/**
 * 작품 안 AI 작업 실행기: 판본 단일 감평, 설정 후보 추출.
 *
 * - 보내기 직전에 키·전송 동의(자료 종류·모델)를 다시 확인한다. 동의가 없으면 요청을 만들지 않는다.
 * - 전송은 OpenAI 공식 Responses 엔드포인트 한 곳(transport)으로만 한다. 키는 Authorization 헤더로만 쓴다.
 * - 작업 기록(AiJob·AiUsage)에는 원고 본문·키를 넣지 않고 상태·토큰·오류 종류만 남긴다.
 * - 실행 중인 작업은 취소할 수 있다. 화면을 옮겨도 작업은 이어지고 결과는 저장소에 들어간다.
 */
import type { WorkspaceStore } from '../domain/store';
import { canonicalJson, sha256Text } from '../domain/text';
import type { AiDataKind, AiJob, Id } from '../domain/types';
import type { ReviewConfig } from '../review/config';
import { REVIEW_PERSPECTIVES, type ReviewPerspective } from '../review/perspectives';
import { buildResponsesRequest } from '../review/buildRequest';
import { callResponses } from '../review/reviewService';
import { ReviewError, type ReviewErrorKind } from '../review/types';
import type { KeySession } from '../session/keySession';
import type { Transport } from '../transport/types';
import { buildExtractionRequest, EXTRACTION_PROMPT_VERSION, parseExtractionOutput } from './extraction';

export const REVIEW_PROMPT_VERSION = 'review-1';

export type AiGateProblem = 'no_key' | 'no_consent' | 'kind_not_allowed' | 'model_changed' | 'too_long' | 'empty';

export interface AiRunner {
  readonly config: ReviewConfig;
  readonly source: Transport['kind'];
  gate(kind: AiDataKind, textLength: number): AiGateProblem | null;
  runReview(workId: Id, versionId: Id, perspective: ReviewPerspective): Promise<{ jobId: Id; error: ReviewErrorKind | null }>;
  runExtraction(workId: Id, versionId: Id, options?: { force?: boolean }): Promise<{ jobId: Id | null; error: ReviewErrorKind | null; reused: boolean }>;
  cancel(jobId: Id): void;
  isCancellable(jobId: Id): boolean;
  completedExtraction(workId: Id, versionId: Id): AiJob | undefined;
}

export function errorCodeOf(error: unknown): string {
  if (error instanceof ReviewError) return error.details.status ? `${error.kind}:${error.details.status}` : error.kind;
  return 'unexpected';
}

export function parseErrorCode(code: string | null): { kind: ReviewErrorKind; status: number | null } {
  const [kind, status] = (code ?? 'unexpected').split(':');
  return { kind: (kind || 'unexpected') as ReviewErrorKind, status: status ? Number(status) : null };
}

export function createAiRunner(store: WorkspaceStore, transport: Transport, keySession: KeySession, config: ReviewConfig): AiRunner {
  const controllers = new Map<Id, AbortController>();

  const gate = (kind: AiDataKind, textLength: number): AiGateProblem | null => {
    if (!keySession.has()) return 'no_key';
    const consent = store.getState().consent;
    if (!consent || consent.revokedAt) return 'no_consent';
    if (!consent.allowedDataKinds.includes(kind)) return 'kind_not_allowed';
    if (consent.allowedModelSnapshot !== config.model) return 'model_changed';
    if (textLength === 0) return 'empty';
    if (textLength > config.maxInputChars) return 'too_long';
    return null;
  };

  const versionOf = (workId: Id, versionId: Id) => {
    const version = store.getState().versions[versionId];
    if (!version || version.workId !== workId) throw new ReviewError('invalid_input');
    return version;
  };

  async function execute<T>(
    job: AiJob,
    call: (signal: AbortSignal, apiKey: string) => Promise<T>,
  ): Promise<{ value: T | null; error: ReviewErrorKind | null }> {
    const controller = new AbortController();
    controllers.set(job.id, controller);
    try {
      const apiKey = keySession.get();
      if (!apiKey) throw new ReviewError('no_key');
      const value = await call(controller.signal, apiKey);
      return { value, error: null };
    } catch (error) {
      const kind = error instanceof ReviewError ? error.kind : 'unexpected';
      store.finishAiJob(
        job.id,
        { status: kind === 'cancelled' ? 'cancelled' : 'failed', errorCode: errorCodeOf(error), summary: null },
        {
          inputTokens: null,
          outputTokens: null,
          reasoningTokens: null,
          latencyMs: null,
          result: kind === 'cancelled' ? 'cancelled' : kind === 'refusal' ? 'refused' : 'failure',
        },
      );
      return { value: null, error: kind };
    } finally {
      controllers.delete(job.id);
    }
  }

  const completedExtraction = (workId: Id, versionId: Id) =>
    Object.values(store.getState().aiJobs).find(
      (job) =>
        job.workId === workId &&
        job.targetVersionId === versionId &&
        job.jobType === 'extract_lore' &&
        job.promptVersion === EXTRACTION_PROMPT_VERSION &&
        job.modelSnapshot === config.model &&
        (job.status === 'completed' || job.status === 'partial_failed' || job.status === 'stale'),
    );

  return {
    config,
    source: transport.kind,
    gate,

    async runReview(workId, versionId, perspective) {
      const version = versionOf(workId, versionId);
      const problem = gate('manuscript_review', version.normalizedText.length);
      if (problem) throw new ReviewError(problem === 'no_key' ? 'no_key' : 'invalid_input');
      const idempotencyKey = await sha256Text(
        canonicalJson({ versionId, hash: version.normalizedSha256, perspective, prompt: REVIEW_PROMPT_VERSION, model: config.model }),
      );
      const job = store.startAiJob({
        workId,
        jobType: 'manuscript_review',
        targetVersionId: versionId,
        provider: transport.kind,
        modelSnapshot: config.model,
        promptVersion: REVIEW_PROMPT_VERSION,
        idempotencyKey,
      });
      const outcome = await execute(job, (signal, apiKey) =>
        callResponses(
          transport,
          { apiKey, body: buildResponsesRequest(version.normalizedText, config, perspective), timeoutMs: config.requestTimeoutMs, signal },
        ),
      );
      if (outcome.value) {
        const result = outcome.value;
        store.addReview({
          workId,
          jobId: job.id,
          versionId,
          perspective,
          text: result.text,
          source: result.source,
          model: result.model,
          responseId: result.responseId,
          incompleteReason: result.incompleteReason,
        });
        store.finishAiJob(
          job.id,
          {
            status: 'completed',
            errorCode: null,
            summary: `${REVIEW_PERSPECTIVES[perspective].label}${result.incompleteReason ? ' · 응답 잘림' : ''}`,
          },
          {
            inputTokens: result.usage?.inputTokens ?? null,
            outputTokens: result.usage?.outputTokens ?? null,
            reasoningTokens: result.usage?.reasoningTokens ?? null,
            latencyMs: Math.round(result.elapsedMs),
            result: 'success',
          },
        );
      }
      return { jobId: job.id, error: outcome.error };
    },

    completedExtraction,

    async runExtraction(workId, versionId, options = {}) {
      const version = versionOf(workId, versionId);
      const problem = gate('lore_extraction', version.normalizedText.length);
      if (problem) throw new ReviewError(problem === 'no_key' ? 'no_key' : 'invalid_input');
      // 같은 판본·프롬프트·모델로 이미 끝난 추출이 있으면 다시 보내지 않는다(작가가 '다시 추출'을 고를 때만).
      const done = completedExtraction(workId, versionId);
      if (done && !options.force) return { jobId: done.id, error: null, reused: true };
      const state = store.getState();
      const known = Object.values(state.entities)
        .filter((entity) => entity.workId === workId && entity.reviewStatus !== 'rejected')
        .map((entity) => ({ name: entity.canonicalName, kind: entity.kind }));
      const idempotencyKey = await sha256Text(
        canonicalJson({ versionId, hash: version.normalizedSha256, prompt: EXTRACTION_PROMPT_VERSION, model: config.model }),
      );
      const job = store.startAiJob({
        workId,
        jobType: 'extract_lore',
        targetVersionId: versionId,
        provider: transport.kind,
        modelSnapshot: config.model,
        promptVersion: EXTRACTION_PROMPT_VERSION,
        idempotencyKey,
      });
      const outcome = await execute(job, async (signal, apiKey) => {
        const result = await callResponses(transport, {
          apiKey,
          body: buildExtractionRequest(version.normalizedText, known, config),
          timeoutMs: config.requestTimeoutMs,
          signal,
        });
        if (result.incompleteReason) throw new ReviewError('empty_response', { incompleteReason: 'max_output_tokens' });
        return { result, candidates: parseExtractionOutput(result.text) };
      });
      if (outcome.value) {
        const { result, candidates } = outcome.value;
        const saved = await store.addAiCandidates(workId, versionId, job.id, candidates);
        const summary = saved.ok
          ? `후보 ${saved.value.saved}건 저장${saved.value.quoteMissing ? ` · 인용 불일치 ${saved.value.quoteMissing}건 제외` : ''}${
              saved.value.ambiguous ? ` · 위치 확인 필요 ${saved.value.ambiguous}건` : ''
            }`
          : '저장 실패';
        const current = store.getState().chapters[version.chapterId]?.currentVersionId;
        store.finishAiJob(
          job.id,
          {
            // 결과는 보낸 판본에 묶여 저장된다. 그 사이 새 판본이 생겼으면 '구판 결과'로 표시한다(현행 덮어쓰기 없음).
            status: !saved.ok ? 'failed' : current && current !== versionId ? 'stale' : saved.value.quoteMissing > 0 ? 'partial_failed' : 'completed',
            errorCode: saved.ok ? null : 'unexpected',
            summary,
          },
          {
            inputTokens: result.usage?.inputTokens ?? null,
            outputTokens: result.usage?.outputTokens ?? null,
            reasoningTokens: result.usage?.reasoningTokens ?? null,
            latencyMs: Math.round(result.elapsedMs),
            result: 'success',
          },
        );
      }
      return { jobId: job.id, error: outcome.error, reused: false };
    },

    cancel(jobId) {
      controllers.get(jobId)?.abort();
    },
    isCancellable(jobId) {
      return controllers.has(jobId);
    },
  };
}

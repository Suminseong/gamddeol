/**
 * 판본 화면의 AI 작업: 단일 감평(기존 알파 감평 지시·관점 재사용), 설정 후보 추출.
 * 보내기 전에 키와 전송 동의(자료 종류·모델)를 확인하고, 실행 중에는 취소할 수 있다.
 * 결과는 참고용·후보이며 설정을 바꾸지 않는다. 실패하면 원고·키는 그대로 두고 다시 시도할 수 있다.
 */
import { useEffect, useId, useState } from 'react';
import { parseErrorCode, type AiGateProblem } from '../../ai/aiRunner';
import { AI_JOB_STATUS_LABELS, formatDateTime } from '../../domain/labels';
import type { AiDataKind, AiJob, AiJobType } from '../../domain/types';
import { REVIEW_PERSPECTIVES, type ReviewPerspective } from '../../review/perspectives';
import { ReviewError } from '../../review/types';
import { OPENAI_RESPONSES_ENDPOINT } from '../../transport/endpoint';
import { copy } from '../copy';
import { Link, useHasKey, useServices, useWorkspace } from '../context';
import { pathFor } from '../../router/routes';
import { Badge, ErrorBanner, InfoBanner, LiveStatus, Panel } from '../ui/primitives';
import '../quick/segmented.css';

export function gateMessage(problem: AiGateProblem, maxChars: number): string {
  switch (problem) {
    case 'no_key':
      return 'OpenAI API 키를 먼저 등록하세요.';
    case 'no_consent':
      return '원고를 OpenAI로 보내려면 먼저 전송 동의가 필요합니다.';
    case 'kind_not_allowed':
      return '이 작업의 자료 종류는 전송 동의 범위에 없습니다. 동의 범위를 넓히세요.';
    case 'model_changed':
      return '동의한 모델과 지금 설정된 모델이 다릅니다. 전송 동의를 다시 하세요.';
    case 'too_long':
      return `본문이 너무 깁니다. 한 번에 최대 ${maxChars.toLocaleString('ko-KR')}자까지 보낼 수 있습니다.`;
    case 'empty':
      return '본문이 비어 있습니다.';
  }
}

function useJobs(versionId: string, jobType: AiJobType): AiJob[] {
  const workspace = useWorkspace();
  return Object.values(workspace.aiJobs)
    .filter((job) => job.targetVersionId === versionId && job.jobType === jobType)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return (
    <span className="waiting-elapsed num" aria-hidden="true">
      {seconds}초
    </span>
  );
}

function JobError({ job, onRetry, disabled }: { job: AiJob; onRetry: () => void; disabled: boolean }) {
  const { kind, status } = parseErrorCode(job.errorCode);
  const message = copy.errors[kind] ?? copy.errors.unexpected;
  return (
    <ErrorBanner
      title={message.title}
      message={
        <>
          {message.guide}
          {status ? ` (HTTP ${status})` : ''} 판본 본문과 등록한 키는 그대로 있습니다.
        </>
      }
      onRetry={disabled ? undefined : onRetry}
    />
  );
}

function GateNotice({ problem, kind }: { problem: AiGateProblem; kind: AiDataKind }) {
  const { aiRunner } = useServices();
  return (
    <InfoBanner tone="warning">
      <p>{gateMessage(problem, aiRunner.config.maxInputChars)}</p>
      {problem !== 'too_long' && problem !== 'empty' && (
        <p>
          <Link to={`/settings/ai?kind=${kind}`}>AI 연결 및 전송 동의로 이동</Link>
        </p>
      )}
    </InfoBanner>
  );
}

function SendDisclosure({ what }: { what: string }) {
  const { aiRunner } = useServices();
  return (
    <details className="disclosure">
      <summary>실행하면 무엇을 보내나요?</summary>
      <p>실행을 누를 때만 다음을 OpenAI 공식 엔드포인트 한 곳으로 보냅니다.</p>
      <p className="endpoint">{OPENAI_RESPONSES_ENDPOINT}</p>
      <ul>
        <li>API 키 → Authorization 헤더</li>
        <li>{what}</li>
      </ul>
      <p className="params">
        {copy.run.params(aiRunner.config.model, aiRunner.config.reasoningEffort, aiRunner.config.maxOutputTokens, aiRunner.config.requestTimeoutMs)}
      </p>
      <p className="hint">OpenAI에는 응답을 저장하지 말라고(store: false) 요청합니다. 작업 기록에는 본문·키 없이 상태와 토큰 수만 남깁니다.</p>
    </details>
  );
}

export function VersionReviewPanel({ workId, versionId }: { workId: string; versionId: string }) {
  const { aiRunner } = useServices();
  const workspace = useWorkspace();
  useHasKey();
  const version = workspace.versions[versionId]!;
  const [perspective, setPerspective] = useState<ReviewPerspective>('general');
  const perspectiveId = useId();
  const [starting, setStarting] = useState(false);
  const [announce, setAnnounce] = useState('');
  const jobs = useJobs(versionId, 'manuscript_review');
  const running = jobs.find((job) => job.status === 'running');
  const latest = jobs[0];
  const reviews = Object.values(workspace.reviews)
    .filter((review) => review.versionId === versionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const problem = aiRunner.gate('manuscript_review', version.normalizedText.length);
  const busy = starting || Boolean(running);

  const run = async () => {
    if (problem || busy) return;
    setStarting(true);
    setAnnounce('감평 요청을 보냈습니다.');
    try {
      const outcome = await aiRunner.runReview(workId, versionId, perspective);
      setAnnounce(outcome.error ? '감평을 받지 못했습니다.' : '감평 결과를 받았습니다.');
    } catch (error) {
      setAnnounce(error instanceof ReviewError ? '감평을 시작하지 못했습니다.' : '감평 중 오류가 났습니다.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <Panel title="단일 감평 (AI 참고용)" headingLevel={3} className="ai-panel">
      <LiveStatus message={announce} />
      {problem && <GateNotice problem={problem} kind="manuscript_review" />}
      <fieldset className="review-perspective perspective-fieldset" aria-describedby={`${perspectiveId}-description`}>
        <legend>감평 관점</legend>
        <div className="perspective-segments">
          {(Object.keys(REVIEW_PERSPECTIVES) as ReviewPerspective[]).map((key) => (
            <label className="perspective-option" key={key}>
              <input
                type="radio"
                name={`${perspectiveId}-perspective`}
                value={key}
                checked={perspective === key}
                disabled={busy}
                onChange={() => setPerspective(key)}
              />
              <span className="perspective-option-surface">{REVIEW_PERSPECTIVES[key].label}</span>
            </label>
          ))}
        </div>
        <p id={`${perspectiveId}-description`} className="hint perspective-description">
          {REVIEW_PERSPECTIVES[perspective].description}
        </p>
      </fieldset>
      <SendDisclosure what={`이 판본(v${version.versionOrdinal}) 본문과 감평 지시(관점 「${REVIEW_PERSPECTIVES[perspective].label}」) → 요청 본문`} />
      <div className="run-actions">
        <button type="button" className="button-primary" disabled={Boolean(problem) || busy} aria-busy={busy} onClick={() => void run()}>
          {busy ? '감평 중…' : '감평 실행'}
        </button>
        {running && aiRunner.isCancellable(running.id) && (
          <button type="button" className="button-secondary" onClick={() => aiRunner.cancel(running.id)}>
            취소
          </button>
        )}
        {running && (
          <span className="waiting">
            <span className="spinner" aria-hidden="true" />
            <span className="waiting-text">OpenAI 응답을 기다리는 중</span>
            <Elapsed since={running.createdAt} />
          </span>
        )}
      </div>
      {!busy && latest && (latest.status === 'failed' || latest.status === 'cancelled') && (
        <JobError job={latest} onRetry={() => void run()} disabled={Boolean(problem)} />
      )}
      {reviews.length === 0 ? (
        <p className="hint">이 판본의 감평 결과가 없습니다.</p>
      ) : (
        <ul className="review-list">
          {reviews.map((review) => (
            <li key={review.id} className="review-item">
              <p className="badge-row">
                <Badge tier="candidate">{review.source === 'mock' ? copy.result.badgeMock : 'AI 감평 · 참고용'}</Badge>
                <span className="hint">
                  {REVIEW_PERSPECTIVES[review.perspective as ReviewPerspective]?.label ?? review.perspective} · {review.model ?? '모델 미상'} ·{' '}
                  <span className="num">{formatDateTime(review.createdAt)}</span>
                </span>
              </p>
              {review.incompleteReason && <p className="truncated-note">{copy.result.truncated(review.incompleteReason, aiRunner.config.maxOutputTokens)}</p>}
              <div className="result-text flat-reader-surface" tabIndex={0} role="region" aria-label="감평 결과 본문">
                {review.text}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">{copy.result.aiNote}</p>
    </Panel>
  );
}

export function ExtractionPanel({ workId, versionId }: { workId: string; versionId: string }) {
  const { aiRunner } = useServices();
  const workspace = useWorkspace();
  useHasKey();
  const version = workspace.versions[versionId]!;
  const [starting, setStarting] = useState(false);
  const [reused, setReused] = useState(false);
  const [announce, setAnnounce] = useState('');
  const jobs = useJobs(versionId, 'extract_lore');
  const running = jobs.find((job) => job.status === 'running');
  const latest = jobs[0];
  const problem = aiRunner.gate('lore_extraction', version.normalizedText.length);
  const busy = starting || Boolean(running);
  const candidates = Object.values(workspace.assertions).filter(
    (assertion) => assertion.createdByJobId !== null && assertion.approvalStatus === 'candidate' && workspace.aiJobs[assertion.createdByJobId]?.targetVersionId === versionId,
  ).length;

  const run = async (force: boolean) => {
    if (problem || busy) return;
    setStarting(true);
    setReused(false);
    setAnnounce('설정 후보 추출 요청을 보냈습니다.');
    try {
      const outcome = await aiRunner.runExtraction(workId, versionId, { force });
      setReused(outcome.reused);
      setAnnounce(outcome.error ? '설정 후보를 받지 못했습니다.' : outcome.reused ? '이미 추출한 결과가 있습니다.' : '설정 후보를 받았습니다.');
    } catch {
      setAnnounce('추출을 시작하지 못했습니다.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <Panel title="설정 후보 추출 (AI)" headingLevel={3} className="ai-panel">
      <LiveStatus message={announce} />
      <p className="hint">AI가 이 판본에서 인물·장소 같은 설정 정보 후보를 찾아 원문 인용과 함께 검토함에 넣습니다. 인용이 본문과 정확히 같지 않으면 버리고, 작가가 확정하기 전까지 설정에 반영하지 않습니다.</p>
      {problem && <GateNotice problem={problem} kind="lore_extraction" />}
      <SendDisclosure what={`이 판본(v${version.versionOrdinal}) 본문과 이미 등록한 설정 항목 이름 목록, 추출 지시 → 요청 본문`} />
      <div className="run-actions">
        <button type="button" className="button-primary" disabled={Boolean(problem) || busy} aria-busy={busy} onClick={() => void run(false)}>
          {busy ? '추출 중…' : '설정 후보 추출'}
        </button>
        {running && aiRunner.isCancellable(running.id) && (
          <button type="button" className="button-secondary" onClick={() => aiRunner.cancel(running.id)}>
            취소
          </button>
        )}
        {running && (
          <span className="waiting">
            <span className="spinner" aria-hidden="true" />
            <span className="waiting-text">OpenAI 응답을 기다리는 중</span>
            <Elapsed since={running.createdAt} />
          </span>
        )}
      </div>
      {reused && !busy && (
        <InfoBanner>
          <p>이 판본·프롬프트·모델로 이미 추출한 결과가 있어 다시 보내지 않았습니다.</p>
          <button type="button" className="button-secondary" onClick={() => void run(true)} disabled={Boolean(problem)}>
            그래도 다시 추출 (새 요청)
          </button>
        </InfoBanner>
      )}
      {!busy && latest && (latest.status === 'failed' || latest.status === 'cancelled') && (
        <JobError job={latest} onRetry={() => void run(false)} disabled={Boolean(problem)} />
      )}
      {latest && latest.status !== 'running' && latest.status !== 'failed' && latest.status !== 'cancelled' && (
        <p className="badge-row">
          <Badge tier={latest.status === 'completed' ? 'canon' : 'warning'}>{AI_JOB_STATUS_LABELS[latest.status]}</Badge>
          <span className="hint">{latest.summary}</span>
        </p>
      )}
      {candidates > 0 && (
        <p>
          검토를 기다리는 이 판본의 후보 {candidates}건 ·{' '}
          <Link to={`${pathFor('page.reviewQueue', { workId })}?versionId=${versionId}`}>AI 후보 검토함에서 보기</Link>
        </p>
      )}
    </Panel>
  );
}

export function AiPanelsSection({ workId, versionId }: { workId: string; versionId: string }) {
  return (
    <section className="ai-section" aria-labelledby="ai-section-heading">
      <h2 id="ai-section-heading">AI 작업</h2>
      <p className="hint">키·원고는 이 탭 메모리에만 있고, 실행할 때만 OpenAI 공식 API로 보냅니다. 결과는 참고용·후보입니다.</p>
      <div className="ai-grid">
        <VersionReviewPanel workId={workId} versionId={versionId} />
        <ExtractionPanel workId={workId} versionId={versionId} />
      </div>
    </section>
  );
}

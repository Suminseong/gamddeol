import { TransportError, type Transport, type TransportKind } from '../transport/types';
import { buildResponsesRequest } from './buildRequest';
import { REVIEW_CONFIG, type ReviewConfig } from './config';
import { reviewErrorFromHttp, reviewErrorFromTransport } from './errors';
import { parseResponsesBody } from './parseResponse';
import type { ReviewPerspective } from './perspectives';
import { ReviewError, type ReviewResult } from './types';
import { checkManuscript } from './validate';

export interface ReviewInput {
  apiKey: string;
  manuscript: string;
  perspective?: ReviewPerspective;
}

export interface ReviewService {
  readonly config: ReviewConfig;
  /** 이 서비스가 쓰는 전송 계층 종류. mock이면 화면에 모의 모드로 표시한다. */
  readonly source: TransportKind;
  review(input: ReviewInput, options?: { signal?: AbortSignal }): Promise<ReviewResult>;
}

/**
 * 감평 요청/결과 계층: 입력 검사 → 요청 본문 생성 → 전송 → 응답 해석.
 * 전송 계층(transport)은 주입받으므로 실제 OpenAI 대신 모의 응답으로 바꿀 수 있다.
 */
export function createReviewService(
  transport: Transport,
  config: ReviewConfig = REVIEW_CONFIG,
  now: () => number = () => performance.now(),
): ReviewService {
  return {
    config,
    source: transport.kind,
    async review({ apiKey, manuscript, perspective }, options = {}) {
      if (!apiKey) throw new ReviewError('no_key');
      const check = checkManuscript(manuscript, config);
      if (!check.ok) throw new ReviewError('invalid_input', { inputProblem: check.reason });

      const body = buildResponsesRequest(manuscript, config, perspective);
      return callResponses(transport, { apiKey, body, timeoutMs: config.requestTimeoutMs, signal: options.signal }, now);
    },
  };
}

/**
 * Responses API 한 번 호출: 전송 → HTTP 오류 분류 → 응답 해석. 감평과 설정 후보 추출이 함께 쓴다.
 * 전송은 주입받은 transport(OpenAI 공식 엔드포인트 한 곳 또는 모의)로만 한다.
 */
export async function callResponses(
  transport: Transport,
  request: { apiKey: string; body: unknown; timeoutMs: number; signal?: AbortSignal },
  now: () => number = () => performance.now(),
): Promise<ReviewResult> {
  if (!request.apiKey) throw new ReviewError('no_key');
  const startedAt = now();
  let response;
  try {
    response = await transport.send(request);
  } catch (error) {
    if (error instanceof TransportError) throw reviewErrorFromTransport(error);
    throw new ReviewError('network');
  }
  if (response.status < 200 || response.status >= 300) {
    throw reviewErrorFromHttp(response.status, response.bodyText);
  }
  const parsed = parseResponsesBody(response.bodyText);
  return {
    ...parsed,
    source: transport.kind,
    elapsedMs: Math.max(0, now() - startedAt),
  };
}

import type { TransportKind } from '../transport/types';

export interface ReviewUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
}

export interface ReviewResult {
  /** 화면에 그대로 보여 줄 응답 텍스트 (줄바꿈 보존). */
  text: string;
  /** openai: 실제 OpenAI 응답, mock: 네트워크 없는 모의 응답. */
  source: TransportKind;
  model: string | null;
  responseId: string | null;
  /** 응답이 끝까지 생성되지 않았을 때의 사유 (예: max_output_tokens). 완료면 null. */
  incompleteReason: string | null;
  usage: ReviewUsage | null;
  elapsedMs: number;
}

export type ReviewErrorKind =
  | 'no_key'
  | 'invalid_input'
  | 'auth'
  | 'permission'
  | 'not_found'
  | 'bad_request'
  | 'quota'
  | 'rate_limit'
  | 'server'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'empty_response'
  | 'refusal'
  | 'response_failed'
  | 'unexpected';

export interface ReviewErrorDetails {
  /** HTTP 상태 코드 (응답을 받은 경우). */
  status?: number;
  /** OpenAI가 돌려준 오류 메시지·거절 사유 (화면 표시용, 최대 500자). */
  serverMessage?: string;
  /** OpenAI 오류 code 또는 type. */
  serverCode?: string;
  /** 빈 응답일 때 OpenAI가 알려 준 미완료 사유. */
  incompleteReason?: string;
  /** invalid_input일 때 원인. */
  inputProblem?: 'empty' | 'too_long';
}

export class ReviewError extends Error {
  readonly kind: ReviewErrorKind;
  readonly details: ReviewErrorDetails;

  constructor(kind: ReviewErrorKind, details: ReviewErrorDetails = {}) {
    super(kind);
    this.name = 'ReviewError';
    this.kind = kind;
    this.details = details;
  }
}

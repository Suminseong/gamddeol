/** 전송 계층: 감평 요청 본문을 받아 HTTP 응답 원문을 돌려준다. 해석은 review 계층이 맡는다. */

export type TransportKind = 'openai' | 'mock';

export interface TransportRequest {
  /** Authorization 헤더로만 쓰인다. 다른 곳에 기록하지 않는다. */
  apiKey: string;
  /** JSON으로 직렬화되어 요청 본문이 된다. */
  body: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface TransportResponse {
  status: number;
  bodyText: string;
}

/** network: 연결 실패·CORS 차단·리디렉션 거부 등 응답을 받지 못함. */
export type TransportFailure = 'network' | 'timeout' | 'aborted';

export class TransportError extends Error {
  readonly failure: TransportFailure;

  constructor(failure: TransportFailure, detail?: string) {
    super(detail ? `${failure} (${detail})` : failure);
    this.name = 'TransportError';
    this.failure = failure;
  }
}

export interface Transport {
  readonly kind: TransportKind;
  send(request: TransportRequest): Promise<TransportResponse>;
}

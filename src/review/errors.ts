import type { TransportError } from '../transport/types';
import { clipMessage } from './parseResponse';
import { ReviewError } from './types';

interface OpenAIErrorBody {
  message?: string;
  type?: string;
  code?: string;
}

function readErrorBody(bodyText: string): OpenAIErrorBody {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const error = (parsed as { error?: unknown }).error;
    if (typeof error !== 'object' || error === null) return {};
    const { message, type, code } = error as Record<string, unknown>;
    return {
      message: typeof message === 'string' ? message : undefined,
      type: typeof type === 'string' ? type : undefined,
      code: typeof code === 'string' ? code : undefined,
    };
  } catch {
    return {};
  }
}

/** 2xx가 아닌 HTTP 응답을 오류 종류로 바꾼다. */
export function reviewErrorFromHttp(status: number, bodyText: string): ReviewError {
  const body = readErrorBody(bodyText);
  const details = {
    status,
    serverMessage: clipMessage(body.message),
    serverCode: body.code ?? body.type,
  };

  if (status === 401) return new ReviewError('auth', details);
  if (status === 403) return new ReviewError('permission', details);
  if (status === 404) return new ReviewError('not_found', details);
  if (status === 408) return new ReviewError('timeout', details);
  if (status === 429) {
    const quota = body.code === 'insufficient_quota' || body.type === 'insufficient_quota';
    return new ReviewError(quota ? 'quota' : 'rate_limit', details);
  }
  if (status >= 500) return new ReviewError('server', details);
  if (status >= 400) return new ReviewError('bad_request', details);
  return new ReviewError('unexpected', details);
}

/** 응답을 받지 못한 실패(연결·시간 초과·취소)를 오류 종류로 바꾼다. */
export function reviewErrorFromTransport(error: TransportError): ReviewError {
  switch (error.failure) {
    case 'timeout':
      return new ReviewError('timeout');
    case 'aborted':
      return new ReviewError('cancelled');
    case 'network':
      return new ReviewError('network');
  }
}

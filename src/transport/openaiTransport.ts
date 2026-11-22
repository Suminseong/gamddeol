import { OPENAI_RESPONSES_ENDPOINT } from './endpoint';
import {
  TransportError,
  type Transport,
  type TransportRequest,
  type TransportResponse,
} from './types';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const defaultFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

/**
 * OpenAI 공식 엔드포인트 한 곳으로만 POST한다.
 * 키는 Authorization 헤더, 원고가 든 요청 본문은 body로만 보낸다.
 * 리디렉션은 따라가지 않고 실패로 처리하며, 쿠키·리퍼러·캐시를 쓰지 않는다.
 */
export function createOpenAITransport(fetchImpl: FetchLike = defaultFetch): Transport {
  return {
    kind: 'openai',
    async send({ apiKey, body, timeoutMs, signal }: TransportRequest): Promise<TransportResponse> {
      if (signal?.aborted) throw new TransportError('aborted');

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });

      try {
        const response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
        });
        const bodyText = await response.text();
        return { status: response.status, bodyText };
      } catch (error) {
        if (timedOut) throw new TransportError('timeout');
        if (signal?.aborted) throw new TransportError('aborted');
        // 브라우저는 연결 실패와 CORS 차단을 같은 TypeError로 알려 준다. 오류 이름만 남긴다.
        throw new TransportError('network', error instanceof Error ? error.name : undefined);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', forwardAbort);
      }
    },
  };
}

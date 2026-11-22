import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAKE_API_KEY } from '../testing/fixtures';
import { OPENAI_RESPONSES_ENDPOINT } from './endpoint';
import { createOpenAITransport } from './openaiTransport';
import { TransportError } from './types';

type Call = { input: string; init: RequestInit };

function recordingFetch(response: () => Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (input: string, init: RequestInit) => {
    calls.push({ input, init });
    return response();
  };
  return { calls, fetchImpl };
}

/** signal이 끊길 때까지 응답하지 않는 fetch. */
function hangingFetch() {
  return (_input: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
}

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TransportError) return error.failure;
    throw error;
  }
  throw new Error('expected TransportError');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createOpenAITransport', () => {
  it('공식 엔드포인트 한 곳에 키는 Authorization 헤더, 본문은 JSON으로만 보낸다', async () => {
    const { calls, fetchImpl } = recordingFetch(async () => new Response('{"ok":true}', { status: 200 }));
    const transport = createOpenAITransport(fetchImpl);
    const body = { model: 'm', input: '1행\n2행' };

    const response = await transport.send({ apiKey: FAKE_API_KEY, body, timeoutMs: 1000 });

    expect(transport.kind).toBe('openai');
    expect(response).toEqual({ status: 200, bodyText: '{"ok":true}' });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.input).toBe(OPENAI_RESPONSES_ENDPOINT);
    expect(call?.init).toMatchObject({
      method: 'POST',
      headers: { Authorization: `Bearer ${FAKE_API_KEY}`, 'Content-Type': 'application/json' },
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    expect(JSON.parse(String(call?.init.body))).toEqual(body);
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('HTTP 오류 응답도 상태와 본문을 그대로 돌려준다', async () => {
    const { fetchImpl } = recordingFetch(async () => new Response('{"error":{}}', { status: 401 }));
    const response = await createOpenAITransport(fetchImpl).send({ apiKey: FAKE_API_KEY, body: {}, timeoutMs: 1000 });
    expect(response).toEqual({ status: 401, bodyText: '{"error":{}}' });
  });

  it('fetch가 실패하면(연결 실패·CORS 차단·리디렉션 거부) network', async () => {
    const { fetchImpl } = recordingFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const failure = await failureOf(createOpenAITransport(fetchImpl).send({ apiKey: FAKE_API_KEY, body: {}, timeoutMs: 1000 }));
    expect(failure).toBe('network');
  });

  it('제한 시간이 지나면 요청을 끊고 timeout', async () => {
    vi.useFakeTimers();
    const pending = createOpenAITransport(hangingFetch()).send({ apiKey: FAKE_API_KEY, body: {}, timeoutMs: 5000 });
    const result = failureOf(pending);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toBe('timeout');
  });

  it('외부 취소 신호를 받으면 aborted', async () => {
    const controller = new AbortController();
    const pending = createOpenAITransport(hangingFetch()).send({
      apiKey: FAKE_API_KEY,
      body: {},
      timeoutMs: 60_000,
      signal: controller.signal,
    });
    controller.abort();
    expect(await failureOf(pending)).toBe('aborted');
  });

  it('이미 취소된 신호면 fetch를 부르지 않는다', async () => {
    const { calls, fetchImpl } = recordingFetch(async () => new Response('{}'));
    const controller = new AbortController();
    controller.abort();
    const failure = await failureOf(
      createOpenAITransport(fetchImpl).send({ apiKey: FAKE_API_KEY, body: {}, timeoutMs: 1000, signal: controller.signal }),
    );
    expect(failure).toBe('aborted');
    expect(calls).toHaveLength(0);
  });
});

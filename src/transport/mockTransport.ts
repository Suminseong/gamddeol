import {
  TransportError,
  type Transport,
  type TransportRequest,
  type TransportResponse,
} from './types';

/**
 * 네트워크를 전혀 쓰지 않는 검증용 전송 계층.
 * 테스트와 `npm run dev:mock`에서만 쓰고, 배포 빌드에는 들어가지 않는다 (src/main.tsx).
 * 결과는 화면에 "모의 응답"으로 따로 표시된다.
 */

export const MOCK_SCENARIOS = [
  'success',
  'truncated',
  'empty',
  'refusal',
  'auth_error',
  'quota',
  'rate_limit',
  'server_error',
  'network_error',
  'timeout',
] as const;

export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export const MOCK_RESPONSE_TEXT =
  '[모의 응답] 네트워크를 쓰지 않은 가짜 감평입니다.\n[모의 응답] 줄바꿈 표시 확인용 둘째 줄입니다.';

function json(status: number, body: unknown): TransportResponse {
  return { status, bodyText: JSON.stringify(body) };
}

function openAIError(status: number, message: string, type: string, code: string | null) {
  return json(status, { error: { message, type, param: null, code } });
}

function messageOutput(text: string) {
  return [
    {
      type: 'message',
      id: 'msg_mock',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }],
    },
  ];
}

/** 시나리오별 가짜 응답. TransportError를 돌려주면 그 오류를 던진다. */
export function mockOutcome(scenario: MockScenario): TransportResponse | TransportError {
  switch (scenario) {
    case 'success':
      return json(200, {
        id: 'resp_mock',
        object: 'response',
        status: 'completed',
        model: 'mock-model',
        output: messageOutput(MOCK_RESPONSE_TEXT),
        usage: { input_tokens: 12, output_tokens: 24, total_tokens: 36 },
      });
    case 'truncated':
      return json(200, {
        id: 'resp_mock_truncated',
        object: 'response',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        model: 'mock-model',
        output: messageOutput('[모의 응답] 출력 상한에 걸려 여기서 끊긴'),
        usage: { input_tokens: 12, output_tokens: 4000, total_tokens: 4012 },
      });
    case 'empty':
      return json(200, {
        id: 'resp_mock_empty',
        object: 'response',
        status: 'completed',
        model: 'mock-model',
        output: [],
      });
    case 'refusal':
      return json(200, {
        id: 'resp_mock_refusal',
        object: 'response',
        status: 'completed',
        model: 'mock-model',
        output: [
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'refusal', refusal: '[모의 응답] 이 요청은 처리할 수 없습니다.' }],
          },
        ],
      });
    case 'auth_error':
      return openAIError(401, '[mock] Incorrect API key provided.', 'invalid_request_error', 'invalid_api_key');
    case 'quota':
      return openAIError(429, '[mock] You exceeded your current quota.', 'insufficient_quota', 'insufficient_quota');
    case 'rate_limit':
      return openAIError(429, '[mock] Rate limit reached.', 'requests', 'rate_limit_exceeded');
    case 'server_error':
      return openAIError(500, '[mock] The server had an error.', 'server_error', null);
    case 'network_error':
      return new TransportError('network', 'mock');
    case 'timeout':
      return new TransportError('timeout');
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new TransportError('aborted'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new TransportError('aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 테스트가 확인할 수 있도록 남기는 호출 기록. 키 원문은 남기지 않는다. */
export interface MockCall {
  hasApiKey: boolean;
  body: unknown;
  timeoutMs: number;
}

export interface MockTransport extends Transport {
  readonly kind: 'mock';
  readonly calls: readonly MockCall[];
  readonly scenario: MockScenario;
  setScenario(scenario: MockScenario): void;
  /** 다음 호출들에 차례로 쓸 시나리오. 비면 현재 시나리오로 돌아간다. */
  queue(...scenarios: MockScenario[]): void;
}

export interface MockTransportOptions {
  scenario?: MockScenario;
  delayMs?: number;
}

export function createMockTransport(options: MockTransportOptions = {}): MockTransport {
  let scenario: MockScenario = options.scenario ?? 'success';
  const delayMs = options.delayMs ?? 0;
  const pending: MockScenario[] = [];
  const calls: MockCall[] = [];

  return {
    kind: 'mock',
    calls,
    get scenario() {
      return scenario;
    },
    setScenario(next) {
      scenario = next;
    },
    queue(...next) {
      pending.push(...next);
    },
    async send({ apiKey, body, timeoutMs, signal }: TransportRequest): Promise<TransportResponse> {
      calls.push({ hasApiKey: apiKey.length > 0, body, timeoutMs });
      const current = pending.shift() ?? scenario;
      await wait(delayMs, signal);
      const outcome = mockOutcome(current);
      if (outcome instanceof TransportError) throw outcome;
      // 구조화 출력(설정 후보 추출) 요청이면 성공 응답을 빈 후보 목록 JSON으로 바꾼다.
      const format = (body as { text?: { format?: { type?: string } } } | null)?.text?.format?.type;
      if (format === 'json_schema' && current === 'success') {
        return json(200, {
          id: 'resp_mock_extract',
          object: 'response',
          status: 'completed',
          model: 'mock-model',
          output: messageOutput('{"candidates":[]}'),
          usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
        });
      }
      return outcome;
    },
  };
}

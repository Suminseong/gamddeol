import { describe, expect, it } from 'vitest';
import { FAKE_API_KEY, UI_CHECK_TEXT } from '../testing/fixtures';
import { createMockTransport, MOCK_RESPONSE_TEXT, type MockScenario } from '../transport/mockTransport';
import { TransportError, type Transport } from '../transport/types';
import { buildResponsesRequest } from './buildRequest';
import { REVIEW_CONFIG, type ReviewConfig } from './config';
import { reviewErrorFromHttp } from './errors';
import { parseResponsesBody } from './parseResponse';
import { createReviewService } from './reviewService';
import { ReviewError, type ReviewErrorKind } from './types';
import { checkManuscript } from './validate';

function errorOf(fn: () => unknown): ReviewError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ReviewError) return error;
    throw error;
  }
  throw new Error('expected ReviewError');
}

async function rejectionOf(promise: Promise<unknown>): Promise<ReviewError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ReviewError) return error;
    throw error;
  }
  throw new Error('expected ReviewError');
}

describe('config', () => {
  it('모델·감평 지시·출력 상한을 한 곳에서 정한다', () => {
    expect(REVIEW_CONFIG.model).toBe('gpt-6-luna');
    expect(REVIEW_CONFIG.maxOutputTokens).toBeGreaterThan(0);
    expect(REVIEW_CONFIG.store).toBe(false);
    expect(REVIEW_CONFIG.instructions).toContain('대신 쓰거나 이어 쓰거나');
    expect(Object.isFrozen(REVIEW_CONFIG)).toBe(true);
  });
});

describe('buildResponsesRequest', () => {
  it('원고를 손대지 않고 input에 넣는다 (줄바꿈 보존)', () => {
    const body = buildResponsesRequest(UI_CHECK_TEXT, REVIEW_CONFIG);
    expect(body).toEqual({
      model: REVIEW_CONFIG.model,
      instructions: REVIEW_CONFIG.instructions,
      input: UI_CHECK_TEXT,
      max_output_tokens: REVIEW_CONFIG.maxOutputTokens,
      store: false,
      reasoning: { effort: REVIEW_CONFIG.reasoningEffort },
    });
  });

  it('reasoningEffort가 null이면 reasoning을 보내지 않는다', () => {
    const config: ReviewConfig = { ...REVIEW_CONFIG, reasoningEffort: null };
    expect(buildResponsesRequest('x', config)).not.toHaveProperty('reasoning');
  });
});

describe('checkManuscript', () => {
  it('빈 입력과 공백만 있는 입력을 막는다', () => {
    expect(checkManuscript('', REVIEW_CONFIG)).toEqual({ ok: false, reason: 'empty', length: 0 });
    expect(checkManuscript(' \n\t', REVIEW_CONFIG)).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('상한을 넘는 입력을 막는다', () => {
    expect(checkManuscript('가나다라', { maxInputChars: 3 })).toEqual({ ok: false, reason: 'too_long', length: 4 });
    expect(checkManuscript('가나다', { maxInputChars: 3 })).toEqual({ ok: true, length: 3 });
  });
});

describe('parseResponsesBody', () => {
  const message = (text: string, extra: Record<string, unknown> = {}) => ({
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text, annotations: [] }],
    ...extra,
  });

  it('어시스턴트 메시지의 output_text를 꺼낸다', () => {
    const parsed = parseResponsesBody(
      JSON.stringify({
        id: 'resp_1',
        status: 'completed',
        model: 'gpt-6-luna',
        output: [{ type: 'reasoning', summary: [] }, message('1행\n2행')],
        usage: { input_tokens: 10, output_tokens: 5, output_tokens_details: { reasoning_tokens: 2 } },
      }),
    );
    expect(parsed).toEqual({
      text: '1행\n2행',
      model: 'gpt-6-luna',
      responseId: 'resp_1',
      incompleteReason: null,
      usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 2 },
    });
  });

  it('final_answer 단계가 있으면 그것만 쓴다', () => {
    const parsed = parseResponsesBody(
      JSON.stringify({
        status: 'completed',
        output: [message('중간 설명', { phase: 'commentary' }), message('최종 감평', { phase: 'final_answer' })],
      }),
    );
    expect(parsed.text).toBe('최종 감평');
  });

  it('출력 상한에 걸린 부분 응답은 잘림 사유와 함께 돌려준다', () => {
    const parsed = parseResponsesBody(
      JSON.stringify({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [message('부분 응답')],
      }),
    );
    expect(parsed.text).toBe('부분 응답');
    expect(parsed.incompleteReason).toBe('max_output_tokens');
  });

  it('텍스트가 없으면 빈 응답 오류', () => {
    const error = errorOf(() =>
      parseResponsesBody(
        JSON.stringify({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }),
      ),
    );
    expect(error.kind).toBe('empty_response');
    expect(error.details.incompleteReason).toBe('max_output_tokens');
    expect(errorOf(() => parseResponsesBody(JSON.stringify({ status: 'completed', output: [message('  ')] }))).kind).toBe(
      'empty_response',
    );
  });

  it('거절만 있으면 refusal 오류', () => {
    const error = errorOf(() =>
      parseResponsesBody(
        JSON.stringify({
          status: 'completed',
          output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: '못 합니다' }] }],
        }),
      ),
    );
    expect(error.kind).toBe('refusal');
    expect(error.details.serverMessage).toBe('못 합니다');
  });

  it('status failed는 response_failed 오류', () => {
    const error = errorOf(() =>
      parseResponsesBody(JSON.stringify({ status: 'failed', error: { code: 'server_error', message: '실패' } })),
    );
    expect(error.kind).toBe('response_failed');
    expect(error.details).toMatchObject({ serverCode: 'server_error', serverMessage: '실패' });
  });

  it('JSON이 아니거나 객체가 아니면 unexpected', () => {
    expect(errorOf(() => parseResponsesBody('<html>')).kind).toBe('unexpected');
    expect(errorOf(() => parseResponsesBody('[]')).kind).toBe('unexpected');
  });

  it('output이 없고 output_text만 있으면 그것을 쓴다', () => {
    expect(parseResponsesBody(JSON.stringify({ status: 'completed', output_text: '대체 텍스트' })).text).toBe(
      '대체 텍스트',
    );
  });
});

describe('reviewErrorFromHttp', () => {
  const body = (code: string | null, type: string, message = 'msg') =>
    JSON.stringify({ error: { message, type, param: null, code } });

  it.each<[number, string, ReviewErrorKind]>([
    [401, body('invalid_api_key', 'invalid_request_error'), 'auth'],
    [403, body('unsupported_country_region_territory', 'request_forbidden'), 'permission'],
    [404, body('model_not_found', 'invalid_request_error'), 'not_found'],
    [400, body('context_length_exceeded', 'invalid_request_error'), 'bad_request'],
    [413, 'too large', 'bad_request'],
    [429, body('insufficient_quota', 'insufficient_quota'), 'quota'],
    [429, body('rate_limit_exceeded', 'requests'), 'rate_limit'],
    [500, body(null, 'server_error'), 'server'],
    [503, '', 'server'],
    [302, '', 'unexpected'],
  ])('HTTP %i → %s', (status, text, kind) => {
    expect(reviewErrorFromHttp(status, text).kind).toBe(kind);
  });

  it('OpenAI 메시지와 code를 남기고 긴 메시지는 자른다', () => {
    const error = reviewErrorFromHttp(401, body('invalid_api_key', 'invalid_request_error', 'x'.repeat(600)));
    expect(error.details.status).toBe(401);
    expect(error.details.serverCode).toBe('invalid_api_key');
    expect(error.details.serverMessage?.length).toBe(501);
  });
});

describe('createReviewService', () => {
  it('설정대로 요청을 만들어 전송 계층에 넘긴다', async () => {
    const transport = createMockTransport();
    const service = createReviewService(transport);
    const result = await service.review({ apiKey: FAKE_API_KEY, manuscript: UI_CHECK_TEXT });

    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]).toEqual({
      hasApiKey: true,
      body: buildResponsesRequest(UI_CHECK_TEXT, REVIEW_CONFIG),
      timeoutMs: REVIEW_CONFIG.requestTimeoutMs,
    });
    expect(result).toMatchObject({ text: MOCK_RESPONSE_TEXT, source: 'mock', responseId: 'resp_mock' });
  });

  it('키가 없거나 원고가 비면 전송하지 않는다', async () => {
    const transport = createMockTransport();
    const service = createReviewService(transport);
    expect((await rejectionOf(service.review({ apiKey: '', manuscript: 'x' }))).kind).toBe('no_key');
    const invalid = await rejectionOf(service.review({ apiKey: FAKE_API_KEY, manuscript: '  ' }));
    expect(invalid.kind).toBe('invalid_input');
    expect(invalid.details.inputProblem).toBe('empty');
    expect(transport.calls).toHaveLength(0);
  });

  it.each<[MockScenario, ReviewErrorKind]>([
    ['auth_error', 'auth'],
    ['quota', 'quota'],
    ['rate_limit', 'rate_limit'],
    ['server_error', 'server'],
    ['network_error', 'network'],
    ['timeout', 'timeout'],
    ['empty', 'empty_response'],
    ['refusal', 'refusal'],
  ])('모의 시나리오 %s → %s', async (scenario, kind) => {
    const service = createReviewService(createMockTransport({ scenario }));
    expect((await rejectionOf(service.review({ apiKey: FAKE_API_KEY, manuscript: UI_CHECK_TEXT }))).kind).toBe(kind);
  });

  it('취소 신호를 받으면 cancelled', async () => {
    const service = createReviewService(createMockTransport({ delayMs: 10_000 }));
    const controller = new AbortController();
    const pending = service.review({ apiKey: FAKE_API_KEY, manuscript: UI_CHECK_TEXT }, { signal: controller.signal });
    controller.abort();
    expect((await rejectionOf(pending)).kind).toBe('cancelled');
  });

  it('전송 계층이 예상 밖 오류를 던져도 network로 처리한다', async () => {
    const broken: Transport = {
      kind: 'openai',
      send: () => Promise.reject(new Error('boom')),
    };
    const service = createReviewService(broken);
    expect((await rejectionOf(service.review({ apiKey: FAKE_API_KEY, manuscript: 'x' }))).kind).toBe('network');
  });

  it('응답 출처와 소요 시간을 결과에 담는다', async () => {
    let tick = 1000;
    const transport: Transport = {
      kind: 'openai',
      send: async () => {
        tick += 2500;
        return {
          status: 200,
          bodyText: JSON.stringify({
            status: 'completed',
            output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }],
          }),
        };
      },
    };
    const result = await createReviewService(transport, REVIEW_CONFIG, () => tick).review({
      apiKey: FAKE_API_KEY,
      manuscript: 'x',
    });
    expect(result.source).toBe('openai');
    expect(result.elapsedMs).toBe(2500);
  });

  it('TransportError 종류를 그대로 옮긴다', async () => {
    const failing = (failure: 'network' | 'timeout' | 'aborted'): Transport => ({
      kind: 'openai',
      send: () => Promise.reject(new TransportError(failure)),
    });
    const kinds = await Promise.all(
      (['network', 'timeout', 'aborted'] as const).map(async (failure) =>
        (await rejectionOf(createReviewService(failing(failure)).review({ apiKey: FAKE_API_KEY, manuscript: 'x' }))).kind,
      ),
    );
    expect(kinds).toEqual(['network', 'timeout', 'cancelled']);
  });
});

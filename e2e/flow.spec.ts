import { expect, test, type Request, type Route } from '@playwright/test';
import {
  auditPage,
  errorTitle,
  expectCleanConsole,
  expectNothingPersisted,
  FAKE_API_KEY,
  fillUiCheckText,
  fulfillJson,
  manuscriptInput,
  mockSuccessBody,
  NETWORK_MOCK_RESPONSE_ID,
  NETWORK_MOCK_TEXT,
  OPENAI_RESPONSES_ENDPOINT,
  openAIErrorBody,
  registerFakeKey,
  resultText,
  runButton,
  UI_CHECK_TEXT,
} from './support.ts';

/** OpenAI 응답은 모두 Playwright 네트워크 모의 응답이다. 실제 OpenAI로는 아무것도 나가지 않는다. */

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

async function capture(request: Request): Promise<CapturedRequest> {
  return {
    url: request.url(),
    method: request.method(),
    headers: await request.allHeaders(),
    body: request.postDataJSON() as Record<string, unknown>,
  };
}

test('키 등록은 요청을 보내지 않고, 실행할 때만 허용된 엔드포인트로 한 번 보낸다', async ({ page, baseURL }) => {
  const audit = auditPage(page, baseURL!);
  const captured: CapturedRequest[] = [];
  await page.route(OPENAI_RESPONSES_ENDPOINT, async (route) => {
    captured.push(await capture(route.request()));
    await fulfillJson(route, 200, mockSuccessBody());
  });

  await page.goto('review');
  await expect(page.getByText('https://api.openai.com/v1/responses')).toBeVisible();
  await expect(page.getByText(/OpenAI는 API 키를 브라우저나 모바일 앱 같은 클라이언트 환경에 두지 말고/)).toBeVisible();

  await registerFakeKey(page);
  await page.waitForTimeout(300);
  expect(audit.apiRequestCount()).toBe(0);

  await fillUiCheckText(page);
  await runButton(page).dblclick();

  await expect(resultText(page)).toBeVisible();
  expect(await resultText(page).textContent()).toBe(NETWORK_MOCK_TEXT);
  await expect(page.getByText(new RegExp(NETWORK_MOCK_RESPONSE_ID))).toBeVisible();

  expect(captured).toHaveLength(1);
  const [request] = captured;
  expect(request?.url).toBe(OPENAI_RESPONSES_ENDPOINT);
  expect(request?.method).toBe('POST');
  expect(request?.headers.authorization).toBe(`Bearer ${FAKE_API_KEY}`);
  expect(request?.headers['content-type']).toBe('application/json');
  expect(request?.headers.cookie).toBeUndefined();
  expect(request?.headers.referer).toBeUndefined();
  expect(request?.body).toMatchObject({ model: 'gpt-6-luna', input: UI_CHECK_TEXT, store: false });
  expect(typeof request?.body.instructions).toBe('string');
  expect(typeof request?.body.max_output_tokens).toBe('number');

  expect(audit.outsideAllowList()).toEqual([]);
  expect(audit.apiRequestCount()).toBe(1);
  expectCleanConsole(audit);
  await expectNothingPersisted(page, baseURL!);

  await page.reload();
  await expect(page.getByText('등록된 키 없음')).toBeVisible();
  await expect(manuscriptInput(page)).toHaveValue('');
  await expect(resultText(page)).toHaveCount(0);
  await expect(runButton(page)).toBeDisabled();
  expect(captured).toHaveLength(1);
  await expectNothingPersisted(page, baseURL!);
});

test('오류마다 입력을 유지하고, 다시 시도하면 이어서 성공한다', async ({ page, baseURL }) => {
  const audit = auditPage(page, baseURL!);
  const responses: ((route: Route) => Promise<void>)[] = [
    (route) => fulfillJson(route, 401, openAIErrorBody('Incorrect API key provided.', 'invalid_request_error', 'invalid_api_key')),
    (route) => fulfillJson(route, 429, openAIErrorBody('You exceeded your current quota.', 'insufficient_quota', 'insufficient_quota')),
    (route) => fulfillJson(route, 429, openAIErrorBody('Rate limit reached.', 'requests', 'rate_limit_exceeded')),
    (route) => fulfillJson(route, 500, openAIErrorBody('The server had an error.', 'server_error', null)),
    // 브라우저 fetch가 TypeError로 끝나는 경우: 연결 실패와, CORS 헤더 없는 응답을 브라우저가 읽지 못한 경우가 같다.
    // 실제 OpenAI의 401 응답에는 CORS 헤더가 없다(2026-11-22 확인). Playwright의 fulfill은 CORS 헤더를 자동으로 붙이므로
    // 그 상황은 abort로 재현한다.
    (route) => route.abort('failed'),
    (route) => fulfillJson(route, 200, { id: 'resp_empty', status: 'completed', output: [] }),
    (route) => fulfillJson(route, 200, mockSuccessBody()),
  ];
  const expectedTitles = [
    '인증 실패 (401)',
    '할당량 부족 (429)',
    '요청이 너무 많음 (429)',
    'OpenAI 서버 오류 (500)',
    '네트워크 오류 또는 브라우저 차단',
    '빈 응답',
  ];
  let calls = 0;
  await page.route(OPENAI_RESPONSES_ENDPOINT, async (route) => {
    const respond = responses[calls];
    calls += 1;
    if (!respond) throw new Error('unexpected extra request');
    await respond(route);
  });

  await page.goto('review');
  await registerFakeKey(page);
  await fillUiCheckText(page);
  await runButton(page).click();

  for (const title of expectedTitles) {
    await expect(errorTitle(page)).toHaveText(title);
    await expect(manuscriptInput(page)).toHaveValue(UI_CHECK_TEXT);
    await expect(page.getByText(/^키 등록됨/)).toBeVisible();
    await page.getByRole('button', { name: '다시 시도' }).click();
  }

  await expect(resultText(page)).toBeVisible();
  expect(await resultText(page).textContent()).toBe(NETWORK_MOCK_TEXT);
  expect(calls).toBe(responses.length);
  expect(audit.outsideAllowList()).toEqual([]);
  await expectNothingPersisted(page, baseURL!);
});

test('시간 초과 뒤 다시 시도할 수 있다', async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  await page.route(OPENAI_RESPONSES_ENDPOINT, async (route) => {
    calls += 1;
    if (calls === 1) return; // 첫 요청은 응답하지 않는다 (앱이 제한 시간 후 끊는다).
    await fulfillJson(route, 200, mockSuccessBody());
  });

  await page.goto('review');
  await registerFakeKey(page);
  await fillUiCheckText(page);
  await runButton(page).click();
  await expect(page.getByText(/OpenAI 응답을 기다리는 중/)).toBeVisible();

  await page.clock.fastForward('03:01');
  await expect(errorTitle(page)).toHaveText('시간 초과');
  await expect(manuscriptInput(page)).toHaveValue(UI_CHECK_TEXT);

  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(resultText(page)).toBeVisible();
  expect(calls).toBe(2);
});

test('실행 중 취소하면 입력을 유지한다', async ({ page }) => {
  await page.route(OPENAI_RESPONSES_ENDPOINT, async () => {
    // 응답하지 않는다.
  });

  await page.goto('review');
  await registerFakeKey(page);
  await fillUiCheckText(page);
  await runButton(page).click();
  await expect(runButton(page)).toHaveText('감평 중…');
  await expect(runButton(page)).toBeDisabled();

  await page.getByRole('button', { name: '취소' }).click();
  await expect(errorTitle(page)).toHaveText('취소됨');
  await expect(manuscriptInput(page)).toHaveValue(UI_CHECK_TEXT);
  await expect(runButton(page)).toBeEnabled();
});

test('지우기를 누르면 키가 사라져 실행할 수 없다', async ({ page }) => {
  await page.goto('review');
  await registerFakeKey(page);
  await fillUiCheckText(page);
  await expect(runButton(page)).toBeEnabled();

  await page.getByRole('button', { name: '지우기' }).click();
  await expect(page.getByText('등록된 키 없음')).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await expect(page.getByText('먼저 OpenAI API 키를 등록하세요.')).toBeVisible();
});

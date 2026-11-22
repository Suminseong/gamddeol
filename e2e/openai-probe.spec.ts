import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { REVIEW_CONFIG } from '../src/review/config.ts';
import {
  auditPage,
  errorTitle,
  FAKE_API_KEY,
  fillUiCheckText,
  OPENAI_RESPONSES_ENDPOINT,
  registerFakeKey,
  UI_CHECK_TEXT,
} from './support.ts';

/**
 * 실제 OpenAI 엔드포인트에 가짜 키로 요청해, 브라우저 직접 호출이 CORS로 막히지 않는지 확인한다.
 * - 보내는 값: 가짜 키(Authorization 헤더)와 짧은 UI 검사 문자열뿐이다.
 * - 브라우저가 401을 읽으면(화면에 "인증 실패 (401)") `reachable`.
 * - 브라우저가 응답을 읽지 못하면, 같은 요청을 브라우저 밖(Node)에서 다시 보내 원인을 가린다.
 *   사전 확인(OPTIONS)은 키·본문 없이, 본 요청(POST)은 같은 가짜 키와 UI 검사 문자열로 보낸다.
 *   - 사전 확인이 이 출처·메서드·헤더를 허용하면 `preflight_ok`: 요청은 나가지만 오류 응답에 CORS 헤더가 없어
 *     브라우저가 읽지 못한 경우다. 실제 키의 성공 응답을 읽을 수 있는지는 실호출로만 확인된다.
 *   - 사전 확인이 막으면 `blocked`: 브라우저는 요청을 보내지도 못한다.
 * OPENAI_PROBE=1일 때만 실행한다 (GitHub Actions의 배포 후 검증 단계).
 */

/** 기록할 응답 헤더. 값에 비밀이 없는 것만 고른다. */
const RECORDED_HEADERS = [
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-allow-credentials',
  'access-control-max-age',
  'content-type',
  'server',
  'cf-mitigated',
  'location',
] as const;

interface RecordedResponse {
  status: number;
  headers: Record<string, string>;
}

function describeResponse(response: APIResponse): RecordedResponse {
  const headers = response.headers();
  return {
    status: response.status(),
    headers: Object.fromEntries(RECORDED_HEADERS.filter((name) => name in headers).map((name) => [name, headers[name] ?? ''])),
  };
}

/** 오류 본문에서 종류만 남긴다. message에는 가려진 키 일부가 들어 있을 수 있어 남기지 않는다. */
async function errorKind(response: APIResponse) {
  try {
    const body = (await response.json()) as { error?: { type?: unknown; code?: unknown } };
    return { type: body.error?.type ?? null, code: body.error?.code ?? null };
  } catch {
    return { nonJsonBody: true };
  }
}

/** 예외 메시지의 첫 줄만 남긴다 (Playwright 호출 기록에는 요청 헤더가 들어 있다). */
function firstLine(error: unknown) {
  return String(error).split('\n')[0]?.slice(0, 300) ?? '';
}

const listOf = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

/**
 * 사전 확인 응답이 앱의 요청(POST, Authorization·Content-Type 헤더, 쿠키 없음)을 허용하는지 본다.
 * Access-Control-Allow-Headers의 *는 Authorization을 포함하지 않으므로 Authorization은 이름으로 있어야 한다.
 */
function preflightAllows(preflight: RecordedResponse, origin: string) {
  if (preflight.status < 200 || preflight.status >= 300) return false;
  const allowOrigin = preflight.headers['access-control-allow-origin'];
  const methods = listOf(preflight.headers['access-control-allow-methods']);
  const headers = listOf(preflight.headers['access-control-allow-headers']);
  return (
    (allowOrigin === '*' || allowOrigin === origin) &&
    (methods.includes('post') || methods.includes('*')) &&
    headers.includes('authorization') &&
    (headers.includes('content-type') || headers.includes('*'))
  );
}

/** 브라우저가 보낸 것과 같은 요청을 브라우저 밖에서 다시 보내, OpenAI가 무엇을 돌려주는지 기록한다. */
async function replayOutsideBrowser(request: APIRequestContext, origin: string, userAgent: string) {
  const options = { failOnStatusCode: false, maxRedirects: 0, timeout: 30_000 } as const;

  let preflight: RecordedResponse | { failed: string };
  try {
    const response = await request.fetch(OPENAI_RESPONSES_ENDPOINT, {
      ...options,
      method: 'OPTIONS',
      headers: {
        origin,
        'user-agent': userAgent,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    preflight = describeResponse(response);
  } catch (error) {
    preflight = { failed: firstLine(error) };
  }

  let post: (RecordedResponse & { error: unknown }) | { failed: string };
  try {
    const response = await request.fetch(OPENAI_RESPONSES_ENDPOINT, {
      ...options,
      method: 'POST',
      headers: {
        origin,
        'user-agent': userAgent,
        authorization: `Bearer ${FAKE_API_KEY}`,
        'content-type': 'application/json',
      },
      data: { model: REVIEW_CONFIG.model, input: UI_CHECK_TEXT, max_output_tokens: 16, store: false },
    });
    post = { ...describeResponse(response), error: await errorKind(response) };
  } catch (error) {
    post = { failed: firstLine(error) };
  }

  return {
    preflight,
    preflightAllowsApp: 'status' in preflight && preflightAllows(preflight, origin),
    post,
    errorResponseHasCors: 'status' in post && 'access-control-allow-origin' in post.headers,
  };
}

test('실제 OpenAI 엔드포인트 브라우저 호출 확인 (가짜 키)', async ({ page, baseURL, request }) => {
  test.skip(process.env.OPENAI_PROBE !== '1', 'OPENAI_PROBE=1일 때만 실행');
  const audit = auditPage(page, baseURL!);

  await page.goto('./');
  await registerFakeKey(page);
  await fillUiCheckText(page);
  await page.getByRole('button', { name: '감평 실행' }).click();
  await expect(errorTitle(page)).toBeVisible({ timeout: 60_000 });

  const title = (await errorTitle(page).textContent()) ?? '';
  const origin = new URL(baseURL!).origin;
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const browserRead401 = title.startsWith('인증 실패');
  const browserNetworkError = title.startsWith('네트워크 오류');
  // 브라우저가 401을 읽었으면 다시 보내지 않는다.
  const outsideBrowser = browserNetworkError ? await replayOutsideBrowser(request, origin, userAgent) : null;
  const outcome = browserRead401
    ? 'reachable'
    : browserNetworkError
      ? outsideBrowser?.preflightAllowsApp
        ? 'preflight_ok'
        : 'blocked'
      : 'other';

  const report = {
    checkedAt: new Date().toISOString(),
    page: baseURL,
    origin,
    endpoint: OPENAI_RESPONSES_ENDPOINT,
    userAgent,
    outcome,
    shownTitle: title,
    apiRequests: audit.apiRequestCount(),
    apiMethods: audit.apiMethods,
    outsideAllowList: audit.outsideAllowList(),
    consoleErrors: audit.consoleMessages.filter((message) => message.type === 'error').map((message) => message.text),
    failedRequests: audit.failedRequests,
    outsideBrowser,
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/openai-probe.json', `${JSON.stringify(report, null, 2)}\n`);

  expect(report.outsideAllowList).toEqual([]);
  expect(report.apiRequests).toBe(1);
  // preflight_ok는 통과로 본다: 브라우저가 요청을 보낼 수는 있다. 성공 응답을 읽는지는 실호출로 확인한다.
  expect(['reachable', 'preflight_ok'], `화면 표시: ${title}, 결과: ${outcome}`).toContain(outcome);
});

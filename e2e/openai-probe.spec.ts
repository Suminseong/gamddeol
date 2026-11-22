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
 * - 기대 결과: OpenAI가 401을 돌려주고 화면에 "인증 실패 (401)"이 보인다 (= CORS 통과).
 * - 막히면 원인을 가리기 위해, 같은 요청을 브라우저 밖(Node)에서 다시 보내 응답 상태와 CORS 헤더를 기록한다.
 *   사전 확인(OPTIONS)은 키·본문 없이, 본 요청(POST)은 같은 가짜 키와 UI 검사 문자열로 보낸다.
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

function describeResponse(response: APIResponse) {
  const headers = response.headers();
  return {
    status: response.status(),
    headers: Object.fromEntries(RECORDED_HEADERS.filter((name) => name in headers).map((name) => [name, headers[name]])),
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

/** 브라우저가 보낸 것과 같은 요청을 브라우저 밖에서 다시 보내, OpenAI가 무엇을 돌려주는지 기록한다. */
async function replayOutsideBrowser(request: APIRequestContext, origin: string, userAgent: string) {
  const options = { failOnStatusCode: false, maxRedirects: 0, timeout: 30_000 } as const;
  const userAgents = [...new Set([userAgent, userAgent.replace('HeadlessChrome', 'Chrome')])];

  const preflights = [];
  for (const agent of userAgents) {
    try {
      const response = await request.fetch(OPENAI_RESPONSES_ENDPOINT, {
        ...options,
        method: 'OPTIONS',
        headers: {
          origin,
          'user-agent': agent,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      });
      preflights.push({ userAgent: agent, ...describeResponse(response) });
    } catch (error) {
      preflights.push({ userAgent: agent, failed: firstLine(error) });
    }
  }

  let post;
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

  return { preflights, post };
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
  const outcome = title.startsWith('인증 실패') ? 'reachable' : title.startsWith('네트워크 오류') ? 'blocked' : 'other';
  const origin = new URL(baseURL!).origin;
  const userAgent = await page.evaluate(() => navigator.userAgent);
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
    // 브라우저에서 막혔을 때만 브라우저 밖에서 다시 보내 원인을 가린다.
    outsideBrowser: outcome === 'reachable' ? null : await replayOutsideBrowser(request, origin, userAgent),
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/openai-probe.json', `${JSON.stringify(report, null, 2)}\n`);

  expect(report.outsideAllowList).toEqual([]);
  expect(report.apiRequests).toBe(1);
  expect(outcome, `화면 표시: ${title}`).toBe('reachable');
});

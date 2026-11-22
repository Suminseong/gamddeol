import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { auditPage, errorTitle, fillUiCheckText, OPENAI_RESPONSES_ENDPOINT, registerFakeKey } from './support.ts';

/**
 * 실제 OpenAI 엔드포인트에 가짜 키로 요청해, 브라우저 직접 호출이 CORS로 막히지 않는지 확인한다.
 * - 보내는 값: 가짜 키(Authorization 헤더)와 짧은 UI 검사 문자열뿐이다.
 * - 기대 결과: OpenAI가 401을 돌려주고 화면에 "인증 실패 (401)"이 보인다 (= CORS 통과).
 * - "네트워크 오류 또는 브라우저 차단"이 보이면 차단으로 기록한다.
 * OPENAI_PROBE=1일 때만 실행한다 (GitHub Actions의 배포 후 검증 단계).
 */
test('실제 OpenAI 엔드포인트 브라우저 호출 확인 (가짜 키)', async ({ page, baseURL }) => {
  test.skip(process.env.OPENAI_PROBE !== '1', 'OPENAI_PROBE=1일 때만 실행');
  const audit = auditPage(page, baseURL!);

  await page.goto('./');
  await registerFakeKey(page);
  await fillUiCheckText(page);
  await page.getByRole('button', { name: '감평 실행' }).click();
  await expect(errorTitle(page)).toBeVisible({ timeout: 60_000 });

  const title = (await errorTitle(page).textContent()) ?? '';
  const outcome = title.startsWith('인증 실패') ? 'reachable' : title.startsWith('네트워크 오류') ? 'blocked' : 'other';
  const report = {
    checkedAt: new Date().toISOString(),
    page: baseURL,
    endpoint: OPENAI_RESPONSES_ENDPOINT,
    outcome,
    shownTitle: title,
    apiRequests: audit.apiRequestCount(),
    apiMethods: audit.apiMethods,
    outsideAllowList: audit.outsideAllowList(),
    consoleErrors: audit.consoleMessages.filter((message) => message.type === 'error').map((message) => message.text),
    failedRequests: audit.failedRequests,
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/openai-probe.json', `${JSON.stringify(report, null, 2)}\n`);

  expect(report.outsideAllowList).toEqual([]);
  expect(report.apiRequests).toBe(1);
  expect(outcome, `화면 표시: ${title}`).toBe('reachable');
});

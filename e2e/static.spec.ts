import { expect, test } from '@playwright/test';
import { auditPage, expectCleanConsole, OPENAI_RESPONSES_ENDPOINT } from './support.ts';

test('프로젝트 경로에서 정적 리소스가 모두 로드되고, 새로고침해도 그대로 열린다', async ({ page, baseURL }) => {
  const audit = auditPage(page, baseURL!);

  const first = await page.goto('./');
  expect(first?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: '감떨 알파' })).toBeVisible();
  await expect(page.getByRole('button', { name: '감평 실행' })).toBeDisabled();

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain(`connect-src ${OPENAI_RESPONSES_ENDPOINT};`);
  expect(csp).toContain("default-src 'none'");
  expect(csp).not.toMatch(/unsafe-/);

  const expectedBuildId = process.env.E2E_EXPECT_BUILD_ID;
  if (expectedBuildId) {
    await expect(page.locator('meta[name="gamddeol-build"]')).toHaveAttribute('content', expectedBuildId);
  }
  await expect(page.getByText(/모의 모드/)).toHaveCount(0);

  const reloaded = await page.reload();
  expect([200, 304]).toContain(reloaded?.status());
  await expect(page.getByRole('heading', { level: 1, name: '감떨 알파' })).toBeVisible();

  const assets = audit.requests.filter((url) => /\/assets\/.+\.(js|css)$/.test(url));
  expect(assets.some((url) => url.endsWith('.js'))).toBe(true);
  expect(assets.some((url) => url.endsWith('.css'))).toBe(true);
  expect(audit.failedRequests).toEqual([]);
  expect(audit.badResponses).toEqual([]);
  expect(audit.outsideAllowList()).toEqual([]);
  expect(audit.apiRequestCount()).toBe(0);
  expectCleanConsole(audit);
});

test('좁은 화면(390px)에서도 가로 스크롤 없이 한 단으로 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: '감떨 알파' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

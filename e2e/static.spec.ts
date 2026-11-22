import { expect, test, type Page } from '@playwright/test';
import { auditPage, expectCleanConsole, OPENAI_RESPONSES_ENDPOINT } from './support.ts';

/**
 * 배포 산출물이 GitHub Pages 프로젝트 경로(/gamddeol/)에서 열리는지, 앱 안쪽 주소로 바로 들어오거나 새로고침해도 화면이 뜨는지 본다.
 * Pages는 안쪽 주소에 404 상태와 404.html(= index.html 사본)을 주므로 문서 상태는 200·304·404를 모두 받는다.
 */

const ANY_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

test('루트는 작품 목록으로 열리고, 정적 리소스·CSP·빌드 식별자가 맞다', async ({ page, baseURL }) => {
  const audit = auditPage(page, baseURL!);

  const first = await page.goto('./');
  expect(first?.status()).toBe(200);
  await expect(heading(page)).toHaveText('작품 목록');
  await expect(page).toHaveURL(new URL('works', baseURL).href);
  await expect(page).toHaveTitle('작품 목록 · 감떨');

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain(`connect-src ${OPENAI_RESPONSES_ENDPOINT};`);
  expect(csp).toContain("default-src 'none'");
  expect(csp).not.toMatch(/unsafe-/);

  const expectedBuildId = process.env.E2E_EXPECT_BUILD_ID;
  if (expectedBuildId) {
    await expect(page.locator('meta[name="gamddeol-build"]')).toHaveAttribute('content', expectedBuildId);
  }
  await expect(page.getByText(/모의 모드/)).toHaveCount(0);
  await expect(page.getByText(/이 탭 메모리에만/).first()).toBeVisible();

  const reloaded = await page.reload();
  expect([200, 304, 404]).toContain(reloaded?.status());
  await expect(heading(page)).toHaveText('작품 목록');

  const assets = audit.requests.filter((url) => /\/assets\/.+\.(js|css)$/.test(url));
  expect(assets.some((url) => url.endsWith('.js'))).toBe(true);
  expect(assets.some((url) => url.endsWith('.css'))).toBe(true);
  expect(audit.failedRequests).toEqual([]);
  expect(audit.badResponses).toEqual([]);
  expect(audit.outsideAllowList()).toEqual([]);
  expect(audit.apiRequestCount()).toBe(0);
  expectCleanConsole(audit);
});

test('안쪽 주소로 바로 들어오거나 새로고침해도 해당 화면이 뜬다', async ({ page, baseURL }) => {
  const audit = auditPage(page, baseURL!);
  for (const [path, title] of [
    ['works/new', '작품 생성'],
    ['settings/ai', 'AI 연결 및 전송 동의'],
    ['settings/data', '데이터·삭제 정책'],
    ['review', '빠른 감평'],
  ] as const) {
    const response = await page.goto(path);
    expect([200, 404]).toContain(response?.status());
    await expect(heading(page)).toHaveText(title);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  }
  await page.reload();
  await expect(heading(page)).toHaveText('빠른 감평');
  expect(audit.failedRequests).toEqual([]);
  expect(audit.badResponses).toEqual([]);
  expect(audit.outsideAllowList()).toEqual([]);
  expectCleanConsole(audit);
});

test('아직 열지 않은 단계(v1·later)의 화면과 잘못된 주소는 404 화면이다', async ({ page }) => {
  for (const path of [`works/${ANY_ID}/timeline`, `works/${ANY_ID}/maps`, `works/${ANY_ID}/wiki/schema`, 'works/not-an-id', 'no-such-page']) {
    await page.goto(path);
    await expect(heading(page)).toHaveText('페이지를 찾을 수 없습니다');
  }
});

test('작품 메뉴에는 MVP 화면만 있고, 작품 자료는 이 탭 메모리에만 있어 새로고침하면 "열려 있지 않은 작품"이 된다', async ({ page }) => {
  await page.goto('works/new');
  await page.getByLabel(/작품명/).fill('UI 검사 작품');
  await page.getByRole('button', { name: '작품 만들기' }).click();
  await expect(heading(page)).toHaveText('UI 검사 작품');
  const nav = page.getByRole('navigation', { name: '앱 메뉴' });
  await expect(nav.getByRole('link', { name: '설정집 및 위키' })).toBeVisible();
  for (const label of ['복선', '작중 연표', '인물 인지', '관계도', '지도', '랜덤 생성표']) {
    await expect(page.getByRole('link', { name: label })).toHaveCount(0);
  }
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect(heading(page)).toHaveText('이 탭에 열려 있지 않은 작품입니다');
});

test('좁은 화면(390px)에서도 가로 스크롤 없이 한 단으로 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(heading(page)).toHaveText('작품 목록');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

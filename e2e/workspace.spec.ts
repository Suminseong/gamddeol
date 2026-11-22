import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { auditPage, expectCleanConsole, expectNothingPersisted, UI_CHECK_TEXT } from './support.ts';

/**
 * 작품 작업 흐름(수동 기능, AI 없음)과 좁은 화면 배치.
 * 본문은 UI 검사 문자열(소설 원고 아님)만 쓰고, 네트워크 요청은 프로젝트 경로 밖으로 나가지 않아야 한다.
 */

const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const appNav = (page: Page) => page.getByRole('navigation', { name: '앱 메뉴' });

async function createWork(page: Page) {
  await page.goto('works/new');
  await page.getByLabel(/작품명/).fill('UI 검사 작품');
  await page.getByRole('button', { name: '작품 만들기' }).click();
  await expect(heading(page)).toHaveText('UI 검사 작품');
}

async function pasteChapter(page: Page) {
  await page.getByRole('link', { name: '회차 업로드' }).first().click();
  await expect(heading(page)).toHaveText('회차 업로드');
  await page.getByText('붙여넣기', { exact: true }).click();
  await page.getByLabel('원고 본문').fill(UI_CHECK_TEXT);
  await page.getByRole('button', { name: '다음: 확인' }).click();
  await page.getByRole('button', { name: '1개 회차 등록' }).click();
  await expect(page.getByText(/모두 등록했습니다/)).toBeVisible();
}

/** 판본 본문에서 문구를 고른다(마우스로 끌어 고른 것과 같은 선택 범위를 만들고 mouseup을 보낸다). */
async function selectInReader(page: Page, phrase: string) {
  await page.evaluate((target) => {
    const root = document.querySelector('.reader-text');
    if (!root) throw new Error('reader missing');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(target) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + target.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return;
    }
    throw new Error('phrase not found');
  }, phrase);
}

test('작품 생성 → 붙여넣기 등록 → 판본에서 근거를 골라 진술 저장 → 위키 확인 → JSON 내려받기, 외부 전송 없음', async ({ page, baseURL }) => {
  const audit = auditPage(page, baseURL!);
  await createWork(page);

  await appNav(page).getByRole('link', { name: '원고 및 회차' }).click();
  await expect(heading(page)).toHaveText('원고 및 회차');
  await expect(page.getByText(/아직 회차가 없습니다|올린 회차가 없습니다/)).toBeVisible();
  await pasteChapter(page);
  await page.getByRole('link', { name: '판본 열기' }).click();

  const reader = page.getByRole('region', { name: /판본 v1 본문/ });
  await expect(reader).toContainText('UI 검사 문자열 1행');
  await expect(page.getByRole('heading', { name: '이 판본의 근거 0건' })).toBeVisible();

  const phrase = UI_CHECK_TEXT.split('\n')[0]!;
  await selectInReader(page, phrase);
  await page.getByLabel('설정 항목').selectOption({ label: '+ 새 항목 만들기' });
  await page.getByLabel(/새 항목 이름/).fill('UI 검사 항목');
  await page.getByLabel(/^값/).fill('UI 검사 값');
  await page.getByRole('button', { name: '근거와 함께 진술 저장' }).click();
  await expect(page.getByText('저장했습니다. 아래 근거 목록에 표시됩니다.')).toBeVisible();
  await expect(page.getByRole('heading', { name: '이 판본의 근거 1건' })).toBeVisible();
  await expect(reader.locator('mark')).toHaveText(phrase);

  await appNav(page).getByRole('link', { name: '설정집 및 위키' }).click();
  await expect(heading(page)).toHaveText('설정집 및 위키');
  await page.getByRole('link', { name: 'UI 검사 항목' }).first().click();
  await expect(heading(page)).toHaveText('UI 검사 항목');
  await expect(page.getByText('UI 검사 값').first()).toBeVisible();

  await appNav(page).getByRole('link', { name: '내보내기' }).click();
  await expect(page.getByText(/이 작품에 내보내지 않은 변경이 있습니다/)).toBeVisible();
  await page.getByRole('button', { name: '내보내기 파일 만들기' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'JSON 내려받기' }).click();
  const download = await downloading;
  const file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(file.format).toBe('gamddeol.work');
  expect(Object.values<{ normalizedText: string }>(file.data.versions).map((version) => version.normalizedText)).toEqual([UI_CHECK_TEXT]);
  expect(Object.values<{ exactQuote: string }>(file.data.anchors).map((anchor) => anchor.exactQuote)).toEqual([phrase]);
  await expect(page.getByText(/이 작품에 내보내지 않은 변경이 있습니다/)).toHaveCount(0);

  expect(audit.outsideAllowList()).toEqual([]);
  expect(audit.apiRequestCount()).toBe(0);
  expect(audit.failedRequests).toEqual([]);
  expect(audit.badResponses).toEqual([]);
  expectCleanConsole(audit);
  await expectNothingPersisted(page, baseURL!, new URL(page.url()).pathname.replace(new URL(baseURL!).pathname, ''));
});

test.describe('360px 화면 (작품 화면)', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  /** 가로 넘침·입력 글자 크기·누르는 대상 높이(시각적으로 숨긴 입력은 그 label로 잰다). */
  async function checkLayout(page: Page, name: string) {
    const result = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((el) => el.getBoundingClientRect().right > width + 0.5)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
      // 글자를 입력받지 않는 체크박스·라디오·파일 선택·슬라이더는 자동 확대 대상이 아니므로 뺀다.
      const small = [...document.querySelectorAll<HTMLElement>('input, textarea, select')]
        .filter((el) => !['checkbox', 'radio', 'file', 'range'].includes((el as HTMLInputElement).type) && el.getBoundingClientRect().width > 1 && parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => el.id || el.className);
      const short = [...document.querySelectorAll<HTMLElement>('main input, main select, main button, main textarea, main a[class*="button"]')]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => {
          const box = el.getBoundingClientRect();
          const hidden = box.width <= 1 || box.height <= 1;
          const label = el.closest('label') ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
          const row = (el as HTMLInputElement).type === 'checkbox' ? el.closest('.field-check') : null;
          const target = hidden && label ? label : row ?? el;
          return { name: el.id || el.textContent?.trim() || el.className, height: target.getBoundingClientRect().height };
        })
        .filter((item) => item.height < 44)
        .map((item) => `${item.name}: ${item.height}`);
      return { scrollWidth: document.documentElement.scrollWidth, width, wide, small, short };
    });
    expect(result.wide, `${name}: 넘치는 요소`).toEqual([]);
    expect(result.scrollWidth, `${name}: 가로 스크롤`).toBeLessThanOrEqual(result.width);
    expect(result.small, `${name}: 16px 미만 입력`).toEqual([]);
    expect(result.short, `${name}: 44px 미만 대상`).toEqual([]);
  }

  test('작품 목록·생성·대시보드·회차·업로드·판본·위키·내보내기·설정이 가로로 넘치지 않는다', async ({ page }) => {
    await page.goto('works');
    await checkLayout(page, '작품 목록(빈 상태)');
    await createWork(page);
    await checkLayout(page, '대시보드');
    // 새로고침하면 메모리 자료가 사라지므로 이후 이동은 화면 안 메뉴(드로어)로 한다.
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    const drawer = page.getByRole('dialog', { name: '메뉴' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('link', { name: '원고 및 회차' }).click();
    await expect(drawer).toHaveCount(0);
    await expect(heading(page)).toHaveText('원고 및 회차');
    await checkLayout(page, '원고 및 회차(빈 상태)');
    await page.getByRole('link', { name: '회차 업로드' }).first().click();
    await checkLayout(page, '회차 업로드');
    await page.getByText('붙여넣기', { exact: true }).click();
    await page.getByLabel('원고 본문').fill(UI_CHECK_TEXT);
    await page.getByRole('button', { name: '다음: 확인' }).click();
    await checkLayout(page, '회차 업로드 확인');
    await page.getByRole('button', { name: '1개 회차 등록' }).click();
    await page.getByRole('link', { name: '판본 열기' }).click();
    await expect(page.getByRole('region', { name: /판본 v1 본문/ })).toBeVisible();
    await checkLayout(page, '판본 보기');

    for (const [label, title] of [
      ['설정집 및 위키', '설정집 및 위키'],
      ['AI 후보 검토함', 'AI 후보 검토함'],
      ['충돌 후보', '충돌 후보'],
      ['가상 독자 성향', '가상 독자 성향'],
      ['내보내기', '내보내기'],
    ] as const) {
      await page.getByRole('button', { name: '메뉴 열기' }).click();
      await page.getByRole('dialog', { name: '메뉴' }).getByRole('link', { name: label }).click();
      await expect(heading(page)).toHaveText(title);
      await checkLayout(page, title);
    }
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    await page.getByRole('dialog', { name: '메뉴' }).getByRole('link', { name: '설정', exact: true }).click();
    await expect(heading(page)).toHaveText('사용자 설정');
    await checkLayout(page, '사용자 설정');
  });
});

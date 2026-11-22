import { expect, test } from '@playwright/test';
import {
  fillUiCheckText,
  fulfillJson,
  mockSuccessBody,
  OPENAI_RESPONSES_ENDPOINT,
  registerFakeKey,
  resultText,
  runButton,
} from './support.ts';

/**
 * 좁은 화면·키보드·스크린리더 관련 회귀 검사. 가짜 키·UI 검사 문자열·네트워크 모의 응답만 쓴다.
 * 실기기(iOS Safari·Android Chrome)와 실제 스크린리더 낭독은 여기서 확인하지 않는다.
 */

const LONG_MOCK_TEXT = Array.from({ length: 120 }, (_, i) => `[네트워크 모의 응답] 스크롤 확인용 ${i + 1}행`).join('\n');

test.describe('360px 화면', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test('가로로 넘치지 않고, 입력은 16px 이상·누르는 대상은 44px 이상이다', async ({ page }) => {
    await page.route(OPENAI_RESPONSES_ENDPOINT, (route) => fulfillJson(route, 200, mockSuccessBody()));
    await page.goto('review');

    const overflow = () =>
      page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((el) => el.getBoundingClientRect().right > width + 0.5)
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
        return { scrollWidth: document.documentElement.scrollWidth, width, wide };
      });

    let result = await overflow();
    expect(result.wide).toEqual([]);
    expect(result.scrollWidth).toBeLessThanOrEqual(result.width);

    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('input:not([type="radio"]):not([type="checkbox"]), textarea, select')].map((el) => ({
        id: el.id,
        fontSize: parseFloat(getComputedStyle(el).fontSize),
      })),
    );
    for (const { id, fontSize } of sizes) expect(fontSize, id).toBeGreaterThanOrEqual(16);

    const targets = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main input, main select, main button')].map((el) => ({
        name: el.id || el.textContent,
        height: el.getBoundingClientRect().height,
      })),
    );
    for (const { name, height } of targets) expect(height, String(name)).toBeGreaterThanOrEqual(44);

    await registerFakeKey(page);
    await fillUiCheckText(page);
    await runButton(page).click();
    await expect(resultText(page)).toBeVisible();
    result = await overflow();
    expect(result.wide).toEqual([]);
    expect(result.scrollWidth).toBeLessThanOrEqual(result.width);
  });
});

test('키보드 순서는 키 → 등록 → 지우기 → 원고 → 관점 → 실행이다', async ({ page }) => {
  await page.goto('review');
  await registerFakeKey(page);
  await fillUiCheckText(page);
  await page.getByLabel('OpenAI API 키').focus();
  const order: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    order.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.textContent || ''));
    await page.keyboard.press('Tab');
  }
  expect(order).toEqual(['openai-key', '등록', '지우기', 'manuscript', 'review-perspective', '감평 실행']);
});

test('관점은 라디오 그룹에서 방향키로 선택하고 탭으로 실행 버튼에 이동한다', async ({ page }) => {
  await page.goto('review');
  await registerFakeKey(page);
  await fillUiCheckText(page);
  const general = page.getByRole('radio', { name: '일반 감평' });
  const pacing = page.getByRole('radio', { name: '전개·몰입' });
  await general.focus();
  await expect(general).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(pacing).toBeFocused();
  await expect(pacing).toBeChecked();
  await expect(page.locator('#review-perspective-description')).toContainText('전개 속도');
  await page.keyboard.press('Tab');
  await expect(runButton(page)).toBeFocused();
});

test('강제 색상에서도 선택 관점과 키보드 초점이 보인다', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('review');
  const general = page.getByRole('radio', { name: '일반 감평' });
  const pacing = page.getByRole('radio', { name: '전개·몰입' });
  await general.focus();
  await page.keyboard.press('ArrowRight');
  await expect(pacing).toBeChecked();
  await expect(pacing).toBeFocused();
  const style = await pacing.locator('..').locator('.perspective-option-surface').evaluate((element) => {
    const computed = getComputedStyle(element);
    return { borderWidth: parseFloat(computed.borderTopWidth), outlineWidth: parseFloat(computed.outlineWidth), outlineStyle: computed.outlineStyle };
  });
  expect(style.borderWidth).toBeGreaterThanOrEqual(3);
  expect(style.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(style.outlineStyle).toBe('solid');
});

test('키보드로 실행하면 취소 버튼으로, 끝나면 실행 버튼으로 초점이 돌아온다', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(OPENAI_RESPONSES_ENDPOINT, async (route) => {
    await gate;
    await fulfillJson(route, 200, mockSuccessBody());
  });
  await page.goto('review');
  await registerFakeKey(page);
  await fillUiCheckText(page);

  await runButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '취소' })).toBeFocused();

  release();
  await expect(resultText(page)).toBeVisible();
  await expect(runButton(page)).toBeFocused();
});

test('대기 중 경과 시간은 화면에만 바뀌고 스크린리더 상태 문구는 그대로다', async ({ page }) => {
  await page.clock.install();
  await page.route(OPENAI_RESPONSES_ENDPOINT, async () => {
    // 응답하지 않는다.
  });
  await page.goto('review');
  await registerFakeKey(page);
  await fillUiCheckText(page);
  await runButton(page).click();

  const status = page.locator('.result-panel [role="status"]');
  await expect(status).toHaveCount(1);
  const before = await status.textContent();
  await expect(page.locator('.waiting-elapsed')).toHaveText('0초');
  await page.clock.fastForward('00:05');
  await expect(page.locator('.waiting-elapsed')).toHaveText('5초');
  expect(await status.textContent()).toBe(before);
  expect(before).not.toMatch(/\d/);
});

test('긴 결과 본문은 키보드로 초점을 옮겨 스크롤할 수 있다', async ({ page }) => {
  await page.route(OPENAI_RESPONSES_ENDPOINT, (route) => fulfillJson(route, 200, mockSuccessBody(LONG_MOCK_TEXT)));
  await page.goto('review');
  await registerFakeKey(page);
  await fillUiCheckText(page);
  await runButton(page).click();

  const region = page.getByRole('region', { name: '감평 결과 본문' });
  await expect(region).toBeVisible();
  await region.focus();
  await expect(region).toBeFocused();
  expect(await region.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.keyboard.press('PageDown');
  await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

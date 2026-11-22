import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  errorTitle,
  fillUiCheckText,
  fulfillJson,
  keyInput,
  manuscriptInput,
  OPENAI_RESPONSES_ENDPOINT,
  openAIErrorBody,
  registerFakeKey,
  runButton,
} from './support.ts';

/**
 * 컨트롤 경계·키보드 초점 표시·placeholder의 명암비를 브라우저가 실제로 계산한 스타일로 잰다.
 * 라이트·다크는 시스템 설정(prefers-color-scheme)을 흉내 내 앱의 data-theme 전환을 그대로 탄다.
 * 경계는 요소 바깥 배경(조상 배경을 합성한 색)과 요소 자신의 배경 양쪽과 비교하고, 요소 opacity도 반영한다.
 * 가짜 키·UI 검사 문자열·네트워크 모의 응답만 쓴다.
 */

interface ControlMeasure {
  /** 경계색 vs 요소 바깥 배경. */
  borderVsOuter: number;
  /** 경계색 vs 요소 자신의 배경. */
  borderVsInner: number;
  /** 초점 표시(outline) vs 바깥 배경. outline이 없으면 0. */
  outlineVsOuter: number;
  outlineWidth: number;
  outlineStyle: string;
  /** placeholder 글자 vs 요소 배경. placeholder가 없으면 null. */
  placeholderVsInner: number | null;
  /** 요소 배경을 바깥에 합성한 색 (상태 비교용). */
  inner: string;
  opacity: number;
}

/** 브라우저 안에서 실행된다. 직렬화되므로 바깥 변수를 참조하지 않는다. */
function inspectControl(el: Element): ControlMeasure {
  type Rgb = [number, number, number];
  const parse = (value: string): [number, number, number, number] => {
    const match = /rgba?\(([^)]+)\)/.exec(value);
    if (!match?.[1]) throw new Error(`해석할 수 없는 색: ${value}`);
    const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
  };
  const mix = (fg: Rgb, bg: Rgb, alpha: number): Rgb => [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
  const luminance = (c: Rgb) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as Rgb;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: Rgb, b: Rgb) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const rgbOf = (c: [number, number, number, number]): Rgb => [c[0], c[1], c[2]];
  const opacityOf = (node: Element) => Number.parseFloat(getComputedStyle(node).opacity);

  // 바깥 배경: 문서 루트부터 부모까지 배경을 차례로 합성한다(각 조상의 opacity 포함).
  const chain: Element[] = [];
  for (let node = el.parentElement; node; node = node.parentElement) chain.unshift(node);
  let outer: Rgb = [255, 255, 255];
  for (const node of chain) {
    const bg = parse(getComputedStyle(node).backgroundColor);
    outer = mix(rgbOf(bg), outer, bg[3] * opacityOf(node));
  }

  const style = getComputedStyle(el);
  const opacity = opacityOf(el);
  const bg = parse(style.backgroundColor);
  const ownBg = mix(rgbOf(bg), outer, bg[3]);
  const inner = mix(ownBg, outer, opacity);
  const border = parse(style.borderTopColor);
  const borderPixel = mix(mix(rgbOf(border), ownBg, border[3]), outer, opacity);

  const outlineStyle = style.outlineStyle;
  const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
  let outlineVsOuter = 0;
  if (outlineStyle !== 'none' && outlineWidth > 0) {
    const outline = parse(style.outlineColor);
    outlineVsOuter = ratio(mix(rgbOf(outline), outer, outline[3] * opacity), outer);
  }

  let placeholderVsInner: number | null = null;
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.placeholder) {
    const placeholder = getComputedStyle(el, '::placeholder');
    const color = parse(placeholder.color);
    const alpha = color[3] * Number.parseFloat(placeholder.opacity || '1');
    placeholderVsInner = ratio(mix(rgbOf(color), inner, alpha), inner);
  }

  return {
    borderVsOuter: ratio(borderPixel, outer),
    borderVsInner: ratio(borderPixel, inner),
    outlineVsOuter,
    outlineWidth,
    outlineStyle,
    placeholderVsInner,
    inner: inner.map((v) => Math.round(v)).join(','),
    opacity,
  };
}

const measure = (locator: Locator) => locator.evaluate(inspectControl);

async function expectVisibleBoundary(locator: Locator, name: string) {
  const m = await measure(locator);
  expect(m.borderVsOuter, `${name}: 경계 vs 바깥 배경`).toBeGreaterThanOrEqual(3);
  expect(m.borderVsInner, `${name}: 경계 vs 안쪽 배경`).toBeGreaterThanOrEqual(3);
  return m;
}

const controls = (page: Page): [Locator, string][] => [
  [keyInput(page), 'API 키 입력'],
  [page.getByRole('button', { name: '등록' }), '등록 버튼'],
  [page.getByRole('button', { name: '지우기' }), '지우기 버튼'],
  [manuscriptInput(page), '원고 입력'],
  [page.getByRole('combobox', { name: '감평 관점' }), '관점 선택'],
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} 테마`, () => {
    test.use({ colorScheme: scheme });

    test.beforeEach(async ({ page }) => {
      await page.goto('review');
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    });

    test('입력·원고·선택·보조 버튼 경계가 안팎 배경과 3:1 이상이다', async ({ page }) => {
      for (const [locator, name] of controls(page)) await expectVisibleBoundary(locator, name);
    });

    test('placeholder 글자가 입력칸 배경과 4.5:1 이상이다', async ({ page }) => {
      for (const [locator, name] of [
        [keyInput(page), 'API 키 입력'],
        [manuscriptInput(page), '원고 입력'],
      ] as const) {
        const m = await measure(locator);
        expect(m.placeholderVsInner, `${name}: placeholder`).not.toBeNull();
        expect(m.placeholderVsInner!, `${name}: placeholder`).toBeGreaterThanOrEqual(4.5);
      }
    });

    test('키보드 초점 표시가 2px 이상이고 바깥 배경과 3:1 이상이다', async ({ page }) => {
      await registerFakeKey(page);
      await fillUiCheckText(page);
      // 탭 순서대로 키보드로 옮겨 가며 잰다(:focus-visible이 키보드 초점 기준으로 켜지도록).
      await keyInput(page).focus();
      for (const [locator, name] of [...controls(page), [runButton(page), '감평 실행 버튼'] as [Locator, string]]) {
        await expect(locator).toBeFocused();
        const m = await measure(locator);
        expect(m.outlineStyle, `${name}: 초점 표시`).toBe('solid');
        expect(m.outlineWidth, `${name}: 초점 표시 두께`).toBeGreaterThanOrEqual(2);
        expect(m.outlineVsOuter, `${name}: 초점 표시 vs 바깥 배경`).toBeGreaterThanOrEqual(3);
        await page.keyboard.press('Tab');
      }
    });

    test('실행 중 읽기 전용 원고와 비활성 관점 선택도 경계가 보이고 상태가 구별된다', async ({ page }) => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(OPENAI_RESPONSES_ENDPOINT, async (route) => {
        await gate;
        await fulfillJson(route, 500, openAIErrorBody('server', 'server_error', null));
      });
      await registerFakeKey(page);
      await fillUiCheckText(page);

      const selector = page.getByRole('combobox', { name: '감평 관점' });
      const idleManuscript = await measure(manuscriptInput(page));
      const idleSelector = await measure(selector);

      await runButton(page).focus();
      await page.keyboard.press('Enter');
      await expect(manuscriptInput(page)).toHaveJSProperty('readOnly', true);
      await expect(selector).toBeDisabled();

      const busyManuscript = await expectVisibleBoundary(manuscriptInput(page), '읽기 전용 원고');
      const busySelector = await expectVisibleBoundary(selector, '비활성 관점 선택');
      await expectVisibleBoundary(page.getByRole('button', { name: '취소' }), '취소 버튼');
      expect(busyManuscript.inner, '읽기 전용 원고 배경이 바뀐다').not.toBe(idleManuscript.inner);
      expect(busySelector.inner, '비활성 관점 선택 배경이 바뀐다').not.toBe(idleSelector.inner);

      release();
      await expect(errorTitle(page)).toHaveText('OpenAI 서버 오류 (500)');
      const retry = page.getByRole('button', { name: '다시 시도' });
      await expectVisibleBoundary(retry, '오류 영역의 다시 시도 버튼');
      await retry.focus();
      const focused = await measure(retry);
      expect(focused.outlineVsOuter, '다시 시도 버튼 초점 표시 vs 오류 배경').toBeGreaterThanOrEqual(3);
    });
  });
}

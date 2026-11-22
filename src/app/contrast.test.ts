// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 색 조합의 명암비를 토큰 파일 값으로 직접 계산한다 (WCAG 2.2 상대 휘도 공식).
 * - 글자: 이 알파의 해당 글자는 12–16px 보통/굵은 글씨라 큰 글자 예외 없이 4.5:1 (1.4.3).
 * - 컨트롤 경계·초점 표시: 3:1 (1.4.11).
 * 브라우저가 실제로 그린 색은 e2e/contrast.spec.ts가 라이트·다크에서 따로 잰다.
 */

const tokensCss = readFileSync(new URL('../../docs/design/tokens/design-tokens.css', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 줄 첫머리에서 시작하는 최상위 규칙 블록의 본문. */
function ruleBody(css: string, selector: string): string {
  const match = new RegExp(`^${escape(selector)} \\{([^}]*)\\}`, 'm').exec(css);
  if (!match?.[1]) throw new Error(`rule ${selector} not found`);
  return match[1];
}

function hexVariables(css: string, selector: string): Record<string, string> {
  return Object.fromEntries(
    [...ruleBody(css, selector).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]),
  );
}

const light = { ...hexVariables(tokensCss, ':root'), ...hexVariables(appCss, ':root') };
const dark = {
  ...light,
  ...hexVariables(tokensCss, '[data-theme="dark"]'),
  ...hexVariables(appCss, "[data-theme='dark']"),
};
const THEMES = [
  ['라이트', light],
  ['다크', dark],
] as const;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(theme: Record<string, string>, fg: string, bg: string): number {
  const a = theme[fg];
  const b = theme[bg];
  if (!a || !b) throw new Error(`color variable missing: ${a ? bg : fg}`);
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** [용도, 글자색 토큰, 배경색 토큰] — app.css에서 실제로 쓰는 조합. */
const TEXT_PAIRS: [string, string, string][] = [
  ['글자 수·결과 메타·힌트·placeholder', '--color-text-secondary', '--color-surface-elevated'],
  ['바닥글', '--color-text-secondary', '--color-canvas-primary'],
  ['전송 고지 설정 줄', '--color-text-secondary', '--color-accent-primary-soft'],
  ['오류 영역 힌트', '--color-text-secondary', '--status-danger-bg'],
  ['오류 제목', '--status-danger-fg', '--status-danger-bg'],
  ['원고 초과 글자 수', '--status-danger-fg', '--color-surface-elevated'],
  ['키 등록됨', '--status-fact-fg', '--color-surface-elevated'],
  ['OpenAI 응답 배지', '--color-text-primary', '--status-candidate-bg'],
  ['모의 응답 배지', '--status-deprecated-fg', '--status-deprecated-bg'],
  ['보안 안내 제목', '--color-text-primary', '--status-warning-bg'],
  ['실행 중 읽기 전용 원고 글자', '--color-text-primary', '--color-canvas-secondary'],
  ['실행 중 비활성 관점 선택 글자', '--color-text-secondary', '--color-canvas-secondary'],
];

/** [위치, 컨트롤 바로 바깥 또는 안쪽 배경 토큰] — 입력·원고·선택·보조 버튼이 놓이는 곳. */
const CONTROL_BACKGROUNDS: [string, string][] = [
  ['패널 면·입력칸 안', '--color-surface-elevated'],
  ['페이지 캔버스', '--color-canvas-primary'],
  ['잠긴 입력칸 안(읽기 전용 원고·비활성 선택)', '--color-canvas-secondary'],
  ['오류 영역(다시 시도 버튼 바깥)', '--status-danger-bg'],
  ['모의 모드 배너(시나리오 선택 바깥)', '--status-deprecated-bg'],
];

/** 초점 표시(outline, offset 2px)가 그려지는 바깥 배경. */
const FOCUS_BACKGROUNDS: [string, string][] = [
  ...CONTROL_BACKGROUNDS.filter(([, bg]) => bg !== '--color-canvas-secondary'),
  ['보안 안내(링크)', '--status-warning-bg'],
];

describe('글자 명암비 (토큰 값 기준)', () => {
  it.each(TEXT_PAIRS)('%s: 라이트·다크 모두 4.5:1 이상', (_, fg, bg) => {
    expect(ratio(light, fg, bg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('muted 글자색은 면 위에서 4.5:1에 못 미쳐, 비활성 버튼 외에는 쓰지 않는다', () => {
    expect(ratio(light, '--color-text-muted', '--color-surface-elevated')).toBeLessThan(4.5);
    const uses = [...appCss.matchAll(/([^{}]+)\{[^}]*color:\s*var\(--color-text-muted\)/g)].map((m) => m[1]!.trim());
    expect(uses).toEqual(['.neu-cta-button:disabled']);
  });

  it('placeholder는 브라우저 기본색 대신 보조 글자색을 쓴다', () => {
    const body = ruleBody(appCss, '.text-input::placeholder,\n.manuscript-input::placeholder');
    expect(body).toMatch(/color:\s*var\(--color-text-secondary\)/);
    expect(body).toMatch(/opacity:\s*1;/);
  });
});

describe('컨트롤 경계 (WCAG 1.4.11, 3:1)', () => {
  it('앱 범위 경계 변수는 app.css에만 있고 디자인 원본 토큰 파일은 그대로다', () => {
    expect(tokensCss).not.toContain('--app-control-border');
    expect(light['--app-control-border']).toBe('#8a8579');
    expect(dark['--app-control-border']).toBe('#737882');
  });

  it('원본 경계 토큰은 아직 면 위에서 3:1에 못 미친다 (넘게 되면 앱 변수를 지우고 원본 토큰을 쓴다)', () => {
    for (const [, theme] of THEMES) {
      expect(ratio(theme, '--color-border-strong', '--color-surface-elevated')).toBeLessThan(3);
      expect(ratio(theme, '--color-border-subtle', '--color-surface-elevated')).toBeLessThan(3);
    }
  });

  it.each(CONTROL_BACKGROUNDS)('경계색 vs %s: 라이트·다크 모두 3:1 이상', (_, bg) => {
    for (const [, theme] of THEMES) {
      expect(ratio(theme, '--app-control-border', bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('입력·원고·선택·보조 버튼이 앱 경계 변수를 쓴다', () => {
    expect(ruleBody(appCss, '.text-input')).toMatch(/border:\s*1px solid var\(--app-control-border\)/);
    expect(ruleBody(appCss, '.button-secondary')).toMatch(/border:\s*1px solid var\(--app-control-border\)/);
    expect(ruleBody(appCss, '.manuscript-input')).toMatch(/border-color:\s*var\(--app-control-border\)/);
  });

  it('잠긴 원고·선택은 투명도를 낮추지 않고 배경색으로 상태를 보인다', () => {
    const readonly = ruleBody(appCss, '.manuscript-input[readonly]');
    expect(readonly).not.toMatch(/opacity/);
    expect(readonly).toMatch(/background-color:\s*var\(--color-canvas-secondary\)/);
    const disabled = ruleBody(appCss, '.text-input:disabled');
    expect(disabled).toMatch(/opacity:\s*1;/);
    expect(disabled).toMatch(/background-color:\s*var\(--color-canvas-secondary\)/);
  });
});

describe('키보드 초점 표시 (3:1)', () => {
  it('초점 표시는 2px 실선 강조색이다', () => {
    expect(ruleBody(appCss, ':focus-visible')).toMatch(/outline:\s*2px solid var\(--color-accent-primary\)/);
  });

  it.each(FOCUS_BACKGROUNDS)('강조색 vs %s: 라이트·다크 모두 3:1 이상', (_, bg) => {
    for (const [, theme] of THEMES) {
      expect(ratio(theme, '--color-accent-primary', bg)).toBeGreaterThanOrEqual(3);
    }
  });
});

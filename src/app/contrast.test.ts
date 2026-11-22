// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 색 조합의 명암비를 토큰 파일 값으로 직접 계산한다 (WCAG 2.2 상대 휘도 공식).
 * - 글자: 앱의 글자는 12–17px 보통/굵은 글씨라 큰 글자 예외 없이 4.5:1 (1.4.3).
 * - 컨트롤 경계·초점 표시: 3:1 (1.4.11).
 * 앱 스타일(app.css)은 색을 토큰 v0.3 변수로만 쓴다. 브라우저가 실제로 그린 색은 e2e/contrast.spec.ts가 잰다.
 */

const tokensCss = readFileSync(new URL('../../docs/design/tokens/design-tokens.css', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
const appCssCode = appCss.replace(/\/\*[\s\S]*?\*\//g, '');

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 줄 첫머리에서 시작하는 최상위 규칙 블록의 본문. */
function ruleBody(css: string, selector: string): string {
  const match = new RegExp(`^${escape(selector)} \\{([^}]*)\\}`, 'm').exec(css);
  if (!match?.[1]) throw new Error(`rule ${selector} not found`);
  return match[1];
}

type Rgba = [number, number, number, number];

function colorVariables(css: string, selector: string): Record<string, Rgba> {
  const body = ruleBody(css, selector);
  const entries: [string, Rgba][] = [];
  for (const m of body.matchAll(/(--[\w-]+):\s*#([0-9a-fA-F]{6})\b/g)) {
    const hex = m[2]!;
    entries.push([m[1]!, [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1) as Rgba]);
  }
  for (const m of body.matchAll(/(--[\w-]+):\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/g)) {
    entries.push([m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]]);
  }
  return Object.fromEntries(entries);
}

const light = colorVariables(tokensCss, ':root');
const dark = { ...light, ...colorVariables(tokensCss, '[data-theme="dark"]') };
const THEMES = [
  ['라이트', light],
  ['다크', dark],
] as const;

/** 반투명 색은 받침색 위에 섞은 결과로 잰다. */
function resolve(theme: Record<string, Rgba>, name: string, under?: string): [number, number, number] {
  const color = theme[name];
  if (!color) throw new Error(`color variable missing: ${name}`);
  const [r, g, b, a] = color;
  if (a >= 1) return [r, g, b];
  if (!under) throw new Error(`translucent ${name} needs a backdrop`);
  const base = resolve(theme, under);
  return [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(theme: Record<string, Rgba>, fg: string, bg: string, under?: string): number {
  const la = luminance(resolve(theme, fg, under));
  const lb = luminance(resolve(theme, bg, under));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** [용도, 글자색 토큰, 배경색 토큰, 반투명 배경의 받침색] — app.css에서 실제로 쓰는 조합. */
const TEXT_PAIRS: [string, string, string, string?][] = [
  ['본문·제목 (면)', '--color-text-primary', '--color-surface-elevated'],
  ['본문 (캔버스·KPI 카드)', '--color-text-primary', '--color-canvas-primary'],
  ['사이드바·잠긴 입력칸·단계 번호', '--color-text-primary', '--color-canvas-secondary'],
  ['안내 배너·현재 단계·일괄 처리 바', '--color-text-primary', '--color-accent-primary-soft'],
  ['힌트·메타·placeholder (면)', '--color-text-secondary', '--color-surface-elevated'],
  ['힌트·바닥글 (캔버스)', '--color-text-secondary', '--color-canvas-primary'],
  ['사이드바 메뉴·비활성 입력칸 글자', '--color-text-secondary', '--color-canvas-secondary'],
  ['전송 고지·안내 배너 힌트', '--color-text-secondary', '--color-accent-primary-soft'],
  ['경고 배너·저장 안내 띠 힌트', '--color-text-secondary', '--status-warning-bg'],
  ['오류 영역 힌트', '--color-text-secondary', '--status-danger-bg'],
  ['링크 (면)', '--color-accent-primary', '--color-surface-elevated'],
  ['링크 (캔버스)', '--color-accent-primary', '--color-canvas-primary'],
  ['사이드바 링크', '--color-accent-primary', '--color-canvas-secondary'],
  ['현재 메뉴·선택한 트리 항목', '--color-accent-primary', '--color-accent-primary-soft'],
  ['경고 배너 안 링크', '--color-accent-primary', '--status-warning-bg'],
  ['오류 배너 안 링크', '--color-accent-primary', '--status-danger-bg'],
  ['링크 hover', '--color-accent-primary-hover', '--color-surface-elevated'],
  ['주요 버튼·선택된 분할 버튼', '--color-accent-contrast', '--color-accent-primary'],
  ['주요 버튼 hover', '--color-accent-contrast', '--color-accent-primary-hover'],
  ['위험 버튼', '--color-accent-contrast', '--status-danger-fg'],
  ['인식 단계 배지: 확정 설정', '--color-text-primary', '--status-canon-bg'],
  ['인식 단계 배지: 원문 사실·키 등록됨', '--color-text-primary', '--status-fact-bg'],
  ['인식 단계 배지: 인물 진술', '--color-text-primary', '--status-claim-bg'],
  ['인식 단계 배지: 후보·AI 배지', '--color-text-primary', '--status-candidate-bg'],
  ['인식 단계 배지: 충돌·보류·경고 배너', '--color-text-primary', '--status-warning-bg'],
  ['인식 단계 배지: 기각·모의 배너', '--color-text-primary', '--status-deprecated-bg'],
  ['인식 단계 배지: 근거 유실·오류 배너', '--color-text-primary', '--status-danger-bg'],
  ['오류 제목', '--status-danger-fg', '--status-danger-bg'],
  ['입력 오류·초과 글자 수·위험 테두리 버튼', '--status-danger-fg', '--color-surface-elevated'],
  ['키 등록됨 표시', '--status-fact-fg', '--color-surface-elevated'],
  ['모의 응답 배지', '--status-deprecated-fg', '--status-deprecated-bg'],
  ['판본 비교: 추가된 줄', '--diff-added-fg', '--diff-added-bg'],
  ['판본 비교: 지운 줄', '--diff-removed-fg', '--diff-removed-bg'],
  ['원문 근거 강조', '--color-text-primary', '--anchor-highlight-bg', '--color-surface-elevated'],
  ['선택한 근거 강조', '--color-text-primary', '--anchor-highlight-active-bg', '--color-surface-elevated'],
];

/** [위치, 컨트롤 바로 바깥 또는 안쪽 배경 토큰] — 입력·원고·선택·보조 버튼이 놓이는 곳. */
const CONTROL_BACKGROUNDS: [string, string][] = [
  ['패널 면·입력칸 안', '--color-surface-elevated'],
  ['페이지 캔버스', '--color-canvas-primary'],
  ['사이드바·잠긴 입력칸 안(읽기 전용 원고·비활성 선택)', '--color-canvas-secondary'],
  ['일괄 처리 바·안내 배너', '--color-accent-primary-soft'],
  ['경고 배너·저장 안내 띠', '--status-warning-bg'],
  ['오류 영역(다시 시도 버튼 바깥)', '--status-danger-bg'],
  ['모의 모드 배너(시나리오 선택 바깥)', '--status-deprecated-bg'],
];

/** 초점 표시(outline, offset 2px)가 그려지는 바깥 배경. */
const FOCUS_BACKGROUNDS: [string, string][] = CONTROL_BACKGROUNDS;

describe('글자 명암비 (토큰 값 기준)', () => {
  it.each(TEXT_PAIRS)('%s: 라이트·다크 모두 4.5:1 이상', (_, fg, bg, under) => {
    expect(ratio(light, fg, bg, under)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark, fg, bg, under)).toBeGreaterThanOrEqual(4.5);
  });

  it('muted 글자색은 면 위에서 4.5:1에 못 미쳐, 비활성 버튼 외에는 쓰지 않는다', () => {
    expect(ratio(light, '--color-text-muted', '--color-surface-elevated')).toBeLessThan(4.5);
    const uses = [...appCssCode.matchAll(/([^{}]+)\{[^}]*color:\s*var\(--color-text-muted\)/g)].map((m) => m[1]!.trim());
    expect(uses).toEqual(['.neu-cta-button:disabled']);
  });

  it('후보·경고 상태색은 제 배경 위 글자로 4.5:1에 못 미쳐, 글자색으로 쓰지 않는다', () => {
    expect(ratio(light, '--status-candidate-fg', '--status-candidate-bg')).toBeLessThan(4.5);
    expect(ratio(light, '--status-warning-fg', '--status-warning-bg')).toBeLessThan(4.5);
    for (const token of ['candidate', 'warning']) {
      expect(appCssCode).not.toMatch(new RegExp(`(^|[^-])color:\\s*var\\(--status-${token}-fg\\)`, 'm'));
    }
  });

  it('placeholder는 브라우저 기본색 대신 보조 글자색을 쓴다', () => {
    const body = ruleBody(appCss, '.text-input::placeholder,\n.manuscript-input::placeholder');
    expect(body).toMatch(/color:\s*var\(--color-text-secondary\)/);
    expect(body).toMatch(/opacity:\s*1;/);
  });

  it('앱 스타일은 색을 토큰 변수로만 쓴다 (hex 리터럴·앱 범위 색 변수 없음)', () => {
    expect(appCssCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(appCss).not.toContain('--app-control-border');
  });
});

describe('컨트롤 경계 (WCAG 1.4.11, 3:1)', () => {
  it('v0.3 토큰에 컨트롤 경계색이 있고, 장식용 구분선 토큰은 면 위에서 3:1에 못 미친다', () => {
    expect(light['--color-border-control']).toBeDefined();
    expect(dark['--color-border-control']).not.toEqual(light['--color-border-control']);
    for (const [, theme] of THEMES) {
      expect(ratio(theme, '--color-border-strong', '--color-surface-elevated')).toBeLessThan(3);
      expect(ratio(theme, '--color-border-subtle', '--color-surface-elevated')).toBeLessThan(3);
    }
  });

  it.each(CONTROL_BACKGROUNDS)('경계색 vs %s: 라이트·다크 모두 3:1 이상', (_, bg) => {
    for (const [, theme] of THEMES) {
      expect(ratio(theme, '--color-border-control', bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('입력·원고·선택·보조 버튼이 컨트롤 경계 토큰을 쓴다', () => {
    expect(ruleBody(appCss, '.text-input')).toMatch(/border:\s*1px solid var\(--color-border-control\)/);
    expect(ruleBody(appCss, '.button-secondary')).toMatch(/border:\s*1px solid var\(--color-border-control\)/);
    expect(ruleBody(appCss, '.manuscript-input')).toMatch(/border-color:\s*var\(--color-border-control\)/);
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

// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 글자색과 배경색 토큰 조합의 명암비를 토큰 파일 값으로 직접 계산한다 (WCAG 2.2 상대 휘도 공식).
 * 이 알파의 해당 글자는 12–16px 보통/굵은 글씨라 큰 글자 예외 없이 4.5:1을 기준으로 한다.
 */

const tokensCss = readFileSync(new URL('../../docs/design/tokens/design-tokens.css', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

function readTheme(selector: string): Record<string, string> {
  const start = tokensCss.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`theme block ${selector} not found`);
  const block = tokensCss.slice(start, tokensCss.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
}

const light = readTheme(':root');
const dark = { ...light, ...readTheme('[data-theme="dark"]') };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(theme: Record<string, string>, fg: string, bg: string): number {
  const a = luminance(theme[fg]!);
  const b = luminance(theme[bg]!);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** [용도, 글자색 토큰, 배경색 토큰] — app.css에서 실제로 쓰는 조합. */
const TEXT_PAIRS: [string, string, string][] = [
  ['글자 수·결과 메타·힌트', '--color-text-secondary', '--color-surface-elevated'],
  ['바닥글', '--color-text-secondary', '--color-canvas-primary'],
  ['전송 고지 설정 줄', '--color-text-secondary', '--color-accent-primary-soft'],
  ['오류 영역 힌트', '--color-text-secondary', '--status-danger-bg'],
  ['오류 제목', '--status-danger-fg', '--status-danger-bg'],
  ['원고 초과 글자 수', '--status-danger-fg', '--color-surface-elevated'],
  ['키 등록됨', '--status-fact-fg', '--color-surface-elevated'],
  ['OpenAI 응답 배지', '--color-text-primary', '--status-candidate-bg'],
  ['모의 응답 배지', '--status-deprecated-fg', '--status-deprecated-bg'],
  ['보안 안내 제목', '--color-text-primary', '--status-warning-bg'],
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
});

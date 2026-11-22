/**
 * 표시용 반올림과 표 만들기. 계산 결과는 반올림하지 않고, 화면·문서에 보일 때만 여기서 반올림한다.
 *
 * 반올림 규칙: 배정밀도 값의 정확한 십진 값을 기준으로 가장 가까운 자리로 맞춘다.
 * 정확히 한가운데이면 0에서 먼 쪽으로 간다(ECMAScript Number.prototype.toFixed 규칙).
 */
import type { EpisodeResult, SimulationResult } from './kernel.ts';
import type { SimulationInput } from './model.ts';

export const NOT_APPLICABLE = '해당 없음';
export const DISPLAY_DIGITS = 4;

/** 고정 소수 자릿수 문자열. 0으로 반올림된 음수는 "-0.0000" 대신 "0.0000"으로 쓴다. */
export function formatFixed(value: number, digits: number = DISPLAY_DIGITS): string {
  if (!Number.isFinite(value)) throw new RangeError('유한한 숫자만 표시합니다.');
  if (Math.abs(value) >= 1e21) throw new RangeError('표시 범위(1e21 미만)를 넘었습니다.');
  const text = value.toFixed(digits);
  return /^-0\.?0*$/.test(text) ? text.slice(1) : text;
}

/** 기대 인원(소수). */
export const formatCount = (count: number, digits: number = DISPLAY_DIGITS) => formatFixed(count, digits);

/** 0–1 비율을 백분율로. null은 분모가 0인 경우다. */
export const formatPercent = (value: number | null, digits: number = DISPLAY_DIGITS) =>
  value === null ? NOT_APPLICABLE : `${formatFixed(value * 100, digits)}%`;

/** 확률 차이를 %p로. 양수에는 +를 붙인다. */
export function formatPoints(delta: number, digits: number = DISPLAY_DIGITS): string {
  const text = formatFixed(delta * 100, digits);
  return `${text.startsWith('-') || /^0\.?0*$/.test(text) ? '' : '+'}${text}%p`;
}

function formatRow(row: EpisodeResult): string {
  const groups = row.groups.map((group) => `${formatPercent(group.churnProbability)} / ${formatCount(group.remaining)}`);
  return `| ${[
    String(row.episode),
    ...groups,
    formatCount(row.total),
    formatPercent(row.cumulativeRetention),
    formatPercent(row.continuationRate),
  ].join(' | ')} |`;
}

/** 검증 계획의 표와 같은 모양의 마크다운 표(머리말 2줄 + 회차별 1줄). */
export function formatTable(input: SimulationInput, result: SimulationResult): string[] {
  const header = ['회차', ...input.groups.map((group) => `${group.label} 이탈 / 잔류`), '전체 잔류', '누적 잔존율', '연속 열람률'];
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...result.episodes.map(formatRow),
  ];
}

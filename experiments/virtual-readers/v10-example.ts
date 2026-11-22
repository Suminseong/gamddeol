/**
 * V10 2집단·4회차 수동 태그 예제와 기대값.
 * 출처: 노션 "PoC 검증 계획 · 합성 원고와 독자 지표 검산 v0.1" → "가상 독자 2집단 검산"
 * (https://app.notion.com/p/420cd7a6269781c29f66c15683709c34, 2026-11-22T01:44Z 편집본).
 *
 * 수치는 오락용 가정이며 시장 예측이 아니다. 원고와 무관한 수동 태그 입력이다.
 * "순애 집단 지시값"은 betrayalTrustSensitivity로 옮겼다(순애 1, 피폐 0).
 */
import type { SimulationInput } from './model.ts';

export const V10_EXAMPLE_INPUT: SimulationInput = {
  groups: [
    {
      id: 'sunae',
      label: '순애',
      initialCount: 6000,
      initialState: { frustration: 0, satisfaction: 2, trust: 0.8 },
      weights: { G: -0.2, B: -0.55, C: 0.35, R: 0.15, H: -0.25 },
      betrayalTrustSensitivity: 1,
    },
    {
      id: 'pipye',
      label: '피폐',
      initialCount: 4000,
      initialState: { frustration: 0, satisfaction: 2, trust: 0.8 },
      weights: { G: 0.05, B: 0.2, C: 0.15, R: 0.15, H: 0.25 },
      betrayalTrustSensitivity: 0,
    },
  ],
  episodes: [
    { tags: { G: 2 }, baseChurn: 0.03 },
    { tags: { B: 2 }, baseChurn: 0.025 },
    { tags: { C: 2, R: 1 }, baseChurn: 0.02 },
    { tags: { H: 2 }, baseChurn: 0.015 },
  ],
};

/** 검증 계획 표의 행을 그대로 옮긴 것(표시 4자리). */
export const V10_EXPECTED_ROWS = [
  '| 1 | 6.4504% / 5612.9757 | 3.8743% / 3845.0284 | 9458.0041 | 94.5800% | 94.5800% |',
  '| 2 | 29.4956% / 3957.3935 | 2.9384% / 3732.0466 | 7689.4401 | 76.8944% | 81.3009% |',
  '| 3 | 3.3381% / 3825.2934 | 2.2547% / 3647.8998 | 7473.1932 | 74.7319% | 97.1877% |',
  '| 4 | 5.3951% / 3618.9164 | 1.6851% / 3586.4288 | 7205.3452 | 72.0535% | 96.4159% |',
] as const;

interface ExpectedGroup {
  churnPercent: number;
  remaining: number;
}

/** 같은 표를 숫자로. 허용오차 비교용. */
export const V10_EXPECTED = [
  { sunae: { churnPercent: 6.4504, remaining: 5612.9757 }, pipye: { churnPercent: 3.8743, remaining: 3845.0284 }, total: 9458.0041, cumulativePercent: 94.58, continuationPercent: 94.58 },
  { sunae: { churnPercent: 29.4956, remaining: 3957.3935 }, pipye: { churnPercent: 2.9384, remaining: 3732.0466 }, total: 7689.4401, cumulativePercent: 76.8944, continuationPercent: 81.3009 },
  { sunae: { churnPercent: 3.3381, remaining: 3825.2934 }, pipye: { churnPercent: 2.2547, remaining: 3647.8998 }, total: 7473.1932, cumulativePercent: 74.7319, continuationPercent: 97.1877 },
  { sunae: { churnPercent: 5.3951, remaining: 3618.9164 }, pipye: { churnPercent: 1.6851, remaining: 3586.4288 }, total: 7205.3452, cumulativePercent: 72.0535, continuationPercent: 96.4159 },
] as const satisfies readonly {
  sunae: ExpectedGroup;
  pipye: ExpectedGroup;
  total: number;
  cumulativePercent: number;
  continuationPercent: number;
}[];

/** 2화 순애 집단, 같은 직전 상태에서 B만 0으로 둔 반사실. */
export const V10_COUNTERFACTUAL = {
  episode: 2,
  groupId: 'sunae',
  tags: { B: 0 },
  counterfactualPercent: 4.946,
  effectPoints: 24.5496,
} as const;

/**
 * 동결 입력의 해시(커널 v10-poc-0.1). 예제 입력이나 커널 상수가 바뀌면 달라진다.
 * 바뀐 것이 의도라면 커널 버전을 올리고 이 값과 README의 실행 기록을 함께 고친다.
 */
export const V10_INPUT_HASH = 'sha256:730d4e55207e66ac11b8f0cf50fd91d10fbbb5812b548e54d7b965054bfc2b5e';

/** 검증 계획이 제안한 허용오차: 인원 0.0001명, 비율 0.0001%p. */
export const V10_TOLERANCE = { count: 0.0001, percentPoints: 0.0001 } as const;

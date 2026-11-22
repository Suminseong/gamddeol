/**
 * 가상 독자 결정적 계산 커널 (IA aiPipelines.deterministicKernel kernel.v10.basic).
 *
 * experiments/virtual-readers(PR #9)와 같은 식을 앱 쪽에 따로 둔 구현이다(앱은 실험 폴더를 가져오지 않는다).
 * 난수·유입·섭동·외부 호출·시계가 없고 중간 반올림도 없다. 같은 입력이면 같은 결과다.
 * 수치는 오락용 가상 실험이며 실제 독자 지표나 시장 예측이 아니다.
 *
 *   x = Σ 가중치[tag] × 강도[tag]
 *   F = clamp(0.6×직전F + max(0, −G가중치×G강도) − 0.15×C강도, 0, 3)
 *   S = clamp(0.5×직전S + 1 + x − 0.5×F, 0, 4)            (F는 이번 회차 값)
 *   T = clamp(직전T − 0.25×B강도×배신민감도 + 0.1×R강도, 0, 1)
 *   p = b + (1−b)×σ(2×(0.15 − S − 0.5×T))
 *   N = 직전N × (1−p)
 */
import { TAG_KEYS, type TagIntensities, type TagKey } from '../domain/types';

export const KERNEL_VERSION = 'v10-basic-1';
export const PRNG_VERSION = 'none';
export const TAXONOMY_VERSION = 'taxonomy.v10.base';
export const INITIAL_STATE = { frustration: 0, satisfaction: 2, trust: 0.8 } as const;
/** 회차별 기본 이탈률 b. 5회차부터는 마지막 값을 그대로 쓴다(IA baselineB는 4회차까지만 정의). */
export const BASELINE_B = [0.03, 0.025, 0.02, 0.015] as const;
export const INTENSITY_MAX = 3;

export const TAG_LABELS: Record<TagKey, string> = {
  G: '고구마',
  B: '관계 배신',
  C: '사이다',
  R: '복선 회수',
  H: '비극',
};

export function baseChurnFor(stepIndex: number): number {
  return BASELINE_B[Math.min(stepIndex, BASELINE_B.length - 1)]!;
}

export interface KernelCohort {
  id: string;
  name: string;
  initialCount: number;
  weights: TagIntensities;
  betrayalSensitivity: number;
}

export interface KernelStepInput {
  tags: TagIntensities;
}

export interface KernelCohortStep {
  cohortId: string;
  name: string;
  frustration: number;
  satisfaction: number;
  trust: number;
  contribution: number;
  churnProbability: number;
  previousCount: number;
  remaining: number;
}

export interface KernelStep {
  stepIndex: number;
  baseChurn: number;
  cohorts: KernelCohortStep[];
  initialTotal: number;
  previousTotal: number;
  total: number;
  cumulativeRetention: number | null;
  consecutiveReadRate: number | null;
}

export class KernelInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KernelInputError';
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const ratio = (numerator: number, denominator: number) => (denominator === 0 ? null : numerator / denominator);

function validate(cohorts: KernelCohort[], steps: KernelStepInput[]) {
  if (cohorts.length === 0) throw new KernelInputError('독자 집단이 없습니다.');
  if (steps.length === 0) throw new KernelInputError('계산할 회차가 없습니다.');
  for (const cohort of cohorts) {
    if (!Number.isFinite(cohort.initialCount) || cohort.initialCount < 0 || cohort.initialCount > Number.MAX_SAFE_INTEGER) {
      throw new KernelInputError(`${cohort.name}: 초기 인원은 0 이상이어야 합니다.`);
    }
    if (!(cohort.betrayalSensitivity >= 0 && cohort.betrayalSensitivity <= 1)) {
      throw new KernelInputError(`${cohort.name}: 배신 민감도는 0–1이어야 합니다.`);
    }
    for (const tag of TAG_KEYS) {
      const weight = cohort.weights[tag];
      if (!Number.isFinite(weight) || Math.abs(weight) > 1e6) {
        throw new KernelInputError(`${cohort.name}: ${TAG_LABELS[tag]} 가중치가 올바르지 않습니다.`);
      }
    }
  }
  steps.forEach((step, index) => {
    for (const tag of TAG_KEYS) {
      const value = step.tags[tag];
      if (!Number.isInteger(value) || value < 0 || value > INTENSITY_MAX) {
        throw new KernelInputError(`${index + 1}번째 회차: ${TAG_LABELS[tag]} 강도는 0–3 정수여야 합니다.`);
      }
    }
  });
}

/** 합계는 집단 id 순서로 더한다(입력 순서와 무관하게 같은 값). */
function sumById(values: { id: string; value: number }[]): number {
  return [...values].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).reduce((acc, item) => acc + item.value, 0);
}

export function simulate(cohorts: KernelCohort[], steps: KernelStepInput[]): KernelStep[] {
  validate(cohorts, steps);
  const initialTotal = sumById(cohorts.map((cohort) => ({ id: cohort.id, value: cohort.initialCount })));
  let states: { frustration: number; satisfaction: number; trust: number }[] = cohorts.map(() => ({ ...INITIAL_STATE }));
  let counts = cohorts.map((cohort) => cohort.initialCount);
  let previousTotal = initialTotal;
  return steps.map((step, stepIndex) => {
    const b = baseChurnFor(stepIndex);
    const intensity = (tag: TagKey) => step.tags[tag];
    const cohortSteps = cohorts.map((cohort, index): KernelCohortStep => {
      const previous = states[index]!;
      let contribution = 0;
      for (const tag of TAG_KEYS) contribution += cohort.weights[tag] * intensity(tag);
      const frustration = clamp(
        0.6 * previous.frustration + Math.max(0, -cohort.weights.G * intensity('G')) - 0.15 * intensity('C'),
        0,
        3,
      );
      const satisfaction = clamp(0.5 * previous.satisfaction + 1 + contribution - 0.5 * frustration, 0, 4);
      const trust = clamp(
        previous.trust - 0.25 * intensity('B') * cohort.betrayalSensitivity + 0.1 * intensity('R'),
        0,
        1,
      );
      const churnProbability = b + (1 - b) * sigmoid(2 * (0.15 - satisfaction - 0.5 * trust));
      const previousCount = counts[index]!;
      return {
        cohortId: cohort.id,
        name: cohort.name,
        frustration,
        satisfaction,
        trust,
        contribution,
        churnProbability,
        previousCount,
        remaining: previousCount * (1 - churnProbability),
      };
    });
    const total = sumById(cohortSteps.map((item) => ({ id: item.cohortId, value: item.remaining })));
    const result: KernelStep = {
      stepIndex,
      baseChurn: b,
      cohorts: cohortSteps,
      initialTotal,
      previousTotal,
      total,
      cumulativeRetention: ratio(total, initialTotal),
      consecutiveReadRate: ratio(total, previousTotal),
    };
    states = cohortSteps.map(({ frustration, satisfaction, trust }) => ({ frustration, satisfaction, trust }));
    counts = cohortSteps.map((item) => item.remaining);
    previousTotal = total;
    return result;
  });
}

export function zeroTags(): TagIntensities {
  return { G: 0, B: 0, C: 0, R: 0, H: 0 };
}

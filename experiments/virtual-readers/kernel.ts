/**
 * 가상 독자 계산 커널(결정적). 난수·유입·섭동 없음, 외부 호출 없음, 중간 반올림 없음.
 * 같은 입력이면 같은 실행 환경에서 비트 단위로 같은 결과를 낸다.
 */
import {
  checkTagIntensities,
  type GroupProfile,
  type GroupState,
  idOrder,
  InputError,
  KERNEL,
  type SimulationInput,
  sumInOrder,
  TAG_IDS,
  type TagId,
  type TagIntensities,
  validateInput,
} from './model.ts';

export interface StepOutcome extends GroupState {
  /** 회차 기여도 x = Σ 가중치×강도. */
  contribution: number;
  /** 이번 회차 이탈확률 p. */
  churnProbability: number;
}

export interface GroupEpisodeResult extends StepOutcome {
  groupId: string;
  /** 직전 기대 잔류 인원. */
  previousCount: number;
  /** 이번 기대 잔류 인원 N = 직전 N×(1−p). 소수 그대로 둔다. */
  remaining: number;
  /** 직전 − 이번. */
  churned: number;
}

export interface EpisodeResult {
  /** 1부터 세는 회차 번호(입력 순서). */
  episode: number;
  /** 입력의 집단 순서. */
  groups: GroupEpisodeResult[];
  /** 직전 합계 N. 1회차는 초기 합계. */
  previousTotal: number;
  /** 이번 합계 N. 집단 id 순서로 더한다(입력 순서와 무관하게 같은 값). */
  total: number;
  /** 누적 잔존율 = 이번 합계 ÷ 초기 합계. 분모가 0이면 null(해당 없음). */
  cumulativeRetention: number | null;
  /** 연속 열람률 = 이번 합계 ÷ 직전 합계. 분모가 0이면 null(해당 없음). */
  continuationRate: number | null;
}

export interface SimulationResult {
  kernelVersion: string;
  initialTotal: number;
  episodes: EpisodeResult[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const ratio = (numerator: number, denominator: number) => (denominator === 0 ? null : numerator / denominator);

/** 한 집단의 한 회차 상태 전이. 인원과 무관하다. 식의 순서는 F → S(이번 F 사용) → T → p. */
export function stepGroup(
  group: GroupProfile,
  previous: GroupState,
  tags: TagIntensities,
  baseChurn: number,
): StepOutcome {
  const intensity = (tag: TagId) => tags[tag] ?? 0;

  let contribution = 0;
  for (const tag of TAG_IDS) contribution += group.weights[tag] * intensity(tag);

  const { frustration: F, satisfaction: S, trust: T, churn } = KERNEL;
  const frustration = clamp(
    F.decay * previous.frustration + Math.max(0, -group.weights.G * intensity('G')) - F.reliefPerC * intensity('C'),
    0,
    F.max,
  );
  const satisfaction = clamp(
    S.decay * previous.satisfaction + S.base + contribution - S.frustrationWeight * frustration,
    0,
    S.max,
  );
  const trust = clamp(
    previous.trust -
      T.betrayalDropPerB * intensity('B') * group.betrayalTrustSensitivity +
      T.payoffGainPerR * intensity('R'),
    0,
    T.max,
  );
  const z = churn.steepness * (churn.threshold - satisfaction - churn.trustWeight * trust);
  const churnProbability = baseChurn + (1 - baseChurn) * sigmoid(z);

  return { frustration, satisfaction, trust, contribution, churnProbability };
}

/** 입력 전체를 회차 순서대로 계산한다. 입력을 바꾸지 않는다. */
export function simulate(input: SimulationInput): SimulationResult {
  validateInput(input);
  const order = idOrder(input.groups);
  const initialTotal = sumInOrder(
    input.groups.map((group) => group.initialCount),
    order,
  );

  let states: GroupState[] = input.groups.map(({ initialState }) => ({ ...initialState }));
  let counts: number[] = input.groups.map((group) => group.initialCount);
  let previousTotal = initialTotal;
  const episodes: EpisodeResult[] = [];

  input.episodes.forEach((episode, episodeIndex) => {
    const groups = input.groups.map((group, groupIndex): GroupEpisodeResult => {
      const outcome = stepGroup(group, states[groupIndex]!, episode.tags, episode.baseChurn);
      const previousCount = counts[groupIndex]!;
      const remaining = previousCount * (1 - outcome.churnProbability);
      return { groupId: group.id, ...outcome, previousCount, remaining, churned: previousCount - remaining };
    });
    const total = sumInOrder(
      groups.map((group) => group.remaining),
      order,
    );
    episodes.push({
      episode: episodeIndex + 1,
      groups,
      previousTotal,
      total,
      cumulativeRetention: ratio(total, initialTotal),
      continuationRate: ratio(total, previousTotal),
    });
    states = groups.map(({ frustration, satisfaction, trust }) => ({ frustration, satisfaction, trust }));
    counts = groups.map((group) => group.remaining);
    previousTotal = total;
  });

  return { kernelVersion: KERNEL.version, initialTotal, episodes };
}

export interface CounterfactualQuery {
  /** 바꿀 회차(1부터). */
  episode: number;
  /** 그 회차 태그 강도를 덮어쓸 값. 0이면 그 태그를 뺀 것과 같다. */
  tags: TagIntensities;
}

export interface CounterfactualGroupResult {
  groupId: string;
  /** 원래 태그의 이탈확률. */
  baseline: number;
  /** 바꾼 태그의 이탈확률(같은 직전 상태). */
  counterfactual: number;
  /** 원래 − 바꾼 것. 양수면 원래 태그가 이탈을 늘렸다는 뜻이다. */
  effect: number;
  baselineRemaining: number;
  counterfactualRemaining: number;
}

export interface CounterfactualResult {
  episode: number;
  tags: Record<TagId, number>;
  groups: CounterfactualGroupResult[];
}

/**
 * 한 회차 반사실 비교: 같은 직전 상태에서 그 회차 태그만 바꿔 다시 계산한다.
 * 이후 회차로 퍼지는 효과는 계산하지 않는다. 여러 태그의 효과는 비선형이라 더해지지 않는다.
 */
export function counterfactual(input: SimulationInput, query: CounterfactualQuery): CounterfactualResult {
  const baseline = simulate(input);
  if (!Number.isInteger(query.episode) || query.episode < 1 || query.episode > input.episodes.length) {
    throw new InputError('out_of_range', 'query.episode', `1 이상 ${input.episodes.length} 이하 정수여야 합니다.`);
  }
  checkTagIntensities(query.tags, 'query.tags');

  const index = query.episode - 1;
  const episode = input.episodes[index]!;
  const changed = Object.fromEntries(
    TAG_IDS.map((tag) => [tag, query.tags[tag] ?? episode.tags[tag] ?? 0]),
  ) as Record<TagId, number>;
  const before = index === 0 ? null : baseline.episodes[index - 1]!;
  const actual = baseline.episodes[index]!;

  const groups = input.groups.map((group, groupIndex): CounterfactualGroupResult => {
    const previousState: GroupState = before ? before.groups[groupIndex]! : group.initialState;
    const previousCount = before ? before.groups[groupIndex]!.remaining : group.initialCount;
    const outcome = stepGroup(group, previousState, changed, episode.baseChurn);
    const baselineGroup = actual.groups[groupIndex]!;
    return {
      groupId: group.id,
      baseline: baselineGroup.churnProbability,
      counterfactual: outcome.churnProbability,
      effect: baselineGroup.churnProbability - outcome.churnProbability,
      baselineRemaining: baselineGroup.remaining,
      counterfactualRemaining: previousCount * (1 - outcome.churnProbability),
    };
  });

  return { episode: query.episode, tags: changed, groups };
}

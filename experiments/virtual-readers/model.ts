/**
 * 가상 독자 계산 PoC: 입력 모델·커널 상수·입력 검증.
 *
 * 출처: 노션 "PoC 검증 계획 · 합성 원고와 독자 지표 검산 v0.1"의 "가상 독자 2집단 검산"(V10).
 * 수치는 오락용 가정이며 시장 예측이 아니다. 원고·외부 API를 쓰지 않고 수동 태그만 입력으로 받는다.
 * 감평 알파(src/)와 독립된 실험 모듈이며, 배포 번들에 들어가지 않는다.
 */

/** 닫힌 태그 목록(검증 계획 예제의 5종). 전체 태그 분류표는 기획 영역이라 여기서 늘리지 않는다. */
export const TAG_IDS = ['G', 'B', 'C', 'R', 'H'] as const;
export type TagId = (typeof TAG_IDS)[number];

export const TAG_LABELS: Readonly<Record<TagId, string>> = {
  G: '고구마',
  B: '관계 배신',
  C: '사이다',
  R: '복선 회수',
  H: '비극',
};

/**
 * 커널 상수. 검증 계획의 식을 그대로 옮겼다. 값을 바꾸면 version을 올린다
 * (version과 값은 입력 해시에 함께 들어가 실행 기록에 남는다).
 *
 * F = clamp(0.6×직전 F + max(0, −G 가중치×G 강도) − 0.15×C 강도, 0, 3)
 * S = clamp(0.5×직전 S + 1 + x − 0.5×F, 0, 4)            x = Σ 가중치×강도, F는 이번 회차 값
 * T = clamp(직전 T − 0.25×B 강도×배신 민감도 + 0.1×R 강도, 0, 1)
 * p = b + (1−b)×σ(2×(0.15 − S − 0.5×T)),  σ(z) = 1/(1+exp(−z))
 * N = 직전 N×(1−p)
 */
export const KERNEL = {
  version: 'v10-poc-0.1',
  frustration: { decay: 0.6, reliefPerC: 0.15, max: 3 },
  satisfaction: { decay: 0.5, base: 1, frustrationWeight: 0.5, max: 4 },
  trust: { betrayalDropPerB: 0.25, payoffGainPerR: 0.1, max: 1 },
  churn: { steepness: 2, threshold: 0.15, trustWeight: 0.5 },
  intensityMax: 3,
} as const;

/**
 * 계산 안전 한계. 검증 계획의 값이 아니라 계산이 넘치거나 NaN이 되지 않게 하는 공학적 한계다.
 * 범위 안의 입력에서는 결과에 영향이 없어 입력 해시에 넣지 않는다.
 *
 * - 인원: 집단별 초기 인원과 그 합계가 2^53−1 이하(정수 인원을 정확히 표현하고 표시 한계 1e21보다 작다).
 * - 가중치: 절댓값 1e6 이하(기여도 합이 넘치지 않는다. S가 0–4로 잘리므로 큰 값은 의미 차이가 없다).
 * - 집단 id·이름: 1–64자.
 */
export const INPUT_LIMITS = {
  maxCount: Number.MAX_SAFE_INTEGER,
  maxWeightAbs: 1e6,
  maxTextLength: 64,
} as const;

/** 집단 상태. F 불만, S 만족, T 신뢰. */
export interface GroupState {
  frustration: number;
  satisfaction: number;
  trust: number;
}

export interface GroupProfile {
  /** 집단 식별자(1–64자). 합계 계산 순서와 입력 해시의 정렬 기준이다. */
  id: string;
  /** 표에 쓰는 이름(1–64자, 예: 순애). */
  label: string;
  /** 초기 인원 N₀. 0 이상 2^53−1 이하(합계도 같은 한계). 소수 허용. */
  initialCount: number;
  /** F₀·S₀·T₀. 각 clamp 범위 안이어야 한다(밖이면 고치지 않고 거부한다). */
  initialState: GroupState;
  /** 태그별 선호 가중치. 5개 태그를 모두 적는다. */
  weights: Readonly<Record<TagId, number>>;
  /**
   * 검증 계획 T 식의 "순애 집단 지시값"을 집단 매개변수로 둔 것. 예제는 순애 1, 피폐 0.
   * 0–1 범위. 이름과 범위는 미확정 가정이다(README 참고).
   */
  betrayalTrustSensitivity: number;
}

/** 회차 태그 강도. 적지 않은 태그는 0이다. 강도 범위는 0–3. */
export type TagIntensities = Readonly<Partial<Record<TagId, number>>>;

export interface EpisodeInput {
  tags: TagIntensities;
  /** 기본 이탈 하한 b. 0–1. */
  baseChurn: number;
}

export interface SimulationInput {
  groups: readonly GroupProfile[];
  /** 판본 순서대로 놓인 회차. 순서가 바뀌면 결과도 바뀐다. */
  episodes: readonly EpisodeInput[];
}

export type InputErrorCode =
  | 'empty'
  | 'invalid_shape'
  | 'invalid_id'
  | 'duplicate_id'
  | 'not_finite'
  | 'out_of_range'
  | 'unknown_tag'
  | 'missing_weight';

/** 입력이 계산 계약을 벗어났을 때. 값을 고쳐서 계산하지 않고 거부한다. */
export class InputError extends Error {
  code: InputErrorCode;
  /** 문제 위치. 예: groups[0].initialCount, episodes[1].tags.X */
  path: string;

  constructor(code: InputErrorCode, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'InputError';
    this.code = code;
    this.path = path;
  }
}

/** 집단 id 비교(UTF-16 코드 단위 순서, 로캘 무관). */
export const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** 집단 id 순서의 색인. 합계와 입력 해시가 입력의 집단 순서에 따라 달라지지 않게 쓴다. */
export function idOrder(groups: readonly { id: string }[]): number[] {
  return groups
    .map((group, index) => ({ id: group.id, index }))
    .sort((a, b) => compareIds(a.id, b.id))
    .map(({ index }) => index);
}

/** 정해진 순서로 더한다. 부동소수 덧셈은 결합 법칙이 성립하지 않아 순서를 고정한다. */
export function sumInOrder(values: readonly number[], order: readonly number[]): number {
  let total = 0;
  for (const index of order) total += values[index] ?? 0;
  return total;
}

function checkText(value: unknown, path: string, code: InputErrorCode): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > INPUT_LIMITS.maxTextLength) {
    throw new InputError(code, path, `1–${INPUT_LIMITS.maxTextLength}자 문자열이어야 합니다.`);
  }
}

function isTagId(value: string): value is TagId {
  return (TAG_IDS as readonly string[]).includes(value);
}

function checkNumber(value: unknown, path: string, min: number, max: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InputError('not_finite', path, '유한한 숫자여야 합니다.');
  }
  if (value < min || value > max) {
    throw new InputError('out_of_range', path, `${min} 이상 ${max} 이하여야 합니다.`);
  }
}

function checkRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InputError('invalid_shape', path, '객체여야 합니다.');
  }
  return value as Record<string, unknown>;
}

export function checkTagIntensities(tags: unknown, path: string): void {
  const record = checkRecord(tags, path);
  for (const key of Object.keys(record)) {
    if (!isTagId(key)) throw new InputError('unknown_tag', `${path}.${key}`, '알 수 없는 태그입니다.');
    checkNumber(record[key], `${path}.${key}`, 0, KERNEL.intensityMax);
  }
}

/** 계산 전에 입력 전체를 검사한다. 첫 문제에서 InputError를 던진다(검사 순서는 고정). */
export function validateInput(input: SimulationInput): void {
  checkRecord(input, '$');
  if (!Array.isArray(input.groups) || input.groups.length === 0) {
    throw new InputError('empty', 'groups', '집단이 하나 이상 있어야 합니다.');
  }
  if (!Array.isArray(input.episodes) || input.episodes.length === 0) {
    throw new InputError('empty', 'episodes', '회차가 하나 이상 있어야 합니다.');
  }

  const seen = new Set<string>();
  input.groups.forEach((group, index) => {
    const at = `groups[${index}]`;
    checkRecord(group, at);
    checkText(group.id, `${at}.id`, 'invalid_id');
    if (seen.has(group.id)) throw new InputError('duplicate_id', `${at}.id`, '집단 id가 겹칩니다.');
    seen.add(group.id);
    checkText(group.label, `${at}.label`, 'invalid_shape');

    checkNumber(group.initialCount, `${at}.initialCount`, 0, INPUT_LIMITS.maxCount);
    const state = checkRecord(group.initialState, `${at}.initialState`);
    checkNumber(state.frustration, `${at}.initialState.frustration`, 0, KERNEL.frustration.max);
    checkNumber(state.satisfaction, `${at}.initialState.satisfaction`, 0, KERNEL.satisfaction.max);
    checkNumber(state.trust, `${at}.initialState.trust`, 0, KERNEL.trust.max);

    const weights = checkRecord(group.weights, `${at}.weights`);
    for (const key of Object.keys(weights)) {
      if (!isTagId(key)) throw new InputError('unknown_tag', `${at}.weights.${key}`, '알 수 없는 태그입니다.');
    }
    for (const tag of TAG_IDS) {
      if (!(tag in weights)) throw new InputError('missing_weight', `${at}.weights.${tag}`, '가중치가 없습니다.');
      checkNumber(weights[tag], `${at}.weights.${tag}`, -INPUT_LIMITS.maxWeightAbs, INPUT_LIMITS.maxWeightAbs);
    }
    checkNumber(group.betrayalTrustSensitivity, `${at}.betrayalTrustSensitivity`, 0, 1);
  });

  const initialTotal = sumInOrder(
    input.groups.map((group) => group.initialCount),
    idOrder(input.groups),
  );
  if (initialTotal > INPUT_LIMITS.maxCount) {
    throw new InputError('out_of_range', 'groups', `초기 인원 합계가 ${INPUT_LIMITS.maxCount} 이하여야 합니다.`);
  }

  input.episodes.forEach((episode, index) => {
    const at = `episodes[${index}]`;
    checkRecord(episode, at);
    checkTagIntensities(episode.tags, `${at}.tags`);
    checkNumber(episode.baseChurn, `${at}.baseChurn`, 0, 1);
  });
}

// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { counterfactual, simulate, stepGroup, type SimulationResult } from './kernel.ts';
import { formatCount, formatFixed, formatPercent, formatPoints, formatTable, NOT_APPLICABLE } from './format.ts';
import {
  type EpisodeInput,
  type GroupProfile,
  INPUT_LIMITS,
  InputError,
  KERNEL,
  type SimulationInput,
  TAG_IDS,
} from './model.ts';
import { canonicalSnapshot, inputHash } from './snapshot.ts';
import {
  V10_COUNTERFACTUAL,
  V10_EXAMPLE_INPUT,
  V10_EXPECTED,
  V10_EXPECTED_ROWS,
  V10_INPUT_HASH,
  V10_TOLERANCE,
} from './v10-example.ts';

/**
 * V10 가상 독자 계산 PoC 자동 검증. 원고·외부 API·난수 없음(속성 검사의 입력 생성기만 고정 시드 사용).
 * 수치는 오락용 가정이며 시장 예측이 아니다.
 */

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

const clone = (input: SimulationInput = V10_EXAMPLE_INPUT) => structuredClone(input) as Mutable<SimulationInput>;

function changed(mutate: (input: Mutable<SimulationInput>) => void): SimulationInput {
  const input = clone();
  mutate(input);
  return input;
}

function errorOf(run: () => unknown): InputError {
  try {
    run();
  } catch (error) {
    if (error instanceof InputError) return error;
    throw error;
  }
  throw new Error('InputError가 나지 않았습니다.');
}

const group = (result: SimulationResult, episode: number, id: string) => {
  const found = result.episodes[episode - 1]?.groups.find((item) => item.groupId === id);
  if (!found) throw new Error(`${episode}화 ${id} 없음`);
  return found;
};

/** 모든 숫자를 경로와 함께 펼친다(-0과 0을 구별하는 비교용). */
function numbersOf(value: unknown, path = '$', out: [string, number][] = []): [string, number][] {
  if (typeof value === 'number') out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((item, index) => numbersOf(item, `${path}[${index}]`, out));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) numbersOf(item, `${path}.${key}`, out);
  }
  return out;
}

function expectBitIdentical(a: unknown, b: unknown) {
  const left = numbersOf(a);
  const right = numbersOf(b);
  expect(left.map(([path]) => path)).toEqual(right.map(([path]) => path));
  left.forEach(([path, value], index) => {
    expect(Object.is(value, right[index]![1]), path).toBe(true);
  });
}

describe('검증 계획 표 재현 (V10 예제)', () => {
  const result = simulate(V10_EXAMPLE_INPUT);

  it('초기값과 커널 버전을 기록한다', () => {
    expect(result.kernelVersion).toBe(KERNEL.version);
    expect(result.initialTotal).toBe(10000);
    expect(result.episodes).toHaveLength(4);
  });

  it('표시 4자리 표가 검증 계획의 행과 글자 하나까지 같다', () => {
    const rows = formatTable(V10_EXAMPLE_INPUT, result);
    expect(rows[0]).toBe('| 회차 | 순애 이탈 / 잔류 | 피폐 이탈 / 잔류 | 전체 잔류 | 누적 잔존율 | 연속 열람률 |');
    expect(rows.slice(2)).toEqual([...V10_EXPECTED_ROWS]);
  });

  it('제안 허용오차(인원 0.0001명, 비율 0.0001%p) 안에서 숫자가 맞는다', () => {
    V10_EXPECTED.forEach((expected, index) => {
      const row = result.episodes[index]!;
      for (const id of ['sunae', 'pipye'] as const) {
        const actual = group(result, index + 1, id);
        expect(Math.abs(actual.churnProbability * 100 - expected[id].churnPercent)).toBeLessThanOrEqual(V10_TOLERANCE.percentPoints);
        expect(Math.abs(actual.remaining - expected[id].remaining)).toBeLessThanOrEqual(V10_TOLERANCE.count);
      }
      expect(Math.abs(row.total - expected.total)).toBeLessThanOrEqual(V10_TOLERANCE.count);
      expect(Math.abs(row.cumulativeRetention! * 100 - expected.cumulativePercent)).toBeLessThanOrEqual(V10_TOLERANCE.percentPoints);
      expect(Math.abs(row.continuationRate! * 100 - expected.continuationPercent)).toBeLessThanOrEqual(V10_TOLERANCE.percentPoints);
    });
  });

  it('1화 순애 집단의 중간값이 식대로 나온다 (F=0.4, x=−0.4, S=1.4, T=0.8)', () => {
    const first = group(result, 1, 'sunae');
    expect(first.frustration).toBeCloseTo(0.4, 12);
    expect(first.contribution).toBeCloseTo(-0.4, 12);
    expect(first.satisfaction).toBeCloseTo(1.4, 12);
    expect(first.trust).toBeCloseTo(0.8, 12);
    const p = 0.03 + 0.97 / (1 + Math.exp(-2 * (0.15 - 1.4 - 0.4)));
    expect(first.churnProbability).toBeCloseTo(p, 12);
  });

  it('집단 합계가 전체 잔류와 일치하고, 이탈 인원 = 직전 − 이번이다', () => {
    for (const row of result.episodes) {
      const byId = [...row.groups].sort((a, b) => (a.groupId < b.groupId ? -1 : 1));
      expect(row.total).toBe(byId.reduce((sum, item) => sum + item.remaining, 0));
      for (const item of row.groups) expect(item.churned).toBe(item.previousCount - item.remaining);
    }
  });
});

describe('누적 잔존율과 연속 열람률의 분모', () => {
  const result = simulate(V10_EXAMPLE_INPUT);

  it('누적 잔존율 = 이번 합계 ÷ 초기 합계, 연속 열람률 = 이번 합계 ÷ 직전 합계(1화는 초기 합계)', () => {
    let previous = result.initialTotal;
    for (const row of result.episodes) {
      expect(row.previousTotal).toBe(previous);
      expect(row.cumulativeRetention).toBe(row.total / result.initialTotal);
      expect(row.continuationRate).toBe(row.total / previous);
      previous = row.total;
    }
    expect(result.episodes[0]!.cumulativeRetention).toBe(result.episodes[0]!.continuationRate);
  });

  it('누적 잔존율은 연속 열람률의 곱과 같다(반올림 오차 범위)', () => {
    let product = 1;
    for (const row of result.episodes) {
      product *= row.continuationRate!;
      expect(row.cumulativeRetention!).toBeCloseTo(product, 12);
    }
  });
});

describe('0명', () => {
  it('초기 0명 집단은 끝까지 0명이고 NaN이 생기지 않는다', () => {
    const result = simulate(changed((input) => (input.groups[1]!.initialCount = 0)));
    for (const row of result.episodes) {
      const zero = row.groups[1]!;
      expect(Object.is(zero.remaining, 0)).toBe(true);
      expect(Object.is(zero.churned, 0)).toBe(true);
      expect(Number.isFinite(zero.churnProbability)).toBe(true);
      expect(row.total).toBe(row.groups[0]!.remaining);
    }
    // 이탈확률은 인원과 무관한 집단 상태의 값이라 0명이어도 같은 값이 나온다.
    expect(group(result, 2, 'pipye').churnProbability).toBe(group(simulate(V10_EXAMPLE_INPUT), 2, 'pipye').churnProbability);
  });

  it('모든 집단이 0명이면 두 비율 모두 해당 없음(null)이다', () => {
    const result = simulate(changed((input) => input.groups.forEach((item) => (item.initialCount = 0))));
    expect(result.initialTotal).toBe(0);
    for (const row of result.episodes) {
      expect(row.total).toBe(0);
      expect(row.cumulativeRetention).toBeNull();
      expect(row.continuationRate).toBeNull();
    }
    expect(formatTable(V10_EXAMPLE_INPUT, result)[2]).toBe(
      `| 1 | 6.4504% / 0.0000 | 3.8743% / 0.0000 | 0.0000 | ${NOT_APPLICABLE} | ${NOT_APPLICABLE} |`,
    );
  });

  it('중간에 모두 이탈하면(b=1) 그 회차 연속 열람률은 0, 다음 회차는 분모 0이라 해당 없음이다', () => {
    const result = simulate(changed((input) => (input.episodes[1]!.baseChurn = 1)));
    const [, second, third, fourth] = result.episodes;
    expect(second!.groups.every((item) => item.churnProbability === 1 && Object.is(item.remaining, 0))).toBe(true);
    expect(second!.total).toBe(0);
    expect(second!.cumulativeRetention).toBe(0);
    expect(second!.continuationRate).toBe(0);
    for (const row of [third!, fourth!]) {
      expect(row.total).toBe(0);
      expect(row.cumulativeRetention).toBe(0);
      expect(row.continuationRate).toBeNull();
    }
  });
});

describe('입력 경계', () => {
  const invalid: [string, (input: Mutable<SimulationInput>) => void, InputError['code'], string][] = [
    ['집단 없음', (input) => (input.groups = []), 'empty', 'groups'],
    ['회차 없음', (input) => (input.episodes = []), 'empty', 'episodes'],
    ['집단이 null', (input) => ((input.groups as unknown[])[1] = null), 'invalid_shape', 'groups[1]'],
    ['회차가 null', (input) => ((input.episodes as unknown[])[2] = null), 'invalid_shape', 'episodes[2]'],
    ['빈 집단 id', (input) => (input.groups[0]!.id = ''), 'invalid_id', 'groups[0].id'],
    ['65자 집단 id', (input) => (input.groups[0]!.id = 'a'.repeat(65)), 'invalid_id', 'groups[0].id'],
    ['겹치는 집단 id', (input) => (input.groups[1]!.id = 'sunae'), 'duplicate_id', 'groups[1].id'],
    ['빈 집단 이름', (input) => (input.groups[1]!.label = ''), 'invalid_shape', 'groups[1].label'],
    ['음수 인원', (input) => (input.groups[0]!.initialCount = -1), 'out_of_range', 'groups[0].initialCount'],
    ['인원 2^53', (input) => (input.groups[0]!.initialCount = 2 ** 53), 'out_of_range', 'groups[0].initialCount'],
    [
      '인원 합계 2^53−1 초과',
      (input) => input.groups.forEach((item) => (item.initialCount = INPUT_LIMITS.maxCount)),
      'out_of_range',
      'groups',
    ],
    ['NaN 인원', (input) => (input.groups[0]!.initialCount = Number.NaN), 'not_finite', 'groups[0].initialCount'],
    ['무한 인원', (input) => (input.groups[0]!.initialCount = Number.POSITIVE_INFINITY), 'not_finite', 'groups[0].initialCount'],
    ['문자열 인원', (input) => ((input.groups[0] as { initialCount: unknown }).initialCount = '6000'), 'not_finite', 'groups[0].initialCount'],
    ['F₀ 상한 초과', (input) => (input.groups[0]!.initialState.frustration = 3.0001), 'out_of_range', 'groups[0].initialState.frustration'],
    ['F₀ 음수', (input) => (input.groups[0]!.initialState.frustration = -0.0001), 'out_of_range', 'groups[0].initialState.frustration'],
    ['S₀ 상한 초과', (input) => (input.groups[1]!.initialState.satisfaction = 4.0001), 'out_of_range', 'groups[1].initialState.satisfaction'],
    ['T₀ 상한 초과', (input) => (input.groups[1]!.initialState.trust = 1.0001), 'out_of_range', 'groups[1].initialState.trust'],
    ['상태 없음', (input) => ((input.groups[0] as { initialState: unknown }).initialState = null), 'invalid_shape', 'groups[0].initialState'],
    ['가중치 빠짐', (input) => delete (input.groups[0]!.weights as Partial<Record<string, number>>).H, 'missing_weight', 'groups[0].weights.H'],
    ['모르는 가중치 태그', (input) => ((input.groups[0]!.weights as Record<string, number>).X = 1), 'unknown_tag', 'groups[0].weights.X'],
    ['NaN 가중치', (input) => (input.groups[1]!.weights.C = Number.NaN), 'not_finite', 'groups[1].weights.C'],
    ['가중치 절댓값 1e6 초과', (input) => (input.groups[1]!.weights.B = -1e6 - 1), 'out_of_range', 'groups[1].weights.B'],
    ['배신 민감도 초과', (input) => (input.groups[0]!.betrayalTrustSensitivity = 1.5), 'out_of_range', 'groups[0].betrayalTrustSensitivity'],
    ['배신 민감도 음수', (input) => (input.groups[1]!.betrayalTrustSensitivity = -0.1), 'out_of_range', 'groups[1].betrayalTrustSensitivity'],
    ['강도 3 초과', (input) => (input.episodes[0]!.tags = { G: 3.5 }), 'out_of_range', 'episodes[0].tags.G'],
    ['강도 음수', (input) => (input.episodes[0]!.tags = { G: -1 }), 'out_of_range', 'episodes[0].tags.G'],
    ['강도 NaN', (input) => (input.episodes[2]!.tags = { C: Number.NaN }), 'not_finite', 'episodes[2].tags.C'],
    ['모르는 회차 태그', (input) => (input.episodes[1]!.tags = { B: 2, X: 1 } as EpisodeInput['tags']), 'unknown_tag', 'episodes[1].tags.X'],
    ['태그 없음(null)', (input) => ((input.episodes[0] as { tags: unknown }).tags = null), 'invalid_shape', 'episodes[0].tags'],
    ['b 상한 초과', (input) => (input.episodes[3]!.baseChurn = 1.0001), 'out_of_range', 'episodes[3].baseChurn'],
    ['b 음수', (input) => (input.episodes[3]!.baseChurn = -0.0001), 'out_of_range', 'episodes[3].baseChurn'],
  ];

  it.each(invalid)('%s → 고치지 않고 거부한다', (_, mutate, code, path) => {
    const input = changed(mutate);
    const error = errorOf(() => simulate(input));
    expect(error.code).toBe(code);
    expect(error.path).toBe(path);
    expect(errorOf(() => inputHash(input)).code).toBe(code);
  });

  it('입력이 객체가 아니면 거부한다', () => {
    for (const value of [null, undefined, 1, 'V10', []]) {
      const error = errorOf(() => simulate(value as unknown as SimulationInput));
      expect([error.code, error.path]).toEqual(['invalid_shape', '$']);
    }
  });

  const boundaries: [string, (input: Mutable<SimulationInput>) => void][] = [
    ['인원 0', (input) => (input.groups[0]!.initialCount = 0)],
    ['F₀ = 3', (input) => (input.groups[0]!.initialState.frustration = 3)],
    ['S₀ = 0', (input) => (input.groups[0]!.initialState.satisfaction = 0)],
    ['S₀ = 4', (input) => (input.groups[0]!.initialState.satisfaction = 4)],
    ['T₀ = 0', (input) => (input.groups[0]!.initialState.trust = 0)],
    ['T₀ = 1', (input) => (input.groups[0]!.initialState.trust = 1)],
    ['강도 0과 3', (input) => (input.episodes[0]!.tags = { G: 0, B: 3 })],
    ['b = 0', (input) => (input.episodes[0]!.baseChurn = 0)],
    ['b = 1', (input) => (input.episodes[3]!.baseChurn = 1)],
    ['배신 민감도 0과 1', (input) => (input.groups[0]!.betrayalTrustSensitivity = 0)],
    ['가중치 ±1e6', (input) => Object.assign(input.groups[1]!.weights, { G: 1e6, B: -1e6, H: 1e6 })],
    ['64자 id·이름', (input) => Object.assign(input.groups[0]!, { id: 'a'.repeat(64), label: '가'.repeat(64) })],
    [
      '인원 합계 2^53−1',
      (input) => {
        input.groups[0]!.initialCount = INPUT_LIMITS.maxCount;
        input.groups[1]!.initialCount = 0;
      },
    ],
  ];

  it.each(boundaries)('경계값 %s 는 받아들이고 범위 안의 결과를 낸다', (_, mutate) => {
    const input = changed(mutate);
    const result = simulate(input);
    for (const row of result.episodes) {
      for (const item of row.groups) {
        expect(item.churnProbability).toBeGreaterThanOrEqual(0);
        expect(item.churnProbability).toBeLessThanOrEqual(1);
        expect(item.remaining).toBeGreaterThanOrEqual(0);
        expect(item.remaining).toBeLessThanOrEqual(item.previousCount);
      }
    }
    expect(() => formatTable(input, result)).not.toThrow();
    expect(inputHash(input)).toMatch(/^sha256:/);
  });

  function single(overrides: Partial<GroupProfile>, episodes: EpisodeInput[]) {
    const base = V10_EXAMPLE_INPUT.groups[0]!;
    return simulate({ groups: [{ ...base, ...overrides }], episodes });
  }

  it('계산 중 clamp 경계에 닿는다: F 상한 3', () => {
    const result = single({ weights: { G: -2, B: 0, C: 0, R: 0, H: 0 } }, [{ tags: { G: 3 }, baseChurn: 0 }]);
    expect(result.episodes[0]!.groups[0]!.frustration).toBe(KERNEL.frustration.max);
  });

  it('계산 중 clamp 경계에 닿는다: S 하한 0과 상한 4', () => {
    const low = single({ weights: { G: -1, B: -1, C: -1, R: -1, H: -1 } }, [{ tags: { G: 3, B: 3, C: 3, R: 3, H: 3 }, baseChurn: 0 }]);
    expect(low.episodes[0]!.groups[0]!.satisfaction).toBe(0);
    const high = single({ weights: { G: 1, B: 1, C: 1, R: 1, H: 1 } }, [{ tags: { C: 3, R: 3, H: 3 }, baseChurn: 0 }]);
    expect(high.episodes[0]!.groups[0]!.satisfaction).toBe(KERNEL.satisfaction.max);
  });

  it('계산 중 clamp 경계에 닿는다: T 하한 0과 상한 1', () => {
    const low = single({}, [
      { tags: { B: 3 }, baseChurn: 0 },
      { tags: { B: 3 }, baseChurn: 0 },
    ]);
    expect(low.episodes[1]!.groups[0]!.trust).toBe(0);
    const high = single({}, [{ tags: { R: 3 }, baseChurn: 0 }]);
    expect(high.episodes[0]!.groups[0]!.trust).toBe(KERNEL.trust.max);
  });

  it('입력을 바꾸지 않는다(깊게 얼린 입력으로도 계산된다)', () => {
    const deepFreeze = <T>(value: T): T => {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
      }
      return value;
    };
    const frozen = deepFreeze(clone());
    expectBitIdentical(simulate(frozen), simulate(V10_EXAMPLE_INPUT));
    expect(frozen).toEqual(V10_EXAMPLE_INPUT);
  });
});

/** 속성 검사용 입력 생성기(고정 시드 mulberry32). 계산 커널 자체에는 난수가 없다. */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInput(random: () => number): SimulationInput {
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const between = (min: number, max: number) => min + (max - min) * random();
  const groupCount = 1 + Math.floor(random() * 4);
  const groups: GroupProfile[] = Array.from({ length: groupCount }, (_, index) => ({
    id: `g${index}`,
    label: `집단${index}`,
    initialCount: pick([0, 1, 3, 2.5, Math.floor(between(0, 10000)), between(0, 10000)]),
    initialState: {
      frustration: pick([0, KERNEL.frustration.max, between(0, KERNEL.frustration.max)]),
      satisfaction: pick([0, KERNEL.satisfaction.max, between(0, KERNEL.satisfaction.max)]),
      trust: pick([0, 1, between(0, 1)]),
    },
    weights: Object.fromEntries(TAG_IDS.map((tag) => [tag, between(-1, 1)])) as GroupProfile['weights'],
    betrayalTrustSensitivity: pick([0, 1, between(0, 1)]),
  }));
  const episodes: EpisodeInput[] = Array.from({ length: 1 + Math.floor(random() * 12) }, () => ({
    tags: Object.fromEntries(
      TAG_IDS.filter(() => random() < 0.5).map((tag) => [tag, pick([0, 1, 2, 3, between(0, 3)])]),
    ),
    baseChurn: pick([0, 1, between(0, 0.1), between(0, 1)]),
  }));
  return { groups, episodes };
}

describe('유입이 없으면 인원이 늘지 않는다 (속성 검사, 고정 시드 300개 시나리오)', () => {
  const random = mulberry32(20261122);
  const scenarios = Array.from({ length: 300 }, () => randomInput(random));

  it('모든 집단·회차에서 0 ≤ 이번 N ≤ 직전 N, b ≤ p ≤ 1, 상태는 clamp 범위 안', () => {
    for (const input of scenarios) {
      const result = simulate(input);
      for (const row of result.episodes) {
        for (const item of row.groups) {
          const b = input.episodes[row.episode - 1]!.baseChurn;
          expect(item.churnProbability).toBeGreaterThanOrEqual(b);
          expect(item.churnProbability).toBeLessThanOrEqual(1);
          expect(item.remaining).toBeGreaterThanOrEqual(0);
          expect(item.remaining).toBeLessThanOrEqual(item.previousCount);
          expect(item.churned).toBeGreaterThanOrEqual(0);
          expect(item.frustration).toBeGreaterThanOrEqual(0);
          expect(item.frustration).toBeLessThanOrEqual(KERNEL.frustration.max);
          expect(item.satisfaction).toBeGreaterThanOrEqual(0);
          expect(item.satisfaction).toBeLessThanOrEqual(KERNEL.satisfaction.max);
          expect(item.trust).toBeGreaterThanOrEqual(0);
          expect(item.trust).toBeLessThanOrEqual(KERNEL.trust.max);
        }
      }
    }
  });

  it('합계는 늘지 않고, 누적 잔존율은 1 이하로 줄어들기만 하며, 연속 열람률은 0–1 또는 해당 없음이다', () => {
    for (const input of scenarios) {
      const result = simulate(input);
      let previousCumulative = 1;
      for (const row of result.episodes) {
        expect(row.total).toBeLessThanOrEqual(row.previousTotal);
        if (row.cumulativeRetention === null) {
          expect(result.initialTotal).toBe(0);
        } else {
          expect(row.cumulativeRetention).toBeLessThanOrEqual(previousCumulative);
          previousCumulative = row.cumulativeRetention;
        }
        if (row.continuationRate === null) expect(row.previousTotal).toBe(0);
        else {
          expect(row.continuationRate).toBeGreaterThanOrEqual(0);
          expect(row.continuationRate).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('0명으로 시작한 집단은 어떤 입력에서도 0명이다', () => {
    for (const input of scenarios) {
      const result = simulate(input);
      input.groups.forEach((item, index) => {
        if (item.initialCount !== 0) return;
        for (const row of result.episodes) expect(Object.is(row.groups[index]!.remaining, 0)).toBe(true);
      });
    }
  });
});

describe('동일 입력 재현성', () => {
  it('같은 입력으로 20번 계산하면 20/20 비트 단위로 같고, 외부 호출은 0회다', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('외부 호출 금지');
    });
    const first = simulate(clone());
    const firstHash = inputHash(clone());
    const runs = Array.from({ length: 20 }, () => ({ result: simulate(clone()), hash: inputHash(clone()) }));
    for (const run of runs) {
      expectBitIdentical(run.result, first);
      expect(JSON.stringify(run.result)).toBe(JSON.stringify(first));
      expect(run.hash).toBe(firstHash);
    }
    counterfactual(clone(), { episode: 2, tags: { B: 0 } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('집단 입력 순서를 바꿔도 집단별 값·합계·입력 해시가 비트 단위로 같다', () => {
    const reversed = changed((input) => input.groups.reverse());
    const a = simulate(V10_EXAMPLE_INPUT);
    const b = simulate(reversed);
    a.episodes.forEach((row, index) => {
      const other = b.episodes[index]!;
      expect(Object.is(row.total, other.total)).toBe(true);
      for (const item of row.groups) {
        expectBitIdentical(item, other.groups.find((candidate) => candidate.groupId === item.groupId));
      }
    });
    expect(inputHash(reversed)).toBe(inputHash(V10_EXAMPLE_INPUT));
  });

  it('집단이 셋 이상이면 더하는 순서가 비트를 바꿀 수 있어, 합계는 id 순서로 더한다', () => {
    // 부동소수 덧셈은 결합 법칙이 성립하지 않는다: (0.1 + 0.2) + 0.3 ≠ (0.3 + 0.2) + 0.1
    expect(0.1 + 0.2 + 0.3).not.toBe(0.3 + 0.2 + 0.1);
    const counts: Record<string, number> = { a: 0.1, b: 0.2, c: 0.3 };
    const make = (ids: string[]) =>
      simulate({
        groups: ids.map((id) => ({ ...V10_EXAMPLE_INPUT.groups[0]!, id, label: id, initialCount: counts[id]! })),
        episodes: V10_EXAMPLE_INPUT.episodes,
      });
    const forward = make(['a', 'b', 'c']);
    for (const ids of [['c', 'b', 'a'], ['b', 'c', 'a']]) {
      const other = make(ids);
      expect(Object.is(other.initialTotal, forward.initialTotal)).toBe(true);
      other.episodes.forEach((row, index) => {
        expect(Object.is(row.total, forward.episodes[index]!.total)).toBe(true);
        expect(Object.is(row.cumulativeRetention, forward.episodes[index]!.cumulativeRetention)).toBe(true);
        expect(Object.is(row.continuationRate, forward.episodes[index]!.continuationRate)).toBe(true);
      });
    }
  });

  it('회차 순서를 바꾸면 결과와 입력 해시가 달라진다(판본 순서가 입력의 일부)', () => {
    const swapped = changed((input) => input.episodes.reverse());
    expect(simulate(swapped).episodes[3]!.total).not.toBe(simulate(V10_EXAMPLE_INPUT).episodes[3]!.total);
    expect(inputHash(swapped)).not.toBe(inputHash(V10_EXAMPLE_INPUT));
  });

  it('적지 않은 태그와 강도 0으로 적은 태그는 같은 입력으로 본다', () => {
    const explicit = changed((input) => (input.episodes[0]!.tags = { G: 2, B: 0, C: 0, R: 0, H: 0 }));
    expectBitIdentical(simulate(explicit), simulate(V10_EXAMPLE_INPUT));
    expect(canonicalSnapshot(explicit)).toBe(canonicalSnapshot(V10_EXAMPLE_INPUT));
  });

  it('입력 해시에는 커널 버전·상수와 섭동·난수·시드 없음(null)이 들어간다', () => {
    const snapshot = JSON.parse(canonicalSnapshot(V10_EXAMPLE_INPUT)) as Record<string, unknown>;
    expect(snapshot.kernel).toEqual(KERNEL);
    expect(snapshot.perturbation).toBeNull();
    expect(snapshot.rng).toBeNull();
    expect(snapshot.seed).toBeNull();
    expect(inputHash(V10_EXAMPLE_INPUT)).toMatch(/^sha256:[0-9a-f]{64}$/);
    // 동결 입력: 예제·커널 상수가 바뀌면 실패한다(의도한 변경이면 커널 버전과 기록을 함께 고친다).
    expect(inputHash(V10_EXAMPLE_INPUT)).toBe(V10_INPUT_HASH);
  });
});

describe('소수 인원과 반올림', () => {
  const result = simulate(V10_EXAMPLE_INPUT);

  it('계산 중에는 반올림하지 않는다(기대 인원은 소수로 남는다)', () => {
    const remaining = group(result, 1, 'sunae').remaining;
    expect(Number.isInteger(remaining)).toBe(false);
    expect(remaining).not.toBe(Number(remaining.toFixed(4)));
  });

  it('회차마다 정수 인원으로 반올림하면 4화 합계가 허용오차 밖으로 달라진다(중간 반올림 금지 근거)', () => {
    let counts = V10_EXAMPLE_INPUT.groups.map((item) => item.initialCount);
    let states = V10_EXAMPLE_INPUT.groups.map((item) => item.initialState);
    for (const episode of V10_EXAMPLE_INPUT.episodes) {
      const outcomes = V10_EXAMPLE_INPUT.groups.map((item, index) => stepGroup(item, states[index]!, episode.tags, episode.baseChurn));
      counts = counts.map((count, index) => Math.round(count * (1 - outcomes[index]!.churnProbability)));
      states = outcomes;
    }
    const roundedTotal = counts.reduce((sum, count) => sum + count, 0);
    expect(Math.abs(roundedTotal - result.episodes[3]!.total)).toBeGreaterThan(V10_TOLERANCE.count);
  });

  it('인원은 초기 인원에 비례하고 이탈확률은 인원과 무관하다(1명·3명·2.5명도 같은 비율)', () => {
    for (const scale of [1 / 6000, 3 / 6000, 2.5 / 6000, 2]) {
      const scaled = simulate(changed((input) => input.groups.forEach((item) => (item.initialCount *= scale))));
      scaled.episodes.forEach((row, index) => {
        row.groups.forEach((item, groupIndex) => {
          const original = result.episodes[index]!.groups[groupIndex]!;
          expect(item.churnProbability).toBe(original.churnProbability);
          expect(item.remaining).toBeGreaterThanOrEqual(0);
          expect(item.remaining).toBeCloseTo(original.remaining * scale, 9);
        });
      });
    }
    const one = simulate(changed((input) => input.groups.forEach((item) => (item.initialCount = 1))));
    expect(formatCount(group(one, 1, 'sunae').remaining)).toBe('0.9355');
  });

  it('표시 반올림은 실제 배정밀도 값 기준이고, 정확히 한가운데면 0에서 먼 쪽으로 간다', () => {
    expect(formatFixed(0.125, 2)).toBe('0.13');
    expect(formatFixed(-0.125, 2)).toBe('-0.13');
    expect(formatFixed(2.5, 0)).toBe('3');
    expect(formatFixed(-2.5, 0)).toBe('-3');
    expect(formatFixed(1.005, 2)).toBe('1.00'); // 1.005의 배정밀도 값은 1.00499999…
    expect(formatFixed(-0.00001)).toBe('0.0000');
    expect(() => formatFixed(Number.NaN)).toThrow(RangeError);
    expect(() => formatFixed(1e21)).toThrow(RangeError);
  });

  it('전체 잔류는 반올림 전 합계를 따로 반올림한다(표시값끼리 더한 것과 0.0001 차이가 날 수 있음)', () => {
    expect(formatCount(1.00004)).toBe('1.0000');
    expect(formatCount(1.00004 + 1.00004)).toBe('2.0001');
    // V10 예제에서는 네 회차 모두 표시값의 합과 표시된 전체가 같다.
    for (const row of result.episodes) {
      const parts = row.groups.reduce((sum, item) => sum + Number(formatCount(item.remaining)), 0);
      expect(formatCount(parts)).toBe(formatCount(row.total));
    }
  });

  it('비율 표시: 분모 0은 해당 없음, %p는 부호를 붙인다', () => {
    expect(formatPercent(null)).toBe(NOT_APPLICABLE);
    expect(formatPercent(0.9458004079)).toBe('94.5800%');
    expect(formatPoints(0.245496451904)).toBe('+24.5496%p');
    expect(formatPoints(-0.005319)).toBe('-0.5319%p');
    expect(formatPoints(0)).toBe('0.0000%p');
    expect(formatPoints(-1e-9)).toBe('0.0000%p');
  });
});

describe('태그 변경의 반사실 비교', () => {
  it('2화 순애: 같은 직전 상태에서 B만 0이면 4.9460%, 태그 유무 차이 +24.5496%p', () => {
    const result = counterfactual(V10_EXAMPLE_INPUT, { episode: V10_COUNTERFACTUAL.episode, tags: V10_COUNTERFACTUAL.tags });
    const sunae = result.groups.find((item) => item.groupId === V10_COUNTERFACTUAL.groupId)!;
    expect(Math.abs(sunae.counterfactual * 100 - V10_COUNTERFACTUAL.counterfactualPercent)).toBeLessThanOrEqual(V10_TOLERANCE.percentPoints);
    expect(Math.abs(sunae.effect * 100 - V10_COUNTERFACTUAL.effectPoints)).toBeLessThanOrEqual(V10_TOLERANCE.percentPoints);
    expect(formatPercent(sunae.counterfactual)).toBe('4.9460%');
    expect(formatPoints(sunae.effect)).toBe('+24.5496%p');
    expect(result.tags).toEqual({ G: 0, B: 0, C: 0, R: 0, H: 0 });
  });

  it('같은 태그도 집단에 따라 방향이 다르다: 피폐는 B를 빼면 이탈이 늘어난다', () => {
    const result = counterfactual(V10_EXAMPLE_INPUT, { episode: 2, tags: { B: 0 } });
    expect(result.groups.find((item) => item.groupId === 'pipye')!.effect).toBeLessThan(0);
  });

  it('한 회차 반사실은 그 회차만 바꾼 입력의 그 회차 계산과 비트 단위로 같다', () => {
    for (const episode of [1, 2, 3, 4]) {
      for (const tag of TAG_IDS) {
        const cf = counterfactual(V10_EXAMPLE_INPUT, { episode, tags: { [tag]: 0 } });
        const rerun = simulate(
          changed((input) => (input.episodes[episode - 1]!.tags = { ...input.episodes[episode - 1]!.tags, [tag]: 0 })),
        );
        cf.groups.forEach((item, index) => {
          const row = rerun.episodes[episode - 1]!.groups[index]!;
          expect(Object.is(item.counterfactual, row.churnProbability)).toBe(true);
          expect(Object.is(item.counterfactualRemaining, row.remaining)).toBe(true);
        });
      }
    }
  });

  it('아무것도 바꾸지 않으면 차이는 정확히 0이다', () => {
    const result = counterfactual(V10_EXAMPLE_INPUT, { episode: 3, tags: {} });
    for (const item of result.groups) {
      expect(item.effect).toBe(0);
      expect(item.counterfactualRemaining).toBe(item.baselineRemaining);
    }
  });

  it('여러 태그의 영향은 따로 뺀 차이를 더한 값과 다르다(3화 C·R, 비선형)', () => {
    const effect = (tags: Partial<Record<'C' | 'R', number>>) =>
      counterfactual(V10_EXAMPLE_INPUT, { episode: 3, tags }).groups.find((item) => item.groupId === 'sunae')!.effect;
    const withoutC = effect({ C: 0 });
    const withoutR = effect({ R: 0 });
    const withoutBoth = effect({ C: 0, R: 0 });
    expect(Math.abs(withoutC + withoutR - withoutBoth)).toBeGreaterThan(0.01);
  });

  it('반사실 질의도 입력 경계를 지킨다', () => {
    expect(errorOf(() => counterfactual(V10_EXAMPLE_INPUT, { episode: 0, tags: {} })).path).toBe('query.episode');
    expect(errorOf(() => counterfactual(V10_EXAMPLE_INPUT, { episode: 5, tags: {} })).path).toBe('query.episode');
    expect(errorOf(() => counterfactual(V10_EXAMPLE_INPUT, { episode: 1.5, tags: {} })).path).toBe('query.episode');
    expect(errorOf(() => counterfactual(V10_EXAMPLE_INPUT, { episode: 2, tags: { B: 4 } })).path).toBe('query.tags.B');
    expect(
      errorOf(() => counterfactual(V10_EXAMPLE_INPUT, { episode: 2, tags: { X: 0 } as unknown as { B: number } })).code,
    ).toBe('unknown_tag');
  });
});

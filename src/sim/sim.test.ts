// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PERSONA_PRESETS } from '../domain/defaults';
import { createWorkspaceStore } from '../domain/store';
import type { TagIntensities } from '../domain/types';
import { buildSimulationRun, freezeSimulationInput, sameNumbers, SimulationInputError } from './buildRun';
import { KernelInputError, simulate, zeroTags } from './kernel';

/**
 * 가상 독자 결정적 커널(V10) 검산. 기대값은 experiments/virtual-readers의 V10 2집단·4회차 예제(PR #9)와 같다.
 * 수치는 가상 실험 값이며 실제 독자 지표가 아니다.
 */

const V10_TAGS: TagIntensities[] = [
  { ...zeroTags(), G: 2 },
  { ...zeroTags(), B: 2 },
  { ...zeroTags(), C: 2, R: 1 },
  { ...zeroTags(), H: 2 },
];
const CUMULATIVE = [94.58, 76.8944, 74.7319, 72.0535];
const CONSECUTIVE = [94.58, 81.3009, 97.1877, 96.4159];
const REMAINING = [
  [5612.9757, 3845.0284],
  [3957.3935, 3732.0466],
  [3825.2934, 3647.8998],
  [3618.9164, 3586.4288],
];

const round4 = (value: number | null) => (value === null ? null : Math.round(value * 1e4) / 1e4);
const cohorts = () =>
  PERSONA_PRESETS.map((preset) => ({
    id: preset.presetKey,
    name: preset.displayName,
    initialCount: preset.initialCount,
    weights: preset.weights,
    betrayalSensitivity: preset.betrayalSensitivity,
  }));

describe('V10 결정적 커널', () => {
  it('2집단·4회차 예제의 기대값을 재현한다', () => {
    const steps = simulate(cohorts(), V10_TAGS.map((tags) => ({ tags })));
    expect(steps.map((step) => round4(step.cumulativeRetention! * 100))).toEqual(CUMULATIVE);
    expect(steps.map((step) => round4(step.consecutiveReadRate! * 100))).toEqual(CONSECUTIVE);
    expect(steps.map((step) => step.cohorts.map((cohort) => round4(cohort.remaining)))).toEqual(REMAINING);
  });

  it('같은 입력이면 같은 결과이고, 집단 순서가 바뀌어도 합계는 같다', () => {
    const forward = simulate(cohorts(), V10_TAGS.map((tags) => ({ tags })));
    const again = simulate(cohorts(), V10_TAGS.map((tags) => ({ tags })));
    const reversed = simulate([...cohorts()].reverse(), V10_TAGS.map((tags) => ({ tags })));
    expect(again).toEqual(forward);
    expect(reversed.map((step) => step.total)).toEqual(forward.map((step) => step.total));
  });

  it('범위를 벗어난 입력은 계산하지 않는다', () => {
    expect(() => simulate(cohorts(), [{ tags: { ...zeroTags(), G: 4 } }])).toThrow(KernelInputError);
    expect(() => simulate(cohorts(), [{ tags: { ...zeroTags(), G: 1.5 } }])).toThrow(KernelInputError);
    expect(() => simulate([], [{ tags: zeroTags() }])).toThrow(KernelInputError);
    expect(() => simulate([{ ...cohorts()[0]!, betrayalSensitivity: 2 }], [{ tags: zeroTags() }])).toThrow(KernelInputError);
  });
});

describe('가상 연재 실행 기록', () => {
  async function setup() {
    let tick = Date.parse('2026-11-22T00:00:00.000Z');
    const now = () => new Date((tick += 1000)).toISOString();
    const store = createWorkspaceStore({ now });
    const created = store.createWork({ title: '확인용 작품', genre: null, tags: [], synopsis: null, serializationStatus: 'draft' }, 'cmd-work');
    if (!created.ok) throw created.error;
    const workId = created.value.id;
    const results = await store.importChapters(
      workId,
      V10_TAGS.map((_, index) => ({
        commandId: `cmd-${index}`,
        displayNumber: String(index + 1),
        title: null,
        source: { rawBytes: null, rawText: `확인 문장 ${index + 1}.`, sourceType: 'paste' as const, fileName: null, encoding: 'utf-8' },
      })),
    );
    const versionIds = results.map((item) => {
      if (!item.result.ok) throw item.result.error;
      return item.result.value.versionId;
    });
    return { store, workId, versionIds, now };
  }

  it('태그를 확정하지 않은 판본이 있으면 실행하지 않는다', async () => {
    const { store, workId, versionIds } = await setup();
    expect(() => freezeSimulationInput(store.getState(), workId, versionIds, 'seed')).toThrow(SimulationInputError);
  });

  it('기본 2집단 프리셋으로 V10 기대값을 내고, 시드가 달라도 수치는 같다(PRNG 없음)', async () => {
    const { store, workId, versionIds, now } = await setup();
    versionIds.forEach((versionId, index) => {
      const saved = store.setTags(workId, versionId, V10_TAGS[index]!);
      if (!saved.ok) throw saved.error;
    });
    const ids = { newId: () => crypto.randomUUID(), now };
    const first = await buildSimulationRun(store.getState(), freezeSimulationInput(store.getState(), workId, versionIds, 'seed-a'), ids);
    const second = await buildSimulationRun(store.getState(), freezeSimulationInput(store.getState(), workId, versionIds, 'seed-b'), ids);
    const repeat = await buildSimulationRun(store.getState(), freezeSimulationInput(store.getState(), workId, versionIds, 'seed-a'), ids);
    expect(first.numericStatus).toBe('completed');
    expect(first.synthetic).toBe(true);
    expect(first.commentEnabled).toBe(false);
    expect(first.prngVersion).toBe('none');
    expect(first.steps.map((step) => round4(step.cumulativeRetention! * 100))).toEqual(CUMULATIVE);
    expect(sameNumbers(first, second)).toBe(true);
    expect(second.inputSnapshotHash).not.toBe(first.inputSnapshotHash);
    expect(repeat.inputSnapshotHash).toBe(first.inputSnapshotHash);
  });
});

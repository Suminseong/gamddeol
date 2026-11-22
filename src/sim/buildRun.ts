/**
 * 가상 연재 실행 입력을 동결하고 커널로 계산해 실행 기록을 만든다.
 * 동결 입력(판본 순서·태그 스냅샷·집단·시드·커널 버전)의 해시를 남겨 같은 입력이면 같은 결과임을 확인할 수 있게 한다.
 */
import { latestTagSnapshot } from '../domain/store';
import { canonicalJson, sha256Text } from '../domain/text';
import type { Id, SimulationRun, SimulationStep, Workspace } from '../domain/types';
import { KERNEL_VERSION, KernelInputError, PRNG_VERSION, simulate, TAXONOMY_VERSION } from './kernel';

export class SimulationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimulationInputError';
  }
}

export interface FrozenSimulationInput {
  workId: Id;
  orderedVersionIds: Id[];
  tagSnapshotIds: Id[];
  seed: string;
}

export function freezeSimulationInput(workspace: Workspace, workId: Id, versionIds: Id[], seed: string): FrozenSimulationInput {
  if (versionIds.length === 0) throw new SimulationInputError('계산할 회차 판본을 하나 이상 고르세요.');
  if (!seed.trim()) throw new SimulationInputError('시드를 입력하세요.');
  const tagSnapshotIds = versionIds.map((versionId) => {
    const version = workspace.versions[versionId];
    if (!version || version.workId !== workId) throw new SimulationInputError('이 작품의 판본이 아닙니다.');
    const snapshot = latestTagSnapshot(workspace, versionId);
    if (!snapshot) throw new SimulationInputError('태그를 확정하지 않은 판본이 있습니다. 2단계에서 태그를 저장하세요.');
    return snapshot.id;
  });
  const cohorts = Object.values(workspace.cohorts).filter((cohort) => cohort.workId === workId);
  const total = cohorts.reduce((sum, cohort) => sum + cohort.share, 0);
  if (cohorts.length === 0) throw new SimulationInputError('독자 집단이 없습니다.');
  if (Math.abs(total - 1) > 1e-9) throw new SimulationInputError('집단 비율 합계가 100%가 아닙니다.');
  return { workId, orderedVersionIds: [...versionIds], tagSnapshotIds, seed: seed.trim() };
}

export async function buildSimulationRun(
  workspace: Workspace,
  input: FrozenSimulationInput,
  ids: { newId: () => string; now: () => string },
  supersedesRunId: Id | null = null,
): Promise<SimulationRun> {
  const cohorts = Object.values(workspace.cohorts)
    .filter((cohort) => cohort.workId === input.workId)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const personas = cohorts.map((cohort) => {
    const persona = workspace.personas[cohort.personaId];
    if (!persona) throw new SimulationInputError('집단의 독자 성향을 찾을 수 없습니다.');
    return persona;
  });
  const snapshots = input.tagSnapshotIds.map((id) => {
    const snapshot = workspace.tagSnapshots[id];
    if (!snapshot) throw new SimulationInputError('태그 스냅샷을 찾을 수 없습니다.');
    return snapshot;
  });
  const promise = workspace.promises[input.workId];
  const frozen = {
    kernelVersion: KERNEL_VERSION,
    prngVersion: PRNG_VERSION,
    taxonomyVersion: TAXONOMY_VERSION,
    seed: input.seed,
    orderedVersionIds: input.orderedVersionIds,
    tags: snapshots.map((snapshot) => snapshot.tags),
    cohorts: cohorts.map((cohort, index) => ({
      id: cohort.id,
      initialCount: cohort.initialCount,
      weights: personas[index]!.weights,
      betrayalSensitivity: personas[index]!.betrayalSensitivity,
    })),
    genrePromises: promise?.genrePromises ?? [],
  };
  const inputSnapshotHash = await sha256Text(canonicalJson(frozen));
  const base = {
    id: ids.newId(),
    workId: input.workId,
    orderedVersionIds: input.orderedVersionIds,
    chapterTagSnapshotIds: input.tagSnapshotIds,
    cohortSnapshot: { cohorts: cohorts.map((cohort) => ({ ...cohort })), personas: personas.map((persona) => ({ ...persona })) },
    promiseProfileSnapshot: { genrePromises: [...(promise?.genrePromises ?? [])] },
    seed: input.seed,
    prngVersion: PRNG_VERSION,
    kernelVersion: KERNEL_VERSION,
    inputSnapshotHash,
    commentEnabled: false,
    reactionStatus: 'not_requested' as const,
    synthetic: true as const,
    supersedesRunId,
    createdAt: ids.now(),
  };
  try {
    const result = simulate(
      cohorts.map((cohort, index) => ({
        id: cohort.id,
        name: personas[index]!.displayName,
        initialCount: cohort.initialCount,
        weights: personas[index]!.weights,
        betrayalSensitivity: personas[index]!.betrayalSensitivity,
      })),
      snapshots.map((snapshot) => ({ tags: snapshot.tags })),
    );
    for (const step of result) {
      if (!Number.isFinite(step.total) || step.cohorts.some((cohort) => !Number.isFinite(cohort.remaining))) {
        throw new KernelInputError('계산 중 비정상 수치가 나왔습니다.');
      }
    }
    const steps: SimulationStep[] = result.map((step, index) => {
      const versionId = input.orderedVersionIds[index]!;
      const version = workspace.versions[versionId];
      const chapter = version ? workspace.chapters[version.chapterId] : undefined;
      return {
        stepIndex: index,
        versionId,
        chapterLabel: chapter ? `${chapter.displayNumber}화 v${version!.versionOrdinal}` : `${index + 1}번째`,
        tags: { ...snapshots[index]!.tags },
        baseChurn: step.baseChurn,
        cohortStates: step.cohorts.map((cohort) => ({ ...cohort })),
        initialCountTotal: step.initialTotal,
        previousCountTotal: step.previousTotal,
        remainingCountTotal: step.total,
        cumulativeRetention: step.cumulativeRetention,
        consecutiveReadRate: step.consecutiveReadRate,
      };
    });
    return { ...base, numericStatus: 'completed', steps, errorMessage: null };
  } catch (error) {
    // 비정상 입력·수치면 결과를 확정하지 않고 커널 오류로 기록한다.
    const message = error instanceof KernelInputError ? error.message : '계산하지 못했습니다.';
    return { ...base, numericStatus: 'failed', steps: [], errorMessage: message };
  }
}

/** 두 실행의 수치가 비트 단위로 같은지(재계산 일치 확인용). */
export function sameNumbers(a: SimulationRun, b: SimulationRun): boolean {
  if (a.steps.length !== b.steps.length) return false;
  return a.steps.every((step, index) => {
    const other = b.steps[index]!;
    return (
      Object.is(step.remainingCountTotal, other.remainingCountTotal) &&
      Object.is(step.cumulativeRetention, other.cumulativeRetention) &&
      Object.is(step.consecutiveReadRate, other.consecutiveReadRate) &&
      step.cohortStates.every((cohort, i) => Object.is(cohort.remaining, other.cohortStates[i]?.remaining))
    );
  });
}

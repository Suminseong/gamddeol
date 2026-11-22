// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { UI_CHECK_TEXT } from '../testing/fixtures';
import { buildSimulationRun, freezeSimulationInput } from '../sim/buildRun';
import { buildWorkExport, parseWorkExport, RestoreError, type WorkExportFile } from './exportFormat';
import { createWorkspaceStore } from './store';
import { canonicalJson, sha256Text } from './text';

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: Error }): T {
  if (!result.ok) throw result.error;
  return result.value;
}

/** 실제 원고가 아닌 기존 UI 검사용 문자열로, 사용자 앱이 만드는 schema 1 파일을 만든다. */
async function fixture(includeHistory = true) {
  const store = createWorkspaceStore();
  const work = unwrap(store.createWork({ title: 'UI 검사', genre: null, tags: [], synopsis: null, serializationStatus: 'draft' }, 'work-command'));
  const items = await store.importChapters(work.id, ['1', '2'].map((displayNumber) => ({
    commandId: `chapter-${displayNumber}`,
    displayNumber,
    title: null,
    source: { rawBytes: null, rawText: UI_CHECK_TEXT, sourceType: 'paste' as const, fileName: null, encoding: 'utf-8' },
  })));
  const [first, second] = items.map((item) => unwrap(item.result));
  const entity = unwrap(store.createEntity(work.id, { kind: 'place', canonicalName: 'UI 확인 항목', description: null }, 'entity-command'));
  const attr = Object.values(store.getState().attributeDefs).find((value) => value.entityKind === 'place' && value.key === 'summary')!;
  const anchor = unwrap(await store.createAnchor(work.id, first!.versionId, 0, 2));
  const assertion = unwrap(store.createAssertion(work.id, {
    subjectEntityId: entity.id, attributeDefId: attr.id, value: '확인', sourceKind: 'narration', speakerEntityId: null,
    speakerUnresolved: false, storyTimeExpression: null, startStoryOrder: null, endStoryOrderExclusive: null,
    evidenceIds: [anchor.id], approveNow: true,
  }, 'assertion-command'));
  const note = unwrap(store.addNote(work.id, first!.chapterId, first!.versionId, '확인', 'note-command'));
  unwrap(store.setTags(work.id, first!.versionId, { G: 0, B: 0, C: 0, R: 0, H: 0 }));
  const simulation = await buildSimulationRun(
    store.getState(),
    freezeSimulationInput(store.getState(), work.id, [first!.versionId], '확인'),
    { newId: () => crypto.randomUUID(), now: () => '2026-11-23T00:00:00.000Z' },
  );
  unwrap(store.saveSimulationRun(simulation, 'simulation-command'));
  // AI 작업 레코드는 백업 대상이 아니므로 해당 ID가 없어도 정상 복원이 가능해야 한다.
  store.addReview({ workId: work.id, jobId: 'not-exported-job', versionId: first!.versionId, perspective: 'general',
    text: '[UI 검사]', source: 'mock', model: null, responseId: null, incompleteReason: null });
  const { file } = await buildWorkExport(store.getState(), work.id, includeHistory, '2026-11-23T00:00:00.000Z');
  return { file, first: first!, second: second!, entity, assertion, anchor, note, work };
}

async function withMatchingHash(file: WorkExportFile): Promise<string> {
  file.integrity.dataSha256 = await sha256Text(canonicalJson(file.data));
  return JSON.stringify(file);
}

describe('schema 1 복원 전 구조·관계 검증', () => {
  it.each([true, false])('실제로 내보낸 파일을 이력 포함=%s 설정 그대로 복원한다', async (includeHistory) => {
    const { file, work } = await fixture(includeHistory);
    const parsed = await parseWorkExport(JSON.stringify(file));
    const restored = createWorkspaceStore();
    expect(restored.loadWorkSnapshot(parsed.snapshot, parsed.workId, parsed.title).ok).toBe(true);
    expect(restored.getState().works[work.id]).toEqual(file.data.works![work.id]);
    expect(restored.getState().versions).toEqual(file.data.versions);
    expect(restored.getState().assertions).toEqual(file.data.assertions);
    expect(restored.getState().decisions).toEqual(file.data.decisions ?? {});
    expect(restored.getState().simRuns).toEqual(file.data.simRuns);
    expect(restored.getState().reviews).toEqual(file.data.reviews);
  });

  it('기존 제한에 맞는 다국어 백업은 UTF-8 바이트 수가 50MiB를 넘어도 복원한다', async () => {
    const { file, work } = await fixture();
    // 원고를 생성하지 않고 안내 필드만 채워 기존 코드 단위 제한의 호환성을 확인한다.
    file.notice = '가'.repeat(Math.ceil((50 * 1024 * 1024) / 3) + 1);
    const text = JSON.stringify(file);
    expect(text.length).toBeLessThan(50 * 1024 * 1024);
    expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(50 * 1024 * 1024);
    await expect(parseWorkExport(text)).resolves.toMatchObject({ workId: work.id });
  }, 15_000);

  it('현재 판본이 같은 작품의 다른 회차 소속이면, 해시가 맞아도 거부하고 기존 탭은 그대로 둔다', async () => {
    const { file, first, second } = await fixture();
    const corrupted = structuredClone(file);
    corrupted.data.chapters![first.chapterId]!.currentVersionId = second.versionId;
    const destination = createWorkspaceStore();
    const existing = unwrap(destination.createWork({ title: '기존 UI', genre: null, tags: [], synopsis: null, serializationStatus: 'draft' }, 'existing-work'));
    const before = destination.getState();
    const text = await withMatchingHash(corrupted);
    const restore = async () => {
      const parsed = await parseWorkExport(text);
      return destination.loadWorkSnapshot(parsed.snapshot, parsed.workId, parsed.title);
    };
    await expect(restore()).rejects.toThrow('현재 판본이 다른 회차');
    expect(destination.getState()).toBe(before);
    expect(destination.getState().works[existing.id]).toEqual(before.works[existing.id]);
  });

  it('다른 회차의 기준 판본과 메모 판본을 거부한다', async () => {
    const { file, first, second, note } = await fixture();
    const version = structuredClone(file);
    version.data.versions![first.versionId]!.basedOnVersionId = second.versionId;
    await expect(parseWorkExport(await withMatchingHash(version))).rejects.toThrow('기준 판본이 다른 회차');
    const memo = structuredClone(file);
    memo.data.notes![note.id]!.versionId = second.versionId;
    await expect(parseWorkExport(await withMatchingHash(memo))).rejects.toThrow('메모의 판본이 다른 회차');
  });

  it('다른 작품의 자료가 섞이거나 없는 설정 항목·속성을 가리키는 진술을 거부한다', async () => {
    const { file, entity, assertion } = await fixture();
    const wrongOwner = structuredClone(file);
    wrongOwner.data.entities![entity.id]!.workId = 'other-work';
    await expect(parseWorkExport(await withMatchingHash(wrongOwner))).rejects.toThrow('다른 작품');
    const wrongEntity = structuredClone(file);
    wrongEntity.data.assertions![assertion.id]!.subjectEntityId = 'missing-entity';
    await expect(parseWorkExport(await withMatchingHash(wrongEntity))).rejects.toThrow('설정 항목이 파일에 없습니다');
    const wrongAttr = structuredClone(file);
    wrongAttr.data.assertions![assertion.id]!.attributeDefId = 'missing-attribute';
    await expect(parseWorkExport(await withMatchingHash(wrongAttr))).rejects.toThrow('속성이 파일에 없습니다');
  });

  it('객체·배열 형식이 깨진 자료는 일반 오류가 아닌 복원 오류로 안전하게 거부한다', async () => {
    const { file, assertion, first } = await fixture();
    const invalid = [
      (data: any) => { data.works = []; },
      (data: any) => { data.audit = {}; },
      (data: any) => { data.audit = [{ workId: 'other-work' }]; },
      (data: any) => { data.versions[first.versionId].segments = {}; },
      (data: any) => { data.assertions[assertion.id].evidenceIds = {}; },
      (data: any) => { data.works[Object.keys(data.works)[0]!].tags = {}; },
    ];
    for (const mutate of invalid) {
      const bad = structuredClone(file);
      mutate(bad.data);
      await expect(parseWorkExport(await withMatchingHash(bad))).rejects.toBeInstanceOf(RestoreError);
    }
  });

  it('해시가 맞아도 화면에서 쓰는 작품·설정의 문자열과 집단 인원이 손상되면 거부한다', async () => {
    const { file, work, entity, assertion, note } = await fixture();
    const invalid = [
      (data: any) => { data.works[work.id].updatedAt = null; },
      (data: any) => { data.works[work.id].genre = {}; },
      (data: any) => { data.entities[entity.id].canonicalName = {}; },
      (data: any) => { data.entities[entity.id].description = []; },
      (data: any) => { data.assertions[assertion.id].value = {}; },
      (data: any) => { data.notes[note.id].body = {}; },
      (data: any) => { data.cohorts[Object.keys(data.cohorts)[0]!].name = null; },
      (data: any) => { data.cohorts[Object.keys(data.cohorts)[0]!].initialCount = '100'; },
      (data: any) => { data.reviews[Object.keys(data.reviews)[0]!].text = {}; },
    ];
    for (const mutate of invalid) {
      const bad = structuredClone(file);
      mutate(bad.data);
      await expect(parseWorkExport(await withMatchingHash(bad))).rejects.toBeInstanceOf(RestoreError);
    }
    // 위 조건은 앱에서 직접 내보낸 정상 schema 1 파일을 가로막지 않는다.
    await expect(parseWorkExport(JSON.stringify(file))).resolves.toMatchObject({ workId: work.id });
  });

  it('해시 알고리즘이나 형식이 잘못된 파일과 다른 작품의 독자 성향 참조를 거부한다', async () => {
    const { file } = await fixture();
    const badHash = structuredClone(file);
    (badHash.integrity as { algorithm: string; dataSha256: string }).algorithm = 'other';
    await expect(parseWorkExport(JSON.stringify(badHash))).rejects.toThrow('해시 정보');
    const badCohort = structuredClone(file);
    Object.values(badCohort.data.cohorts!)[0]!.personaId = 'other-work-persona';
    await expect(parseWorkExport(await withMatchingHash(badCohort))).rejects.toThrow('독자 집단');
  });

  it('태그·시뮬레이션·감평이 없는 판본을 가리키면 거부한다', async () => {
    const { file } = await fixture();
    const badTag = structuredClone(file);
    Object.values(badTag.data.tagSnapshots!)[0]!.versionId = 'other-version';
    await expect(parseWorkExport(await withMatchingHash(badTag))).rejects.toThrow('태그가 가리키는 판본');
    const badRun = structuredClone(file);
    Object.values(badRun.data.simRuns!)[0]!.orderedVersionIds = ['other-version'];
    await expect(parseWorkExport(await withMatchingHash(badRun))).rejects.toThrow('가상 연재 기록의 판본');
    const badReview = structuredClone(file);
    Object.values(badReview.data.reviews!)[0]!.versionId = 'other-version';
    await expect(parseWorkExport(await withMatchingHash(badReview))).rejects.toThrow('감평 결과가 가리키는 판본');
  });
});

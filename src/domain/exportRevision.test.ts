// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hasUnexportedChanges } from './selectors';
import { createWorkspaceStore } from './store';
import { buildWorkExport } from './exportFormat';

function newWork(store: ReturnType<typeof createWorkspaceStore>, id: string) {
  const result = store.createWork({ title: id, genre: null, tags: [], synopsis: null, serializationStatus: 'draft' }, `create-${id}`);
  if (!result.ok) throw result.error;
  return result.value.id;
}

function change(store: ReturnType<typeof createWorkspaceStore>, workId: string, id: string) {
  const result = store.createEntity(workId, { kind: 'place', canonicalName: id, description: null }, `entity-${id}`);
  if (!result.ok) throw result.error;
}

describe('내보내기 파일의 revision', () => {
  it('비동기 파일 생성 중 변경은 파일에 섞이지 않고 저장 확인 뒤에도 경고로 남는다', async () => {
    const store = createWorkspaceStore();
    const workId = newWork(store, '검사 A');
    const snapshot = store.getState();
    const inFlight = buildWorkExport(snapshot, workId, true, '2026-11-23T00:00:00.000Z');
    change(store, workId, '변경 1');
    const { file } = await inFlight;
    expect(Object.values(file.data.entities ?? {}).some((entity) => entity.canonicalName === '변경 1')).toBe(false);
    store.markExported(workId, snapshot.revision);
    expect(hasUnexportedChanges(store.getState(), workId)).toBe(true);
  });

  it('만들기 시작한 뒤 작품이 바뀌면 이전 파일을 확인해도 변경 경고를 유지한다', () => {
    const store = createWorkspaceStore();
    const workId = newWork(store, '검사 A');
    const snapshot = store.getState().revision;
    change(store, workId, '변경 1');
    store.markExported(workId, snapshot);
    expect(hasUnexportedChanges(store.getState(), workId)).toBe(true);
    expect(store.getState().exportedRevision[workId]).toBe(snapshot);
  });

  it('최신 확인 후 이전 파일을 다시 확인해도 상태가 되돌아가지 않고 이후 변경은 표시한다', () => {
    const store = createWorkspaceStore();
    const workId = newWork(store, '검사 A');
    const old = store.getState().revision;
    change(store, workId, '변경 1');
    const latest = store.getState().revision;
    store.markExported(workId, latest);
    expect(hasUnexportedChanges(store.getState(), workId)).toBe(false);
    store.markExported(workId, old);
    expect(store.getState().exportedRevision[workId]).toBe(latest);
    expect(hasUnexportedChanges(store.getState(), workId)).toBe(false);
    change(store, workId, '변경 2');
    store.markExported(workId, old);
    expect(hasUnexportedChanges(store.getState(), workId)).toBe(true);
  });

  it('작품별 저장 확인은 서로 영향을 주지 않고 미래·잘못된 revision은 무시한다', () => {
    const store = createWorkspaceStore();
    const first = newWork(store, '검사 A');
    const second = newWork(store, '검사 B');
    const before = store.getState().revision;
    store.markExported(first, before + 1);
    store.markExported(first, Number.NaN);
    store.markExported(first, -1);
    expect(store.getState().revision).toBe(before);
    expect(hasUnexportedChanges(store.getState(), first)).toBe(true);
    store.markExported(first, before);
    expect(hasUnexportedChanges(store.getState(), first)).toBe(false);
    expect(hasUnexportedChanges(store.getState(), second)).toBe(true);
    change(store, second, '변경 B');
    expect(hasUnexportedChanges(store.getState(), first)).toBe(false);
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { detectConflicts, incomparablePairs } from './conflicts';
import { buildWorkExport, parseWorkExport, RestoreError } from './exportFormat';
import { createWorkspaceStore, type AssertionInput, type VersionSource, type WorkspaceStore } from './store';
import { boundaryCandidates, canonicalJson, cpLength, cpSlice, cpToUtf16, findAllCp, normalizeManuscript, segmentText, sha256Text, utf16ToCp } from './text';
import type { Id } from './types';

/**
 * 도메인 규칙 검사. 본문은 기능 확인용 짧은 문장만 쓴다(소설 원고를 만들지 않는다).
 */

function clock() {
  let t = Date.parse('2026-11-22T00:00:00.000Z');
  return () => new Date((t += 1000)).toISOString();
}

function newStore(): WorkspaceStore {
  return createWorkspaceStore({ now: clock() });
}

const paste = (rawText: string): VersionSource => ({ rawBytes: null, rawText, sourceType: 'paste', fileName: null, encoding: 'utf-8' });

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: Error }): T {
  if (!result.ok) throw result.error;
  return result.value;
}

function makeWork(store: WorkspaceStore, commandId = 'cmd-work') {
  return unwrap(store.createWork({ title: '확인용 작품', genre: null, tags: [], synopsis: null, serializationStatus: 'draft' }, commandId));
}

async function importOne(store: WorkspaceStore, workId: Id, text: string, displayNumber = '1') {
  const [item] = await store.importChapters(workId, [{ commandId: `cmd-import-${displayNumber}`, displayNumber, title: null, source: paste(text) }]);
  return unwrap(item!.result);
}

function attributeId(store: WorkspaceStore, workId: Id, key: string, kind = 'character') {
  const def = Object.values(store.getState().attributeDefs).find((item) => item.workId === workId && item.entityKind === kind && item.key === key);
  if (!def) throw new Error(`attribute ${key} missing`);
  return def.id;
}

function assertionInput(overrides: Partial<AssertionInput> & Pick<AssertionInput, 'subjectEntityId' | 'attributeDefId' | 'value'>): AssertionInput {
  return {
    sourceKind: 'narration',
    speakerEntityId: null,
    speakerUnresolved: false,
    storyTimeExpression: null,
    startStoryOrder: null,
    endStoryOrderExclusive: null,
    evidenceIds: [],
    approveNow: false,
    ...overrides,
  };
}

describe('원고 정규화·코드포인트 오프셋', () => {
  it('BOM을 빼고 CRLF·CR을 LF로, NFC로 정규화한다 (공백은 그대로)', () => {
    const decomposed = '가'.normalize('NFD');
    expect(normalizeManuscript(`﻿첫 줄\r\n둘째  줄\r셋째 ${decomposed}`)).toBe('첫 줄\n둘째  줄\n셋째 가');
  });

  it('코드포인트와 UTF-16 오프셋을 오간다 (서로게이트 쌍 포함)', () => {
    const text = 'A😀B가';
    expect(text.length).toBe(5);
    expect(cpLength(text)).toBe(4);
    expect(cpToUtf16(text, 2)).toBe(3);
    expect(utf16ToCp(text, 3)).toBe(2);
    expect(cpSlice(text, 1, 3)).toBe('😀B');
    expect(findAllCp('😀가😀가', '가')).toEqual([
      { startCp: 1, endCp: 2 },
      { startCp: 3, endCp: 4 },
    ]);
  });

  it('회차 제목 줄을 경계 후보로 찾되, 본문 속 숫자+화는 제목으로 보지 않는다', () => {
    const text = normalizeManuscript('1화\n확인 문장\n제 2 화\n3화의 끝이라는 문장\n5회차 문장\n# 머리말\n에필로그');
    expect(boundaryCandidates(text).map((item) => item.line)).toEqual(['제 2 화', '# 머리말', '에필로그']);
  });

  it('단락 구간이 정규화 본문을 빈틈 없이 순서대로 덮는다', () => {
    const text = '1화\n\n확인 문장 하나.\n\n\n확인 문장 둘.';
    const segments = segmentText(text);
    expect(segments.map((segment) => segment.kind)).toEqual(['heading', 'paragraph', 'paragraph']);
    for (const segment of segments) expect(cpSlice(text, segment.startCp, segment.endCp)).toBe(segment.text);
    expect(segments.at(-1)!.endCp).toBe(cpLength(text));
  });

  it('해시 입력용 JSON은 키 순서와 무관하다', async () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
    expect(await sha256Text('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('작품·회차·판본', () => {
  it('같은 명령 ID로 작품을 두 번 만들면 하나만 생긴다', () => {
    const store = newStore();
    const first = makeWork(store);
    const second = makeWork(store);
    expect(second.id).toBe(first.id);
    expect(Object.keys(store.getState().works)).toHaveLength(1);
    const invalid = store.createWork({ title: '  ', genre: null, tags: [], synopsis: null, serializationStatus: 'draft' }, 'cmd-x');
    expect(invalid.ok).toBe(false);
  });

  it('여러 회차를 항목 순서대로 등록하고, 실패한 항목만 다시 보낼 수 있다', async () => {
    const store = newStore();
    const work = makeWork(store);
    const items = [
      { commandId: 'a', displayNumber: '1', title: '첫 회', source: paste('확인 문장 가.') },
      { commandId: 'b', displayNumber: '2', title: null, source: paste('   ') },
      { commandId: 'c', displayNumber: '3', title: null, source: paste('확인 문장 다. 조금 더 긴 줄입니다.') },
    ];
    const results = await store.importChapters(work.id, items);
    expect(results.map((item) => item.result.ok)).toEqual([true, false, true]);
    const chapters = store.chaptersOf(work.id);
    expect(chapters.map((chapter) => [chapter.displayNumber, chapter.sortKey])).toEqual([
      ['1', 1],
      ['3', 2],
    ]);
    const retry = await store.importChapters(work.id, [items[0]!, { ...items[1]!, source: paste('확인 문장 나.') }]);
    expect(retry.map((item) => item.result.ok)).toEqual([true, true]);
    expect(unwrap(retry[0]!.result).versionId).toBe(unwrap(results[0]!.result).versionId);
    expect(store.chaptersOf(work.id).map((chapter) => chapter.displayNumber)).toEqual(['1', '3', '2']);
  });

  it('판본은 바뀌지 않고, 같은 본문은 새 판본으로 만들지 않는다', async () => {
    const store = newStore();
    const work = makeWork(store);
    const { chapterId, versionId } = await importOne(store, work.id, '확인 문장 하나.\r\n확인 문장 둘.');
    const v1 = store.getState().versions[versionId]!;
    expect(v1.normalizedText).toBe('확인 문장 하나.\n확인 문장 둘.');
    expect(v1.normalizedSha256).toBe(await sha256Text(v1.normalizedText));
    expect(v1.rawContentSha256).toMatch(/^[0-9a-f]{64}$/);

    const duplicate = await store.addVersion(work.id, chapterId, paste('확인 문장 하나.\n확인 문장 둘.'), 'cmd-dup');
    expect(duplicate.ok ? null : duplicate.error.code).toBe('duplicate');

    const v2 = unwrap(await store.addVersion(work.id, chapterId, paste('확인 문장 하나.\n바뀐 문장 둘.'), 'cmd-v2'));
    expect(v2.versionOrdinal).toBe(2);
    expect(v2.basedOnVersionId).toBe(versionId);
    expect(store.getState().versions[versionId]).toBe(v1);
    expect(store.getState().chapters[chapterId]!.currentVersionId).toBe(v2.id);
    const again = unwrap(await store.addVersion(work.id, chapterId, paste('확인 문장 하나.\n바뀐 문장 둘.'), 'cmd-v2'));
    expect(again.id).toBe(v2.id);
  });
});

describe('근거·진술·결정', () => {
  async function setup() {
    const store = newStore();
    const work = makeWork(store);
    const { chapterId, versionId } = await importOne(store, work.id, '확인 문장 😀 하나.\n확인 문장 둘.\n확인 문장 둘.');
    const entity = unwrap(store.createEntity(work.id, { kind: 'character', canonicalName: '확인 인물', description: null }, 'cmd-entity'));
    return { store, work, chapterId, versionId, entity };
  }

  it('근거 구간을 검증하고, 인용·앞뒤 문맥을 판본 본문에서 그대로 떼어 둔다', async () => {
    const { store, work, versionId } = await setup();
    const text = store.getState().versions[versionId]!.normalizedText;
    const startCp = utf16ToCp(text, text.indexOf('😀'));
    const anchor = unwrap(await store.createAnchor(work.id, versionId, startCp, startCp + 4));
    expect(anchor.exactQuote).toBe('😀 하나');
    expect(anchor.prefixContext).toBe('확인 문장 ');
    expect(anchor.quoteSha256).toBe(await sha256Text('😀 하나'));
    const same = unwrap(await store.createAnchor(work.id, versionId, startCp, startCp + 4));
    expect(same.id).toBe(anchor.id);
    for (const [start, end] of [
      [3, 3],
      [5, 2],
      [0, cpLength(text) + 1],
      [-1, 2],
    ] as const) {
      expect((await store.createAnchor(work.id, versionId, start, end)).ok).toBe(false);
    }
    expect((await store.createAnchor(work.id, versionId, 5, 6)).ok).toBe(false);
  });

  it('AI 추론 출처는 직접 입력할 수 없고, 직접 입력 진술은 작가가 고를 때만 바로 확정된다', async () => {
    const { store, work, entity } = await setup();
    const attr = attributeId(store, work.id, 'age');
    const ai = store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: attr, value: '17', sourceKind: 'ai_inference' }), 'cmd-ai');
    expect(ai.ok).toBe(false);
    const candidate = unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: attr, value: '17' }), 'cmd-a1'));
    expect(candidate.approvalStatus).toBe('candidate');
    const approved = unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: attr, value: '18', approveNow: true }), 'cmd-a2'));
    expect(approved.approvalStatus).toBe('approved');
    expect(Object.values(store.getState().decisions).filter((item) => item.assertionId === approved.id)).toHaveLength(1);
  });

  it('결정은 화면이 본 리비전이 다르면 거부하고, 같은 명령 ID는 한 번만 적용한다', async () => {
    const { store, work, entity } = await setup();
    const attr = attributeId(store, work.id, 'age');
    const assertion = unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: attr, value: '17' }), 'cmd-a1'));
    const stale = store.decide(work.id, assertion.id, 'approve', assertion.revision + 1, null, 'cmd-d0');
    expect(stale.ok ? null : stale.error.code).toBe('stale');
    const first = unwrap(store.decide(work.id, assertion.id, 'approve', assertion.revision, '확인', 'cmd-d1'));
    const repeat = unwrap(store.decide(work.id, assertion.id, 'approve', assertion.revision, '확인', 'cmd-d1'));
    expect(repeat.id).toBe(first.id);
    const after = store.getState().assertions[assertion.id]!;
    expect(after.approvalStatus).toBe('approved');
    expect(after.revision).toBe(assertion.revision + 1);
    const reject = store.decide(work.id, assertion.id, 'reject', after.revision, null, 'cmd-d2');
    expect(reject.ok ? null : reject.error.code).toBe('invalid');
  });

  it('묶음 결정은 항목별로 성공·실패를 돌려준다', async () => {
    const { store, work, entity } = await setup();
    const attr = attributeId(store, work.id, 'trait');
    const a = unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: attr, value: '가' }), 'cmd-a'));
    const b = unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: attr, value: '나' }), 'cmd-b'));
    const results = store.decideBatch(
      work.id,
      [
        { assertionId: a.id, baseRevision: a.revision },
        { assertionId: b.id, baseRevision: b.revision + 5 },
      ],
      'reject',
      null,
      'batch-1',
    );
    expect(results.map((item) => (item.result.ok ? 'ok' : item.result.error.code))).toEqual(['ok', 'stale']);
    expect(store.getState().assertions[a.id]!.approvalStatus).toBe('rejected');
    expect(store.getState().assertions[b.id]!.approvalStatus).toBe('candidate');
  });

  it('새 판본을 올리면 이전 판본 근거에 재검토 요청만 만들고 승인 상태는 그대로 둔다', async () => {
    const { store, work, chapterId, versionId, entity } = await setup();
    const anchor = unwrap(await store.createAnchor(work.id, versionId, 0, 5));
    const assertion = unwrap(
      store.createAssertion(
        work.id,
        assertionInput({ subjectEntityId: entity.id, attributeDefId: attributeId(store, work.id, 'trait'), value: '확인', evidenceIds: [anchor.id], approveNow: true }),
        'cmd-a',
      ),
    );
    await store.addVersion(work.id, chapterId, paste('완전히 바뀐 확인 문장.'), 'cmd-v2');
    const state = store.getState();
    expect(state.anchors[anchor.id]!.anchorHealth).toBe('review_requested');
    expect(state.assertions[assertion.id]!.approvalStatus).toBe('approved');
    expect(state.assertions[assertion.id]!.evidenceHealth).toBe('review_requested');
    const requests = Object.values(state.reviewRequests).filter((request) => request.assertionId === assertion.id);
    expect(requests.map((request) => [request.status, request.cause])).toEqual([['open', 'source_changed']]);

    unwrap(store.setReviewRequestStatus(work.id, requests[0]!.id, 'resolved'));
    expect(store.getState().anchors[anchor.id]!.anchorHealth).toBe('ok');
  });

  it('AI 추출 후보는 인용이 본문에 정확히 있을 때만 후보로 저장하고, 자동 확정하지 않는다', async () => {
    const { store, work, versionId } = await setup();
    const outcome = unwrap(
      await store.addAiCandidates(work.id, versionId, 'job-1', [
        { entityName: '새 인물', entityKind: 'character', attributeKey: 'trait', value: '확인 값', sourceKind: 'narration', speakerName: null, quote: '확인 문장 😀 하나.' },
        { entityName: '새 인물', entityKind: 'character', attributeKey: 'age', value: '20', sourceKind: 'ai_inference', speakerName: null, quote: '확인 문장 둘.' },
        { entityName: '없는 인용', entityKind: 'place', attributeKey: 'summary', value: '값', sourceKind: 'narration', speakerName: null, quote: '본문에 없는 문장' },
      ]),
    );
    expect(outcome).toEqual({ saved: 2, quoteMissing: 1, ambiguous: 1, newEntities: 1 });
    const state = store.getState();
    const created = Object.values(state.assertions).filter((item) => item.createdByJobId === 'job-1');
    expect(created.every((item) => item.approvalStatus === 'candidate')).toBe(true);
    const healths = created.map((item) => state.anchors[item.evidenceIds[0]!]!.anchorHealth).sort();
    expect(healths).toEqual(['ok', 'relocation_candidate']);
    for (const item of created) {
      const anchor = state.anchors[item.evidenceIds[0]!]!;
      expect(cpSlice(state.versions[versionId]!.normalizedText, anchor.startCp, anchor.endCp)).toBe(anchor.exactQuote);
    }
    const entity = Object.values(state.entities).find((item) => item.canonicalName === '새 인물')!;
    expect([entity.createdBy, entity.reviewStatus]).toEqual(['ai_candidate', 'candidate']);
  });
});

describe('충돌 후보 (규칙 기반)', () => {
  async function setup() {
    const store = newStore();
    const work = makeWork(store);
    const { versionId } = await importOne(store, work.id, '근거 문장 하나.\n근거 문장 둘.');
    const entity = unwrap(store.createEntity(work.id, { kind: 'character', canonicalName: '확인 인물', description: null }, 'cmd-entity'));
    const first = unwrap(await store.createAnchor(work.id, versionId, 0, 8));
    const second = unwrap(await store.createAnchor(work.id, versionId, 9, 17));
    return { store, work, versionId, entity, anchors: [first.id, second.id] as const };
  }

  it('같은 항목·같은 속성·겹치는 작중 시점·양쪽 근거가 모두 있을 때만 충돌 후보가 된다', async () => {
    const { store, work, entity, anchors } = await setup();
    const age = attributeId(store, work.id, 'age');
    unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: age, value: '17', startStoryOrder: 1, evidenceIds: [anchors[0]], approveNow: true }), 'a1'));
    unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: age, value: '18', startStoryOrder: 3, endStoryOrderExclusive: 5, evidenceIds: [anchors[1]] }), 'a2'));
    // 시점이 겹치지 않으면 후보가 아니다.
    unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: age, value: '9', startStoryOrder: -5, endStoryOrderExclusive: 0, evidenceIds: [anchors[1]] }), 'a3'));
    // 같은 값(공백·대소문자 차이)은 충돌이 아니다.
    unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: age, value: ' 17 ', startStoryOrder: 2, evidenceIds: [anchors[1]] }), 'a4'));
    const state = store.getState();
    const found = detectConflicts(state, work.id);
    expect(found.map((item) => [item.overlapStart, item.overlapEnd])).toEqual([[3, 5]]);
    expect(Object.values(state.conflicts).map((item) => item.status)).toEqual(['open']);
  });

  it('작중 시점이나 근거가 비면 충돌로 단정하지 않고 비교 불가로만 알린다', async () => {
    const { store, work, entity, anchors } = await setup();
    const age = attributeId(store, work.id, 'age');
    unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: age, value: '17', startStoryOrder: 1, evidenceIds: [anchors[0]], approveNow: true }), 'a1'));
    unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: age, value: '18', evidenceIds: [anchors[1]] }), 'a2'));
    unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: age, value: '19', startStoryOrder: 1 }), 'a3'));
    const state = store.getState();
    expect(detectConflicts(state, work.id)).toEqual([]);
    expect(incomparablePairs(state, work.id).map((pair) => pair.reason).sort()).toEqual(['작중 시점이 비어 있어 비교하지 않았습니다.', '한쪽 이상에 원문 근거가 없습니다.']);
  });

  it('시점과 무관한 속성은 값이 다르면 바로 후보가 된다', async () => {
    const { store, work, entity, anchors } = await setup();
    const name = attributeId(store, work.id, 'name');
    unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: name, value: '갑', evidenceIds: [anchors[0]], approveNow: true }), 'a1'));
    unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: name, value: '을', evidenceIds: [anchors[1]] }), 'a2'));
    expect(detectConflicts(store.getState(), work.id)).toHaveLength(1);
  });

  it('의도된 전개 분류는 그 근거 쌍에만 적용되고, 근거가 바뀌면 다시 열린다', async () => {
    const { store, work, versionId, entity, anchors } = await setup();
    const name = attributeId(store, work.id, 'name');
    unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: name, value: '갑', evidenceIds: [anchors[0]], approveNow: true }), 'a1'));
    const right = unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: name, value: '을', evidenceIds: [anchors[1]] }), 'a2'));
    const conflict = Object.values(store.getState().conflicts)[0]!;
    unwrap(store.classifyConflict(work.id, conflict.id, 'intentional', '확인용 사유'));
    expect(store.getState().conflicts[conflict.id]!.status).toBe('intentional');

    const extra = unwrap(await store.createAnchor(work.id, versionId, 0, 2));
    unwrap(store.addEvidence(work.id, right.id, extra.id, right.revision));
    const reopened = store.getState().conflicts[conflict.id]!;
    expect(reopened.status).toBe('reopened');
    expect(reopened.decisionReason).toBe('확인용 사유');
  });

  it('한쪽을 기각하면 열린 충돌 후보가 사라진다', async () => {
    const { store, work, entity, anchors } = await setup();
    const name = attributeId(store, work.id, 'name');
    unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: name, value: '갑', evidenceIds: [anchors[0]], approveNow: true }), 'a1'));
    const right = unwrap(store.createAssertion(work.id, assertionInput({ subjectEntityId: entity.id, attributeDefId: name, value: '을', evidenceIds: [anchors[1]] }), 'a2'));
    expect(Object.keys(store.getState().conflicts)).toHaveLength(1);
    unwrap(store.decide(work.id, right.id, 'reject', right.revision, null, 'd1'));
    expect(Object.keys(store.getState().conflicts)).toHaveLength(0);
  });
});

describe('JSON 내보내기·불러오기', () => {
  async function exported() {
    const store = newStore();
    const work = makeWork(store);
    const { versionId } = await importOne(store, work.id, '내보내기 확인 문장.');
    const entity = unwrap(store.createEntity(work.id, { kind: 'place', canonicalName: '확인 장소', description: null }, 'cmd-entity'));
    const anchor = unwrap(await store.createAnchor(work.id, versionId, 0, 4));
    unwrap(
      store.createAssertion(
        work.id,
        assertionInput({ subjectEntityId: entity.id, attributeDefId: attributeId(store, work.id, 'summary', 'place'), value: '값', evidenceIds: [anchor.id], approveNow: true }),
        'cmd-a',
      ),
    );
    const { file, text } = await buildWorkExport(store.getState(), work.id, true, '2026-11-22T00:00:00.000Z');
    return { store, work, file, text, anchorId: anchor.id };
  }

  it('내보낸 파일을 검증해 새 탭 작업 공간에 그대로 불러온다', async () => {
    const { store, work, text } = await exported();
    const parsed = await parseWorkExport(text);
    expect(parsed.workId).toBe(work.id);
    const fresh = newStore();
    unwrap(fresh.loadWorkSnapshot(parsed.snapshot, parsed.workId, parsed.title));
    const before = store.getState();
    const after = fresh.getState();
    expect(after.versions).toEqual(before.versions);
    expect(after.assertions).toEqual(before.assertions);
    expect(after.decisions).toEqual(before.decisions);
    expect(fresh.loadWorkSnapshot(parsed.snapshot, parsed.workId, parsed.title).ok).toBe(false);
  });

  it('내보낸 뒤 바뀐 파일은 불러오지 않는다', async () => {
    const { file } = await exported();
    const tampered = structuredClone(file);
    const version = Object.values(tampered.data.versions!)[0]!;
    version.normalizedText = `${version.normalizedText}!`;
    await expect(parseWorkExport(JSON.stringify(tampered))).rejects.toThrow(RestoreError);
    await expect(parseWorkExport('{"format":"other"}')).rejects.toThrow('감떨 작품 내보내기 파일이 아닙니다.');
  });

  it('무결성 해시를 다시 맞춰도 판본 해시·근거 위치가 맞지 않으면 불러오지 않는다', async () => {
    const { file, anchorId } = await exported();
    const rehash = async (data: typeof file.data) => ({ ...file, data, integrity: { algorithm: 'SHA-256' as const, dataSha256: await sha256Text(canonicalJson(data)) } });

    const badVersion = structuredClone(file.data);
    Object.values(badVersion.versions!)[0]!.normalizedText = '바꾼 본문';
    await expect(parseWorkExport(JSON.stringify(await rehash(badVersion)))).rejects.toThrow('판본 본문 해시가 맞지 않아');

    const badAnchor = structuredClone(file.data);
    badAnchor.anchors![anchorId]!.endCp = 999;
    await expect(parseWorkExport(JSON.stringify(await rehash(badAnchor)))).rejects.toThrow('근거 위치가 판본 본문과 맞지 않아');
  });
});

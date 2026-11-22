/**
 * 작품 작업 공간 저장소(논리 서비스 인터페이스의 탭 메모리 구현).
 *
 * - 화면은 이 저장소의 명령(command)과 읽기만 쓴다. 나중에 서버 저장소가 승인되면 같은 명령 계약으로 바꾼다.
 * - 데이터는 이 탭 메모리에만 있다. localStorage·IndexedDB·서버에 쓰지 않는다(새로고침하면 사라진다).
 * - 원고 판본은 불변이다. 수정본은 새 판본으로만 추가하고, 이전 본문·해시·메모를 보존한다.
 * - AI 작업은 후보(candidate)만 만든다. 승인·기각·취소는 작가 명령(decide)으로만 일어난다.
 * - 같은 commandId로 다시 들어온 명령은 새로 만들지 않고 처음 결과를 돌려준다(중복 제출 방지).
 */
import { attributeSeeds, PERSONA_PRESETS } from './defaults';
import { detectConflicts, evidencePairKey } from './conflicts';
import {
  ANCHOR_CONTEXT_CP,
  cpLength,
  cpSlice,
  findAllCp,
  normalizeManuscript,
  normalizeName,
  NORMALIZER_VERSION,
  segmentText,
  sha256Bytes,
  sha256Text,
} from './text';
import {
  LOCAL_OWNER_ID,
  TAG_KEYS,
  type AiConsent,
  type AiDataKind,
  type AiJob,
  type AiJobStatus,
  type AiJobType,
  type AiUsage,
  type AnchorHealth,
  type ApprovalStatus,
  type Assertion,
  type AssertionDecision,
  type AssertionSourceKind,
  type AuditEvent,
  type AuditEventType,
  type Chapter,
  type ChapterDraftStatus,
  type ConflictFinding,
  type ConflictStatus,
  type DecisionAction,
  type EntityKind,
  type EvidenceAnchor,
  type Id,
  type LoreEntity,
  type ManuscriptReview,
  type ManuscriptVersion,
  type Persona,
  type ReviewRequestStatus,
  type SerializationStatus,
  type SimulationRun,
  type SourceType,
  type TagIntensities,
  type Work,
  type Workspace,
  type WriterNote,
} from './types';

export type DomainErrorCode = 'not_found' | 'forbidden' | 'invalid' | 'stale' | 'duplicate' | 'integrity';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly field: string | undefined;
  constructor(code: DomainErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.field = field;
  }
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T = never>(code: DomainErrorCode, message: string, field?: string): Result<T> => ({
  ok: false,
  error: new DomainError(code, message, field),
});

type TableKey = {
  [K in keyof Workspace]: Workspace[K] extends Record<Id, infer V>
    ? V extends { id: Id } | { workId: Id }
      ? K
      : never
    : never;
}[keyof Workspace];

export function emptyWorkspace(): Workspace {
  return {
    user: { displayName: '작가', locale: 'ko-KR' },
    works: {},
    promises: {},
    chapters: {},
    versions: {},
    uploads: {},
    notes: {},
    entities: {},
    aliases: {},
    attributeDefs: {},
    anchors: {},
    assertions: {},
    decisions: {},
    reviewRequests: {},
    conflicts: {},
    tagSnapshots: {},
    personas: {},
    cohorts: {},
    simRuns: {},
    aiJobs: {},
    aiUsage: {},
    reviews: {},
    consent: null,
    audit: [],
    processedCommands: {},
    revision: 0,
    exportedRevision: {},
    changedRevision: {},
  };
}

export interface StoreDeps {
  now?: () => string;
  newId?: () => string;
}

export interface WorkInput {
  title: string;
  genre: string | null;
  tags: string[];
  synopsis: string | null;
  serializationStatus: SerializationStatus;
}

export interface WorkSettingsInput extends WorkInput {
  storyCalendarLabel: string | null;
  genrePromises: string[];
  readerExpectations: string;
}

export interface VersionSource {
  /** 파일 원본 바이트(원본 해시용). 붙여넣기면 null이고 텍스트 UTF-8 바이트로 해시한다. */
  rawBytes: Uint8Array | null;
  /** 디코딩한 원문(정규화 전). */
  rawText: string;
  sourceType: SourceType;
  fileName: string | null;
  encoding: string;
}

export interface ChapterImportItem {
  /** 항목별 명령 ID. 일부 실패 뒤 다시 보내면 성공한 항목은 다시 만들지 않는다. */
  commandId: Id;
  displayNumber: string;
  title: string | null;
  source: VersionSource;
}

export interface ImportItemResult {
  commandId: Id;
  result: Result<{ chapterId: Id; versionId: Id }>;
}

export interface AssertionInput {
  subjectEntityId: Id;
  attributeDefId: Id;
  value: string;
  sourceKind: AssertionSourceKind;
  speakerEntityId: Id | null;
  speakerUnresolved: boolean;
  storyTimeExpression: string | null;
  startStoryOrder: number | null;
  endStoryOrderExclusive: number | null;
  evidenceIds: Id[];
  /** 작가가 직접 쓴 진술을 바로 확정할지. AI 출처(ai_inference)에는 쓸 수 없다. */
  approveNow: boolean;
}

export interface BatchDecisionItem {
  assertionId: Id;
  baseRevision: number;
}

export interface AiCandidateInput {
  entityName: string;
  entityKind: EntityKind;
  attributeKey: string;
  value: string;
  sourceKind: 'narration' | 'character_speech' | 'ai_inference';
  speakerName: string | null;
  quote: string;
}

export interface AiCandidateOutcome {
  saved: number;
  quoteMissing: number;
  ambiguous: number;
  newEntities: number;
}

const HEALTH_ORDER: AnchorHealth[] = ['ok', 'review_requested', 'relocation_candidate', 'lost'];

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;

export function createWorkspaceStore(deps: StoreDeps = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => globalThis.crypto.randomUUID());
  let state = emptyWorkspace();
  const listeners = new Set<() => void>();
  const pending = new Map<string, Promise<unknown>>();

  class Tx {
    next: Workspace;
    private copied = new Set<string>();
    private touched = new Set<Id>();
    constructor(base: Workspace) {
      this.next = { ...base };
    }
    table<K extends TableKey>(key: K): Workspace[K] {
      if (!this.copied.has(key)) {
        (this.next as unknown as Record<string, unknown>)[key] = { ...(this.next[key] as object) };
        this.copied.add(key);
      }
      return this.next[key];
    }
    put<K extends TableKey>(key: K, value: Workspace[K][string] & { id: Id }) {
      (this.table(key) as Record<Id, unknown>)[value.id] = value;
    }
    touch(workId: Id | null) {
      if (workId) this.touched.add(workId);
    }
    audit(workId: Id | null, eventType: AuditEventType, summary: string, targetId: Id | null, commandId: Id | null = null, changesWork = true) {
      const event: AuditEvent = {
        id: newId(),
        workId,
        eventType,
        actorType: eventType === 'ai_job' ? 'worker' : 'owner',
        targetId,
        commandId,
        summary,
        createdAt: now(),
      };
      this.next.audit = [...this.next.audit, event];
      if (changesWork) this.touch(workId);
    }
    processed(commandId: Id, resultId: Id) {
      this.next.processedCommands = { ...this.next.processedCommands, [commandId]: resultId };
    }
    apply() {
      const revision = state.revision + 1;
      this.next.revision = revision;
      if (this.touched.size > 0) {
        const changed = { ...this.next.changedRevision };
        for (const workId of this.touched) changed[workId] = revision;
        this.next.changedRevision = changed;
      }
      state = this.next;
      for (const listener of listeners) listener();
    }
  }

  const tx = () => new Tx(state);
  const processedResult = (commandId: Id) => state.processedCommands[commandId];

  /** 같은 commandId의 비동기 명령이 겹치면 처음 것의 결과를 함께 기다린다. */
  function once<T>(commandId: Id, run: () => Promise<T>): Promise<T> {
    const existing = pending.get(commandId);
    if (existing) return existing as Promise<T>;
    const promise = run().finally(() => pending.delete(commandId));
    pending.set(commandId, promise);
    return promise;
  }

  // ---------- 조회 도우미 ----------

  function requireWork(workId: Id): Result<Work> {
    const work = state.works[workId];
    return work ? ok(work) : fail('not_found', '작품을 찾을 수 없습니다.');
  }

  function inWork<T extends { workId: Id }>(record: T | undefined, workId: Id, label: string): Result<T> {
    if (!record) return fail('not_found', `${label}을(를) 찾을 수 없습니다.`);
    if (record.workId !== workId) return fail('forbidden', '다른 작품의 자료에는 이 경로로 접근할 수 없습니다.');
    return ok(record);
  }

  function chaptersOf(workId: Id): Chapter[] {
    return Object.values(state.chapters)
      .filter((chapter) => chapter.workId === workId)
      .sort((a, b) => a.sortKey - b.sortKey);
  }

  function versionsOf(chapterId: Id): ManuscriptVersion[] {
    return Object.values(state.versions)
      .filter((version) => version.chapterId === chapterId)
      .sort((a, b) => a.versionOrdinal - b.versionOrdinal);
  }

  function assertionHealth(workspace: Workspace, assertion: Assertion): AnchorHealth {
    let worst: AnchorHealth = 'ok';
    for (const evidenceId of assertion.evidenceIds) {
      const health = workspace.anchors[evidenceId]?.anchorHealth ?? 'lost';
      if (HEALTH_ORDER.indexOf(health) > HEALTH_ORDER.indexOf(worst)) worst = health;
    }
    return worst;
  }

  function refreshConflicts(t: Tx, workId: Id) {
    const found = detectConflicts(t.next, workId);
    const existing = Object.values(t.next.conflicts).filter((conflict) => conflict.workId === workId);
    const byPair = new Map(existing.map((conflict) => [`${conflict.leftAssertionId}|${conflict.rightAssertionId}`, conflict]));
    const stillPresent = new Set<string>();
    for (const candidate of found) {
      const key = `${candidate.leftAssertionId}|${candidate.rightAssertionId}`;
      stillPresent.add(key);
      const previous = byPair.get(key);
      if (!previous) {
        t.put('conflicts', {
          id: newId(),
          workId,
          leftAssertionId: candidate.leftAssertionId,
          rightAssertionId: candidate.rightAssertionId,
          attributeDefId: candidate.attributeDefId,
          overlapStart: candidate.overlapStart,
          overlapEnd: candidate.overlapEnd,
          status: 'open',
          reason: candidate.reason,
          decisionReason: null,
          exceptionEvidencePairKey: null,
          createdAt: now(),
          updatedAt: now(),
        });
        continue;
      }
      const decided = previous.status === 'intentional' || previous.status === 'dismissed';
      const evidenceChanged = decided && previous.exceptionEvidencePairKey !== candidate.evidencePairKey;
      // 의도적 전개·무시 결정은 그 근거 쌍에만 적용된다. 근거가 바뀌면 다시 연다.
      t.put('conflicts', {
        ...previous,
        overlapStart: candidate.overlapStart,
        overlapEnd: candidate.overlapEnd,
        reason: candidate.reason,
        status: evidenceChanged ? 'reopened' : previous.status,
        updatedAt: evidenceChanged ? now() : previous.updatedAt,
      });
    }
    // 아직 결정하지 않은 충돌 후보가 조건을 더는 만족하지 않으면(값이 같아짐, 기각 등) 목록에서 뺀다.
    for (const conflict of existing) {
      const key = `${conflict.leftAssertionId}|${conflict.rightAssertionId}`;
      if (!stillPresent.has(key) && (conflict.status === 'open' || conflict.status === 'reopened')) {
        const table = t.table('conflicts');
        delete table[conflict.id];
      }
    }
  }

  async function prepareVersion(source: VersionSource) {
    const normalizedText = normalizeManuscript(source.rawText);
    const rawBytes = source.rawBytes ?? new TextEncoder().encode(source.rawText);
    const [rawContentSha256, normalizedSha256] = await Promise.all([sha256Bytes(rawBytes), sha256Text(normalizedText)]);
    const drafts = segmentText(normalizedText);
    const hashes = await Promise.all(drafts.map((segment) => sha256Text(segment.text)));
    const segments = drafts.map((segment, index) => ({
      sequence: index,
      startCp: segment.startCp,
      endCp: segment.endCp,
      kind: segment.kind,
      textSha256: hashes[index]!,
    }));
    return { normalizedText, rawContentSha256, normalizedSha256, segments, sizeBytes: rawBytes.byteLength };
  }

  function seedWorkDefaults(t: Tx, workId: Id, createdAt: string) {
    for (const { entityKind, seeds } of attributeSeeds()) {
      for (const seed of seeds) {
        t.put('attributeDefs', {
          id: newId(),
          workId,
          entityKind,
          key: seed.key,
          label: seed.label,
          valueType: 'string',
          timeVariant: seed.timeVariant,
          isBuiltIn: true,
          active: true,
        });
      }
    }
    for (const preset of PERSONA_PRESETS) {
      const persona: Persona = {
        id: newId(),
        workId,
        displayName: preset.displayName,
        presetKey: preset.presetKey,
        likes: [...preset.likes],
        dislikes: [...preset.dislikes],
        weights: { ...preset.weights },
        betrayalSensitivity: preset.betrayalSensitivity,
      };
      t.put('personas', persona);
      t.put('cohorts', {
        id: newId(),
        workId,
        personaId: persona.id,
        name: preset.displayName,
        initialCount: preset.initialCount,
        share: 0,
        profileRevision: 1,
      });
    }
    normalizeShares(t, workId);
    t.put('promises', {
      id: workId,
      workId,
      genrePromises: [],
      readerExpectations: {},
      revision: 1,
      confirmedByOwner: false,
      updatedAt: createdAt,
    });
  }

  function normalizeShares(t: Tx, workId: Id) {
    const cohorts = Object.values(t.next.cohorts).filter((cohort) => cohort.workId === workId);
    const total = cohorts.reduce((sum, cohort) => sum + cohort.initialCount, 0);
    for (const cohort of cohorts) {
      t.put('cohorts', { ...cohort, share: total > 0 ? cohort.initialCount / total : 0 });
    }
  }

  function validateWorkInput(input: WorkInput): Result<WorkInput> {
    const title = input.title.trim();
    if (!title) return fail('invalid', '작품명을 입력하세요.', 'title');
    if (title.length > 120) return fail('invalid', '작품명은 120자 이하로 입력하세요.', 'title');
    return ok({
      title,
      genre: input.genre?.trim() || null,
      tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 30),
      synopsis: input.synopsis?.trim() || null,
      serializationStatus: input.serializationStatus,
    });
  }

  function addVersionInTx(
    t: Tx,
    chapter: Chapter,
    prepared: Awaited<ReturnType<typeof prepareVersion>>,
    source: VersionSource,
    commandId: Id,
  ): ManuscriptVersion {
    const existing = Object.values(t.next.versions).filter((version) => version.chapterId === chapter.id);
    const ordinal = existing.reduce((max, version) => Math.max(max, version.versionOrdinal), 0) + 1;
    const createdAt = now();
    const version: ManuscriptVersion = {
      id: newId(),
      workId: chapter.workId,
      chapterId: chapter.id,
      versionOrdinal: ordinal,
      rawContentSha256: prepared.rawContentSha256,
      normalizedSha256: prepared.normalizedSha256,
      normalizedText: prepared.normalizedText,
      normalizerVersion: NORMALIZER_VERSION,
      sourceType: source.sourceType,
      sourceFileName: source.fileName,
      encoding: source.encoding,
      basedOnVersionId: chapter.currentVersionId,
      segments: prepared.segments,
      createdAt,
    };
    t.put('versions', version);
    if (source.fileName) {
      t.put('uploads', {
        id: newId(),
        workId: chapter.workId,
        fileName: source.fileName,
        mimeType: source.fileName.endsWith('.md') || source.fileName.endsWith('.markdown') ? 'text/markdown' : 'text/plain',
        sizeBytes: prepared.sizeBytes,
        sha256: prepared.rawContentSha256,
        importStatus: 'accepted',
        createdAt,
      });
    }
    t.put('chapters', { ...chapter, currentVersionId: version.id, updatedAt: createdAt });
    t.processed(commandId, version.id);

    // 같은 회차의 이전 판본에 걸린 근거는 재검토 요청만 만든다. 승인 상태는 그대로 둔다.
    const olderVersionIds = new Set(existing.map((item) => item.id));
    const affectedAnchors = Object.values(t.next.anchors).filter(
      (anchor) => olderVersionIds.has(anchor.versionId) && anchor.anchorHealth === 'ok',
    );
    if (affectedAnchors.length > 0) {
      const anchorIds = new Set(affectedAnchors.map((anchor) => anchor.id));
      for (const anchor of affectedAnchors) t.put('anchors', { ...anchor, anchorHealth: 'review_requested' });
      for (const assertion of Object.values(t.next.assertions)) {
        const hits = assertion.evidenceIds.filter((id) => anchorIds.has(id));
        if (hits.length === 0) continue;
        for (const evidenceId of hits) {
          t.put('reviewRequests', {
            id: newId(),
            workId: chapter.workId,
            assertionId: assertion.id,
            evidenceId,
            observedVersionId: version.id,
            cause: 'source_changed',
            status: 'open',
            createdAt,
            updatedAt: createdAt,
          });
        }
        t.put('assertions', { ...assertion, evidenceHealth: assertionHealth(t.next, assertion), updatedAt: createdAt });
      }
      t.audit(chapter.workId, 'evidence_recheck', `근거 ${affectedAnchors.length}건 재검토 요청`, version.id, commandId);
    }
    return version;
  }

  // ---------- 명령 ----------

  const api = {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    chaptersOf,
    versionsOf,

    updateProfile(displayName: string): Result<null> {
      const name = displayName.trim();
      if (!name) return fail('invalid', '표시 이름을 입력하세요.', 'displayName');
      if (name.length > 40) return fail('invalid', '표시 이름은 40자 이하로 입력하세요.', 'displayName');
      const t = tx();
      t.next.user = { ...t.next.user, displayName: name };
      t.apply();
      return ok(null);
    },

    createWork(input: WorkInput, commandId: Id): Result<Work> {
      const done = processedResult(commandId);
      if (done && state.works[done]) return ok(state.works[done]);
      const valid = validateWorkInput(input);
      if (!valid.ok) return valid;
      const createdAt = now();
      const work: Work = {
        id: newId(),
        ownerId: LOCAL_OWNER_ID,
        ...valid.value,
        language: 'ko',
        storyCalendarLabel: null,
        revision: 1,
        createdAt,
        updatedAt: createdAt,
      };
      const t = tx();
      t.put('works', work);
      seedWorkDefaults(t, work.id, createdAt);
      t.processed(commandId, work.id);
      t.audit(work.id, 'work_created', '작품 생성', work.id, commandId);
      t.apply();
      return ok(work);
    },

    updateWorkSettings(workId: Id, input: WorkSettingsInput, baseRevision: number): Result<Work> {
      const found = requireWork(workId);
      if (!found.ok) return found;
      if (found.value.revision !== baseRevision) {
        return fail('stale', '다른 화면에서 작품 정보가 바뀌었습니다. 최신 내용을 불러온 뒤 다시 저장하세요.');
      }
      const valid = validateWorkInput(input);
      if (!valid.ok) return valid;
      const expectations: Record<string, string> = {};
      for (const line of input.readerExpectations.split('\n')) {
        const [key, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        if (key?.trim() && value) expectations[key.trim()] = value;
      }
      const updatedAt = now();
      const work: Work = {
        ...found.value,
        ...valid.value,
        storyCalendarLabel: input.storyCalendarLabel?.trim() || null,
        revision: found.value.revision + 1,
        updatedAt,
      };
      const t = tx();
      t.put('works', work);
      const promise = state.promises[workId];
      t.put('promises', {
        id: workId,
        workId,
        genrePromises: [...new Set(input.genrePromises.map((item) => item.trim()).filter(Boolean))],
        readerExpectations: expectations,
        revision: (promise?.revision ?? 0) + 1,
        confirmedByOwner: true,
        updatedAt,
      });
      t.audit(workId, 'work_updated', '작품 설정 저장', workId);
      t.apply();
      return ok(work);
    },

    /** 항목 순서대로 하나씩 등록한다(해시 계산이 끝나는 순서와 무관하게 회차 순서가 항목 순서를 따르도록). */
    async importChapters(workId: Id, items: ChapterImportItem[]): Promise<ImportItemResult[]> {
      const results: ImportItemResult[] = [];
      for (const item of items) {
        results.push(
          await once(item.commandId, async (): Promise<ImportItemResult> => {
            const done = processedResult(item.commandId);
            const doneVersion = done ? state.versions[done] : undefined;
            if (doneVersion) {
              return { commandId: item.commandId, result: ok({ chapterId: doneVersion.chapterId, versionId: doneVersion.id }) };
            }
            if (!state.works[workId]) return { commandId: item.commandId, result: fail('not_found', '작품을 찾을 수 없습니다.') };
            const displayNumber = item.displayNumber.trim();
            if (!displayNumber) {
              return { commandId: item.commandId, result: fail('invalid', '회차 번호를 입력하세요.', 'displayNumber') };
            }
            if (normalizeManuscript(item.source.rawText).trim().length === 0) {
              return { commandId: item.commandId, result: fail('invalid', '본문이 비어 있습니다.') };
            }
            let prepared;
            try {
              prepared = await prepareVersion(item.source);
            } catch {
              return { commandId: item.commandId, result: fail('integrity', '해시를 계산하지 못했습니다. 다시 시도하세요.') };
            }
            const t = tx();
            const sortKey = chaptersOf(workId).reduce((max, chapter) => Math.max(max, chapter.sortKey), 0) + 1;
            const createdAt = now();
            const chapter: Chapter = {
              id: newId(),
              workId,
              displayNumber,
              sortKey,
              title: item.title?.trim() || null,
              currentVersionId: null,
              draftStatus: 'draft',
              createdAt,
              updatedAt: createdAt,
            };
            t.put('chapters', chapter);
            const version = addVersionInTx(t, chapter, prepared, item.source, item.commandId);
            t.audit(workId, 'manuscript_imported', `${displayNumber}화 등록 (판본 v1)`, chapter.id, item.commandId);
            t.apply();
            return { commandId: item.commandId, result: ok({ chapterId: chapter.id, versionId: version.id }) };
          }),
        );
      }
      return results;
    },

    addVersion(workId: Id, chapterId: Id, source: VersionSource, commandId: Id): Promise<Result<ManuscriptVersion>> {
      return once(commandId, async () => {
        const done = processedResult(commandId);
        if (done && state.versions[done]) return ok(state.versions[done]);
        const found = inWork(state.chapters[chapterId], workId, '회차');
        if (!found.ok) return found;
        if (normalizeManuscript(source.rawText).trim().length === 0) return fail('invalid', '본문이 비어 있습니다.');
        let prepared;
        try {
          prepared = await prepareVersion(source);
        } catch {
          return fail('integrity', '해시를 계산하지 못했습니다. 다시 시도하세요.');
        }
        const chapter = state.chapters[chapterId];
        if (!chapter) return fail('not_found', '회차를 찾을 수 없습니다.');
        const current = chapter.currentVersionId ? state.versions[chapter.currentVersionId] : undefined;
        if (current && current.normalizedSha256 === prepared.normalizedSha256) {
          return fail('duplicate', '현재 판본과 본문이 같아 새 판본을 만들지 않았습니다.');
        }
        const t = tx();
        const version = addVersionInTx(t, chapter, prepared, source, commandId);
        t.audit(workId, 'version_added', `${chapter.displayNumber}화 판본 v${version.versionOrdinal} 추가`, version.id, commandId);
        t.apply();
        return ok(version);
      });
    },

    updateChapter(
      workId: Id,
      chapterId: Id,
      patch: { displayNumber: string; title: string | null; draftStatus: ChapterDraftStatus },
    ): Result<Chapter> {
      const found = inWork(state.chapters[chapterId], workId, '회차');
      if (!found.ok) return found;
      const displayNumber = patch.displayNumber.trim();
      if (!displayNumber) return fail('invalid', '회차 번호를 입력하세요.', 'displayNumber');
      const chapter: Chapter = {
        ...found.value,
        displayNumber,
        title: patch.title?.trim() || null,
        draftStatus: patch.draftStatus,
        updatedAt: now(),
      };
      const t = tx();
      t.put('chapters', chapter);
      t.touch(workId);
      t.apply();
      return ok(chapter);
    },

    /** 정렬 키만 바꾼다. 판본·근거는 바뀌지 않는다. */
    moveChapter(workId: Id, chapterId: Id, toIndex: number): Result<null> {
      const ordered = chaptersOf(workId);
      const from = ordered.findIndex((chapter) => chapter.id === chapterId);
      if (from < 0) return fail('not_found', '회차를 찾을 수 없습니다.');
      const target = Math.max(0, Math.min(ordered.length - 1, toIndex));
      if (target === from) return ok(null);
      const [moved] = ordered.splice(from, 1);
      ordered.splice(target, 0, moved!);
      const t = tx();
      ordered.forEach((chapter, index) => {
        if (chapter.sortKey !== index + 1) t.put('chapters', { ...chapter, sortKey: index + 1 });
      });
      t.audit(workId, 'chapters_reordered', `${moved!.displayNumber}화 순서 변경`, chapterId);
      t.apply();
      return ok(null);
    },

    addNote(workId: Id, chapterId: Id, versionId: Id | null, body: string, commandId: Id): Result<WriterNote> {
      const done = processedResult(commandId);
      if (done && state.notes[done]) return ok(state.notes[done]);
      const chapter = inWork(state.chapters[chapterId], workId, '회차');
      if (!chapter.ok) return chapter;
      if (versionId && state.versions[versionId]?.chapterId !== chapterId) return fail('invalid', '판본이 이 회차에 속하지 않습니다.');
      const text = body.trim();
      if (!text) return fail('invalid', '메모 내용을 입력하세요.', 'body');
      const createdAt = now();
      const note: WriterNote = { id: newId(), workId, chapterId, versionId, body: text, revision: 1, createdAt, updatedAt: createdAt };
      const t = tx();
      t.put('notes', note);
      t.processed(commandId, note.id);
      t.touch(workId);
      t.apply();
      return ok(note);
    },

    createEntity(
      workId: Id,
      input: { kind: EntityKind; canonicalName: string; description: string | null },
      commandId: Id,
    ): Result<LoreEntity> {
      const done = processedResult(commandId);
      if (done && state.entities[done]) return ok(state.entities[done]);
      const work = requireWork(workId);
      if (!work.ok) return work;
      const name = input.canonicalName.trim();
      if (!name) return fail('invalid', '정식 명칭을 입력하세요.', 'canonicalName');
      const createdAt = now();
      const entity: LoreEntity = {
        id: newId(),
        workId,
        kind: input.kind,
        canonicalName: name,
        description: input.description?.trim() || null,
        lifecycle: 'active',
        createdBy: 'author',
        reviewStatus: 'approved',
        revision: 1,
        createdAt,
        updatedAt: createdAt,
      };
      const t = tx();
      t.put('entities', entity);
      t.processed(commandId, entity.id);
      t.audit(workId, 'entity_created', `설정 항목 추가: ${name}`, entity.id, commandId);
      t.apply();
      return ok(entity);
    },

    updateEntity(
      workId: Id,
      entityId: Id,
      patch: { canonicalName: string; description: string | null },
      baseRevision: number,
    ): Result<LoreEntity> {
      const found = inWork(state.entities[entityId], workId, '설정 항목');
      if (!found.ok) return found;
      if (found.value.revision !== baseRevision) return fail('stale', '다른 작업으로 항목이 바뀌었습니다. 최신 내용을 확인하세요.');
      const name = patch.canonicalName.trim();
      if (!name) return fail('invalid', '정식 명칭을 입력하세요.', 'canonicalName');
      const entity = {
        ...found.value,
        canonicalName: name,
        description: patch.description?.trim() || null,
        revision: found.value.revision + 1,
        updatedAt: now(),
      };
      const t = tx();
      t.put('entities', entity);
      t.touch(workId);
      t.apply();
      return ok(entity);
    },

    /** AI가 만든 후보 항목을 작가가 확정하거나 기각한다. */
    reviewEntity(workId: Id, entityId: Id, status: 'approved' | 'rejected'): Result<LoreEntity> {
      const found = inWork(state.entities[entityId], workId, '설정 항목');
      if (!found.ok) return found;
      const entity = { ...found.value, reviewStatus: status, revision: found.value.revision + 1, updatedAt: now() };
      const t = tx();
      t.put('entities', entity);
      t.audit(workId, status === 'approved' ? 'assertion_approved' : 'assertion_rejected', `항목 ${status === 'approved' ? '확정' : '기각'}: ${entity.canonicalName}`, entityId);
      t.apply();
      return ok(entity);
    },

    addAlias(workId: Id, entityId: Id, alias: string): Result<null> {
      const found = inWork(state.entities[entityId], workId, '설정 항목');
      if (!found.ok) return found;
      const text = alias.trim();
      if (!text) return fail('invalid', '별칭을 입력하세요.', 'alias');
      const normalizedAlias = normalizeName(text);
      const exists = Object.values(state.aliases).some(
        (item) => item.entityId === entityId && item.normalizedAlias === normalizedAlias,
      );
      if (exists || normalizeName(found.value.canonicalName) === normalizedAlias) {
        return fail('duplicate', '이미 등록된 이름입니다.', 'alias');
      }
      const t = tx();
      t.put('aliases', {
        id: newId(),
        workId,
        entityId,
        alias: text,
        normalizedAlias,
        sourceKind: 'author_decision',
        reviewStatus: 'approved',
        createdAt: now(),
      });
      t.touch(workId);
      t.apply();
      return ok(null);
    },

    removeAlias(workId: Id, aliasId: Id): Result<null> {
      const found = inWork(state.aliases[aliasId], workId, '별칭');
      if (!found.ok) return found;
      const t = tx();
      delete t.table('aliases')[aliasId];
      t.touch(workId);
      t.apply();
      return ok(null);
    },

    createAnchor(workId: Id, versionId: Id, startCp: number, endCp: number): Promise<Result<EvidenceAnchor>> {
      return (async () => {
        const version = inWork(state.versions[versionId], workId, '판본');
        if (!version.ok) return version;
        const text = version.value.normalizedText;
        const length = cpLength(text);
        if (!Number.isInteger(startCp) || !Number.isInteger(endCp) || startCp < 0 || endCp > length || endCp <= startCp) {
          return fail<EvidenceAnchor>('invalid', '근거 구간이 올바르지 않습니다.');
        }
        const reuse = Object.values(state.anchors).find(
          (anchor) => anchor.versionId === versionId && anchor.startCp === startCp && anchor.endCp === endCp && anchor.reanchoredFromId === null,
        );
        if (reuse) return ok(reuse);
        const exactQuote = cpSlice(text, startCp, endCp);
        if (!exactQuote.trim()) return fail<EvidenceAnchor>('invalid', '공백만 있는 구간은 근거로 쓸 수 없습니다.');
        const quoteSha256 = await sha256Text(exactQuote);
        const anchor: EvidenceAnchor = {
          id: newId(),
          workId,
          versionId,
          startCp,
          endCp,
          exactQuote,
          prefixContext: cpSlice(text, Math.max(0, startCp - ANCHOR_CONTEXT_CP), startCp),
          suffixContext: cpSlice(text, endCp, Math.min(length, endCp + ANCHOR_CONTEXT_CP)),
          normalizerVersion: NORMALIZER_VERSION,
          quoteSha256,
          anchorHealth: 'ok',
          reanchoredFromId: null,
          createdAt: now(),
        };
        const t = tx();
        t.put('anchors', anchor);
        t.touch(workId);
        t.apply();
        return ok(anchor);
      })();
    },

    /**
     * 작가가 고른 위치로 근거를 다시 건다(자동 재고정 없음). 이전 근거는 이력으로 남고,
     * 진술의 근거 목록에서만 새 근거로 바뀐다. 승인 상태는 그대로다.
     */
    reanchor(workId: Id, anchorId: Id, targetVersionId: Id, startCp: number, endCp: number): Promise<Result<EvidenceAnchor>> {
      return (async () => {
        const old = inWork(state.anchors[anchorId], workId, '근거');
        if (!old.ok) return old;
        const target = inWork(state.versions[targetVersionId], workId, '판본');
        if (!target.ok) return target;
        const source = state.versions[old.value.versionId];
        if (!source || source.chapterId !== target.value.chapterId) {
          return fail<EvidenceAnchor>('invalid', '같은 회차의 판본으로만 근거를 옮길 수 있습니다.');
        }
        const created = await api.createAnchor(workId, targetVersionId, startCp, endCp);
        if (!created.ok) return created;
        const t = tx();
        const fresh: EvidenceAnchor = { ...created.value, reanchoredFromId: anchorId, anchorHealth: 'ok' };
        t.put('anchors', fresh);
        if (anchorId !== fresh.id) t.put('anchors', { ...old.value, anchorHealth: old.value.anchorHealth === 'ok' ? 'ok' : old.value.anchorHealth });
        const updatedAt = now();
        for (const assertion of Object.values(t.next.assertions)) {
          if (!assertion.evidenceIds.includes(anchorId)) continue;
          const evidenceIds = [...new Set(assertion.evidenceIds.map((id) => (id === anchorId ? fresh.id : id)))];
          const next = { ...assertion, evidenceIds, updatedAt };
          t.put('assertions', { ...next, evidenceHealth: assertionHealth(t.next, next) });
        }
        for (const request of Object.values(t.next.reviewRequests)) {
          if (request.evidenceId === anchorId && request.status !== 'resolved') {
            t.put('reviewRequests', { ...request, status: 'resolved', updatedAt });
          }
        }
        refreshConflicts(t, workId);
        t.audit(workId, 'evidence_reanchored', '근거 위치 재지정', fresh.id);
        t.apply();
        return ok(fresh);
      })();
    },

    /** 근거를 더는 쓸 수 없다고 작가가 표시한다(새 판본에 해당 문장이 없을 때). */
    markAnchorLost(workId: Id, anchorId: Id): Result<null> {
      const found = inWork(state.anchors[anchorId], workId, '근거');
      if (!found.ok) return found;
      const t = tx();
      t.put('anchors', { ...found.value, anchorHealth: 'lost' });
      for (const assertion of Object.values(t.next.assertions)) {
        if (assertion.evidenceIds.includes(anchorId)) t.put('assertions', { ...assertion, evidenceHealth: assertionHealth(t.next, assertion) });
      }
      t.touch(workId);
      t.apply();
      return ok(null);
    },

    setReviewRequestStatus(workId: Id, requestId: Id, status: ReviewRequestStatus): Result<null> {
      const found = inWork(state.reviewRequests[requestId], workId, '재검토 요청');
      if (!found.ok) return found;
      const t = tx();
      t.put('reviewRequests', { ...found.value, status, updatedAt: now() });
      if (status === 'resolved') {
        const anchor = state.anchors[found.value.evidenceId];
        const stillOpen = Object.values(t.next.reviewRequests).some(
          (request) => request.evidenceId === found.value.evidenceId && request.status !== 'resolved',
        );
        if (anchor && anchor.anchorHealth === 'review_requested' && !stillOpen) {
          t.put('anchors', { ...anchor, anchorHealth: 'ok' });
          for (const assertion of Object.values(t.next.assertions)) {
            if (assertion.evidenceIds.includes(anchor.id)) t.put('assertions', { ...assertion, evidenceHealth: assertionHealth(t.next, assertion) });
          }
        }
      }
      t.touch(workId);
      t.apply();
      return ok(null);
    },

    createAssertion(workId: Id, input: AssertionInput, commandId: Id): Result<Assertion> {
      const done = processedResult(commandId);
      if (done && state.assertions[done]) return ok(state.assertions[done]);
      const entity = inWork(state.entities[input.subjectEntityId], workId, '설정 항목');
      if (!entity.ok) return entity;
      const attribute = inWork(state.attributeDefs[input.attributeDefId], workId, '속성');
      if (!attribute.ok) return attribute;
      if (attribute.value.entityKind !== entity.value.kind) return fail('invalid', '이 항목 종류에 없는 속성입니다.', 'attributeDefId');
      const value = input.value.trim();
      if (!value) return fail('invalid', '값을 입력하세요.', 'value');
      if (input.sourceKind === 'ai_inference') return fail('invalid', 'AI 추론 출처는 직접 입력할 수 없습니다.', 'sourceKind');
      if (
        input.startStoryOrder !== null &&
        input.endStoryOrderExclusive !== null &&
        !(input.endStoryOrderExclusive > input.startStoryOrder)
      ) {
        return fail('invalid', '끝 순서는 시작 순서보다 커야 합니다.', 'endStoryOrderExclusive');
      }
      for (const evidenceId of input.evidenceIds) {
        const anchor = inWork(state.anchors[evidenceId], workId, '근거');
        if (!anchor.ok) return anchor;
      }
      if (input.speakerEntityId) {
        const speaker = inWork(state.entities[input.speakerEntityId], workId, '화자');
        if (!speaker.ok) return speaker;
      }
      const createdAt = now();
      const status: ApprovalStatus = input.approveNow ? 'approved' : 'candidate';
      const draft: Assertion = {
        id: newId(),
        workId,
        subjectEntityId: input.subjectEntityId,
        attributeDefId: input.attributeDefId,
        value,
        sourceKind: input.sourceKind,
        speakerEntityId: input.sourceKind === 'character_speech' ? input.speakerEntityId : null,
        speakerUnresolved: input.sourceKind === 'character_speech' && !input.speakerEntityId,
        approvalStatus: status,
        evidenceHealth: 'ok',
        startStoryOrder: input.startStoryOrder,
        endStoryOrderExclusive: input.endStoryOrderExclusive,
        storyTimeExpression: input.storyTimeExpression?.trim() || null,
        evidenceIds: [...new Set(input.evidenceIds)],
        createdByJobId: null,
        heldAt: null,
        revision: 1,
        createdAt,
        updatedAt: createdAt,
      };
      const t = tx();
      const assertion = { ...draft, evidenceHealth: assertionHealth(t.next, draft) };
      t.put('assertions', assertion);
      if (input.approveNow) {
        t.put('decisions', {
          id: newId(),
          workId,
          assertionId: assertion.id,
          commandId,
          batchId: null,
          action: 'approve',
          previousStatus: 'candidate',
          nextStatus: 'approved',
          baseAssertionRevision: 1,
          reason: '작가 직접 입력',
          createdAt,
        });
      }
      t.processed(commandId, assertion.id);
      refreshConflicts(t, workId);
      t.audit(workId, 'assertion_created', `진술 추가: ${entity.value.canonicalName} · ${attribute.value.label}`, assertion.id, commandId);
      t.apply();
      return ok(assertion);
    },

    addEvidence(workId: Id, assertionId: Id, anchorId: Id, baseRevision: number): Result<Assertion> {
      const found = inWork(state.assertions[assertionId], workId, '진술');
      if (!found.ok) return found;
      const anchor = inWork(state.anchors[anchorId], workId, '근거');
      if (!anchor.ok) return anchor;
      if (found.value.revision !== baseRevision) return fail('stale', '다른 작업으로 진술이 바뀌었습니다. 최신 내용을 확인하세요.');
      if (found.value.evidenceIds.includes(anchorId)) return ok(found.value);
      const t = tx();
      const next = { ...found.value, evidenceIds: [...found.value.evidenceIds, anchorId], revision: found.value.revision + 1, updatedAt: now() };
      const assertion = { ...next, evidenceHealth: assertionHealth(t.next, next) };
      t.put('assertions', assertion);
      refreshConflicts(t, workId);
      t.touch(workId);
      t.apply();
      return ok(assertion);
    },

    /** 승인·기각·확정 취소. 화면이 본 리비전과 다르면 거부한다(오래된 화면의 결정 방지). */
    decide(
      workId: Id,
      assertionId: Id,
      action: DecisionAction,
      baseRevision: number,
      reason: string | null,
      commandId: Id,
      batchId: Id | null = null,
    ): Result<AssertionDecision> {
      const done = processedResult(commandId);
      if (done && state.decisions[done]) return ok(state.decisions[done]);
      const found = inWork(state.assertions[assertionId], workId, '진술');
      if (!found.ok) return found;
      const assertion = found.value;
      if (assertion.revision !== baseRevision) {
        return fail('stale', '다른 작업으로 항목이 변경되었습니다. 최신 내용을 확인한 뒤 다시 결정하세요.');
      }
      const allowed: Record<DecisionAction, ApprovalStatus[]> = {
        approve: ['candidate', 'rejected', 'revoked'],
        reject: ['candidate'],
        revoke: ['approved'],
      };
      if (!allowed[action].includes(assertion.approvalStatus)) {
        return fail('invalid', '지금 상태에서는 할 수 없는 결정입니다.');
      }
      const nextStatus: ApprovalStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'revoked';
      const createdAt = now();
      const decision: AssertionDecision = {
        id: newId(),
        workId,
        assertionId,
        commandId,
        batchId,
        action,
        previousStatus: assertion.approvalStatus,
        nextStatus,
        baseAssertionRevision: baseRevision,
        reason: reason?.trim() || null,
        createdAt,
      };
      const t = tx();
      t.put('decisions', decision);
      t.put('assertions', { ...assertion, approvalStatus: nextStatus, heldAt: null, revision: assertion.revision + 1, updatedAt: createdAt });
      const entity = state.entities[assertion.subjectEntityId];
      if (action === 'approve' && entity && entity.reviewStatus === 'candidate') {
        t.put('entities', { ...entity, reviewStatus: 'approved', revision: entity.revision + 1, updatedAt: createdAt });
      }
      t.processed(commandId, decision.id);
      refreshConflicts(t, workId);
      const eventType = action === 'approve' ? 'assertion_approved' : action === 'reject' ? 'assertion_rejected' : 'assertion_revoked';
      t.audit(workId, eventType, `진술 ${action === 'approve' ? '확정' : action === 'reject' ? '기각' : '확정 취소'}`, assertionId, commandId);
      t.apply();
      return ok(decision);
    },

    /** 선택 묶음 결정. 항목마다 따로 처리하고 항목별 성공·실패를 돌려준다. */
    decideBatch(
      workId: Id,
      items: BatchDecisionItem[],
      action: DecisionAction,
      reason: string | null,
      batchId: Id,
    ): { assertionId: Id; result: Result<AssertionDecision> }[] {
      return items.map((item) => ({
        assertionId: item.assertionId,
        result: api.decide(workId, item.assertionId, action, item.baseRevision, reason, `${batchId}:${item.assertionId}`, batchId),
      }));
    },

    setHeld(workId: Id, assertionId: Id, held: boolean): Result<null> {
      const found = inWork(state.assertions[assertionId], workId, '진술');
      if (!found.ok) return found;
      const t = tx();
      t.put('assertions', { ...found.value, heldAt: held ? now() : null });
      t.touch(workId);
      t.apply();
      return ok(null);
    },

    classifyConflict(workId: Id, conflictId: Id, status: ConflictStatus, reason: string | null): Result<ConflictFinding> {
      const found = inWork(state.conflicts[conflictId], workId, '충돌 후보');
      if (!found.ok) return found;
      const left = state.assertions[found.value.leftAssertionId];
      const right = state.assertions[found.value.rightAssertionId];
      const conflict: ConflictFinding = {
        ...found.value,
        status,
        decisionReason: reason?.trim() || null,
        exceptionEvidencePairKey:
          (status === 'intentional' || status === 'dismissed') && left && right ? evidencePairKey(left, right) : null,
        updatedAt: now(),
      };
      const t = tx();
      t.put('conflicts', conflict);
      t.audit(workId, 'conflict_classified', `충돌 후보 분류: ${status}`, conflictId);
      t.apply();
      return ok(conflict);
    },

    updatePersona(
      workId: Id,
      personaId: Id,
      patch: Pick<Persona, 'displayName' | 'likes' | 'dislikes' | 'weights' | 'betrayalSensitivity'>,
    ): Result<Persona> {
      const found = inWork(state.personas[personaId], workId, '독자 성향');
      if (!found.ok) return found;
      const name = patch.displayName.trim();
      if (!name) return fail('invalid', '이름을 입력하세요.', 'displayName');
      for (const key of TAG_KEYS) {
        if (!Number.isFinite(patch.weights[key]) || Math.abs(patch.weights[key]) > 5) {
          return fail('invalid', '가중치는 -5에서 5 사이 숫자여야 합니다.', `weight-${key}`);
        }
      }
      if (!(patch.betrayalSensitivity >= 0 && patch.betrayalSensitivity <= 1)) {
        return fail('invalid', '배신 민감도는 0에서 1 사이여야 합니다.', 'betrayalSensitivity');
      }
      const persona: Persona = {
        ...found.value,
        displayName: name,
        likes: patch.likes.map((item) => item.trim()).filter(Boolean),
        dislikes: patch.dislikes.map((item) => item.trim()).filter(Boolean),
        weights: { ...patch.weights },
        betrayalSensitivity: patch.betrayalSensitivity,
        presetKey: found.value.presetKey,
      };
      const t = tx();
      t.put('personas', persona);
      for (const cohort of Object.values(state.cohorts)) {
        if (cohort.personaId === personaId) t.put('cohorts', { ...cohort, name, profileRevision: cohort.profileRevision + 1 });
      }
      t.touch(workId);
      t.apply();
      return ok(persona);
    },

    updateCohortCounts(workId: Id, counts: Record<Id, number>): Result<null> {
      const cohorts = Object.values(state.cohorts).filter((cohort) => cohort.workId === workId);
      for (const cohort of cohorts) {
        const value = counts[cohort.id] ?? cohort.initialCount;
        if (!Number.isFinite(value) || value < 0) return fail('invalid', '집단 인원은 0 이상이어야 합니다.', cohort.id);
        if (value > 1e9) return fail('invalid', '집단 인원은 10억 명 이하로 입력하세요.', cohort.id);
      }
      const total = cohorts.reduce((sum, cohort) => sum + (counts[cohort.id] ?? cohort.initialCount), 0);
      if (total <= 0) return fail('invalid', '전체 인원이 0보다 커야 비율을 계산할 수 있습니다.');
      const t = tx();
      for (const cohort of cohorts) {
        t.put('cohorts', { ...cohort, initialCount: counts[cohort.id] ?? cohort.initialCount, profileRevision: cohort.profileRevision + 1 });
      }
      normalizeShares(t, workId);
      t.touch(workId);
      t.apply();
      return ok(null);
    },

    setTags(workId: Id, versionId: Id, tags: TagIntensities): Result<Id> {
      const version = inWork(state.versions[versionId], workId, '판본');
      if (!version.ok) return version;
      for (const key of TAG_KEYS) {
        if (!Number.isInteger(tags[key]) || tags[key] < 0 || tags[key] > 3) return fail('invalid', '태그 강도는 0–3 정수입니다.', key);
      }
      const latest = latestTagSnapshot(state, versionId);
      if (latest && TAG_KEYS.every((key) => latest.tags[key] === tags[key])) return ok(latest.id);
      const t = tx();
      const id = newId();
      t.put('tagSnapshots', {
        id,
        workId,
        versionId,
        taxonomyVersion: 'taxonomy.v10.base',
        tags: { ...tags },
        sourceKind: 'manual',
        approvedByUser: true,
        createdAt: now(),
      });
      t.touch(workId);
      t.apply();
      return ok(id);
    },

    saveSimulationRun(run: SimulationRun, commandId: Id): Result<SimulationRun> {
      const done = processedResult(commandId);
      if (done && state.simRuns[done]) return ok(state.simRuns[done]);
      const t = tx();
      t.put('simRuns', run);
      t.processed(commandId, run.id);
      t.audit(run.workId, 'simulation_run', `가상 연재 계산 (${run.steps.length}회차)`, run.id, commandId);
      t.apply();
      return ok(run);
    },

    grantConsent(kinds: AiDataKind[], model: string): Result<AiConsent> {
      if (kinds.length === 0) return fail('invalid', '보낼 자료 종류를 하나 이상 고르세요.', 'kinds');
      const consent: AiConsent = {
        id: newId(),
        provider: 'OpenAI',
        allowedModelSnapshot: model,
        allowedDataKinds: [...new Set(kinds)],
        grantedAt: now(),
        revokedAt: null,
        policyVersion: 'alpha-browser-direct-1',
      };
      const t = tx();
      t.next.consent = consent;
      t.audit(null, 'ai_consent_changed', `전송 동의: ${consent.allowedDataKinds.join(', ')}`, consent.id);
      t.apply();
      return ok(consent);
    },

    revokeConsent(): Result<null> {
      if (!state.consent || state.consent.revokedAt) return ok(null);
      const t = tx();
      t.next.consent = { ...state.consent, revokedAt: now() };
      t.audit(null, 'ai_consent_changed', '전송 동의 철회', state.consent.id);
      t.apply();
      return ok(null);
    },

    startAiJob(input: {
      workId: Id | null;
      jobType: AiJobType;
      targetVersionId: Id | null;
      provider: 'openai' | 'mock';
      modelSnapshot: string;
      promptVersion: string;
      idempotencyKey: string;
    }): AiJob {
      const createdAt = now();
      const previous = Object.values(state.aiJobs).filter((job) => job.idempotencyKey === input.idempotencyKey);
      const job: AiJob = {
        id: newId(),
        ...input,
        status: 'running',
        attemptCount: previous.length + 1,
        errorCode: null,
        summary: null,
        createdAt,
        updatedAt: createdAt,
      };
      const t = tx();
      t.put('aiJobs', job);
      t.touch(input.workId);
      t.apply();
      return job;
    },

    finishAiJob(
      jobId: Id,
      outcome: { status: AiJobStatus; errorCode: string | null; summary: string | null },
      usage: Omit<AiUsage, 'id' | 'jobId' | 'workId' | 'attempt' | 'createdAt'> | null,
    ): void {
      const job = state.aiJobs[jobId];
      if (!job) return;
      const t = tx();
      t.put('aiJobs', { ...job, ...outcome, updatedAt: now() });
      if (usage) {
        t.put('aiUsage', { id: newId(), jobId, workId: job.workId, attempt: job.attemptCount, ...usage, createdAt: now() });
      }
      t.audit(job.workId, 'ai_job', `AI 작업 ${outcome.status}`, jobId);
      t.apply();
    },

    addReview(review: Omit<ManuscriptReview, 'id' | 'createdAt' | 'synthetic'>): ManuscriptReview {
      const saved: ManuscriptReview = { ...review, id: newId(), synthetic: true, createdAt: now() };
      const t = tx();
      t.put('reviews', saved);
      t.touch(review.workId);
      t.apply();
      return saved;
    },

    /**
     * AI 추출 결과를 후보로 저장한다. 인용이 판본 본문에 정확히 없으면 버리고,
     * 여러 곳에 있으면 첫 위치에 걸되 '위치 재확인 필요'로 표시해 작가가 고르게 한다.
     */
    async addAiCandidates(workId: Id, versionId: Id, jobId: Id, candidates: AiCandidateInput[]): Promise<Result<AiCandidateOutcome>> {
      const version = inWork(state.versions[versionId], workId, '판본');
      if (!version.ok) return version;
      const text = version.value.normalizedText;
      const outcome: AiCandidateOutcome = { saved: 0, quoteMissing: 0, ambiguous: 0, newEntities: 0 };
      const prepared: { candidate: AiCandidateInput; quote: string; startCp: number; endCp: number; ambiguous: boolean; quoteSha256: string }[] = [];
      for (const candidate of candidates) {
        const quote = normalizeManuscript(candidate.quote).trim();
        const hits = quote ? findAllCp(text, quote, 5) : [];
        if (hits.length === 0) {
          outcome.quoteMissing++;
          continue;
        }
        if (hits.length > 1) outcome.ambiguous++;
        prepared.push({
          candidate,
          quote,
          startCp: hits[0]!.startCp,
          endCp: hits[0]!.endCp,
          ambiguous: hits.length > 1,
          quoteSha256: await sha256Text(quote),
        });
      }
      const t = tx();
      const length = cpLength(text);
      const createdAt = now();
      const entityByName = new Map<string, Id>();
      for (const entity of Object.values(state.entities)) {
        if (entity.workId === workId) entityByName.set(`${entity.kind}:${normalizeName(entity.canonicalName)}`, entity.id);
      }
      for (const alias of Object.values(state.aliases)) {
        const entity = state.entities[alias.entityId];
        if (alias.workId === workId && entity) entityByName.set(`${entity.kind}:${alias.normalizedAlias}`, entity.id);
      }
      const findEntity = (name: string, kind: EntityKind) => entityByName.get(`${kind}:${normalizeName(name)}`);
      const findAnyEntity = (name: string) => {
        const key = normalizeName(name);
        for (const [mapKey, id] of entityByName) if (mapKey.endsWith(`:${key}`)) return id;
        return undefined;
      };
      for (const item of prepared) {
        const { candidate } = item;
        const name = candidate.entityName.trim();
        if (!name || !candidate.value.trim()) continue;
        let entityId = findEntity(name, candidate.entityKind);
        if (!entityId) {
          entityId = newId();
          t.put('entities', {
            id: entityId,
            workId,
            kind: candidate.entityKind,
            canonicalName: name,
            description: null,
            lifecycle: 'active',
            createdBy: 'ai_candidate',
            reviewStatus: 'candidate',
            revision: 1,
            createdAt,
            updatedAt: createdAt,
          });
          entityByName.set(`${candidate.entityKind}:${normalizeName(name)}`, entityId);
          outcome.newEntities++;
        }
        const attributes = Object.values(t.next.attributeDefs).filter(
          (def) => def.workId === workId && def.entityKind === candidate.entityKind,
        );
        const attribute = attributes.find((def) => def.key === candidate.attributeKey) ?? attributes.find((def) => def.key === 'trait');
        if (!attribute) continue;
        const anchor: EvidenceAnchor = {
          id: newId(),
          workId,
          versionId,
          startCp: item.startCp,
          endCp: item.endCp,
          exactQuote: item.quote,
          prefixContext: cpSlice(text, Math.max(0, item.startCp - ANCHOR_CONTEXT_CP), item.startCp),
          suffixContext: cpSlice(text, item.endCp, Math.min(length, item.endCp + ANCHOR_CONTEXT_CP)),
          normalizerVersion: NORMALIZER_VERSION,
          quoteSha256: item.quoteSha256,
          anchorHealth: item.ambiguous ? 'relocation_candidate' : 'ok',
          reanchoredFromId: null,
          createdAt,
        };
        t.put('anchors', anchor);
        const speakerId = candidate.speakerName ? findAnyEntity(candidate.speakerName) ?? null : null;
        t.put('assertions', {
          id: newId(),
          workId,
          subjectEntityId: entityId,
          attributeDefId: attribute.id,
          value: candidate.value.trim(),
          sourceKind: candidate.sourceKind,
          speakerEntityId: candidate.sourceKind === 'character_speech' ? speakerId : null,
          speakerUnresolved: candidate.sourceKind === 'character_speech' && !speakerId,
          approvalStatus: 'candidate',
          evidenceHealth: anchor.anchorHealth,
          startStoryOrder: null,
          endStoryOrderExclusive: null,
          storyTimeExpression: null,
          evidenceIds: [anchor.id],
          createdByJobId: jobId,
          heldAt: null,
          revision: 1,
          createdAt,
          updatedAt: createdAt,
        });
        outcome.saved++;
      }
      refreshConflicts(t, workId);
      t.touch(workId);
      t.apply();
      return ok(outcome);
    },

    markExported(workId: Id, snapshotRevision: number): void {
      // 확인은 실제로 만든 파일에 포함된 범위까지만 가능하다. 뒤늦게 이전 파일을 확인해도
      // 더 최근에 확인한 백업을 되돌리지 않으며, 잘못된 revision은 절대 적용하지 않는다.
      if (!state.works[workId] || !Number.isSafeInteger(snapshotRevision) || snapshotRevision < 0 || snapshotRevision > state.revision) return;
      const t = tx();
      // 이 확인 이벤트 자체는 작품 내용의 수정이 아니므로 다시 미백업 상태를 만들지 않는다.
      t.audit(workId, 'exported', 'JSON 파일 저장 확인', workId, null, false);
      t.next.exportedRevision = {
        ...t.next.exportedRevision,
        [workId]: Math.max(state.exportedRevision[workId] ?? 0, snapshotRevision),
      };
      t.apply();
    },

    /** 검증을 마친 내보내기 자료를 이 탭 작업 공간에 넣는다(exportFormat.restoreWork가 검증). */
    loadWorkSnapshot(snapshot: Partial<Workspace>, workId: Id, title: string): Result<null> {
      if (state.works[workId]) return fail('duplicate', '같은 작품이 이미 열려 있습니다. 작품 목록에서 여세요.');
      const t = tx();
      const tables: TableKey[] = [
        'works',
        'promises',
        'chapters',
        'versions',
        'uploads',
        'notes',
        'entities',
        'aliases',
        'attributeDefs',
        'anchors',
        'assertions',
        'decisions',
        'reviewRequests',
        'conflicts',
        'tagSnapshots',
        'personas',
        'cohorts',
        'simRuns',
        'reviews',
      ];
      for (const key of tables) {
        const incoming = snapshot[key] as Record<Id, unknown> | undefined;
        if (!incoming) continue;
        const table = t.table(key) as Record<Id, unknown>;
        for (const [id, value] of Object.entries(incoming)) {
          if (table[id]) return fail('duplicate', '이미 열려 있는 자료와 ID가 겹칩니다.');
          table[id] = value;
        }
      }
      if (snapshot.audit) t.next.audit = [...t.next.audit, ...snapshot.audit];
      t.audit(workId, 'work_restored', `JSON에서 불러옴: ${title}`, workId);
      t.next.exportedRevision = { ...t.next.exportedRevision, [workId]: state.revision + 1 };
      t.apply();
      return ok(null);
    },

    /** 이 탭의 작품 자료를 모두 비운다(서버·다른 기기에는 원래 아무것도 없다). */
    clearWorkspace(): void {
      const t = tx();
      const fresh = emptyWorkspace();
      t.next = { ...fresh, user: state.user, consent: null, audit: [] };
      t.audit(null, 'workspace_cleared', '이 탭의 작품 자료 비움', null);
      t.apply();
    },
  };

  return api;
}

export function latestTagSnapshot(workspace: Workspace, versionId: Id) {
  let latest: Workspace['tagSnapshots'][string] | undefined;
  for (const snapshot of Object.values(workspace.tagSnapshots)) {
    if (snapshot.versionId === versionId && (!latest || snapshot.createdAt >= latest.createdAt)) latest = snapshot;
  }
  return latest;
}

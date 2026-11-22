/**
 * 작품 JSON 내보내기·불러오기 계약 (IA feature.export, flow.export).
 *
 * - 원고 판본(정규화 본문·해시)·근거·작가 메모·진술·승인 이력·가상 연재 기록을 한 파일에 담는다.
 * - 데이터 SHA-256과 판본 본문 해시를 다시 계산하고 관계를 확인한 뒤 불러온다.
 * - 해시는 손상 확인용이며 서명이나 파일 작성자의 인증 수단이 아니다.
 * - 파일은 작가가 직접 내려받는다. 앱은 이 파일을 어디에도 올리거나 저장하지 않는다.
 */
import { canonicalJson, cpLength, cpSlice, sha256Text } from './text';
import type { Id, Workspace } from './types';

export const EXPORT_FORMAT = 'gamddeol.work';
export const EXPORT_SCHEMA_VERSION = 1;
// 기존 schema 1에서 사용해 온 UTF-16 코드 단위 제한을 유지한다.
export const MAX_IMPORT_CODE_UNITS = 50 * 1024 * 1024;

const WORK_TABLES = [
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
  'reviewRequests',
  'conflicts',
  'tagSnapshots',
  'personas',
  'cohorts',
  'simRuns',
  'reviews',
] as const;
const HISTORY_TABLES = ['decisions'] as const;

type WorkTable = (typeof WORK_TABLES)[number] | (typeof HISTORY_TABLES)[number];
export type WorkSnapshot = Partial<Pick<Workspace, WorkTable | 'audit'>>;

export interface WorkExportFile {
  format: typeof EXPORT_FORMAT;
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  includeHistory: boolean;
  notice: string;
  data: WorkSnapshot;
  integrity: { algorithm: 'SHA-256'; dataSha256: string };
}

function pick<T extends { workId: Id }>(table: Record<Id, T>, workId: Id): Record<Id, T> {
  return Object.fromEntries(Object.entries(table).filter(([, value]) => value.workId === workId));
}

export function snapshotWork(workspace: Workspace, workId: Id, includeHistory: boolean): WorkSnapshot {
  const data: WorkSnapshot = {};
  const record = data as Record<string, unknown>;
  for (const key of WORK_TABLES) {
    if (key === 'works') continue;
    record[key] = pick(workspace[key] as Record<Id, { workId: Id }>, workId);
  }
  // 작품 레코드는 workId 대신 자기 id로 고른다.
  const work = workspace.works[workId];
  data.works = work ? { [workId]: work } : {};
  if (includeHistory) {
    data.decisions = pick(workspace.decisions, workId);
    data.audit = workspace.audit.filter((event) => event.workId === workId);
  } else {
    // 이력을 빼도 진술·근거·판본은 그대로 둔다(참조가 끊기지 않게). 해결된 재검토 요청만 뺀다.
    data.reviewRequests = Object.fromEntries(
      Object.entries(data.reviewRequests ?? {}).filter(([, request]) => request.status !== 'resolved'),
    );
  }
  return data;
}

export async function buildWorkExport(
  workspace: Workspace,
  workId: Id,
  includeHistory: boolean,
  exportedAt: string,
): Promise<{ file: WorkExportFile; text: string }> {
  const data = snapshotWork(workspace, workId, includeHistory);
  const dataSha256 = await sha256Text(canonicalJson(data));
  const file: WorkExportFile = {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt,
    includeHistory,
    notice: '감떨 작품 내보내기. 원고 본문이 들어 있습니다. 가상 독자 수치와 AI 감평·후보는 가상·참고 자료이며 실제 독자 지표가 아닙니다.',
    data,
    integrity: { algorithm: 'SHA-256', dataSha256 },
  };
  return { file, text: JSON.stringify(file, null, 2) };
}

export class RestoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestoreError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** 화면이 정렬·검색·출력에 사용하는 값은 복원 전에 확인한다. */
function hasStrings(value: unknown, keys: readonly string[]): boolean {
  return isRecord(value) && keys.every((key) => typeof value[key] === 'string');
}

function nullableString(value: unknown): boolean {
  return value == null || typeof value === 'string';
}

/** 상속 속성은 저장된 자료가 아니다. 실제 JSON 항목만 참조할 수 있다. */
function requireReference(table: Record<string, unknown> | undefined, id: unknown, message: string): void {
  if (typeof id !== 'string' || !table || !Object.hasOwn(table, id)) throw new RestoreError(message);
}

function requireOptionalReference(table: Record<string, unknown> | undefined, id: unknown, message: string): void {
  if (id !== null && id !== undefined) requireReference(table, id, message);
}

/** 내보내기 파일을 검증한다. 문제가 있으면 RestoreError(원고 원문 없는 안내문)를 던진다. */
export async function parseWorkExport(text: string): Promise<{ snapshot: WorkSnapshot; workId: Id; title: string }> {
  if (text.length > MAX_IMPORT_CODE_UNITS) {
    throw new RestoreError('파일 내용이 너무 깁니다(문자 단위 제한 초과).');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RestoreError('JSON 형식이 아닙니다.');
  }
  if (!isRecord(parsed) || parsed.format !== EXPORT_FORMAT) throw new RestoreError('감떨 작품 내보내기 파일이 아닙니다.');
  if (parsed.schemaVersion !== EXPORT_SCHEMA_VERSION) throw new RestoreError('지원하지 않는 내보내기 버전입니다.');
  if (!isRecord(parsed.data) || !isRecord(parsed.integrity)) throw new RestoreError('파일 구조가 올바르지 않습니다.');
  const data = parsed.data as WorkSnapshot;
  const expected = parsed.integrity.dataSha256;
  if (parsed.integrity.algorithm !== 'SHA-256' || typeof expected !== 'string' || !/^[0-9a-f]{64}$/.test(expected)) {
    throw new RestoreError('무결성 해시 정보가 올바르지 않습니다.');
  }
  let actual: string;
  try {
    actual = await sha256Text(canonicalJson(data));
  } catch {
    throw new RestoreError('파일 구조가 너무 복잡하거나 올바르지 않습니다.');
  }
  if (actual !== expected) throw new RestoreError('파일 내용이 내보낸 뒤 바뀌었거나 손상되어 불러오지 않았습니다(무결성 해시 불일치).');

  if (!isRecord(data.works)) throw new RestoreError('작품 자료 형식이 올바르지 않습니다.');
  const works = Object.values(data.works ?? {});
  if (works.length !== 1) throw new RestoreError('작품이 정확히 하나 들어 있어야 합니다.');
  const work = works[0]!;
  if (!isRecord(work) || typeof work.id !== 'string' || !work.id || !hasStrings(work, ['title', 'createdAt', 'updatedAt', 'serializationStatus']) ||
      !nullableString(work.genre) || !nullableString(work.synopsis) || !stringArray(work.tags)) {
    throw new RestoreError('작품 자료 형식이 올바르지 않습니다.');
  }
  for (const key of [...WORK_TABLES, ...HISTORY_TABLES]) {
    const table = (data as Record<string, unknown>)[key];
    if (table === undefined) continue;
    if (!isRecord(table)) throw new RestoreError(`${key} 형식이 올바르지 않습니다.`);
    for (const [id, value] of Object.entries(table)) {
      if (['__proto__', 'constructor', 'prototype'].includes(id) || !isRecord(value) || (key === 'works' ? value.id : value.workId) !== work.id || (key !== 'promises' && value.id !== id)) {
        throw new RestoreError('다른 작품의 자료가 섞여 있거나 ID가 맞지 않습니다.');
      }
    }
  }
  if (data.audit !== undefined && (!Array.isArray(data.audit) || data.audit.some((item) => !isRecord(item) || item.workId !== work.id))) {
    throw new RestoreError('작업 이력 형식이 올바르지 않거나 다른 작품의 이력이 섞여 있습니다.');
  }

  const chapters = data.chapters ?? {};
  const versions = data.versions ?? {};
  for (const version of Object.values(versions)) {
    if (typeof version.normalizedText !== 'string') throw new RestoreError('판본 본문이 없습니다.');
    if ((await sha256Text(version.normalizedText)) !== version.normalizedSha256) {
      throw new RestoreError('판본 본문 해시가 맞지 않아 불러오지 않았습니다.');
    }
    if (!Array.isArray(version.segments) || version.segments.some((segment) => !isRecord(segment))) {
      throw new RestoreError('판본의 구간 자료 형식이 올바르지 않습니다.');
    }
    requireReference(chapters, version.chapterId, '판본이 가리키는 회차가 파일에 없습니다.');
    requireOptionalReference(versions, version.basedOnVersionId, '기준 판본이 파일에 없습니다.');
    if (version.basedOnVersionId && versions[version.basedOnVersionId]!.chapterId !== version.chapterId) {
      throw new RestoreError('기준 판본이 다른 회차에 속합니다.');
    }
  }
  for (const chapter of Object.values(chapters)) {
    if (!hasStrings(chapter, ['displayNumber', 'createdAt', 'updatedAt', 'draftStatus']) || !nullableString(chapter.title)) {
      throw new RestoreError('회차 자료 형식이 올바르지 않습니다.');
    }
    requireOptionalReference(versions, chapter.currentVersionId, '회차의 현재 판본이 파일에 없습니다.');
    if (chapter.currentVersionId && versions[chapter.currentVersionId]!.chapterId !== chapter.id) {
      throw new RestoreError('회차의 현재 판본이 다른 회차에 속합니다.');
    }
  }
  for (const note of Object.values(data.notes ?? {})) {
    if (!hasStrings(note, ['body', 'createdAt', 'updatedAt'])) throw new RestoreError('작가 메모 형식이 올바르지 않습니다.');
    requireReference(chapters, note.chapterId, '작가 메모가 가리키는 회차가 파일에 없습니다.');
    requireOptionalReference(versions, note.versionId, '작가 메모가 가리키는 판본이 파일에 없습니다.');
    if (note.versionId && versions[note.versionId]!.chapterId !== note.chapterId) throw new RestoreError('작가 메모의 판본이 다른 회차에 속합니다.');
  }
  const entities = data.entities ?? {};
  const attributeDefs = data.attributeDefs ?? {};
  for (const entity of Object.values(entities)) {
    if (!hasStrings(entity, ['canonicalName', 'kind', 'createdAt', 'updatedAt']) || !nullableString(entity.description)) {
      throw new RestoreError('설정 항목 형식이 올바르지 않습니다.');
    }
  }
  for (const attribute of Object.values(attributeDefs)) {
    if (!hasStrings(attribute, ['entityKind', 'key', 'label'])) throw new RestoreError('설정 속성 형식이 올바르지 않습니다.');
  }
  for (const alias of Object.values(data.aliases ?? {})) {
    if (!hasStrings(alias, ['alias', 'normalizedAlias'])) throw new RestoreError('별칭 형식이 올바르지 않습니다.');
    requireReference(entities, alias.entityId, '별칭이 가리키는 설정 항목이 파일에 없습니다.');
  }
  const anchors = data.anchors ?? {};
  for (const anchor of Object.values(anchors)) {
    requireReference(versions, anchor.versionId, '근거가 가리키는 판본이 파일에 없습니다.');
    const version = versions[anchor.versionId]!;
    requireOptionalReference(anchors, anchor.reanchoredFromId, '이전 근거가 파일에 없습니다.');
    if (anchor.reanchoredFromId && versions[anchors[anchor.reanchoredFromId]!.versionId]?.chapterId !== version.chapterId) {
      throw new RestoreError('이전 근거가 다른 회차에 속합니다.');
    }
    const { startCp, endCp } = anchor;
    const inRange =
      Number.isInteger(startCp) && Number.isInteger(endCp) && startCp >= 0 && endCp > startCp && endCp <= cpLength(version.normalizedText);
    if (!inRange || cpSlice(version.normalizedText, startCp, endCp) !== anchor.exactQuote) {
      throw new RestoreError('근거 위치가 판본 본문과 맞지 않아 불러오지 않았습니다.');
    }
  }
  const assertions = data.assertions ?? {};
  for (const assertion of Object.values(assertions)) {
    if (!hasStrings(assertion, ['value', 'sourceKind', 'approvalStatus', 'createdAt', 'updatedAt'])) {
      throw new RestoreError('진술 형식이 올바르지 않습니다.');
    }
    requireReference(entities, assertion.subjectEntityId, '진술이 가리키는 설정 항목이 파일에 없습니다.');
    requireReference(attributeDefs, assertion.attributeDefId, '진술이 가리키는 속성이 파일에 없습니다.');
    requireOptionalReference(entities, assertion.speakerEntityId, '진술의 화자 항목이 파일에 없습니다.');
    if (!stringArray(assertion.evidenceIds)) throw new RestoreError('진술의 근거 목록 형식이 올바르지 않습니다.');
    for (const id of assertion.evidenceIds) requireReference(anchors, id, '진술이 가리키는 근거가 파일에 없습니다.');
  }
  for (const decision of Object.values(data.decisions ?? {})) {
    requireReference(assertions, decision.assertionId, '검토 이력이 가리키는 진술이 파일에 없습니다.');
  }
  for (const request of Object.values(data.reviewRequests ?? {})) {
    requireReference(assertions, request.assertionId, '재검토 요청이 가리키는 진술이 파일에 없습니다.');
    requireReference(anchors, request.evidenceId, '재검토 요청이 가리키는 근거가 파일에 없습니다.');
    requireReference(versions, request.observedVersionId, '재검토 요청이 가리키는 판본이 파일에 없습니다.');
    const anchor = anchors[request.evidenceId]!;
    if (versions[anchor.versionId]!.chapterId !== versions[request.observedVersionId]!.chapterId) {
      throw new RestoreError('재검토 요청의 판본이 근거와 다른 회차에 속합니다.');
    }
  }
  for (const conflict of Object.values(data.conflicts ?? {})) {
    requireReference(assertions, conflict.leftAssertionId, '충돌 후보의 진술이 파일에 없습니다.');
    requireReference(assertions, conflict.rightAssertionId, '충돌 후보의 진술이 파일에 없습니다.');
    requireReference(attributeDefs, conflict.attributeDefId, '충돌 후보의 속성이 파일에 없습니다.');
  }
  for (const snapshot of Object.values(data.tagSnapshots ?? {})) {
    requireReference(versions, snapshot.versionId, '회차 태그가 가리키는 판본이 파일에 없습니다.');
    if (!isRecord(snapshot.tags)) throw new RestoreError('회차 태그 형식이 올바르지 않습니다.');
  }
  for (const persona of Object.values(data.personas ?? {})) {
    if (!hasStrings(persona, ['displayName']) || !stringArray(persona.likes) || !stringArray(persona.dislikes) || !isRecord(persona.weights)) {
      throw new RestoreError('독자 성향 자료 형식이 올바르지 않습니다.');
    }
  }
  for (const cohort of Object.values(data.cohorts ?? {})) {
    if (!hasStrings(cohort, ['name']) || typeof cohort.initialCount !== 'number' || !Number.isFinite(cohort.initialCount)) {
      throw new RestoreError('독자 집단 자료 형식이 올바르지 않습니다.');
    }
    requireReference(data.personas, cohort.personaId, '독자 집단이 가리키는 성향이 파일에 없습니다.');
  }
  for (const run of Object.values(data.simRuns ?? {})) {
    if (!stringArray(run.orderedVersionIds) || !stringArray(run.chapterTagSnapshotIds) || !Array.isArray(run.steps) ||
        !isRecord(run.cohortSnapshot) || !Array.isArray(run.cohortSnapshot.cohorts) || !Array.isArray(run.cohortSnapshot.personas) ||
        run.cohortSnapshot.cohorts.some((cohort) => !isRecord(cohort)) || run.cohortSnapshot.personas.some((persona) => !isRecord(persona)) ||
        !isRecord(run.promiseProfileSnapshot) || !stringArray(run.promiseProfileSnapshot.genrePromises)) {
      throw new RestoreError('가상 연재 기록 형식이 올바르지 않습니다.');
    }
    for (const id of run.orderedVersionIds) requireReference(versions, id, '가상 연재 기록의 판본이 파일에 없습니다.');
    for (const id of run.chapterTagSnapshotIds) requireReference(data.tagSnapshots, id, '가상 연재 기록의 태그가 파일에 없습니다.');
    for (const step of run.steps) {
      if (!isRecord(step) || !Array.isArray(step.cohortStates) || step.cohortStates.some((cohort) => !isRecord(cohort))) {
        throw new RestoreError('가상 연재 회차 기록 형식이 올바르지 않습니다.');
      }
      requireReference(versions, step.versionId, '가상 연재 회차 기록의 판본이 파일에 없습니다.');
    }
  }
  for (const review of Object.values(data.reviews ?? {})) {
    if (!hasStrings(review, ['text', 'perspective', 'createdAt'])) throw new RestoreError('감평 결과 형식이 올바르지 않습니다.');
    requireReference(versions, review.versionId, '감평 결과가 가리키는 판본이 파일에 없습니다.');
  }
  for (const promise of Object.values(data.promises ?? {})) {
    if (!stringArray(promise.genrePromises) || !isRecord(promise.readerExpectations)) throw new RestoreError('작품 약속 자료 형식이 올바르지 않습니다.');
  }
  return { snapshot: data, workId: work.id, title: work.title };
}

/**
 * 작품 JSON 내보내기·불러오기 계약 (IA feature.export, flow.export).
 *
 * - 원고 판본(정규화 본문·해시)·근거·작가 메모·진술·승인 이력·가상 연재 기록을 한 파일에 담는다.
 * - 파일 전체 데이터의 SHA-256(dataSha256)과 판본마다 본문 해시를 다시 계산해 일치할 때만 불러온다.
 * - 파일은 작가가 직접 내려받는다. 앱은 이 파일을 어디에도 올리거나 저장하지 않는다.
 */
import { canonicalJson, cpLength, cpSlice, sha256Text } from './text';
import type { Id, Workspace } from './types';

export const EXPORT_FORMAT = 'gamddeol.work';
export const EXPORT_SCHEMA_VERSION = 1;
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

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

/** 내보내기 파일을 검증한다. 문제가 있으면 RestoreError(원고 원문 없는 안내문)를 던진다. */
export async function parseWorkExport(text: string): Promise<{ snapshot: WorkSnapshot; workId: Id; title: string }> {
  if (text.length > MAX_IMPORT_BYTES) throw new RestoreError('파일이 너무 큽니다(50MB 초과).');
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
  const actual = await sha256Text(canonicalJson(data));
  if (actual !== expected) throw new RestoreError('파일 내용이 내보낸 뒤 바뀌었거나 손상되어 불러오지 않았습니다(무결성 해시 불일치).');

  const works = Object.values(data.works ?? {});
  if (works.length !== 1) throw new RestoreError('작품이 정확히 하나 들어 있어야 합니다.');
  const work = works[0]!;
  for (const key of [...WORK_TABLES, ...HISTORY_TABLES]) {
    const table = (data as Record<string, unknown>)[key];
    if (table === undefined) continue;
    if (!isRecord(table)) throw new RestoreError(`${key} 형식이 올바르지 않습니다.`);
    for (const [id, value] of Object.entries(table)) {
      if (!isRecord(value) || (key === 'works' ? value.id : value.workId) !== work.id || (key !== 'promises' && value.id !== id)) {
        throw new RestoreError('다른 작품의 자료가 섞여 있거나 ID가 맞지 않습니다.');
      }
    }
  }
  const versions = data.versions ?? {};
  for (const version of Object.values(versions)) {
    if (typeof version.normalizedText !== 'string') throw new RestoreError('판본 본문이 없습니다.');
    if ((await sha256Text(version.normalizedText)) !== version.normalizedSha256) {
      throw new RestoreError('판본 본문 해시가 맞지 않아 불러오지 않았습니다.');
    }
  }
  for (const chapter of Object.values(data.chapters ?? {})) {
    if (chapter.currentVersionId && !versions[chapter.currentVersionId]) throw new RestoreError('회차의 현재 판본이 파일에 없습니다.');
  }
  const anchors = data.anchors ?? {};
  for (const anchor of Object.values(anchors)) {
    const version = versions[anchor.versionId];
    if (!version) throw new RestoreError('근거가 가리키는 판본이 파일에 없습니다.');
    const { startCp, endCp } = anchor;
    const inRange =
      Number.isInteger(startCp) && Number.isInteger(endCp) && startCp >= 0 && endCp > startCp && endCp <= cpLength(version.normalizedText);
    if (!inRange || cpSlice(version.normalizedText, startCp, endCp) !== anchor.exactQuote) {
      throw new RestoreError('근거 위치가 판본 본문과 맞지 않아 불러오지 않았습니다.');
    }
  }
  for (const assertion of Object.values(data.assertions ?? {})) {
    if (assertion.evidenceIds.some((id) => !anchors[id])) throw new RestoreError('진술이 가리키는 근거가 파일에 없습니다.');
  }
  return { snapshot: data, workId: work.id, title: work.title };
}

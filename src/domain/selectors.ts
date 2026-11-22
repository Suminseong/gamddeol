/** 화면용 읽기 도우미. 저장소 상태(Workspace)만 읽고 바꾸지 않는다. */
import type {
  AiJob,
  Assertion,
  AttributeDef,
  Chapter,
  ConflictFinding,
  EntityKind,
  EvidenceAnchor,
  Id,
  LoreEntity,
  ManuscriptVersion,
  ReviewRequest,
  SimulationRun,
  Workspace,
  WriterNote,
} from './types';

const byCreatedDesc = <T extends { createdAt: string }>(a: T, b: T) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

export function chaptersOf(ws: Workspace, workId: Id): Chapter[] {
  return Object.values(ws.chapters)
    .filter((chapter) => chapter.workId === workId)
    .sort((a, b) => a.sortKey - b.sortKey);
}

export function versionsOf(ws: Workspace, chapterId: Id): ManuscriptVersion[] {
  return Object.values(ws.versions)
    .filter((version) => version.chapterId === chapterId)
    .sort((a, b) => a.versionOrdinal - b.versionOrdinal);
}

export function chapterLabel(chapter: Pick<Chapter, 'displayNumber' | 'title'>): string {
  return `${chapter.displayNumber}화${chapter.title ? ` · ${chapter.title}` : ''}`;
}

export function versionLabel(version: Pick<ManuscriptVersion, 'versionOrdinal'>): string {
  return `판본 v${version.versionOrdinal}`;
}

export function entitiesOf(ws: Workspace, workId: Id): LoreEntity[] {
  return Object.values(ws.entities)
    .filter((entity) => entity.workId === workId)
    .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'ko'));
}

export function attributesFor(ws: Workspace, workId: Id, kind: EntityKind): AttributeDef[] {
  return Object.values(ws.attributeDefs).filter((def) => def.workId === workId && def.entityKind === kind && def.active);
}

export function assertionsOf(ws: Workspace, workId: Id): Assertion[] {
  return Object.values(ws.assertions).filter((assertion) => assertion.workId === workId);
}

export function assertionsAbout(ws: Workspace, entityId: Id): Assertion[] {
  return Object.values(ws.assertions).filter((assertion) => assertion.subjectEntityId === entityId);
}

export function anchorsOfVersion(ws: Workspace, versionId: Id): EvidenceAnchor[] {
  return Object.values(ws.anchors)
    .filter((anchor) => anchor.versionId === versionId)
    .sort((a, b) => a.startCp - b.startCp || a.endCp - b.endCp);
}

/** 근거를 쓰는 진술들. */
export function assertionsUsingAnchor(ws: Workspace, anchorId: Id): Assertion[] {
  return Object.values(ws.assertions).filter((assertion) => assertion.evidenceIds.includes(anchorId));
}

export function notesOf(ws: Workspace, chapterId: Id): WriterNote[] {
  return Object.values(ws.notes)
    .filter((note) => note.chapterId === chapterId)
    .sort(byCreatedDesc);
}

export function openReviewRequests(ws: Workspace, workId: Id): ReviewRequest[] {
  return Object.values(ws.reviewRequests)
    .filter((request) => request.workId === workId && request.status !== 'resolved')
    .sort(byCreatedDesc);
}

export function conflictsOf(ws: Workspace, workId: Id): ConflictFinding[] {
  return Object.values(ws.conflicts)
    .filter((conflict) => conflict.workId === workId)
    .sort(byCreatedDesc);
}

export const isOpenConflict = (conflict: Pick<ConflictFinding, 'status'>) => conflict.status === 'open' || conflict.status === 'reopened';

export function candidateCount(ws: Workspace, workId: Id): number {
  return assertionsOf(ws, workId).filter((assertion) => assertion.approvalStatus === 'candidate').length;
}

export function simRunsOf(ws: Workspace, workId: Id): SimulationRun[] {
  return Object.values(ws.simRuns)
    .filter((run) => run.workId === workId)
    .sort(byCreatedDesc);
}

export function aiJobsOf(ws: Workspace, workId: Id | null): AiJob[] {
  return Object.values(ws.aiJobs)
    .filter((job) => workId === null || job.workId === workId)
    .sort(byCreatedDesc);
}

/** 진술이 속한 회차·판본 위치(첫 근거 기준). 근거가 없으면 null. */
export function assertionLocation(ws: Workspace, assertion: Assertion) {
  for (const evidenceId of assertion.evidenceIds) {
    const anchor = ws.anchors[evidenceId];
    const version = anchor ? ws.versions[anchor.versionId] : undefined;
    const chapter = version ? ws.chapters[version.chapterId] : undefined;
    if (anchor && version && chapter) return { anchor, version, chapter };
  }
  return null;
}

export function entityName(ws: Workspace, entityId: Id | null | undefined): string {
  if (!entityId) return '알 수 없음';
  return ws.entities[entityId]?.canonicalName ?? '삭제된 항목';
}

export function attributeLabel(ws: Workspace, attributeDefId: Id): string {
  return ws.attributeDefs[attributeDefId]?.label ?? '속성';
}

/** 작중 시점 표시. 순서 정보가 없으면 '시점 미상'. */
export function storyTimeText(assertion: Pick<Assertion, 'storyTimeExpression' | 'startStoryOrder' | 'endStoryOrderExclusive'>): string {
  const range =
    assertion.startStoryOrder === null && assertion.endStoryOrderExclusive === null
      ? null
      : `${assertion.startStoryOrder ?? '처음'} – ${assertion.endStoryOrderExclusive ?? '끝'}`;
  if (assertion.storyTimeExpression && range) return `${assertion.storyTimeExpression} (순서 ${range})`;
  if (assertion.storyTimeExpression) return `${assertion.storyTimeExpression} (순서 미입력)`;
  if (range) return `순서 ${range}`;
  return '시점 미상';
}

export function hasUnexportedChanges(ws: Workspace, workId: Id): boolean {
  return (ws.changedRevision[workId] ?? 0) > (ws.exportedRevision[workId] ?? 0);
}

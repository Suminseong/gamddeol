/**
 * 작품 데이터 모델 (IA v0.1 dataModels의 MVP 부분집합).
 *
 * 저장 정책: 모든 데이터는 이 탭의 메모리에만 있다(알파의 원고 비영속 정책 유지).
 * 서버·브라우저 저장소에 쓰지 않으며, 보관은 작가가 직접 내려받는 JSON 내보내기로만 한다.
 * 그래서 ownerId는 항상 이 탭의 로컬 사용자 하나다(계정·인증 없음).
 */

export type Id = string;
export type IsoTime = string;

export const LOCAL_OWNER_ID = 'local-owner';

export type SerializationStatus = 'draft' | 'ongoing' | 'completed' | 'hiatus';

export interface Work {
  id: Id;
  ownerId: Id;
  title: string;
  genre: string | null;
  tags: string[];
  synopsis: string | null;
  serializationStatus: SerializationStatus;
  language: string;
  storyCalendarLabel: string | null;
  revision: number;
  createdAt: IsoTime;
  updatedAt: IsoTime;
}

export interface StoryPromiseProfile {
  /** 작품당 하나라 작품 ID를 그대로 쓴다. */
  id: Id;
  workId: Id;
  genrePromises: string[];
  readerExpectations: Record<string, string>;
  revision: number;
  confirmedByOwner: boolean;
  updatedAt: IsoTime;
}

export type ChapterDraftStatus = 'draft' | 'published' | 'archived';

export interface Chapter {
  id: Id;
  workId: Id;
  /** 작가가 보는 회차 번호(문자열, 예: "12", "외전 1"). 정렬과 분리한다. */
  displayNumber: string;
  /** 정렬 전용 키. 순서 변경은 이 값만 바꾸고 판본은 건드리지 않는다. */
  sortKey: number;
  title: string | null;
  currentVersionId: Id | null;
  draftStatus: ChapterDraftStatus;
  createdAt: IsoTime;
  updatedAt: IsoTime;
}

export type SegmentKind = 'paragraph' | 'heading';

export interface TextSegment {
  sequence: number;
  /** 코드포인트 반열림 구간 [startCp, endCp). */
  startCp: number;
  endCp: number;
  kind: SegmentKind;
  textSha256: string;
}

export type SourceType = 'upload' | 'paste' | 'import';

/** 불변 원고 판본. 생성 뒤 본문·해시를 바꾸지 않고, 수정은 새 판본으로만 한다. */
export interface ManuscriptVersion {
  id: Id;
  workId: Id;
  chapterId: Id;
  versionOrdinal: number;
  rawContentSha256: string;
  normalizedSha256: string;
  normalizedText: string;
  normalizerVersion: string;
  sourceType: SourceType;
  sourceFileName: string | null;
  encoding: string;
  basedOnVersionId: Id | null;
  segments: TextSegment[];
  createdAt: IsoTime;
}

export interface UploadAsset {
  id: Id;
  workId: Id;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  importStatus: 'accepted' | 'failed';
  createdAt: IsoTime;
}

export interface WriterNote {
  id: Id;
  workId: Id;
  chapterId: Id;
  versionId: Id | null;
  body: string;
  revision: number;
  createdAt: IsoTime;
  updatedAt: IsoTime;
}

export const ENTITY_KINDS = [
  'character',
  'organization',
  'nation',
  'place',
  'object',
  'ability',
  'technology',
  'law',
  'culture',
  'species',
  'custom',
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export type ReviewStatus = 'candidate' | 'approved' | 'rejected';

export interface LoreEntity {
  id: Id;
  workId: Id;
  kind: EntityKind;
  canonicalName: string;
  description: string | null;
  lifecycle: 'active' | 'archived';
  createdBy: 'author' | 'ai_candidate';
  reviewStatus: ReviewStatus;
  revision: number;
  createdAt: IsoTime;
  updatedAt: IsoTime;
}

export interface EntityAlias {
  id: Id;
  workId: Id;
  entityId: Id;
  alias: string;
  normalizedAlias: string;
  sourceKind: 'author_decision' | 'manuscript' | 'ai_inference';
  reviewStatus: ReviewStatus;
  createdAt: IsoTime;
}

export type AttributeValueType = 'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'enum' | 'entityRef' | 'json';

export interface AttributeDef {
  id: Id;
  workId: Id;
  entityKind: EntityKind;
  key: string;
  label: string;
  valueType: AttributeValueType;
  timeVariant: boolean;
  isBuiltIn: boolean;
  active: boolean;
}

export type AnchorHealth = 'ok' | 'review_requested' | 'relocation_candidate' | 'lost';

/** 특정 판본의 정확한 원문 구간. 코드포인트 반열림 [startCp, endCp). */
export interface EvidenceAnchor {
  id: Id;
  workId: Id;
  versionId: Id;
  startCp: number;
  endCp: number;
  exactQuote: string;
  prefixContext: string;
  suffixContext: string;
  normalizerVersion: string;
  quoteSha256: string;
  anchorHealth: AnchorHealth;
  reanchoredFromId: Id | null;
  createdAt: IsoTime;
}

export const ASSERTION_SOURCE_KINDS = [
  'narration',
  'character_speech',
  'author_decision',
  'author_idea',
  'ai_inference',
] as const;
export type AssertionSourceKind = (typeof ASSERTION_SOURCE_KINDS)[number];
export type ApprovalStatus = 'candidate' | 'approved' | 'rejected' | 'revoked';

/**
 * 설정 진술. 출처(sourceKind)와 승인 상태(approvalStatus)는 서로 다른 축이다.
 * AI 작업은 candidate만 만들 수 있고, 상태 전이는 작가의 명시 명령으로만 일어난다.
 */
export interface Assertion {
  id: Id;
  workId: Id;
  subjectEntityId: Id;
  attributeDefId: Id;
  value: string;
  sourceKind: AssertionSourceKind;
  speakerEntityId: Id | null;
  speakerUnresolved: boolean;
  approvalStatus: ApprovalStatus;
  evidenceHealth: AnchorHealth;
  startStoryOrder: number | null;
  endStoryOrderExclusive: number | null;
  storyTimeExpression: string | null;
  evidenceIds: Id[];
  createdByJobId: Id | null;
  /** 보류 표시(검토함 정리용). 승인 상태를 바꾸지 않는다. */
  heldAt: IsoTime | null;
  revision: number;
  createdAt: IsoTime;
  updatedAt: IsoTime;
}

export type DecisionAction = 'approve' | 'reject' | 'revoke';

export interface AssertionDecision {
  id: Id;
  workId: Id;
  assertionId: Id;
  commandId: Id;
  batchId: Id | null;
  action: DecisionAction;
  previousStatus: ApprovalStatus;
  nextStatus: ApprovalStatus;
  baseAssertionRevision: number;
  reason: string | null;
  createdAt: IsoTime;
}

export type ReviewRequestCause = 'source_changed' | 'quote_missing' | 'ambiguous_reanchor' | 'related_entity_changed';
export type ReviewRequestStatus = 'open' | 'acknowledged' | 'resolved';

export interface ReviewRequest {
  id: Id;
  workId: Id;
  assertionId: Id;
  evidenceId: Id;
  observedVersionId: Id;
  cause: ReviewRequestCause;
  status: ReviewRequestStatus;
  createdAt: IsoTime;
  updatedAt: IsoTime;
}

export type ConflictStatus = 'open' | 'intentional' | 'dismissed' | 'reopened';

export interface ConflictFinding {
  id: Id;
  workId: Id;
  leftAssertionId: Id;
  rightAssertionId: Id;
  attributeDefId: Id;
  overlapStart: number | null;
  overlapEnd: number | null;
  status: ConflictStatus;
  reason: string;
  decisionReason: string | null;
  /** 의도적 전개로 표시할 때의 근거 쌍 해시. 근거가 바뀌면 다시 열린다. */
  exceptionEvidencePairKey: string | null;
  createdAt: IsoTime;
  updatedAt: IsoTime;
}

export const TAG_KEYS = ['G', 'B', 'C', 'R', 'H'] as const;
export type TagKey = (typeof TAG_KEYS)[number];
export type TagIntensities = Record<TagKey, number>;

export interface ChapterTagSnapshot {
  id: Id;
  workId: Id;
  versionId: Id;
  taxonomyVersion: string;
  tags: TagIntensities;
  sourceKind: 'manual';
  approvedByUser: boolean;
  createdAt: IsoTime;
}

export interface Persona {
  id: Id;
  workId: Id;
  displayName: string;
  presetKey: string | null;
  likes: string[];
  dislikes: string[];
  weights: TagIntensities;
  betrayalSensitivity: number;
}

export interface AudienceCohort {
  id: Id;
  workId: Id;
  personaId: Id;
  name: string;
  initialCount: number;
  share: number;
  profileRevision: number;
}

export interface CohortStepState {
  cohortId: Id;
  name: string;
  frustration: number;
  satisfaction: number;
  trust: number;
  contribution: number;
  churnProbability: number;
  previousCount: number;
  remaining: number;
}

export interface SimulationStep {
  stepIndex: number;
  versionId: Id;
  chapterLabel: string;
  tags: TagIntensities;
  baseChurn: number;
  cohortStates: CohortStepState[];
  initialCountTotal: number;
  previousCountTotal: number;
  remainingCountTotal: number;
  cumulativeRetention: number | null;
  consecutiveReadRate: number | null;
}

export interface SimulationRun {
  id: Id;
  workId: Id;
  orderedVersionIds: Id[];
  chapterTagSnapshotIds: Id[];
  cohortSnapshot: { cohorts: AudienceCohort[]; personas: Persona[] };
  promiseProfileSnapshot: { genrePromises: string[] };
  seed: string;
  prngVersion: string;
  kernelVersion: string;
  inputSnapshotHash: string;
  commentEnabled: boolean;
  numericStatus: 'completed' | 'failed';
  reactionStatus: 'not_requested';
  synthetic: true;
  supersedesRunId: Id | null;
  steps: SimulationStep[];
  errorMessage: string | null;
  createdAt: IsoTime;
}

export type AiJobType = 'manuscript_review' | 'extract_lore';
export type AiJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'stale' | 'partial_failed';

export interface AiJob {
  id: Id;
  workId: Id | null;
  jobType: AiJobType;
  targetVersionId: Id | null;
  provider: 'openai' | 'mock';
  modelSnapshot: string;
  promptVersion: string;
  idempotencyKey: string;
  status: AiJobStatus;
  attemptCount: number;
  errorCode: string | null;
  /** 결과 요약(후보 수 등). 원고 본문은 넣지 않는다. */
  summary: string | null;
  createdAt: IsoTime;
  updatedAt: IsoTime;
}

export interface AiUsage {
  id: Id;
  jobId: Id;
  workId: Id | null;
  attempt: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  latencyMs: number | null;
  result: 'success' | 'failure' | 'refused' | 'cancelled';
  createdAt: IsoTime;
}

/** 작품 안 원고 감평 결과(AI 생성, 참고용). 설정에 자동 반영되지 않는다. */
export interface ManuscriptReview {
  id: Id;
  workId: Id;
  jobId: Id;
  versionId: Id;
  perspective: string;
  text: string;
  source: 'openai' | 'mock';
  model: string | null;
  responseId: string | null;
  incompleteReason: string | null;
  synthetic: true;
  createdAt: IsoTime;
}

export const AI_DATA_KINDS = ['manuscript_review', 'lore_extraction'] as const;
export type AiDataKind = (typeof AI_DATA_KINDS)[number];

export interface AiConsent {
  id: Id;
  provider: 'OpenAI';
  allowedModelSnapshot: string;
  allowedDataKinds: AiDataKind[];
  grantedAt: IsoTime;
  revokedAt: IsoTime | null;
  policyVersion: string;
}

export type AuditEventType =
  | 'work_created'
  | 'work_updated'
  | 'work_restored'
  | 'manuscript_imported'
  | 'version_added'
  | 'chapters_reordered'
  | 'entity_created'
  | 'assertion_created'
  | 'assertion_approved'
  | 'assertion_rejected'
  | 'assertion_revoked'
  | 'evidence_recheck'
  | 'evidence_reanchored'
  | 'conflict_classified'
  | 'simulation_run'
  | 'ai_job'
  | 'exported'
  | 'ai_consent_changed'
  | 'workspace_cleared';

/** 감사 이벤트. 원고·키 원문 대신 대상 ID와 메타데이터만 남긴다. */
export interface AuditEvent {
  id: Id;
  workId: Id | null;
  eventType: AuditEventType;
  actorType: 'owner' | 'worker' | 'system';
  targetId: Id | null;
  commandId: Id | null;
  summary: string;
  createdAt: IsoTime;
}

export interface Workspace {
  user: { displayName: string; locale: string };
  works: Record<Id, Work>;
  promises: Record<Id, StoryPromiseProfile>;
  chapters: Record<Id, Chapter>;
  versions: Record<Id, ManuscriptVersion>;
  uploads: Record<Id, UploadAsset>;
  notes: Record<Id, WriterNote>;
  entities: Record<Id, LoreEntity>;
  aliases: Record<Id, EntityAlias>;
  attributeDefs: Record<Id, AttributeDef>;
  anchors: Record<Id, EvidenceAnchor>;
  assertions: Record<Id, Assertion>;
  decisions: Record<Id, AssertionDecision>;
  reviewRequests: Record<Id, ReviewRequest>;
  conflicts: Record<Id, ConflictFinding>;
  tagSnapshots: Record<Id, ChapterTagSnapshot>;
  personas: Record<Id, Persona>;
  cohorts: Record<Id, AudienceCohort>;
  simRuns: Record<Id, SimulationRun>;
  aiJobs: Record<Id, AiJob>;
  aiUsage: Record<Id, AiUsage>;
  reviews: Record<Id, ManuscriptReview>;
  consent: AiConsent | null;
  audit: AuditEvent[];
  /** 처리한 명령 ID → 결과 ID. 같은 명령을 다시 받으면 새로 만들지 않는다(중복 제출 방지). */
  processedCommands: Record<Id, Id>;
  /** 변경마다 1씩 오른다. 마지막 내보내기 이후 변경 여부 판단에 쓴다. */
  revision: number;
  /** 작품별 마지막 내보내기 시점의 revision. */
  exportedRevision: Record<Id, number>;
  /** 작품별 마지막 변경 시점의 revision. 내보내기보다 크면 '내보내지 않은 변경 있음'. */
  changedRevision: Record<Id, number>;
}

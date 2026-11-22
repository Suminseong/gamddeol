/** 화면 표시용 한국어 이름표. 저장값(enum)은 바꾸지 않고 표시만 한다. */
import type {
  AiJobStatus,
  AiJobType,
  AnchorHealth,
  ApprovalStatus,
  AssertionSourceKind,
  ChapterDraftStatus,
  ConflictStatus,
  EntityKind,
  ReviewRequestCause,
  ReviewRequestStatus,
  SerializationStatus,
  SourceType,
} from './types';

export const SERIALIZATION_LABELS: Record<SerializationStatus, string> = {
  draft: '구상',
  ongoing: '연재 중',
  completed: '완결',
  hiatus: '휴재',
};

export const CHAPTER_STATUS_LABELS: Record<ChapterDraftStatus, string> = {
  draft: '초고',
  published: '공개',
  archived: '보관',
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  upload: '파일 업로드',
  paste: '붙여넣기',
  import: '가져오기',
};

export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  character: '인물',
  organization: '조직',
  nation: '국가',
  place: '장소',
  object: '사물',
  ability: '능력',
  technology: '기술',
  law: '법칙',
  culture: '문화',
  species: '종족',
  custom: '사용자 정의',
};

export const SOURCE_KIND_LABELS: Record<AssertionSourceKind, string> = {
  narration: '원고 서술',
  character_speech: '인물 발언',
  author_decision: '작가 결정',
  author_idea: '작가 구상',
  ai_inference: 'AI 추론',
};

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  candidate: '후보',
  approved: '확정',
  rejected: '기각',
  revoked: '확정 취소',
};

export const ANCHOR_HEALTH_LABELS: Record<AnchorHealth, string> = {
  ok: '근거 정상',
  review_requested: '재검토 요청',
  relocation_candidate: '위치 재확인 필요',
  lost: '근거 유실',
};

export const REVIEW_REQUEST_CAUSE_LABELS: Record<ReviewRequestCause, string> = {
  source_changed: '원고 새 판본 등록',
  quote_missing: '새 판본에 인용 없음',
  ambiguous_reanchor: '인용 위치가 여러 곳',
  related_entity_changed: '관련 항목 변경',
};

export const REVIEW_REQUEST_STATUS_LABELS: Record<ReviewRequestStatus, string> = {
  open: '열림',
  acknowledged: '확인함',
  resolved: '해결',
};

export const CONFLICT_STATUS_LABELS: Record<ConflictStatus, string> = {
  open: '검토 필요',
  intentional: '의도된 전개',
  dismissed: '무시함',
  reopened: '다시 열림',
};

export const AI_JOB_TYPE_LABELS: Record<AiJobType, string> = {
  manuscript_review: '원고 감평',
  extract_lore: '설정 후보 추출',
};

export const AI_JOB_STATUS_LABELS: Record<AiJobStatus, string> = {
  queued: '대기',
  running: '진행 중',
  completed: '완료',
  failed: '실패',
  cancelled: '취소됨',
  stale: '구판 결과',
  partial_failed: '일부 실패',
};

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPercent(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '해당 없음';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}

export function shortHash(hash: string, length = 8): string {
  return hash.slice(0, length);
}

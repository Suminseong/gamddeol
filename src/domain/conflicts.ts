/**
 * 규칙 기반 충돌 후보 선별 (IA pipeline.conflict, 외부 AI 없음).
 * 네 조건을 모두 만족할 때만 후보로 낸다: 같은 항목, 같은 속성, 비교 가능한 작중 시점의 겹침, 양쪽 원문 근거.
 * 작중 시점을 모르면 충돌로 단정하지 않고 '비교 불가' 정보로만 돌려준다.
 */
import { normalizeName } from './text';
import type { Assertion, Id, Workspace } from './types';

export interface ConflictCandidate {
  leftAssertionId: Id;
  rightAssertionId: Id;
  attributeDefId: Id;
  overlapStart: number | null;
  overlapEnd: number | null;
  reason: string;
  evidencePairKey: string;
}

export interface IncomparablePair {
  leftAssertionId: Id;
  rightAssertionId: Id;
  reason: string;
}

export function evidencePairKey(left: Assertion, right: Assertion): string {
  return `${[...left.evidenceIds].sort().join(',')}|${[...right.evidenceIds].sort().join(',')}|${left.value}|${right.value}`;
}

const ACTIVE = new Set(['approved', 'candidate']);

function ordered(a: Assertion, b: Assertion): [Assertion, Assertion] {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? [a, b] : [b, a];
  return a.id < b.id ? [a, b] : [b, a];
}

function pairs(workspace: Workspace, workId: Id) {
  const groups = new Map<string, Assertion[]>();
  for (const assertion of Object.values(workspace.assertions)) {
    if (assertion.workId !== workId || !ACTIVE.has(assertion.approvalStatus)) continue;
    const key = `${assertion.subjectEntityId}|${assertion.attributeDefId}`;
    const group = groups.get(key);
    if (group) group.push(assertion);
    else groups.set(key, [assertion]);
  }
  const result: [Assertion, Assertion][] = [];
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [left, right] = ordered(group[i]!, group[j]!);
        if (left.approvalStatus !== 'approved' && right.approvalStatus !== 'approved') continue;
        if (normalizeName(left.value) === normalizeName(right.value)) continue;
        result.push([left, right]);
      }
    }
  }
  return result;
}

const hasEvidence = (workspace: Workspace, assertion: Assertion) =>
  assertion.evidenceIds.some((id) => workspace.anchors[id] && workspace.anchors[id]!.anchorHealth !== 'lost');

export function detectConflicts(workspace: Workspace, workId: Id): ConflictCandidate[] {
  const found: ConflictCandidate[] = [];
  for (const [left, right] of pairs(workspace, workId)) {
    if (!hasEvidence(workspace, left) || !hasEvidence(workspace, right)) continue;
    const attribute = workspace.attributeDefs[left.attributeDefId];
    if (!attribute) continue;
    let overlapStart: number | null = null;
    let overlapEnd: number | null = null;
    if (attribute.timeVariant) {
      if (left.startStoryOrder === null || right.startStoryOrder === null) continue;
      const leftEnd = left.endStoryOrderExclusive ?? Number.POSITIVE_INFINITY;
      const rightEnd = right.endStoryOrderExclusive ?? Number.POSITIVE_INFINITY;
      const start = Math.max(left.startStoryOrder, right.startStoryOrder);
      const end = Math.min(leftEnd, rightEnd);
      if (!(start < end)) continue;
      overlapStart = start;
      overlapEnd = Number.isFinite(end) ? end : null;
    }
    found.push({
      leftAssertionId: left.id,
      rightAssertionId: right.id,
      attributeDefId: left.attributeDefId,
      overlapStart,
      overlapEnd,
      reason: attribute.timeVariant
        ? `같은 작중 시점 구간에서 「${attribute.label}」 값이 다릅니다.`
        : `시점과 무관한 속성 「${attribute.label}」 값이 다릅니다.`,
      evidencePairKey: evidencePairKey(left, right),
    });
  }
  return found;
}

/** 값은 다르지만 작중 시점이나 근거가 없어 충돌로 판단하지 않은 쌍. */
export function incomparablePairs(workspace: Workspace, workId: Id): IncomparablePair[] {
  const result: IncomparablePair[] = [];
  for (const [left, right] of pairs(workspace, workId)) {
    const attribute = workspace.attributeDefs[left.attributeDefId];
    if (!attribute) continue;
    if (!hasEvidence(workspace, left) || !hasEvidence(workspace, right)) {
      result.push({ leftAssertionId: left.id, rightAssertionId: right.id, reason: '한쪽 이상에 원문 근거가 없습니다.' });
    } else if (attribute.timeVariant && (left.startStoryOrder === null || right.startStoryOrder === null)) {
      result.push({ leftAssertionId: left.id, rightAssertionId: right.id, reason: '작중 시점이 비어 있어 비교하지 않았습니다.' });
    }
  }
  return result;
}

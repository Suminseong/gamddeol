/** 작품 통합 검색: 원고 판본 본문(정확 문구)·설정 항목 이름/별칭·진술 값. 결과는 판본과 정확 구간을 함께 돌려준다. */
import { cpSlice, findAllCp, normalizeManuscript, normalizeName } from './text';
import type { AssertionSourceKind, EntityKind, Id, Workspace } from './types';

export type SearchScope = 'all' | 'manuscript' | 'wiki';
export type SearchSort = 'relevance' | 'chapterOrder';

export interface SearchOptions {
  scope: SearchScope;
  allVersions: boolean;
  chapterFrom: number | null;
  chapterTo: number | null;
  entityKind: EntityKind | 'all';
  sourceKind: AssertionSourceKind | 'all';
  sort: SearchSort;
}

export type SearchHit =
  | {
      type: 'manuscript';
      key: string;
      score: number;
      chapterId: Id;
      chapterIndex: number;
      chapterLabel: string;
      versionId: Id;
      versionOrdinal: number;
      isCurrent: boolean;
      startCp: number;
      endCp: number;
      before: string;
      match: string;
      after: string;
    }
  | { type: 'entity'; key: string; score: number; entityId: Id; name: string; kind: EntityKind; matched: string; chapterIndex: number }
  | {
      type: 'assertion';
      key: string;
      score: number;
      assertionId: Id;
      entityId: Id;
      entityName: string;
      attributeLabel: string;
      value: string;
      sourceKind: AssertionSourceKind;
      chapterIndex: number;
    };

export const MAX_HITS = 300;
const CONTEXT = 30;

export function searchWork(workspace: Workspace, workId: Id, rawQuery: string, options: SearchOptions): { hits: SearchHit[]; truncated: boolean } {
  const query = normalizeManuscript(rawQuery).trim();
  if (!query) return { hits: [], truncated: false };
  const hits: SearchHit[] = [];
  let truncated = false;
  const chapters = Object.values(workspace.chapters)
    .filter((chapter) => chapter.workId === workId)
    .sort((a, b) => a.sortKey - b.sortKey);

  if (options.scope !== 'wiki') {
    chapters.forEach((chapter, index) => {
      const position = index + 1;
      if (options.chapterFrom !== null && position < options.chapterFrom) return;
      if (options.chapterTo !== null && position > options.chapterTo) return;
      const versions = Object.values(workspace.versions)
        .filter((version) => version.chapterId === chapter.id && (options.allVersions || version.id === chapter.currentVersionId))
        .sort((a, b) => b.versionOrdinal - a.versionOrdinal);
      for (const version of versions) {
        const text = version.normalizedText;
        for (const range of findAllCp(text, query, 50)) {
          if (hits.length >= MAX_HITS) {
            truncated = true;
            return;
          }
          hits.push({
            type: 'manuscript',
            key: `${version.id}:${range.startCp}`,
            score: version.id === chapter.currentVersionId ? 1 : 0.5,
            chapterId: chapter.id,
            chapterIndex: position,
            chapterLabel: `${chapter.displayNumber}화${chapter.title ? ` · ${chapter.title}` : ''}`,
            versionId: version.id,
            versionOrdinal: version.versionOrdinal,
            isCurrent: version.id === chapter.currentVersionId,
            startCp: range.startCp,
            endCp: range.endCp,
            before: cpSlice(text, Math.max(0, range.startCp - CONTEXT), range.startCp),
            match: cpSlice(text, range.startCp, range.endCp),
            after: cpSlice(text, range.endCp, range.endCp + CONTEXT),
          });
        }
      }
    });
  }

  if (options.scope !== 'manuscript') {
    const needle = normalizeName(query);
    const aliasesByEntity = new Map<Id, string[]>();
    for (const alias of Object.values(workspace.aliases)) {
      if (alias.workId !== workId) continue;
      aliasesByEntity.set(alias.entityId, [...(aliasesByEntity.get(alias.entityId) ?? []), alias.alias]);
    }
    for (const entity of Object.values(workspace.entities)) {
      if (entity.workId !== workId) continue;
      if (options.entityKind !== 'all' && entity.kind !== options.entityKind) continue;
      const name = normalizeName(entity.canonicalName);
      const alias = (aliasesByEntity.get(entity.id) ?? []).find((item) => normalizeName(item).includes(needle));
      const inDescription = entity.description ? normalizeName(entity.description).includes(needle) : false;
      if (name.includes(needle) || alias || inDescription) {
        hits.push({
          type: 'entity',
          key: `entity:${entity.id}`,
          score: name === needle ? 3 : name.includes(needle) ? 2.5 : alias ? 2 : 1.2,
          entityId: entity.id,
          name: entity.canonicalName,
          kind: entity.kind,
          matched: name.includes(needle) ? '정식 명칭' : alias ? `별칭 「${alias}」` : '설명',
          chapterIndex: 0,
        });
      }
    }
    for (const assertion of Object.values(workspace.assertions)) {
      if (assertion.workId !== workId) continue;
      if (options.sourceKind !== 'all' && assertion.sourceKind !== options.sourceKind) continue;
      const entity = workspace.entities[assertion.subjectEntityId];
      if (!entity || (options.entityKind !== 'all' && entity.kind !== options.entityKind)) continue;
      if (!normalizeName(assertion.value).includes(needle)) continue;
      hits.push({
        type: 'assertion',
        key: `assertion:${assertion.id}`,
        score: 1.5,
        assertionId: assertion.id,
        entityId: entity.id,
        entityName: entity.canonicalName,
        attributeLabel: workspace.attributeDefs[assertion.attributeDefId]?.label ?? '속성',
        value: assertion.value,
        sourceKind: assertion.sourceKind,
        chapterIndex: 0,
      });
    }
  }

  if (options.sort === 'relevance') {
    hits.sort((a, b) => b.score - a.score || a.chapterIndex - b.chapterIndex);
  } else {
    hits.sort((a, b) => a.chapterIndex - b.chapterIndex || b.score - a.score);
  }
  return { hits, truncated };
}

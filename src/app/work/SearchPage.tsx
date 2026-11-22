/**
 * 작품 통합 검색(screen.search): 원고 판본 본문(정확 문구)·설정 항목 이름/별칭·진술 값.
 * 검색어는 주소에 넣지 않는다(원고 문구가 주소·방문 기록에 남지 않게). 결과 링크에는 판본 ID와 코드포인트 위치만 쓴다.
 * 마지막 검색 조건은 이 탭 메모리에만 기억해 결과를 보고 돌아와도 유지한다.
 */
import { useMemo, useState } from 'react';
import { ENTITY_KIND_LABELS, SOURCE_KIND_LABELS } from '../../domain/labels';
import { searchWork, type SearchOptions, type SearchScope, type SearchSort } from '../../domain/search';
import { ASSERTION_SOURCE_KINDS, ENTITY_KINDS, type AssertionSourceKind, type EntityKind } from '../../domain/types';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useWorkspace } from '../context';
import { Badge, CheckboxField, EmptyState, LiveStatus, PageHeader, SelectField, TextField } from '../ui/primitives';

const DEFAULT_OPTIONS: SearchOptions = {
  scope: 'all',
  allVersions: false,
  chapterFrom: null,
  chapterTo: null,
  entityKind: 'all',
  sourceKind: 'all',
  sort: 'relevance',
};

/** 작품별 마지막 검색(탭 메모리). */
const lastSearch = new Map<string, { query: string; options: SearchOptions }>();

/** 작업 공간을 비울 때 기억한 검색어도 지운다. */
export function forgetSearches() {
  lastSearch.clear();
}

const toNumber = (value: string) => (value.trim() && Number.isFinite(Number(value)) ? Math.max(1, Math.floor(Number(value))) : null);

export function SearchPage({ params }: PageProps) {
  const workspace = useWorkspace();
  const workId = params.workId!;
  const remembered = lastSearch.get(workId);
  const [draft, setDraft] = useState(remembered?.query ?? '');
  const [submitted, setSubmitted] = useState(remembered?.query ?? '');
  const [options, setOptions] = useState<SearchOptions>(remembered?.options ?? DEFAULT_OPTIONS);
  const [fromText, setFromText] = useState(options.chapterFrom?.toString() ?? '');
  const [toText, setToText] = useState(options.chapterTo?.toString() ?? '');

  const result = useMemo(
    () => (submitted.trim() ? searchWork(workspace, workId, submitted, options) : null),
    [workspace, workId, submitted, options],
  );

  const update = (patch: Partial<SearchOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    if (submitted.trim()) lastSearch.set(workId, { query: submitted, options: next });
  };

  const run = () => {
    const next = { ...options, chapterFrom: toNumber(fromText), chapterTo: toNumber(toText) };
    setOptions(next);
    setSubmitted(draft);
    lastSearch.set(workId, { query: draft, options: next });
  };

  const hits = result?.hits ?? [];
  const counts = {
    manuscript: hits.filter((hit) => hit.type === 'manuscript').length,
    entity: hits.filter((hit) => hit.type === 'entity').length,
    assertion: hits.filter((hit) => hit.type === 'assertion').length,
  };

  return (
    <div className="page">
      <PageHeader title="작품 통합 검색" description="원고 본문은 입력한 문구와 정확히 같은 곳을 찾습니다. 검색어는 주소나 기록에 남기지 않습니다." />
      <form
        className="search-form"
        role="search"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <div className="search-box">
          <TextField label="검색어" type="search" value={draft} onChange={setDraft} placeholder="문구, 인물 이름, 설정 값" autoFocus />
          <button type="submit" className="button-primary" disabled={!draft.trim()}>
            검색
          </button>
        </div>
        <details className="search-facets" open>
          <summary>검색 조건</summary>
          <div className="filter-toolbar">
            <SelectField<SearchScope>
              label="범위"
              value={options.scope}
              onChange={(scope) => update({ scope })}
              options={[
                { value: 'all', label: '원고 + 설정' },
                { value: 'manuscript', label: '원고만' },
                { value: 'wiki', label: '설정만' },
              ]}
            />
            <SelectField<SearchSort>
              label="정렬"
              value={options.sort}
              onChange={(sort) => update({ sort })}
              options={[
                { value: 'relevance', label: '관련도순' },
                { value: 'chapterOrder', label: '회차순' },
              ]}
            />
            <SelectField<EntityKind | 'all'>
              label="항목 종류"
              value={options.entityKind}
              onChange={(entityKind) => update({ entityKind })}
              options={[{ value: 'all', label: '전체' }, ...ENTITY_KINDS.map((value) => ({ value, label: ENTITY_KIND_LABELS[value] }))]}
            />
            <SelectField<AssertionSourceKind | 'all'>
              label="진술 출처"
              value={options.sourceKind}
              onChange={(sourceKind) => update({ sourceKind })}
              options={[{ value: 'all', label: '전체' }, ...ASSERTION_SOURCE_KINDS.map((value) => ({ value, label: SOURCE_KIND_LABELS[value] }))]}
            />
            <TextField label="회차 순서 시작" type="number" inputMode="numeric" value={fromText} onChange={setFromText} />
            <TextField label="회차 순서 끝" type="number" inputMode="numeric" value={toText} onChange={setToText} />
            <CheckboxField label="이전 판본도 검색" checked={options.allVersions} onChange={(allVersions) => update({ allVersions })} />
          </div>
          <p className="hint">회차 범위는 검색 버튼을 누를 때 적용됩니다.</p>
        </details>
      </form>
      <LiveStatus message={result ? `검색 결과 ${hits.length}건${result.truncated ? ' 이상' : ''}` : ''} />
      {!result ? (
        <EmptyState message="찾을 문구나 이름을 입력하고 검색을 누르세요." />
      ) : hits.length === 0 ? (
        <EmptyState message="검색 결과가 없습니다. 원고 본문은 띄어쓰기까지 같은 문구만 찾습니다." />
      ) : (
        <section aria-labelledby="search-results-heading">
          <h2 id="search-results-heading">
            검색 결과 <span className="num">{hits.length}</span>건{result.truncated ? ' (앞부분만 표시)' : ''}
          </h2>
          <p className="hint">
            원고 {counts.manuscript} · 설정 항목 {counts.entity} · 진술 {counts.assertion}
          </p>
          <ul className="search-results">
            {hits.map((hit) => {
              if (hit.type === 'manuscript') {
                return (
                  <li key={hit.key} className="search-hit">
                    <p className="badge-row">
                      <Badge tier="neutral">원고</Badge>
                      <Link to={`${pathFor('page.version', { workId, chapterId: hit.chapterId, versionId: hit.versionId })}?hl=${hit.startCp}-${hit.endCp}`}>
                        {hit.chapterLabel} · 판본 v{hit.versionOrdinal}
                      </Link>
                      {!hit.isCurrent && <Badge tier="deprecated">이전 판본</Badge>}
                    </p>
                    <p className="snippet">
                      …{hit.before}
                      <mark>{hit.match}</mark>
                      {hit.after}…
                    </p>
                  </li>
                );
              }
              if (hit.type === 'entity') {
                return (
                  <li key={hit.key} className="search-hit">
                    <p className="badge-row">
                      <Badge tier="neutral">설정 항목 · {ENTITY_KIND_LABELS[hit.kind]}</Badge>
                      <Link to={pathFor('page.wikiDetail', { workId, entityId: hit.entityId })}>{hit.name}</Link>
                      <span className="hint">{hit.matched}에서 찾음</span>
                    </p>
                  </li>
                );
              }
              return (
                <li key={hit.key} className="search-hit">
                  <p className="badge-row">
                    <Badge tier="neutral">진술 · {SOURCE_KIND_LABELS[hit.sourceKind]}</Badge>
                    <Link to={pathFor('page.wikiDetail', { workId, entityId: hit.entityId })}>
                      {hit.entityName} · {hit.attributeLabel}
                    </Link>
                  </p>
                  <p className="snippet">{hit.value}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

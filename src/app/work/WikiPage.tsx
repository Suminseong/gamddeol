/** 설정집 및 위키(screen.wiki): 종류별 항목 트리 + 목록(이름·별칭 거르기, 검토 상태). */
import { useState } from 'react';
import { ENTITY_KIND_LABELS } from '../../domain/labels';
import { assertionsAbout, entitiesOf } from '../../domain/selectors';
import { normalizeName } from '../../domain/text';
import { ENTITY_KINDS, type EntityKind, type ReviewStatus } from '../../domain/types';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useWorkspace } from '../context';
import { Badge, EmptyState, PageHeader, SelectField, TextField } from '../ui/primitives';

export function WikiPage({ params }: PageProps) {
  const workspace = useWorkspace();
  const workId = params.workId!;
  const [kind, setKind] = useState<EntityKind | 'all'>('all');
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<ReviewStatus | 'all'>('all');
  const entities = entitiesOf(workspace, workId);
  const aliasMap = new Map<string, string[]>();
  for (const alias of Object.values(workspace.aliases)) {
    if (alias.workId === workId) aliasMap.set(alias.entityId, [...(aliasMap.get(alias.entityId) ?? []), alias.alias]);
  }
  const needle = normalizeName(filter);
  const visible = entities.filter(
    (entity) =>
      (kind === 'all' || entity.kind === kind) &&
      (status === 'all' || entity.reviewStatus === status) &&
      (!needle || normalizeName(entity.canonicalName).includes(needle) || (aliasMap.get(entity.id) ?? []).some((alias) => normalizeName(alias).includes(needle))),
  );
  const counts = new Map<EntityKind, number>();
  for (const entity of entities) counts.set(entity.kind, (counts.get(entity.kind) ?? 0) + 1);

  return (
    <div className="page">
      <PageHeader
        title="설정집 및 위키"
        description="설정 항목과 진술을 원문 근거와 함께 관리합니다. AI가 만든 항목은 작가가 확정하기 전까지 후보로 표시됩니다."
        actions={
          <Link to={pathFor('page.wikiNew', { workId })} className="neu-cta-button button-cta">
            설정 항목 추가
          </Link>
        }
      />
      {entities.length === 0 ? (
        <EmptyState
          message="아직 설정 항목이 없습니다. 직접 추가하거나 판본 화면에서 AI 설정 후보를 추출하세요."
          action={
            <Link to={pathFor('page.wikiNew', { workId })} className="button-primary">
              설정 항목 추가
            </Link>
          }
        />
      ) : (
        <div className="wiki-layout">
          <nav className="entity-tree" aria-label="항목 종류">
            <ul>
              <li>
                <button type="button" className="tree-item" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
                  전체 <span className="num">{entities.length}</span>
                </button>
              </li>
              {ENTITY_KINDS.filter((item) => counts.has(item)).map((item) => (
                <li key={item}>
                  <button type="button" className="tree-item" aria-pressed={kind === item} onClick={() => setKind(item)}>
                    {ENTITY_KIND_LABELS[item]} <span className="num">{counts.get(item)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="wiki-main">
            <div className="filter-toolbar">
              <TextField label="이름·별칭 거르기" type="search" value={filter} onChange={setFilter} />
              <SelectField
                label="검토 상태"
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: '전체' },
                  { value: 'approved', label: '확정 항목' },
                  { value: 'candidate', label: 'AI 후보 항목' },
                  { value: 'rejected', label: '기각한 항목' },
                ]}
              />
            </div>
            {visible.length === 0 ? (
              <EmptyState message="조건에 맞는 항목이 없습니다." />
            ) : (
              <ul className="entity-list" aria-label="설정 항목">
                {visible.map((entity) => {
                  const assertions = assertionsAbout(workspace, entity.id);
                  const pending = assertions.filter((assertion) => assertion.approvalStatus === 'candidate').length;
                  const aliases = aliasMap.get(entity.id) ?? [];
                  return (
                    <li key={entity.id} className="entity-card">
                      <h2 className="card-title">
                        <Link to={pathFor('page.wikiDetail', { workId, entityId: entity.id })}>{entity.canonicalName}</Link>
                      </h2>
                      <p className="badge-row">
                        <Badge tier="neutral">{ENTITY_KIND_LABELS[entity.kind]}</Badge>
                        {entity.reviewStatus === 'candidate' && <Badge tier="candidate">AI 후보 항목</Badge>}
                        {entity.reviewStatus === 'rejected' && <Badge tier="deprecated">기각한 항목</Badge>}
                        <span className="hint num">진술 {assertions.length}</span>
                        {pending > 0 && <span className="hint num">검토 대기 {pending}</span>}
                      </p>
                      {aliases.length > 0 && <p className="hint">별칭: {aliases.join(', ')}</p>}
                      {entity.description && <p className="entity-description">{entity.description}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

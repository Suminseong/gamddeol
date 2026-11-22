/**
 * 충돌 후보(screen.conflicts): 규칙 기반(같은 항목·같은 속성·겹치는 작중 시점·양쪽 원문 근거)으로 고른 후보.
 * 시점을 모르거나 근거가 없는 쌍은 충돌로 단정하지 않고 '비교 불가'로만 보여 준다.
 */
import { useState } from 'react';
import { incomparablePairs } from '../../domain/conflicts';
import { attributeLabel, conflictsOf, entityName, isOpenConflict } from '../../domain/selectors';
import type { ConflictStatus } from '../../domain/types';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useWorkspace } from '../context';
import { ConflictBadge, EmptyState, PageHeader, Panel, SelectField } from '../ui/primitives';

export function ConflictsPage({ params }: PageProps) {
  const workspace = useWorkspace();
  const workId = params.workId!;
  const [status, setStatus] = useState<'unresolved' | ConflictStatus | 'all'>('unresolved');
  const [attribute, setAttribute] = useState('all');
  const conflicts = conflictsOf(workspace, workId);
  const attributeIds = [...new Set(conflicts.map((conflict) => conflict.attributeDefId))];
  const visible = conflicts
    .filter((conflict) => (status === 'all' ? true : status === 'unresolved' ? isOpenConflict(conflict) : conflict.status === status))
    .filter((conflict) => attribute === 'all' || conflict.attributeDefId === attribute);
  const incomparable = incomparablePairs(workspace, workId);

  return (
    <div className="page">
      <PageHeader
        title="충돌 후보"
        description="같은 항목·같은 속성의 값이 작중 시점이 겹치는 구간에서 다르고, 양쪽 모두 원문 근거가 있을 때만 후보로 올립니다. AI를 쓰지 않는 규칙 검사입니다."
      />
      {conflicts.length > 0 && (
        <div className="filter-toolbar">
          <SelectField
            label="상태"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'unresolved', label: '검토 필요(열림·다시 열림)' },
              { value: 'intentional', label: '의도된 전개' },
              { value: 'dismissed', label: '무시함' },
              { value: 'all', label: '전체' },
            ]}
          />
          <SelectField
            label="속성"
            value={attribute}
            onChange={setAttribute}
            options={[{ value: 'all', label: '전체' }, ...attributeIds.map((id) => ({ value: id, label: attributeLabel(workspace, id) }))]}
          />
        </div>
      )}
      {conflicts.length === 0 ? (
        <EmptyState message="충돌 후보가 없습니다. 근거와 작중 시점이 있는 진술이 서로 어긋나면 여기에 나타납니다." />
      ) : visible.length === 0 ? (
        <EmptyState message="조건에 맞는 충돌 후보가 없습니다." />
      ) : (
        <ul className="conflict-list" aria-label="충돌 후보">
          {visible.map((conflict) => {
            const left = workspace.assertions[conflict.leftAssertionId];
            const right = workspace.assertions[conflict.rightAssertionId];
            return (
              <li key={conflict.id} className="conflict-card">
                <h2 className="card-title">
                  <Link to={pathFor('page.conflictDetail', { workId, conflictId: conflict.id })}>
                    {entityName(workspace, left?.subjectEntityId)} · {attributeLabel(workspace, conflict.attributeDefId)}
                  </Link>
                </h2>
                <p className="badge-row">
                  <ConflictBadge status={conflict.status} />
                  <span className="hint">
                    {conflict.overlapStart === null ? '시점 무관 속성' : `겹치는 작중 순서 ${conflict.overlapStart} – ${conflict.overlapEnd ?? '끝'}`}
                  </span>
                </p>
                <p className="conflict-values">
                  <span>{left?.value ?? '삭제된 진술'}</span>
                  <span aria-hidden="true"> ↔ </span>
                  <span className="sr-only"> 그리고 </span>
                  <span>{right?.value ?? '삭제된 진술'}</span>
                </p>
                <p className="hint">{conflict.reason}</p>
              </li>
            );
          })}
        </ul>
      )}
      {incomparable.length > 0 && (
        <Panel title={`비교하지 않은 쌍 ${incomparable.length}건`}>
          <p className="hint">값은 다르지만 작중 시점이나 원문 근거가 없어 충돌로 판단하지 않았습니다. 시점이 바뀌는 속성이면 정상일 수 있습니다.</p>
          <ul className="row-list">
            {incomparable.slice(0, 30).map((pair) => {
              const left = workspace.assertions[pair.leftAssertionId];
              const right = workspace.assertions[pair.rightAssertionId];
              if (!left || !right) return null;
              return (
                <li key={`${pair.leftAssertionId}|${pair.rightAssertionId}`}>
                  <Link to={pathFor('page.wikiDetail', { workId, entityId: left.subjectEntityId })}>
                    {entityName(workspace, left.subjectEntityId)} · {attributeLabel(workspace, left.attributeDefId)}
                  </Link>
                  <span>
                    {left.value} / {right.value}
                  </span>
                  <span className="hint">{pair.reason}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

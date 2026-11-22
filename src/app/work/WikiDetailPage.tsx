/**
 * 설정 항목 상세(screen.wikiDetail): 별칭, 속성별 진술(출처·승인·시점·근거), 인라인 결정, 진술 추가, 결정 이력.
 * 별칭이 같아도 다른 항목과 자동으로 합치지 않는다.
 */
import { useState } from 'react';
import { ANCHOR_HEALTH_LABELS, APPROVAL_LABELS, ENTITY_KIND_LABELS, formatDateTime } from '../../domain/labels';
import { assertionsAbout, attributeLabel, chapterLabel, storyTimeText } from '../../domain/selectors';
import type { Assertion, DecisionAction } from '../../domain/types';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useServices, useUnsavedGuard, useWorkspace } from '../context';
import { AssertionBadges, Badge, ErrorBanner, LiveStatus, PageHeader, Panel, StaleBanner, TextAreaField, TextField } from '../ui/primitives';
import { AssertionForm } from './AssertionForm';
import { DECISION_LABELS, DecisionButtons, useDecide } from './decisions';

export function WikiDetailPage({ params }: PageProps) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const workId = params.workId!;
  const entityId = params.entityId!;
  const entity = workspace.entities[entityId]!;
  const assertions = assertionsAbout(workspace, entityId);
  const aliases = Object.values(workspace.aliases).filter((alias) => alias.entityId === entityId);
  const { decide, banner } = useDecide(workId);
  const [reason, setReason] = useState('');
  const [announce, setAnnounce] = useState('');
  const [aliasDraft, setAliasDraft] = useState('');
  const [aliasError, setAliasError] = useState<string | null>(null);

  const groups = new Map<string, Assertion[]>();
  for (const assertion of assertions) groups.set(assertion.attributeDefId, [...(groups.get(assertion.attributeDefId) ?? []), assertion]);
  const decisions = Object.values(workspace.decisions)
    .filter((decision) => assertions.some((assertion) => assertion.id === decision.assertionId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const onDecide = (assertion: Assertion, action: DecisionAction) => {
    if (decide(assertion, action, reason || null)) {
      setAnnounce(`${attributeLabel(workspace, assertion.attributeDefId)} 진술을 ${DECISION_LABELS[action]}했습니다.`);
      setReason('');
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={entity.canonicalName}
        meta={
          <span className="badge-row">
            <Badge tier="neutral">{ENTITY_KIND_LABELS[entity.kind]}</Badge>
            {entity.reviewStatus === 'candidate' && <Badge tier="candidate">AI 후보 항목</Badge>}
            {entity.reviewStatus === 'rejected' && <Badge tier="deprecated">기각한 항목</Badge>}
            <span className="hint num">진술 {assertions.length}</span>
          </span>
        }
        description={entity.description ?? undefined}
        actions={
          entity.reviewStatus === 'candidate' ? (
            <>
              <button type="button" className="button-primary" onClick={() => store.reviewEntity(workId, entityId, 'approved')}>
                항목 확정
              </button>
              <button type="button" className="button-secondary" onClick={() => store.reviewEntity(workId, entityId, 'rejected')}>
                항목 기각
              </button>
            </>
          ) : undefined
        }
      />
      <LiveStatus message={announce} />
      {banner}
      <div className="two-col">
        <div className="col-main">
          <Panel title="별칭">
            <p className="hint">별칭이 다른 항목과 같아도 자동으로 합치지 않습니다. 같은 대상인지 작가가 판단하세요.</p>
            {aliases.length > 0 && (
              <ul className="chip-list" aria-label="별칭 목록">
                {aliases.map((alias) => (
                  <li key={alias.id} className="chip">
                    <span>{alias.alias}</span>
                    <button type="button" className="chip-remove" aria-label={`별칭 ${alias.alias} 빼기`} onClick={() => store.removeAlias(workId, alias.id)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="inline-form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const result = store.addAlias(workId, entityId, aliasDraft);
                if (!result.ok) setAliasError(result.error.message);
                else {
                  setAliasError(null);
                  setAliasDraft('');
                }
              }}
            >
              <TextField label="별칭 추가" value={aliasDraft} onChange={setAliasDraft} error={aliasError} />
              <button type="submit" className="button-secondary" disabled={!aliasDraft.trim()}>
                추가
              </button>
            </form>
          </Panel>

          <Panel title="속성별 진술">
            {assertions.length === 0 ? (
              <p className="hint">아직 진술이 없습니다. 아래에서 추가하거나, 판본 화면에서 원문을 골라 근거와 함께 추가하세요.</p>
            ) : (
              <>
                <TextField label="결정 사유 (선택)" value={reason} onChange={setReason} hint="다음에 누르는 확정·기각·확정 취소에 함께 기록됩니다." />
                {[...groups.entries()].map(([attributeId, list]) => (
                  <section key={attributeId} className="attribute-group" aria-labelledby={`attr-${attributeId}`}>
                    <h3 id={`attr-${attributeId}`}>{attributeLabel(workspace, attributeId)}</h3>
                    <ul className="assertion-list">
                      {list.map((assertion) => (
                        <AssertionRow key={assertion.id} workId={workId} assertion={assertion} onDecide={(action) => onDecide(assertion, action)} />
                      ))}
                    </ul>
                  </section>
                ))}
              </>
            )}
          </Panel>

          <Panel title="진술 추가">
            <AssertionForm workId={workId} fixedEntityId={entityId} onDone={() => setAnnounce('진술을 저장했습니다.')} />
          </Panel>
        </div>
        <aside className="col-side" aria-label="항목 편집과 결정 이력">
          <EntityEditor key={entity.id} workId={workId} entityId={entityId} />
          <Panel title="결정 이력">
            {decisions.length === 0 ? (
              <p className="hint">아직 결정 기록이 없습니다.</p>
            ) : (
              <ol className="timeline">
                {decisions.map((decision) => {
                  const assertion = workspace.assertions[decision.assertionId];
                  return (
                    <li key={decision.id}>
                      <p>
                        <strong>{DECISION_LABELS[decision.action]}</strong> · {assertion ? `${attributeLabel(workspace, assertion.attributeDefId)} = ${assertion.value}` : '진술'}
                      </p>
                      <p className="hint">
                        {APPROVAL_LABELS[decision.previousStatus]} → {APPROVAL_LABELS[decision.nextStatus]} · <span className="num">{formatDateTime(decision.createdAt)}</span>
                        {decision.batchId ? ' · 묶음 결정' : ''}
                      </p>
                      {decision.reason && <p className="hint">사유: {decision.reason}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function AssertionRow({ workId, assertion, onDecide }: { workId: string; assertion: Assertion; onDecide: (action: DecisionAction) => void }) {
  const workspace = useWorkspace();
  const speaker = assertion.speakerEntityId ? workspace.entities[assertion.speakerEntityId] : undefined;
  const label = `${attributeLabel(workspace, assertion.attributeDefId)} = ${assertion.value}`;
  return (
    <li className="assertion-row">
      <div className="assertion-main">
        <p className="assertion-value">{assertion.value}</p>
        <p className="badge-row">
          <AssertionBadges assertion={assertion} />
          {assertion.evidenceHealth !== 'ok' && <Badge tier="warning">{ANCHOR_HEALTH_LABELS[assertion.evidenceHealth]}</Badge>}
          {assertion.heldAt && <Badge tier="neutral">보류</Badge>}
        </p>
        <p className="hint">
          {storyTimeText(assertion)}
          {assertion.sourceKind === 'character_speech' && ` · 화자: ${speaker ? speaker.canonicalName : '미상'}`}
        </p>
        {assertion.evidenceIds.length > 0 ? (
          <ul className="evidence-links">
            {assertion.evidenceIds.map((evidenceId) => {
              const anchor = workspace.anchors[evidenceId];
              const version = anchor ? workspace.versions[anchor.versionId] : undefined;
              const chapter = version ? workspace.chapters[version.chapterId] : undefined;
              if (!anchor || !version || !chapter) return null;
              return (
                <li key={evidenceId}>
                  <Link to={`${pathFor('page.version', { workId, chapterId: chapter.id, versionId: version.id })}?anchor=${anchor.id}`}>
                    {chapterLabel(chapter)} v{version.versionOrdinal}
                  </Link>{' '}
                  <span className="quote-inline">&ldquo;{anchor.exactQuote.length > 60 ? `${anchor.exactQuote.slice(0, 60)}…` : anchor.exactQuote}&rdquo;</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="hint">원문 근거 없음</p>
        )}
      </div>
      <DecisionButtons assertion={assertion} onDecide={onDecide} label={label} />
    </li>
  );
}

function EntityEditor({ workId, entityId }: { workId: string; entityId: string }) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const entity = workspace.entities[entityId]!;
  const [baseRevision, setBaseRevision] = useState(entity.revision);
  const [name, setName] = useState(entity.canonicalName);
  const [description, setDescription] = useState(entity.description ?? '');
  const [problem, setProblem] = useState<{ stale: boolean; field?: string; message: string } | null>(null);
  const dirty = name !== entity.canonicalName || description !== (entity.description ?? '');
  useUnsavedGuard(dirty, '항목 편집 내용을 저장하지 않았습니다.');

  return (
    <Panel title="항목 편집">
      {problem?.stale && (
        <StaleBanner
          onReload={() => {
            setBaseRevision(entity.revision);
            setProblem(null);
          }}
        />
      )}
      {problem && !problem.stale && !problem.field && <ErrorBanner title="저장하지 못했습니다" message={problem.message} />}
      <form
        className="form-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const result = store.updateEntity(workId, entityId, { canonicalName: name, description: description || null }, baseRevision);
          if (!result.ok) {
            setProblem({ stale: result.error.code === 'stale', field: result.error.field, message: result.error.message });
            return;
          }
          setProblem(null);
          setBaseRevision(result.value.revision);
        }}
      >
        <TextField label="정식 명칭" required value={name} onChange={setName} error={problem?.field === 'canonicalName' ? problem.message : null} />
        <TextAreaField label="설명" value={description} onChange={setDescription} rows={4} />
        <button type="submit" className="button-primary" disabled={!dirty}>
          저장
        </button>
      </form>
    </Panel>
  );
}

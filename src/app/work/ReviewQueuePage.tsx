/**
 * AI 후보 검토함(screen.reviewQueue): 후보 목록 + 상세(원문 인용 ±32자 문맥), 결정 바(사유·확정·보류·기각), 묶음 결정(항목별 결과).
 * 단축키 J/K(다음/이전), A(확정), R(기각)는 입력칸에 초점이 있을 때는 동작하지 않는다.
 */
import { useEffect, useState } from 'react';
import { ANCHOR_HEALTH_LABELS, ENTITY_KIND_LABELS, REVIEW_REQUEST_CAUSE_LABELS, SOURCE_KIND_LABELS } from '../../domain/labels';
import { assertionLocation, assertionsOf, attributeLabel, chapterLabel, entityName, openReviewRequests, storyTimeText } from '../../domain/selectors';
import { ENTITY_KINDS, type Assertion, type AssertionSourceKind, type DecisionAction, type EntityKind } from '../../domain/types';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useQuery, useServices, useWorkspace } from '../context';
import { AssertionBadges, Badge, CheckboxField, EmptyState, ErrorBanner, InfoBanner, LiveStatus, PageHeader, Panel, SelectField, SplitPanes, TextField } from '../ui/primitives';
import { DECISION_LABELS, useDecide } from './decisions';

type SourceFilter = AssertionSourceKind | 'all';

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function ReviewQueuePage({ params }: PageProps) {
  const { store, newId } = useServices();
  const workspace = useWorkspace();
  const query = useQuery();
  const workId = params.workId!;
  const versionFilter = query.get('versionId');
  const [source, setSource] = useState<SourceFilter>('all');
  const [kind, setKind] = useState<EntityKind | 'all'>('all');
  const [showHeld, setShowHeld] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [announce, setAnnounce] = useState('');
  const [batchResult, setBatchResult] = useState<{ ok: number; failed: { label: string; message: string }[]; action: DecisionAction } | null>(null);
  const { decide, banner } = useDecide(workId);

  const candidates = assertionsOf(workspace, workId)
    .filter((assertion) => assertion.approvalStatus === 'candidate')
    .filter((assertion) => source === 'all' || assertion.sourceKind === source)
    .filter((assertion) => kind === 'all' || workspace.entities[assertion.subjectEntityId]?.kind === kind)
    .filter((assertion) => showHeld || !assertion.heldAt)
    .filter((assertion) => !versionFilter || assertion.evidenceIds.some((id) => workspace.anchors[id]?.versionId === versionFilter))
    .sort((a, b) => (a.heldAt ? 1 : 0) - (b.heldAt ? 1 : 0) || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  const selected = candidates.find((assertion) => assertion.id === selectedId) ?? candidates[0];
  const index = selected ? candidates.indexOf(selected) : -1;
  const requests = openReviewRequests(workspace, workId);
  const versionLabel = (() => {
    if (!versionFilter) return null;
    const version = workspace.versions[versionFilter];
    const chapter = version ? workspace.chapters[version.chapterId] : undefined;
    return version && chapter ? `${chapterLabel(chapter)} v${version.versionOrdinal}` : null;
  })();

  const labelOf = (assertion: Assertion) =>
    `${entityName(workspace, assertion.subjectEntityId)} · ${attributeLabel(workspace, assertion.attributeDefId)} = ${assertion.value}`;

  const act = (assertion: Assertion, action: DecisionAction | 'hold') => {
    const next = candidates[index + 1] ?? candidates[index - 1];
    if (action === 'hold') {
      const result = store.setHeld(workId, assertion.id, !assertion.heldAt);
      if (result.ok) setAnnounce(assertion.heldAt ? '보류를 풀었습니다.' : '보류로 표시했습니다. 승인 상태는 그대로입니다.');
      return;
    }
    if (decide(assertion, action, reason || null)) {
      setAnnounce(`${labelOf(assertion)}: ${DECISION_LABELS[action]}했습니다.`);
      setReason('');
      setChecked((list) => list.filter((id) => id !== assertion.id));
      setSelectedId(next?.id ?? null);
    }
  };

  const batch = (action: DecisionAction) => {
    const items = checked
      .map((id) => workspace.assertions[id])
      .filter((assertion): assertion is Assertion => Boolean(assertion))
      .map((assertion) => ({ assertionId: assertion.id, baseRevision: assertion.revision }));
    if (items.length === 0) return;
    const results = store.decideBatch(workId, items, action, reason || null, newId());
    const failed = results
      .filter((item) => !item.result.ok)
      .map((item) => ({
        label: workspace.assertions[item.assertionId] ? labelOf(workspace.assertions[item.assertionId]!) : item.assertionId,
        message: item.result.ok ? '' : item.result.error.message,
      }));
    setBatchResult({ ok: results.length - failed.length, failed, action });
    setAnnounce(`묶음 ${DECISION_LABELS[action]}: 성공 ${results.length - failed.length}건, 실패 ${failed.length}건`);
    setChecked(results.filter((item) => !item.result.ok).map((item) => item.assertionId));
    setReason('');
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || !selected) return;
      const key = event.key.toLowerCase();
      if (key === 'j' || key === 'k') {
        const target = candidates[index + (key === 'j' ? 1 : -1)];
        if (target) {
          event.preventDefault();
          setSelectedId(target.id);
        }
      } else if (key === 'a') {
        event.preventDefault();
        act(selected, 'approve');
      } else if (key === 'r') {
        event.preventDefault();
        act(selected, 'reject');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const list = (
    <div className="queue-list">
      <div className="filter-toolbar filter-compact">
        <SelectField
          label="출처"
          value={source}
          onChange={setSource}
          options={[{ value: 'all', label: '전체' }, ...(['narration', 'character_speech', 'ai_inference', 'author_decision', 'author_idea'] as const).map((value) => ({ value, label: SOURCE_KIND_LABELS[value] }))]}
        />
        <SelectField
          label="항목 종류"
          value={kind}
          onChange={setKind}
          options={[{ value: 'all', label: '전체' }, ...ENTITY_KINDS.map((value) => ({ value, label: ENTITY_KIND_LABELS[value] }))]}
        />
        <CheckboxField label="보류한 후보도 보기" checked={showHeld} onChange={setShowHeld} />
      </div>
      {versionLabel && (
        <p className="hint">
          {versionLabel}에서 나온 후보만 보는 중 · <Link to={pathFor('page.reviewQueue', { workId })}>모든 후보 보기</Link>
        </p>
      )}
      {checked.length > 0 && (
        <div className="batch-bar" role="group" aria-label="묶음 결정">
          <span className="num">{checked.length}건 선택</span>
          <button type="button" className="button-primary button-small" onClick={() => batch('approve')}>
            선택 확정
          </button>
          <button type="button" className="button-secondary button-small" onClick={() => batch('reject')}>
            선택 기각
          </button>
          <button type="button" className="button-link" onClick={() => setChecked([])}>
            선택 해제
          </button>
        </div>
      )}
      {candidates.length === 0 ? (
        <EmptyState message="검토할 후보가 없습니다." />
      ) : (
        <ul className="queue-items" aria-label="검토할 후보">
          {candidates.map((assertion) => {
            const isSelected = selected?.id === assertion.id;
            return (
              <li key={assertion.id} className={isSelected ? 'queue-item is-selected' : 'queue-item'}>
                <input
                  type="checkbox"
                  className="checkbox"
                  aria-label={`묶음 선택: ${labelOf(assertion)}`}
                  checked={checked.includes(assertion.id)}
                  onChange={(event) => setChecked((list) => (event.target.checked ? [...list, assertion.id] : list.filter((id) => id !== assertion.id)))}
                />
                <button type="button" className="queue-open" aria-current={isSelected ? 'true' : undefined} onClick={() => setSelectedId(assertion.id)}>
                  <span className="queue-title">
                    {entityName(workspace, assertion.subjectEntityId)} · {attributeLabel(workspace, assertion.attributeDefId)}
                  </span>
                  <span className="queue-value">{assertion.value}</span>
                  <span className="badge-row">
                    <AssertionBadges assertion={assertion} />
                    {assertion.heldAt && <Badge tier="neutral">보류</Badge>}
                    {assertion.evidenceHealth !== 'ok' && <Badge tier="warning">{ANCHOR_HEALTH_LABELS[assertion.evidenceHealth]}</Badge>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const detail = selected ? (
    <CandidateDetail workId={workId} assertion={selected} reason={reason} onReason={setReason} onAct={(action) => act(selected, action)} />
  ) : (
    <EmptyState message="왼쪽에서 후보를 고르세요." />
  );

  return (
    <div className="page page-wide">
      <PageHeader
        title="AI 후보 검토함"
        meta={<span className="hint num">후보 {candidates.length}건</span>}
        description="AI가 만든 후보와 작가가 후보로 남긴 진술입니다. 확정하기 전에는 설정(정본)에 반영되지 않습니다. 단축키: J/K 이동, A 확정, R 기각."
      />
      <LiveStatus message={announce} />
      {banner}
      {batchResult && (
        <div className={batchResult.failed.length > 0 ? 'banner banner-warning' : 'banner banner-info'} role="status">
          <p className="banner-title">
            묶음 {DECISION_LABELS[batchResult.action]}: 성공 {batchResult.ok}건, 실패 {batchResult.failed.length}건
          </p>
          {batchResult.failed.length > 0 && (
            <ul>
              {batchResult.failed.map((item) => (
                <li key={item.label}>
                  {item.label}: {item.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {requests.length > 0 && (
        <InfoBanner tone="warning">
          <p className="banner-title">원고 새 판본 때문에 다시 확인할 근거 {requests.length}건</p>
          <ul>
            {[...new Set(requests.map((request) => workspace.anchors[request.evidenceId]?.versionId))].map((versionId) => {
              const version = versionId ? workspace.versions[versionId] : undefined;
              const chapter = version ? workspace.chapters[version.chapterId] : undefined;
              if (!version || !chapter) return null;
              const cause = requests.find((request) => workspace.anchors[request.evidenceId]?.versionId === versionId)?.cause;
              return (
                <li key={version.id}>
                  <Link to={`${pathFor('page.compare', { workId, chapterId: chapter.id })}?left=${version.id}&right=${chapter.currentVersionId ?? version.id}`}>
                    {chapterLabel(chapter)} v{version.versionOrdinal} 근거 비교
                  </Link>
                  {cause ? ` · ${REVIEW_REQUEST_CAUSE_LABELS[cause]}` : ''}
                </li>
              );
            })}
          </ul>
        </InfoBanner>
      )}
      <SplitPanes labels={['후보 목록', '상세·결정']} variant="list">
        {list}
        {detail}
      </SplitPanes>
    </div>
  );
}

function CandidateDetail({
  workId,
  assertion,
  reason,
  onReason,
  onAct,
}: {
  workId: string;
  assertion: Assertion;
  reason: string;
  onReason: (value: string) => void;
  onAct: (action: DecisionAction | 'hold') => void;
}) {
  const workspace = useWorkspace();
  const entity = workspace.entities[assertion.subjectEntityId];
  const location = assertionLocation(workspace, assertion);
  const job = assertion.createdByJobId ? workspace.aiJobs[assertion.createdByJobId] : undefined;
  const speaker = assertion.speakerEntityId ? workspace.entities[assertion.speakerEntityId] : undefined;

  return (
    <Panel title="후보 상세">
      <dl className="detail-list">
        <div>
          <dt>설정 항목</dt>
          <dd>
            {entity ? <Link to={pathFor('page.wikiDetail', { workId, entityId: entity.id })}>{entity.canonicalName}</Link> : '알 수 없음'}
            {entity && <span className="hint"> ({ENTITY_KIND_LABELS[entity.kind]})</span>}
            {entity?.reviewStatus === 'candidate' && <Badge tier="candidate">새 항목 후보</Badge>}
          </dd>
        </div>
        <div>
          <dt>속성</dt>
          <dd>{attributeLabel(workspace, assertion.attributeDefId)}</dd>
        </div>
        <div>
          <dt>값</dt>
          <dd className="assertion-value">{assertion.value}</dd>
        </div>
        <div>
          <dt>출처·상태</dt>
          <dd>
            <AssertionBadges assertion={assertion} />
          </dd>
        </div>
        {assertion.sourceKind === 'character_speech' && (
          <div>
            <dt>화자</dt>
            <dd>{speaker ? speaker.canonicalName : '화자 미상 (원고에서 확인 필요)'}</dd>
          </div>
        )}
        <div>
          <dt>작중 시점</dt>
          <dd>{storyTimeText(assertion)}</dd>
        </div>
        {job && (
          <div>
            <dt>만든 작업</dt>
            <dd className="hint">
              AI {job.modelSnapshot} · {job.promptVersion}
            </dd>
          </div>
        )}
      </dl>
      {location ? (
        <figure className="quote-context">
          <figcaption>
            <Link to={`${pathFor('page.version', { workId, chapterId: location.chapter.id, versionId: location.version.id })}?anchor=${location.anchor.id}`}>
              {chapterLabel(location.chapter)} 판본 v{location.version.versionOrdinal}
            </Link>
            {location.anchor.anchorHealth !== 'ok' && <Badge tier="warning">{ANCHOR_HEALTH_LABELS[location.anchor.anchorHealth]}</Badge>}
          </figcaption>
          <blockquote className="flat-reader-surface quote-box">
            <span className="quote-context-text">{location.anchor.prefixContext}</span>
            <mark className="reader-mark is-active">{location.anchor.exactQuote}</mark>
            <span className="quote-context-text">{location.anchor.suffixContext}</span>
          </blockquote>
          {location.anchor.anchorHealth === 'relocation_candidate' && (
            <p className="hint">같은 문장이 본문 여러 곳에 있어 첫 위치에 걸었습니다. 판본 화면에서 맞는 위치를 확인하세요.</p>
          )}
        </figure>
      ) : (
        <ErrorBanner title="원문 근거가 없습니다" message="근거 없이 확정할 수는 있지만, 원고 사실로 쓰려면 판본에서 근거를 연결하세요." />
      )}
      <div className="decision-bar" role="group" aria-label="결정">
        <TextField label="결정 사유 (선택)" value={reason} onChange={onReason} />
        <div className="decision-actions">
          <button type="button" className="button-primary" onClick={() => onAct('approve')} aria-keyshortcuts="A">
            확정
          </button>
          <button type="button" className="button-secondary" onClick={() => onAct('hold')}>
            {assertion.heldAt ? '보류 풀기' : '보류'}
          </button>
          <button type="button" className="button-secondary button-danger-outline" onClick={() => onAct('reject')} aria-keyshortcuts="R">
            기각
          </button>
        </div>
      </div>
    </Panel>
  );
}

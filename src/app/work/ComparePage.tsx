/**
 * 판본 비교(screen.compare): 같은 회차의 두 판본을 줄 단위로 비교하고, 이전 판본 근거의 재검토 요청을 처리한다.
 * 근거 위치는 자동으로 옮기지 않는다. 새 판본에서 같은 문장을 찾아 보여 주고 작가가 고른다.
 */
import { useMemo, useState } from 'react';
import { diffLines, type DiffOp } from '../../domain/diff';
import { ANCHOR_HEALTH_LABELS, REVIEW_REQUEST_CAUSE_LABELS } from '../../domain/labels';
import { anchorsOfVersion, attributeLabel, chapterLabel, entityName, versionsOf } from '../../domain/selectors';
import { cpSlice, findAllCp } from '../../domain/text';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useNavigate, useQuery, useServices, useWorkspace } from '../context';
import { Badge, EmptyState, ErrorBanner, InfoBanner, LiveStatus, PageHeader, Panel, SelectField } from '../ui/primitives';

type Row = { left: DiffOp | null; right: DiffOp | null };

function toRows(ops: DiffOp[]): Row[] {
  const rows: Row[] = [];
  let removed: DiffOp[] = [];
  let added: DiffOp[] = [];
  const flush = () => {
    const count = Math.max(removed.length, added.length);
    for (let i = 0; i < count; i++) rows.push({ left: removed[i] ?? null, right: added[i] ?? null });
    removed = [];
    added = [];
  };
  for (const op of ops) {
    if (op.type === 'equal') {
      flush();
      rows.push({ left: op, right: op });
    } else if (op.type === 'removed') removed.push(op);
    else added.push(op);
  }
  flush();
  return rows;
}

export function ComparePage({ params }: PageProps) {
  const workspace = useWorkspace();
  const query = useQuery();
  const navigate = useNavigate();
  const workId = params.workId!;
  const chapterId = params.chapterId!;
  const chapter = workspace.chapters[chapterId]!;
  const versions = versionsOf(workspace, chapterId);
  const inChapter = (id: string | null) => (id && workspace.versions[id]?.chapterId === chapterId ? workspace.versions[id] : undefined);
  const right = inChapter(query.get('right')) ?? versions[versions.length - 1];
  const left = inChapter(query.get('left')) ?? versions[versions.length - 2] ?? right;
  const [view, setView] = useState<'split' | 'unified'>('split');
  const [onlyChanges, setOnlyChanges] = useState(true);

  const diff = useMemo(() => (left && right ? diffLines(left.normalizedText, right.normalizedText) : null), [left, right]);

  if (versions.length < 2 || !left || !right) {
    return (
      <div className="page">
        <PageHeader title={`${chapterLabel(chapter)} 판본 비교`} />
        <EmptyState
          message="비교하려면 판본이 두 개 이상 있어야 합니다."
          action={
            <Link to={`${pathFor('page.import', { workId })}?chapterId=${chapterId}`} className="button-primary">
              새 판본 올리기
            </Link>
          }
        />
      </div>
    );
  }

  const select = (side: 'left' | 'right', id: string) => {
    const next = { left: left.id, right: right.id, [side]: id };
    navigate(`${pathFor('page.compare', { workId, chapterId })}?left=${next.left}&right=${next.right}`, { replace: true });
  };
  const versionOptions = versions.map((version) => ({
    value: version.id,
    label: `판본 v${version.versionOrdinal}${version.id === chapter.currentVersionId ? ' (현재)' : ''}`,
  }));
  const rows = diff && !diff.tooLarge ? toRows(diff.ops) : [];
  const shownRows = onlyChanges ? rows.filter((row) => row.left?.type !== 'equal') : rows;

  return (
    <div className="page page-wide">
      <PageHeader
        title={`${chapterLabel(chapter)} 판본 비교`}
        description="두 판본 모두 바뀌지 않는 원본입니다. 비교는 줄 단위로 합니다."
        actions={
          <Link to={pathFor('page.chapter', { workId, chapterId })} className="button-secondary">
            회차 상세
          </Link>
        }
      />
      <div className="filter-toolbar">
        <SelectField label="왼쪽(기준)" value={left.id} onChange={(id) => select('left', id)} options={versionOptions} />
        <SelectField label="오른쪽(비교)" value={right.id} onChange={(id) => select('right', id)} options={versionOptions} />
        <div className="segmented" role="radiogroup" aria-label="비교 보기">
          {(['split', 'unified'] as const).map((value) => (
            <label key={value} className={view === value ? 'segment is-active' : 'segment'}>
              <input type="radio" name="diff-view" checked={view === value} onChange={() => setView(value)} />
              {value === 'split' ? '나란히' : '한 줄로'}
            </label>
          ))}
        </div>
        <label className="inline-check">
          <input type="checkbox" className="checkbox" checked={onlyChanges} onChange={(event) => setOnlyChanges(event.target.checked)} />
          바뀐 줄만 보기
        </label>
      </div>

      <AnchorReview workId={workId} chapterId={chapterId} leftId={left.id} rightId={right.id} />

      <Panel title="본문 차이">
        {diff?.tooLarge ? (
          <InfoBanner tone="warning">두 판본이 너무 길어 이 화면에서 줄 단위 비교를 하지 않았습니다. 판본 화면에서 각각 읽어 보세요.</InfoBanner>
        ) : (
          <>
            <p className="diff-summary">
              <Badge tier="canon">추가 {diff?.added ?? 0}줄</Badge> <Badge tier="danger">삭제 {diff?.removed ?? 0}줄</Badge>
              {left.id === right.id && <span className="hint"> 같은 판본을 골랐습니다.</span>}
            </p>
            {shownRows.length === 0 ? (
              <p className="hint">바뀐 줄이 없습니다.</p>
            ) : view === 'split' ? (
              <div className="diff-split" role="table" aria-label={`판본 v${left.versionOrdinal}과 v${right.versionOrdinal} 나란히 비교`}>
                <div className="diff-row diff-head" role="row">
                  <span role="columnheader">판본 v{left.versionOrdinal}</span>
                  <span role="columnheader">판본 v{right.versionOrdinal}</span>
                </div>
                {shownRows.map((row, index) => (
                  <div className="diff-row" role="row" key={index}>
                    <DiffCell op={row.left} side="left" />
                    <DiffCell op={row.right} side="right" />
                  </div>
                ))}
              </div>
            ) : (
              <ol className="diff-unified" aria-label="한 줄로 보는 비교">
                {(onlyChanges ? diff!.ops.filter((op) => op.type !== 'equal') : diff!.ops).map((op, index) => (
                  <li key={index} className={`diff-line is-${op.type}`}>
                    <span className="diff-sign" aria-hidden="true">
                      {op.type === 'added' ? '+' : op.type === 'removed' ? '−' : ' '}
                    </span>
                    <span className="sr-only">{op.type === 'added' ? '추가: ' : op.type === 'removed' ? '삭제: ' : ''}</span>
                    <span className="diff-text">{op.text || ' '}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

function DiffCell({ op, side }: { op: DiffOp | null; side: 'left' | 'right' }) {
  if (!op) return <span role="cell" className="diff-cell is-empty" />;
  const kind = op.type === 'equal' ? 'equal' : side === 'left' ? 'removed' : 'added';
  return (
    <span role="cell" className={`diff-cell is-${kind}`}>
      {kind !== 'equal' && <span className="sr-only">{kind === 'added' ? '추가: ' : '삭제: '}</span>}
      {op.text || ' '}
    </span>
  );
}

/** 왼쪽 판본 근거의 상태와 열린 재검토 요청. 같은 문장을 오른쪽 판본에서 찾아 작가가 위치를 고른다. */
function AnchorReview({ workId, chapterId, leftId, rightId }: { workId: string; chapterId: string; leftId: string; rightId: string }) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const left = workspace.versions[leftId]!;
  const right = workspace.versions[rightId]!;
  const olderIds = new Set(versionsOf(workspace, chapterId).filter((version) => version.versionOrdinal < right.versionOrdinal).map((version) => version.id));
  const anchors = anchorsOfVersion(workspace, leftId);
  const requests = Object.values(workspace.reviewRequests).filter(
    (request) => request.workId === workId && request.status !== 'resolved' && olderIds.has(workspace.anchors[request.evidenceId]?.versionId ?? ''),
  );
  if (anchors.length === 0 && requests.length === 0) return null;

  const resolveAll = (evidenceId: string) => {
    for (const request of requests.filter((item) => item.evidenceId === evidenceId)) store.setReviewRequestStatus(workId, request.id, 'resolved');
  };

  return (
    <Panel title={`이전 판본 근거 재검토 ${requests.length}건`}>
      <LiveStatus message={message} />
      {error && <ErrorBanner title="처리하지 못했습니다" message={error} />}
      <p className="hint">
        판본 v{left.versionOrdinal}의 근거 {anchors.length}건 중{' '}
        {anchors.filter((anchor) => anchor.anchorHealth !== 'ok').length}건이 확인을 기다립니다. 승인 상태는 바뀌지 않았습니다.
      </p>
      {requests.length === 0 ? (
        <p className="hint">열린 재검토 요청이 없습니다.</p>
      ) : (
        <ul className="request-list">
          {[...new Set(requests.map((request) => request.evidenceId))].map((evidenceId) => {
            const anchor = workspace.anchors[evidenceId];
            if (!anchor) return null;
            const related = requests.filter((request) => request.evidenceId === evidenceId);
            const hits = findAllCp(right.normalizedText, anchor.exactQuote, 6);
            return (
              <li key={evidenceId} className="request-item">
                <p className="quote-line">&ldquo;{anchor.exactQuote}&rdquo;</p>
                <p className="badge-row">
                  <Badge tier="warning">{ANCHOR_HEALTH_LABELS[anchor.anchorHealth]}</Badge>
                  <span className="hint">
                    {REVIEW_REQUEST_CAUSE_LABELS[related[0]!.cause]} · 판본 v{workspace.versions[anchor.versionId]?.versionOrdinal}
                  </span>
                </p>
                <ul className="assertion-mini-list">
                  {related.map((request) => {
                    const assertion = workspace.assertions[request.assertionId];
                    return assertion ? (
                      <li key={request.id}>
                        {entityName(workspace, assertion.subjectEntityId)} · {attributeLabel(workspace, assertion.attributeDefId)} = {assertion.value}
                      </li>
                    ) : null;
                  })}
                </ul>
                {hits.length === 0 ? (
                  <p className="hint">판본 v{right.versionOrdinal}에서 같은 문장을 찾지 못했습니다.</p>
                ) : (
                  <div className="hit-choices">
                    <p className="hint">
                      판본 v{right.versionOrdinal}에서 같은 문장 {hits.length >= 6 ? '6곳 이상' : `${hits.length}곳`}을 찾았습니다. 옮길 위치를 고르세요.
                    </p>
                    {hits.slice(0, 5).map((hit) => (
                      <button
                        key={hit.startCp}
                        type="button"
                        className="button-secondary hit-choice"
                        onClick={async () => {
                          const result = await store.reanchor(workId, evidenceId, rightId, hit.startCp, hit.endCp);
                          if (!result.ok) setError(result.error.message);
                          else {
                            setError(null);
                            setMessage('근거를 새 판본 위치로 옮겼습니다.');
                          }
                        }}
                      >
                        <span className="hit-context">
                          …{cpSlice(right.normalizedText, Math.max(0, hit.startCp - 12), hit.startCp)}
                          <strong>{anchor.exactQuote.length > 30 ? `${anchor.exactQuote.slice(0, 30)}…` : anchor.exactQuote}</strong>
                          {cpSlice(right.normalizedText, hit.endCp, hit.endCp + 12)}…
                        </span>
                        <span className="sr-only">이 위치로 근거 옮기기</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="row-actions">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      resolveAll(evidenceId);
                      setMessage('이전 판본 근거를 그대로 두었습니다.');
                    }}
                  >
                    이전 판본 근거 유지
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      const result = store.markAnchorLost(workId, evidenceId);
                      if (!result.ok) {
                        setError(result.error.message);
                        return;
                      }
                      resolveAll(evidenceId);
                      setMessage('근거 유실로 표시했습니다.');
                    }}
                  >
                    근거 유실로 표시
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

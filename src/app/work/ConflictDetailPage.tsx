/**
 * 충돌 근거 비교(screen.conflictDetail): 두 진술의 원문 근거를 나란히 보고 작가가 분류한다.
 * '의도된 전개'·'무시'는 지금 근거 쌍에만 적용되고, 근거나 값이 바뀌면 다시 열린다.
 */
import { useState } from 'react';
import { CONFLICT_STATUS_LABELS, formatDateTime } from '../../domain/labels';
import { attributeLabel, chapterLabel, entityName, storyTimeText } from '../../domain/selectors';
import type { Assertion, ConflictStatus } from '../../domain/types';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useServices, useWorkspace } from '../context';
import { AssertionBadges, ConflictBadge, ErrorBanner, LiveStatus, PageHeader, Panel, SplitPanes, TextAreaField } from '../ui/primitives';

export function ConflictDetailPage({ params }: PageProps) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const workId = params.workId!;
  const conflict = workspace.conflicts[params.conflictId!]!;
  const left = workspace.assertions[conflict.leftAssertionId];
  const right = workspace.assertions[conflict.rightAssertionId];
  const [reason, setReason] = useState(conflict.decisionReason ?? '');
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const open = conflict.status === 'open' || conflict.status === 'reopened';

  const classify = (status: ConflictStatus) => {
    const result = store.classifyConflict(workId, conflict.id, status, reason || null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setAnnounce(`「${CONFLICT_STATUS_LABELS[status]}」(으)로 분류했습니다.`);
  };

  return (
    <div className="page page-wide">
      <PageHeader
        title={`${entityName(workspace, left?.subjectEntityId)} · ${attributeLabel(workspace, conflict.attributeDefId)} 충돌`}
        meta={
          <span className="badge-row">
            <ConflictBadge status={conflict.status} />
            <span className="hint num">갱신 {formatDateTime(conflict.updatedAt)}</span>
          </span>
        }
        description={conflict.reason}
        actions={
          <Link to={pathFor('page.conflicts', { workId })} className="button-secondary">
            충돌 후보 목록
          </Link>
        }
      />
      <LiveStatus message={announce} />
      {conflict.status === 'reopened' && (
        <div className="banner banner-warning">
          <p>이전에 분류했지만 근거나 값이 바뀌어 다시 열렸습니다. 새 근거를 확인하세요.</p>
        </div>
      )}
      <SplitPanes labels={['먼저 기록된 진술', '나중 기록된 진술']} variant="even">
        <AssertionSide workId={workId} assertion={left} title="먼저 기록된 진술" />
        <AssertionSide workId={workId} assertion={right} title="나중 기록된 진술" />
      </SplitPanes>
      <Panel title="분류">
        {error && <ErrorBanner title="분류하지 못했습니다" message={error} />}
        <TextAreaField label="결정 사유" value={reason} onChange={setReason} rows={3} hint="예: 3장에서 기억을 잃은 설정이라 의도된 변화. 사유는 내보내기 파일에 함께 남습니다." />
        <div className="decision-actions">
          {open ? (
            <>
              <button type="button" className="button-primary" onClick={() => classify('intentional')}>
                의도된 전개로 표시
              </button>
              <button type="button" className="button-secondary" onClick={() => classify('dismissed')}>
                무시
              </button>
            </>
          ) : (
            <button type="button" className="button-secondary" onClick={() => classify('open')}>
              다시 열기
            </button>
          )}
        </div>
        <p className="hint">한쪽 진술이 틀렸다면 설정 항목 화면에서 그 진술을 기각하거나 확정 취소하세요. 그러면 충돌 후보도 사라집니다.</p>
      </Panel>
    </div>
  );
}

function AssertionSide({ workId, assertion, title }: { workId: string; assertion: Assertion | undefined; title: string }) {
  const workspace = useWorkspace();
  if (!assertion) return <Panel title={title}>{<p className="hint">진술을 찾을 수 없습니다.</p>}</Panel>;
  return (
    <Panel title={title}>
      <p className="assertion-value">{assertion.value}</p>
      <p className="badge-row">
        <AssertionBadges assertion={assertion} />
      </p>
      <p className="hint">{storyTimeText(assertion)}</p>
      <ul className="evidence-blocks">
        {assertion.evidenceIds.map((evidenceId) => {
          const anchor = workspace.anchors[evidenceId];
          const version = anchor ? workspace.versions[anchor.versionId] : undefined;
          const chapter = version ? workspace.chapters[version.chapterId] : undefined;
          if (!anchor || !version || !chapter) return null;
          return (
            <li key={evidenceId}>
              <Link to={`${pathFor('page.version', { workId, chapterId: chapter.id, versionId: version.id })}?anchor=${anchor.id}`}>
                {chapterLabel(chapter)} 판본 v{version.versionOrdinal}
              </Link>
              <blockquote className="flat-reader-surface quote-box">
                <span className="quote-context-text">{anchor.prefixContext}</span>
                <mark className="reader-mark is-active">{anchor.exactQuote}</mark>
                <span className="quote-context-text">{anchor.suffixContext}</span>
              </blockquote>
            </li>
          );
        })}
      </ul>
      <p>
        <Link to={pathFor('page.wikiDetail', { workId, entityId: assertion.subjectEntityId })}>설정 항목에서 이 진술 관리</Link>
      </p>
    </Panel>
  );
}

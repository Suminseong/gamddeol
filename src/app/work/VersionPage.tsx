/**
 * 원고 판본 보기(screen.version): 불변 판본 읽기 + 근거·메모 검사 영역.
 * 본문에서 구간을 고르면 '원문 근거로 연결'로 진술을 만들거나 기존 진술에 근거를 더한다.
 * 주소의 ?hl=시작-끝(코드포인트)은 검색 결과 위치, ?anchor=는 근거 위치를 강조한다. 검색어·본문은 주소에 넣지 않는다.
 */
import { useMemo, useState, useSyncExternalStore } from 'react';
import { ANCHOR_HEALTH_LABELS, formatDateTime, SOURCE_TYPE_LABELS } from '../../domain/labels';
import {
  anchorsOfVersion,
  assertionsUsingAnchor,
  attributeLabel,
  chapterLabel,
  entityName,
  versionsOf,
} from '../../domain/selectors';
import { cpLength } from '../../domain/text';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useQuery, useServices, useWorkspace } from '../context';
import { ManuscriptReader, type ReaderMark, type ReaderSelection } from '../ui/reader';
import { AssertionBadges, Badge, CopyButton, PageHeader, Panel, SplitPanes } from '../ui/primitives';
import { AiPanelsSection } from './AiPanels';
import { AssertionForm, AttachEvidenceForm } from './AssertionForm';
import { NotesPanel } from './ChapterPage';

function parseRange(value: string | null, max: number): { startCp: number; endCp: number } | null {
  if (!value) return null;
  const match = /^(\d+)-(\d+)$/.exec(value);
  if (!match) return null;
  const startCp = Number(match[1]);
  const endCp = Number(match[2]);
  return endCp > startCp && endCp <= max ? { startCp, endCp } : null;
}

export function VersionPage({ params }: PageProps) {
  const { prefs } = useServices();
  const workspace = useWorkspace();
  const query = useQuery();
  const workId = params.workId!;
  const chapterId = params.chapterId!;
  const versionId = params.versionId!;
  const chapter = workspace.chapters[chapterId]!;
  const version = workspace.versions[versionId]!;
  const versions = versionsOf(workspace, chapterId);
  const isCurrent = chapter.currentVersionId === versionId;
  const previous = versions.find((item) => item.versionOrdinal === version.versionOrdinal - 1);
  const readerFont = useSyncExternalStore(prefs.subscribe, () => prefs.get().readerFont, () => prefs.get().readerFont);
  const anchors = anchorsOfVersion(workspace, versionId);
  const length = useMemo(() => cpLength(version.normalizedText), [version.normalizedText]);
  const highlight = parseRange(query.get('hl'), length);
  const anchorParam = query.get('anchor');
  const [activeAnchor, setActiveAnchor] = useState<string | null>(anchorParam && workspace.anchors[anchorParam]?.versionId === versionId ? anchorParam : null);
  const [focusMark, setFocusMark] = useState<string | null>(highlight ? 'search' : activeAnchor);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [linkMode, setLinkMode] = useState<'new' | 'attach'>('new');
  const [saved, setSaved] = useState(false);

  const marks: ReaderMark[] = useMemo(() => {
    const list: ReaderMark[] = anchors.map((anchor) => ({
      id: anchor.id,
      startCp: anchor.startCp,
      endCp: anchor.endCp,
      tone: assertionsUsingAnchor(workspace, anchor.id).some((assertion) => assertion.approvalStatus === 'candidate') ? 'candidate' : 'anchor',
    }));
    if (highlight) list.push({ id: 'search', startCp: highlight.startCp, endCp: highlight.endCp, tone: 'search' });
    return list;
  }, [anchors, highlight, workspace]);

  const showAnchor = (anchorId: string) => {
    setActiveAnchor(anchorId);
    setFocusMark(null);
    window.setTimeout(() => setFocusMark(anchorId), 0);
  };

  const reader = (
    <div className="reader-wrap" data-reader-font={readerFont}>
      <ManuscriptReader
        text={version.normalizedText}
        marks={marks}
        label={`${chapterLabel(chapter)} 판본 v${version.versionOrdinal} 본문`}
        activeMarkId={activeAnchor}
        focusMarkId={focusMark}
        onSelect={(next) => {
          setSelection(next);
          setSaved(false);
        }}
      />
    </div>
  );

  const inspector = (
    <div className="inspector">
      <Panel title="원문 근거로 연결">
        {saved && <p className="hint" role="status">저장했습니다. 아래 근거 목록에 표시됩니다.</p>}
        {!selection ? (
          <p className="hint">본문에서 근거로 쓸 문장을 드래그(또는 Shift+방향키)로 고르면 여기에서 진술과 연결할 수 있습니다.</p>
        ) : (
          <>
            <div className="segmented" role="radiogroup" aria-label="연결 방식">
              {(['new', 'attach'] as const).map((value) => (
                <label key={value} className={linkMode === value ? 'segment is-active' : 'segment'}>
                  <input type="radio" name="link-mode" checked={linkMode === value} onChange={() => setLinkMode(value)} />
                  {value === 'new' ? '새 진술' : '기존 진술에 더하기'}
                </label>
              ))}
            </div>
            {linkMode === 'new' ? (
              <AssertionForm
                key={`${selection.startCp}-${selection.endCp}`}
                workId={workId}
                evidence={{ versionId, ...selection }}
                onDone={() => {
                  setSelection(null);
                  setSaved(true);
                }}
              />
            ) : (
              <AttachEvidenceForm
                workId={workId}
                evidence={{ versionId, ...selection }}
                onDone={() => {
                  setSelection(null);
                  setSaved(true);
                }}
              />
            )}
          </>
        )}
      </Panel>
      <Panel title={`이 판본의 근거 ${anchors.length}건`}>
        {anchors.length === 0 ? (
          <p className="hint">아직 이 판본에 걸린 근거가 없습니다.</p>
        ) : (
          <ul className="anchor-list">
            {anchors.map((anchor) => {
              const used = assertionsUsingAnchor(workspace, anchor.id);
              return (
                <li key={anchor.id} className={activeAnchor === anchor.id ? 'anchor-item is-active' : 'anchor-item'}>
                  <p className="quote-line">
                    &ldquo;{anchor.exactQuote.length > 80 ? `${anchor.exactQuote.slice(0, 80)}…` : anchor.exactQuote}&rdquo;
                  </p>
                  <p className="badge-row">
                    <Badge tier={anchor.anchorHealth === 'ok' ? 'neutral' : 'warning'}>{ANCHOR_HEALTH_LABELS[anchor.anchorHealth]}</Badge>
                    <button type="button" className="button-link" onClick={() => showAnchor(anchor.id)}>
                      본문에서 보기
                    </button>
                  </p>
                  {used.length > 0 && (
                    <ul className="assertion-mini-list">
                      {used.map((assertion) => (
                        <li key={assertion.id}>
                          <AssertionBadges assertion={assertion} />
                          <Link to={pathFor('page.wikiDetail', { workId, entityId: assertion.subjectEntityId })}>
                            {entityName(workspace, assertion.subjectEntityId)} · {attributeLabel(workspace, assertion.attributeDefId)}
                          </Link>
                          <span> = {assertion.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <NotesPanel workId={workId} chapterId={chapterId} versionId={versionId} />
    </div>
  );

  return (
    <div className="page page-wide">
      <PageHeader
        title={`${chapterLabel(chapter)} · 판본 v${version.versionOrdinal}`}
        meta={
          <span className="badge-row">
            <Badge tier="accent">불변 판본 v{version.versionOrdinal}</Badge>
            {isCurrent ? <Badge tier="canon">현재 판본</Badge> : <Badge tier="neutral">이전 판본</Badge>}
            <Badge tier="neutral">{SOURCE_TYPE_LABELS[version.sourceType]}</Badge>
            <span className="hint num">{formatDateTime(version.createdAt)}</span>
          </span>
        }
        actions={
          <>
            <div className="segmented" role="radiogroup" aria-label="본문 글꼴">
              {(['serif', 'sans'] as const).map((font) => (
                <label key={font} className={readerFont === font ? 'segment is-active' : 'segment'}>
                  <input type="radio" name="reader-font" checked={readerFont === font} onChange={() => prefs.setReaderFont(font)} />
                  {font === 'serif' ? '명조' : '고딕'}
                </label>
              ))}
            </div>
            {previous && (
              <Link to={`${pathFor('page.compare', { workId, chapterId })}?left=${previous.id}&right=${versionId}`} className="button-secondary">
                이전 판본과 비교
              </Link>
            )}
            <Link to={pathFor('page.chapter', { workId, chapterId })} className="button-secondary">
              회차 상세
            </Link>
          </>
        }
      />
      {!isCurrent && chapter.currentVersionId && (
        <div className="banner banner-info">
          <p>이전 판본을 보고 있습니다. 이 판본은 바뀌지 않으며, 여기서 만든 근거는 이 판본 위치를 가리킵니다.</p>
          <Link to={pathFor('page.version', { workId, chapterId, versionId: chapter.currentVersionId })}>현재 판본으로 이동</Link>
        </div>
      )}
      <dl className="hash-list">
        <div>
          <dt>정규화 본문 SHA-256</dt>
          <dd>
            <code className="hash">{version.normalizedSha256}</code>
            <CopyButton value={version.normalizedSha256} label="해시 복사" />
          </dd>
        </div>
        <div>
          <dt>원본 SHA-256</dt>
          <dd>
            <code className="hash">{version.rawContentSha256}</code>
          </dd>
        </div>
        <div>
          <dt>정규화 규칙·인코딩</dt>
          <dd>
            {version.normalizerVersion} · {version.encoding}
            {version.sourceFileName ? ` · ${version.sourceFileName}` : ''}
          </dd>
        </div>
      </dl>
      <SplitPanes labels={['원문', '근거·메모']}>
        {reader}
        {inspector}
      </SplitPanes>
      <AiPanelsSection workId={workId} versionId={versionId} />
    </div>
  );
}

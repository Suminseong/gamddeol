/** 회차 상세(screen.chapter): 회차 정보 수정, 불변 판본 이력(두 개 골라 비교), 작가 메모. */
import { useState } from 'react';
import { CHAPTER_STATUS_LABELS, formatDateTime, SOURCE_TYPE_LABELS, shortHash } from '../../domain/labels';
import { chapterLabel, notesOf, versionsOf } from '../../domain/selectors';
import type { ChapterDraftStatus } from '../../domain/types';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useCommandId, useNavigate, useServices, useUnsavedGuard, useWorkspace } from '../context';
import { ActionBar, Badge, ErrorBanner, LiveStatus, PageHeader, Panel, SelectField, TextAreaField, TextField } from '../ui/primitives';

const STATUS_OPTIONS = (Object.keys(CHAPTER_STATUS_LABELS) as ChapterDraftStatus[]).map((value) => ({ value, label: CHAPTER_STATUS_LABELS[value] }));

export function ChapterPage({ params }: PageProps) {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const workId = params.workId!;
  const chapterId = params.chapterId!;
  const chapter = workspace.chapters[chapterId]!;
  const versions = versionsOf(workspace, chapterId);
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (versionId: string, on: boolean) =>
    setPicked((list) => (on ? [...list.filter((id) => id !== versionId), versionId].slice(-2) : list.filter((id) => id !== versionId)));

  const compare = () => {
    const [a, b] = picked
      .map((id) => workspace.versions[id]!)
      .sort((x, y) => x.versionOrdinal - y.versionOrdinal);
    if (a && b) navigate(`${pathFor('page.compare', { workId, chapterId })}?left=${a.id}&right=${b.id}`);
  };

  return (
    <div className="page">
      <PageHeader
        title={chapterLabel(chapter)}
        meta={
          <span className="badge-row">
            <Badge tier="neutral">{CHAPTER_STATUS_LABELS[chapter.draftStatus]}</Badge>
            <span className="hint num">판본 {versions.length}개</span>
          </span>
        }
        actions={
          <Link to={`${pathFor('page.import', { workId })}?chapterId=${chapterId}`} className="neu-cta-button button-cta">
            새 판본 올리기
          </Link>
        }
      />
      <div className="two-col">
        <div className="col-main">
          <Panel
            title="판본 이력"
            actions={
              <button type="button" className="button-secondary" disabled={picked.length !== 2} onClick={compare}>
                고른 두 판본 비교
              </button>
            }
          >
            <p className="hint">판본은 등록 뒤 바뀌지 않습니다. 비교하려면 판본 두 개를 고르세요.</p>
            <ol className="version-list" reversed>
              {[...versions].reverse().map((version) => {
                const isCurrent = version.id === chapter.currentVersionId;
                const notes = notesOf(workspace, chapterId).filter((note) => note.versionId === version.id).length;
                return (
                  <li key={version.id} className="version-row">
                    <input
                      type="checkbox"
                      className="checkbox"
                      aria-label={`판본 v${version.versionOrdinal} 비교 대상으로 고르기`}
                      checked={picked.includes(version.id)}
                      onChange={(event) => toggle(version.id, event.target.checked)}
                    />
                    <div className="version-main">
                      <Link to={pathFor('page.version', { workId, chapterId, versionId: version.id })} className="chapter-title">
                        판본 v{version.versionOrdinal}
                      </Link>
                      <span className="badge-row">
                        {isCurrent && <Badge tier="accent">현재 판본</Badge>}
                        <Badge tier="neutral">{SOURCE_TYPE_LABELS[version.sourceType]}</Badge>
                        <span className="hint num">{formatDateTime(version.createdAt)}</span>
                        <span className="hint num">{version.normalizedText.length.toLocaleString('ko-KR')}자</span>
                        <span className="hint num hash">SHA-256 {shortHash(version.normalizedSha256, 12)}…</span>
                        {notes > 0 && <span className="hint">메모 {notes}</span>}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Panel>
          <ChapterMetaForm key={chapter.id} workId={workId} chapterId={chapterId} />
        </div>
        <aside className="col-side" aria-label="작가 메모">
          <NotesPanel workId={workId} chapterId={chapterId} versionId={null} />
        </aside>
      </div>
    </div>
  );
}

function ChapterMetaForm({ workId, chapterId }: { workId: string; chapterId: string }) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const chapter = workspace.chapters[chapterId]!;
  const [displayNumber, setDisplayNumber] = useState(chapter.displayNumber);
  const [title, setTitle] = useState(chapter.title ?? '');
  const [status, setStatus] = useState<ChapterDraftStatus>(chapter.draftStatus);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [saved, setSaved] = useState('');
  const dirty = displayNumber !== chapter.displayNumber || title !== (chapter.title ?? '') || status !== chapter.draftStatus;
  useUnsavedGuard(dirty, '회차 정보를 저장하지 않았습니다.');

  return (
    <Panel title="회차 정보">
      <LiveStatus message={saved} />
      <form
        className="form-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const result = store.updateChapter(workId, chapterId, { displayNumber, title: title || null, draftStatus: status });
          if (!result.ok) setError({ field: result.error.field, message: result.error.message });
          else {
            setError(null);
            setSaved('회차 정보를 저장했습니다.');
          }
        }}
      >
        {error && !error.field && <ErrorBanner title="저장하지 못했습니다" message={error.message} />}
        <TextField label="회차 번호" required value={displayNumber} onChange={setDisplayNumber} error={error?.field === 'displayNumber' ? error.message : null} hint="정렬 순서와는 별개인 표시용 번호입니다(예: 12, 외전 1)." />
        <TextField label="회차 제목" value={title} onChange={setTitle} />
        <SelectField label="상태" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <ActionBar label="회차 정보 저장">
          <button type="submit" className="button-primary" disabled={!dirty}>
            저장
          </button>
        </ActionBar>
      </form>
    </Panel>
  );
}

export function NotesPanel({ workId, chapterId, versionId }: { workId: string; chapterId: string; versionId: string | null }) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const [body, setBody] = useState('');
  const [commandId, renew] = useCommandId();
  const [error, setError] = useState<string | null>(null);
  useUnsavedGuard(body.trim().length > 0, '작성 중인 메모가 있습니다.');
  const notes = notesOf(workspace, chapterId).filter((note) => versionId === null || note.versionId === versionId || note.versionId === null);

  return (
    <Panel title="작가 메모">
      <form
        className="form-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const result = store.addNote(workId, chapterId, versionId, body, commandId);
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          setError(null);
          setBody('');
          renew();
        }}
      >
        <TextAreaField label="새 메모" value={body} onChange={setBody} rows={3} error={error} hint={versionId ? '이 판본에 붙는 메모입니다.' : '회차 전체 메모입니다.'} />
        <button type="submit" className="button-secondary" disabled={!body.trim()}>
          메모 추가
        </button>
      </form>
      {notes.length === 0 ? (
        <p className="hint">메모가 없습니다.</p>
      ) : (
        <ul className="note-list">
          {notes.map((note) => {
            const version = note.versionId ? workspace.versions[note.versionId] : undefined;
            return (
              <li key={note.id} className="note">
                <p className="note-body">{note.body}</p>
                <p className="hint num">
                  {version ? `판본 v${version.versionOrdinal}` : '회차 전체'} · {formatDateTime(note.createdAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

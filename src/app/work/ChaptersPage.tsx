/** 원고 및 회차(screen.chapters): 회차 목록, 상태 필터, 순서 변경(끌어 놓기 + 위/아래 버튼). 순서 변경은 정렬 키만 바꾼다. */
import { useState } from 'react';
import { CHAPTER_STATUS_LABELS, formatDateTime } from '../../domain/labels';
import { chapterLabel, chaptersOf } from '../../domain/selectors';
import type { ChapterDraftStatus } from '../../domain/types';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useServices, useWorkspace } from '../context';
import { Badge, EmptyState, ErrorBanner, LiveStatus, PageHeader, SelectField } from '../ui/primitives';

export function ChaptersPage({ params }: PageProps) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const workId = params.workId!;
  const [filter, setFilter] = useState<ChapterDraftStatus | 'all'>('all');
  const [dragging, setDragging] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [error, setError] = useState<string | null>(null);
  const chapters = chaptersOf(workspace, workId);
  const visible = chapters.filter((chapter) => filter === 'all' || chapter.draftStatus === filter);
  const canReorder = filter === 'all';

  const move = (chapterId: string, toIndex: number) => {
    const chapter = workspace.chapters[chapterId];
    const result = store.moveChapter(workId, chapterId, toIndex);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    if (chapter) setAnnounce(`${chapterLabel(chapter)}을(를) ${toIndex + 1}번째로 옮겼습니다.`);
  };

  return (
    <div className="page">
      <PageHeader
        title="원고 및 회차"
        description="회차 순서를 바꿔도 판본 본문과 근거는 바뀌지 않습니다."
        actions={
          <Link to={pathFor('page.import', { workId })} className="neu-cta-button button-cta">
            회차 업로드
          </Link>
        }
      />
      <LiveStatus message={announce} />
      {error && <ErrorBanner title="순서를 바꾸지 못했습니다" message={error} />}
      {chapters.length > 0 && (
        <div className="filter-toolbar">
          <SelectField
            label="상태"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: '전체' },
              ...(Object.keys(CHAPTER_STATUS_LABELS) as ChapterDraftStatus[]).map((value) => ({ value, label: CHAPTER_STATUS_LABELS[value] })),
            ]}
          />
          {!canReorder && <p className="hint">순서 변경은 상태 필터가 &lsquo;전체&rsquo;일 때만 할 수 있습니다.</p>}
        </div>
      )}
      {chapters.length === 0 ? (
        <EmptyState
          message="아직 회차가 없습니다. TXT·Markdown 파일을 올리거나 본문을 붙여넣어 첫 회차를 만드세요."
          action={
            <Link to={pathFor('page.import', { workId })} className="button-primary">
              회차 업로드
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState message="이 상태의 회차가 없습니다." />
      ) : (
        <ol className="chapter-list" aria-label="회차 목록">
          {visible.map((chapter) => {
            const index = chapters.indexOf(chapter);
            const current = chapter.currentVersionId ? workspace.versions[chapter.currentVersionId] : undefined;
            return (
              <li
                key={chapter.id}
                className={`chapter-row${dragging === chapter.id ? ' is-dragging' : ''}`}
                draggable={canReorder}
                onDragStart={(event) => {
                  setDragging(chapter.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', chapter.id);
                }}
                onDragEnd={() => setDragging(null)}
                onDragOver={(event) => {
                  if (canReorder && dragging) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging && dragging !== chapter.id) move(dragging, index);
                  setDragging(null);
                }}
              >
                {canReorder && (
                  <span className="drag-handle" aria-hidden="true">
                    ⋮⋮
                  </span>
                )}
                <div className="chapter-main">
                  <Link to={pathFor('page.chapter', { workId, chapterId: chapter.id })} className="chapter-title">
                    {chapterLabel(chapter)}
                  </Link>
                  <span className="badge-row">
                    <Badge tier="neutral">{CHAPTER_STATUS_LABELS[chapter.draftStatus]}</Badge>
                    {current && (
                      <Link to={pathFor('page.version', { workId, chapterId: chapter.id, versionId: current.id })} className="hint">
                        현재 판본 v{current.versionOrdinal} 읽기
                      </Link>
                    )}
                    <span className="hint num">수정 {formatDateTime(chapter.updatedAt)}</span>
                  </span>
                </div>
                {canReorder && (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`${chapterLabel(chapter)} 위로`}
                      disabled={index === 0}
                      onClick={() => move(chapter.id, index - 1)}
                    >
                      <span aria-hidden="true">↑</span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`${chapterLabel(chapter)} 아래로`}
                      disabled={index === chapters.length - 1}
                      onClick={() => move(chapter.id, index + 1)}
                    >
                      <span aria-hidden="true">↓</span>
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

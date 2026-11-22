/** 작품 목록(screen.works): 검색·장르/연재 상태 필터·정렬, 작품 카드, JSON 불러오기. */
import { useMemo, useRef, useState } from 'react';
import { parseWorkExport, RestoreError } from '../../domain/exportFormat';
import { formatDateTime, SERIALIZATION_LABELS } from '../../domain/labels';
import type { SerializationStatus } from '../../domain/types';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useNavigate, useServices, useWorkspace } from '../context';
import { Badge, EmptyState, ErrorBanner, InfoBanner, PageHeader, SelectField, TextField } from '../ui/primitives';
import '../editorial-pages.css';

type Sort = 'updatedAt' | 'title';

export function WorksPage(_: PageProps) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('all');
  const [status, setStatus] = useState<SerializationStatus | 'all'>('all');
  const [sort, setSort] = useState<Sort>('updatedAt');
  const [restoreState, setRestoreState] = useState<{ phase: 'idle' } | { phase: 'busy' } | { phase: 'error'; message: string } | { phase: 'done'; title: string; workId: string }>({ phase: 'idle' });
  const fileRef = useRef<HTMLInputElement>(null);

  const works = Object.values(workspace.works);
  const genres = [...new Set(works.map((work) => work.genre).filter((item): item is string => Boolean(item)))].sort();
  const chapterCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const chapter of Object.values(workspace.chapters)) counts.set(chapter.workId, (counts.get(chapter.workId) ?? 0) + 1);
    return counts;
  }, [workspace.chapters]);

  const visible = works
    .filter((work) => !query.trim() || work.title.includes(query.trim()) || work.tags.some((tag) => tag.includes(query.trim())))
    .filter((work) => genre === 'all' || work.genre === genre)
    .filter((work) => status === 'all' || work.serializationStatus === status)
    .sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title, 'ko') : b.updatedAt.localeCompare(a.updatedAt)));

  const restore = async (file: File) => {
    setRestoreState({ phase: 'busy' });
    try {
      const text = await file.text();
      const parsed = await parseWorkExport(text);
      const result = store.loadWorkSnapshot(parsed.snapshot, parsed.workId, parsed.title);
      if (!result.ok) {
        setRestoreState({ phase: 'error', message: result.error.message });
        return;
      }
      setRestoreState({ phase: 'done', title: parsed.title, workId: parsed.workId });
    } catch (error) {
      setRestoreState({ phase: 'error', message: error instanceof RestoreError ? error.message : '파일을 읽지 못했습니다.' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="page editorial-works">
      <p className="editorial-eyebrow"><span aria-hidden="true">●</span> 나의 작업 공간</p>
      <PageHeader
        title="작품 목록"
        description="작품을 만들거나 내보내 둔 작품 JSON을 불러오세요. 자료는 이 탭 메모리에만 있습니다."
        actions={
          <>
            <Link to="/works/new" className="neu-cta-button button-cta">
              새 작품 만들기
            </Link>
            <label className="button-secondary file-button">
              작품 JSON 불러오기
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="visually-hidden-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void restore(file);
                }}
              />
            </label>
          </>
        }
      />
      {restoreState.phase === 'busy' && <InfoBanner>파일의 무결성 해시와 판본 해시를 확인하는 중입니다…</InfoBanner>}
      {restoreState.phase === 'error' && <ErrorBanner title="불러오지 못했습니다" message={restoreState.message} />}
      {restoreState.phase === 'done' && (
        <InfoBanner>
          「{restoreState.title}」을(를) 불러왔습니다. 해시 검증을 통과했습니다.{' '}
          <Link to={pathFor('page.workHome', { workId: restoreState.workId })}>작품 열기</Link>
        </InfoBanner>
      )}

      {works.length > 0 && (
        <div className="filter-toolbar" role="search">
          <TextField label="작품 검색" type="search" value={query} onChange={setQuery} placeholder="작품명·태그" />
          <SelectField
            label="장르"
            value={genre}
            onChange={setGenre}
            options={[{ value: 'all', label: '전체' }, ...genres.map((item) => ({ value: item, label: item }))]}
          />
          <SelectField
            label="연재 상태"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: '전체' },
              ...(Object.keys(SERIALIZATION_LABELS) as SerializationStatus[]).map((value) => ({ value, label: SERIALIZATION_LABELS[value] })),
            ]}
          />
          <SelectField
            label="정렬"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'updatedAt', label: '최근 수정순' },
              { value: 'title', label: '제목순' },
            ]}
          />
        </div>
      )}

      {works.length === 0 ? (
        <section className="editorial-welcome" aria-labelledby="welcome-title">
          <div className="editorial-welcome-copy">
            <p className="editorial-kicker">WORKSPACE · 01</p>
            <h2 id="welcome-title">아직 작품이 없습니다.</h2>
            <p className="editorial-lead">이야기가 머무를 자리를 만들어 보세요.</p>
            <p>작품을 만들고 원고를 더하면 감평과 설정 관리를 한곳에서 시작할 수 있습니다.</p>
            <button type="button" className="button-primary" onClick={() => navigate('/works/new')}>
              새 작품 만들기
            </button>
            <p className="editorial-memory">이 탭을 닫거나 새로고침하면 자료가 사라집니다. 계속 작업하려면 작품 JSON을 내보낸 뒤 다시 불러오세요.</p>
          </div>
          <div className="editorial-welcome-guide" aria-label="시작 순서">
            <p className="editorial-guide-label">시작하기</p>
            <ol>
              <li><span aria-hidden="true">01</span><div><strong>작품 만들기</strong><small>작품의 이름부터 정하세요.</small></div></li>
              <li><span aria-hidden="true">02</span><div><strong>원고 추가하기</strong><small>텍스트를 붙여 넣거나 파일을 올리세요.</small></div></li>
              <li><span aria-hidden="true">03</span><div><strong>읽고 살펴보기</strong><small>감평과 설정 관리를 시작하세요.</small></div></li>
            </ol>
          </div>
        </section>
      ) : visible.length === 0 ? (
        <EmptyState message="조건에 맞는 작품이 없습니다." />
      ) : (
        <ul className="card-grid editorial-work-grid" aria-label="작품">
          {visible.map((work) => (
            <li key={work.id} className="work-card">
              <span className="editorial-card-mark" aria-hidden="true">W</span>
              <h2 className="card-title">
                <Link to={pathFor('page.workHome', { workId: work.id })}>{work.title}</Link>
              </h2>
              <p className="badge-row">
                <Badge tier="neutral">{SERIALIZATION_LABELS[work.serializationStatus]}</Badge>
                {work.genre && <Badge tier="neutral">{work.genre}</Badge>}
              </p>
              <dl className="meta-list">
                <div>
                  <dt>회차</dt>
                  <dd className="num">{chapterCounts.get(work.id) ?? 0}</dd>
                </div>
                <div>
                  <dt>최종 수정</dt>
                  <dd className="num">{formatDateTime(work.updatedAt)}</dd>
                </div>
              </dl>
              {work.tags.length > 0 && <p className="hint">#{work.tags.join(' #')}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

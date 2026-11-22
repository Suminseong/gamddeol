/** 작품 대시보드(screen.workHome): 핵심 지표 4개, 최근 회차·AI 작업, 바로 가기. */
import { AI_JOB_STATUS_LABELS, AI_JOB_TYPE_LABELS, formatDateTime, formatPercent, SERIALIZATION_LABELS } from '../../domain/labels';
import {
  aiJobsOf,
  candidateCount,
  chapterLabel,
  chaptersOf,
  conflictsOf,
  isOpenConflict,
  openReviewRequests,
  simRunsOf,
} from '../../domain/selectors';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useWorkspace } from '../context';
import { Badge, EmptyState, PageHeader, Panel } from '../ui/primitives';

export function WorkHomePage({ params }: PageProps) {
  const workspace = useWorkspace();
  const workId = params.workId!;
  const work = workspace.works[workId]!;
  const chapters = chaptersOf(workspace, workId);
  const candidates = candidateCount(workspace, workId);
  const openConflicts = conflictsOf(workspace, workId).filter(isOpenConflict).length;
  const reviewRequests = openReviewRequests(workspace, workId).length;
  const latestRun = simRunsOf(workspace, workId).find((run) => run.numericStatus === 'completed');
  const lastStep = latestRun?.steps[latestRun.steps.length - 1];
  const recentChapters = [...chapters].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 5);
  const jobs = aiJobsOf(workspace, workId).slice(0, 5);
  const to = (id: string) => pathFor(id, { workId });

  return (
    <div className="page editorial-dashboard">
      <p className="editorial-eyebrow"><span aria-hidden="true">●</span> 작품 작업실</p>
      <PageHeader
        title={work.title}
        meta={
          <span className="badge-row">
            <Badge tier="neutral">{SERIALIZATION_LABELS[work.serializationStatus]}</Badge>
            {work.genre && <Badge tier="neutral">{work.genre}</Badge>}
            <span className="hint num">최종 수정 {formatDateTime(work.updatedAt)}</span>
          </span>
        }
        description={work.synopsis ?? undefined}
        actions={
          <Link to={to('page.import')} className="neu-cta-button button-cta">
            회차 업로드
          </Link>
        }
      />

      {chapters.length === 0 && (
        <section className="editorial-next-step" aria-labelledby="next-step-title">
          <div>
            <p className="editorial-kicker">YOUR NEXT STEP</p>
            <h2 id="next-step-title">첫 회차를 추가해 보세요</h2>
            <p>원고를 올리면 감평을 받아보고 작품의 설정도 정리할 수 있습니다.</p>
          </div>
          <Link to={to('page.import')} className="button-primary">첫 회차 올리기</Link>
        </section>
      )}

      <section aria-labelledby="kpi-heading">
        <div className="editorial-section-heading">
          <h2 id="kpi-heading">작품 현황</h2>
          <span>한눈에 보기</span>
        </div>
        <ul className="kpi-grid">
          <li className="neu-kpi-card">
            <span className="kpi-label">전체 회차</span>
            <span className="kpi-value num">{chapters.length}</span>
            <Link to={to('page.chapters')} className="kpi-link">
              원고 및 회차
            </Link>
          </li>
          <li className="neu-kpi-card">
            <span className="kpi-label">검토 대기 후보</span>
            <span className="kpi-value num">{candidates}</span>
            <Link to={to('page.reviewQueue')} className="kpi-link">
              AI 후보 검토함
            </Link>
          </li>
          <li className="neu-kpi-card">
            <span className="kpi-label">열린 충돌 후보</span>
            <span className="kpi-value num">{openConflicts}</span>
            <Link to={to('page.conflicts')} className="kpi-link">
              충돌 후보
            </Link>
          </li>
          <li className="neu-kpi-card">
            <span className="kpi-label">최근 가상 연독률</span>
            <span className="kpi-value num">{lastStep ? formatPercent(lastStep.consecutiveReadRate) : '없음'}</span>
            <span className="kpi-note">가상 시뮬레이션 · 실제 독자 지표 아님</span>
            <Link to={to('page.simRuns')} className="kpi-link">
              가상 연재 기록
            </Link>
          </li>
        </ul>
      </section>

      {reviewRequests > 0 && (
        <div className="banner banner-warning">
          <p className="banner-title">원고 새 판본 때문에 다시 확인할 근거가 {reviewRequests}건 있습니다.</p>
          <p>승인 상태는 바뀌지 않았습니다. 판본 비교나 검토함에서 근거 위치를 확인하세요.</p>
          <Link to={to('page.reviewQueue')}>재검토 요청 보기</Link>
        </div>
      )}

      <div className="dashboard-grid editorial-dashboard-grid">
        <Panel title="최근 수정한 회차" className="editorial-recent-chapters">
          {recentChapters.length === 0 ? (
            <EmptyState
              message="아직 회차가 없습니다."
              action={
                <Link to={to('page.import')} className="button-primary">
                  첫 회차 올리기
                </Link>
              }
            />
          ) : (
            <ul className="row-list">
              {recentChapters.map((chapter) => (
                <li key={chapter.id}>
                  <Link to={pathFor('page.chapter', { workId, chapterId: chapter.id })}>{chapterLabel(chapter)}</Link>
                  <span className="hint num">{formatDateTime(chapter.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="최근 AI 작업" className="editorial-recent-jobs">
          {jobs.length === 0 ? (
            <EmptyState message="이 작품에서 실행한 AI 작업이 없습니다. 판본 화면에서 감평이나 설정 후보 추출을 실행할 수 있습니다." />
          ) : (
            <ul className="row-list">
              {jobs.map((job) => (
                <li key={job.id}>
                  <span>
                    {AI_JOB_TYPE_LABELS[job.jobType]} · {AI_JOB_STATUS_LABELS[job.status]}
                    {job.summary ? ` · ${job.summary}` : ''}
                  </span>
                  <span className="hint num">{formatDateTime(job.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="panel-foot">
            <Link to="/settings/usage">사용량 전체 보기</Link>
          </p>
        </Panel>
        <Panel title="바로 가기" className="editorial-shortcuts">
          <ul className="quick-actions">
            <li>
              <Link to={to('page.import')} className="button-secondary">
                회차 업로드
              </Link>
            </li>
            <li>
              <Link to={to('page.wikiNew')} className="button-secondary">
                설정 항목 추가
              </Link>
            </li>
            <li>
              <Link to={to('page.simNew')} className="button-secondary">
                가상 연재 실행
              </Link>
            </li>
            <li>
              <Link to={to('page.export')} className="button-secondary">
                작품 JSON 내보내기
              </Link>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

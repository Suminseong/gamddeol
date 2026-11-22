/** 가상 연재 기록(screen.simRuns): 실행 목록(시드·커널 버전·입력 해시 포함). 가상 수치이며 실제 독자 지표가 아니다. */
import { formatDateTime, formatPercent, shortHash } from '../../domain/labels';
import { simRunsOf } from '../../domain/selectors';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useWorkspace } from '../context';
import { Badge, EmptyState, PageHeader, SyntheticNotice } from '../ui/primitives';

export function SimRunsPage({ params }: PageProps) {
  const workspace = useWorkspace();
  const workId = params.workId!;
  const runs = simRunsOf(workspace, workId);

  return (
    <div className="page">
      <PageHeader
        title="가상 연재 기록"
        description="회차 태그와 가상 독자 성향으로 계산한 결정적(같은 입력이면 같은 결과) 가상 실험 기록입니다."
        actions={
          <Link to={pathFor('page.simNew', { workId })} className="neu-cta-button button-cta">
            가상 연재 실행
          </Link>
        }
      />
      <SyntheticNotice />
      {runs.length === 0 ? (
        <EmptyState
          message="아직 실행 기록이 없습니다."
          action={
            <Link to={pathFor('page.simNew', { workId })} className="button-primary">
              첫 가상 연재 실행
            </Link>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">가상 연재 실행 기록</caption>
            <thead>
              <tr>
                <th scope="col">실행 시각</th>
                <th scope="col">회차 수</th>
                <th scope="col">마지막 누적 잔존률</th>
                <th scope="col">마지막 연독률</th>
                <th scope="col">시드</th>
                <th scope="col">커널</th>
                <th scope="col">입력 해시</th>
                <th scope="col">상태</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const last = run.steps[run.steps.length - 1];
                return (
                  <tr key={run.id}>
                    <th scope="row">
                      <Link to={pathFor('page.simDetail', { workId, runId: run.id })}>{formatDateTime(run.createdAt)}</Link>
                    </th>
                    <td className="num">{run.orderedVersionIds.length}</td>
                    <td className="num">{last ? formatPercent(last.cumulativeRetention) : '—'}</td>
                    <td className="num">{last ? formatPercent(last.consecutiveReadRate) : '—'}</td>
                    <td>
                      <code>{run.seed}</code>
                    </td>
                    <td>
                      <code>{run.kernelVersion}</code>
                    </td>
                    <td>
                      <code className="hash">{shortHash(run.inputSnapshotHash, 10)}</code>
                    </td>
                    <td>
                      {run.numericStatus === 'completed' ? <Badge tier="neutral">계산 완료</Badge> : <Badge tier="danger">계산 실패</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

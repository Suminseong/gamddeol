/** AI 작업 사용량(screen.usage): 작업 종류·상태로 거르기, 합계(토큰), 작업 표, 실행 중 작업 취소. 비용(원화) 환산은 하지 않는다. */
import { useState } from 'react';
import { parseErrorCode } from '../../ai/aiRunner';
import { AI_JOB_STATUS_LABELS, AI_JOB_TYPE_LABELS, formatDateTime } from '../../domain/labels';
import { aiJobsOf } from '../../domain/selectors';
import type { AiJobStatus, AiJobType } from '../../domain/types';
import { copy } from '../copy';
import type { PageProps } from '../App';
import { useServices, useWorkspace } from '../context';
import { Badge, EmptyState, PageHeader, Panel, SelectField } from '../ui/primitives';
import { SettingsLayout } from './SettingsNav';

export function UsagePage(_: PageProps) {
  const { aiRunner } = useServices();
  const workspace = useWorkspace();
  const [type, setType] = useState<AiJobType | 'all'>('all');
  const [status, setStatus] = useState<AiJobStatus | 'all'>('all');
  const jobs = aiJobsOf(workspace, null)
    .filter((job) => type === 'all' || job.jobType === type)
    .filter((job) => status === 'all' || job.status === status);
  const usage = Object.values(workspace.aiUsage).filter((item) => jobs.some((job) => job.id === item.jobId));
  const sum = (pick: (item: (typeof usage)[number]) => number | null) => usage.reduce((total, item) => total + (pick(item) ?? 0), 0);

  return (
    <div className="page">
      <PageHeader title="AI 작업 사용량" description="이 탭에서 실행한 작품 AI 작업의 기록입니다. 원고 본문과 키는 기록하지 않습니다. 빠른 감평 화면의 요청은 여기에 남지 않습니다." />
      <SettingsLayout>
        <div className="filter-toolbar">
          <SelectField
            label="작업 종류"
            value={type}
            onChange={setType}
            options={[{ value: 'all', label: '전체' }, ...(Object.keys(AI_JOB_TYPE_LABELS) as AiJobType[]).map((value) => ({ value, label: AI_JOB_TYPE_LABELS[value] }))]}
          />
          <SelectField
            label="상태"
            value={status}
            onChange={setStatus}
            options={[{ value: 'all', label: '전체' }, ...(Object.keys(AI_JOB_STATUS_LABELS) as AiJobStatus[]).map((value) => ({ value, label: AI_JOB_STATUS_LABELS[value] }))]}
          />
        </div>
        <ul className="kpi-grid kpi-grid-3">
          <li className="neu-kpi-card">
            <span className="kpi-label">작업 수</span>
            <span className="kpi-value num">{jobs.length}</span>
          </li>
          <li className="neu-kpi-card">
            <span className="kpi-label">입력 토큰</span>
            <span className="kpi-value num">{sum((item) => item.inputTokens).toLocaleString('ko-KR')}</span>
          </li>
          <li className="neu-kpi-card">
            <span className="kpi-label">출력 토큰</span>
            <span className="kpi-value num">{sum((item) => item.outputTokens).toLocaleString('ko-KR')}</span>
          </li>
        </ul>
        <p className="hint">요금 환산은 하지 않습니다(가격표 미연결). 정확한 비용은 OpenAI 대시보드에서 확인하세요.</p>
        <Panel title="작업 목록">
          {jobs.length === 0 ? (
            <EmptyState message="기록된 AI 작업이 없습니다." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">시각</th>
                    <th scope="col">작품</th>
                    <th scope="col">종류</th>
                    <th scope="col">상태</th>
                    <th scope="col">시도</th>
                    <th scope="col">토큰 (입력/출력)</th>
                    <th scope="col">결과·오류</th>
                    <th scope="col">
                      <span className="sr-only">작업</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const record = Object.values(workspace.aiUsage).find((item) => item.jobId === job.id);
                    const error = job.errorCode ? copy.errors[parseErrorCode(job.errorCode).kind] ?? copy.errors.unexpected : null;
                    return (
                      <tr key={job.id}>
                        <td className="num">{formatDateTime(job.createdAt)}</td>
                        <td>{job.workId ? workspace.works[job.workId]?.title ?? '닫힌 작품' : '—'}</td>
                        <td>{AI_JOB_TYPE_LABELS[job.jobType]}</td>
                        <td>
                          <Badge tier={job.status === 'completed' ? 'canon' : job.status === 'running' ? 'accent' : job.status === 'failed' ? 'danger' : 'neutral'}>
                            {AI_JOB_STATUS_LABELS[job.status]}
                          </Badge>
                        </td>
                        <td className="num">{job.attemptCount}</td>
                        <td className="num">
                          {record?.inputTokens ?? '—'} / {record?.outputTokens ?? '—'}
                        </td>
                        <td>{error ? error.title : job.summary ?? '—'}</td>
                        <td>
                          {job.status === 'running' && aiRunner.isCancellable(job.id) && (
                            <button type="button" className="button-secondary button-small" onClick={() => aiRunner.cancel(job.id)}>
                              취소
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </SettingsLayout>
    </div>
  );
}

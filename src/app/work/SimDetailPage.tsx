/**
 * 가상 연재 결과(screen.simDetail): 지표, 회차별 선 그래프(점 선택, 분모 0이면 계산 불가 표시), 단계 표, 입력 스냅샷.
 * '같은 입력으로 다시 계산'은 저장하지 않고 수치가 같은지만 확인한다(결정적 커널 검증).
 */
import { useState } from 'react';
import { formatCount, formatDateTime, formatPercent } from '../../domain/labels';
import type { SimulationRun, SimulationStep } from '../../domain/types';
import { TAG_KEYS } from '../../domain/types';
import { buildSimulationRun, sameNumbers } from '../../sim/buildRun';
import { TAG_LABELS } from '../../sim/kernel';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useServices, useWorkspace } from '../context';
import { Badge, CopyButton, ErrorBanner, InfoBanner, PageHeader, Panel, SyntheticNotice } from '../ui/primitives';

type Measure = 'cumulativeRetention' | 'consecutiveReadRate';
const MEASURE_LABELS: Record<Measure, string> = { cumulativeRetention: '누적 잔존률', consecutiveReadRate: '연독률(직전 회차 대비)' };

export function SimDetailPage({ params }: PageProps) {
  const { newId } = useServices();
  const workspace = useWorkspace();
  const workId = params.workId!;
  const run = workspace.simRuns[params.runId!]!;
  const [measure, setMeasure] = useState<Measure>('cumulativeRetention');
  const [selected, setSelected] = useState<number>(Math.max(0, run.steps.length - 1));
  const [verify, setVerify] = useState<{ same: boolean; hash: boolean } | 'error' | null>(null);
  const last = run.steps[run.steps.length - 1];
  const nullSteps = run.steps.filter((step) => step[measure] === null);

  const recompute = async () => {
    try {
      const again = await buildSimulationRun(
        workspace,
        { workId, orderedVersionIds: run.orderedVersionIds, tagSnapshotIds: run.chapterTagSnapshotIds, seed: run.seed },
        { newId, now: () => new Date().toISOString() },
      );
      setVerify({ same: sameNumbers(run, again), hash: again.inputSnapshotHash === run.inputSnapshotHash });
    } catch {
      setVerify('error');
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="가상 연재 결과"
        meta={
          <span className="badge-row">
            {run.numericStatus === 'completed' ? <Badge tier="neutral">계산 완료</Badge> : <Badge tier="danger">계산 실패</Badge>}
            <span className="hint num">{formatDateTime(run.createdAt)}</span>
          </span>
        }
        actions={
          <>
            <Link to={pathFor('page.simNew', { workId })} className="button-secondary">
              새로 실행
            </Link>
            <Link to={pathFor('page.simRuns', { workId })} className="button-secondary">
              실행 기록
            </Link>
          </>
        }
      />
      <SyntheticNotice />
      {run.numericStatus === 'failed' ? (
        <ErrorBanner title="계산하지 못했습니다" message={run.errorMessage ?? '입력을 확인하세요.'} />
      ) : (
        <>
          <ul className="kpi-grid">
            <li className="neu-kpi-card">
              <span className="kpi-label">시작 인원</span>
              <span className="kpi-value num">{formatCount(last?.initialCountTotal ?? 0)}</span>
            </li>
            <li className="neu-kpi-card">
              <span className="kpi-label">마지막 남은 인원</span>
              <span className="kpi-value num">{formatCount(last?.remainingCountTotal ?? 0)}</span>
            </li>
            <li className="neu-kpi-card">
              <span className="kpi-label">마지막 누적 잔존률</span>
              <span className="kpi-value num">{formatPercent(last?.cumulativeRetention ?? null)}</span>
            </li>
            <li className="neu-kpi-card">
              <span className="kpi-label">마지막 연독률</span>
              <span className="kpi-value num">{formatPercent(last?.consecutiveReadRate ?? null)}</span>
            </li>
          </ul>

          <Panel
            title={`회차별 ${MEASURE_LABELS[measure]}`}
            actions={
              <div className="segmented" role="radiogroup" aria-label="그래프 지표">
                {(Object.keys(MEASURE_LABELS) as Measure[]).map((key) => (
                  <label key={key} className={measure === key ? 'segment is-active' : 'segment'}>
                    <input type="radio" name="sim-measure" checked={measure === key} onChange={() => setMeasure(key)} />
                    {key === 'cumulativeRetention' ? '누적 잔존률' : '연독률'}
                  </label>
                ))}
              </div>
            }
          >
            <LineChart steps={run.steps} measure={measure} selected={selected} onSelect={setSelected} />
            <p className="hint">가로축은 회차 순서(1부터), 세로축은 0–100% 비율입니다. 점을 누르거나 방향키로 옮겨 값을 볼 수 있습니다.</p>
            {nullSteps.length > 0 && (
              <p className="hint">
                {nullSteps.map((step) => step.chapterLabel).join(', ')}: 직전 인원이 0명이라 비율을 계산할 수 없어 그래프에서 비웠습니다.
              </p>
            )}
            {run.steps[selected] && <StepReadout step={run.steps[selected]!} />}
          </Panel>

          <Panel title="단계별 수치">
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">회차별 가상 수치 표</caption>
                <thead>
                  <tr>
                    <th scope="col">회차</th>
                    <th scope="col">태그 (G·B·C·R·H)</th>
                    <th scope="col">기본 이탈률</th>
                    <th scope="col">남은 인원</th>
                    <th scope="col">누적 잔존률</th>
                    <th scope="col">연독률</th>
                  </tr>
                </thead>
                <tbody>
                  {run.steps.map((step) => (
                    <tr key={step.stepIndex} aria-current={step.stepIndex === selected ? 'true' : undefined}>
                      <th scope="row">{step.chapterLabel}</th>
                      <td className="num">{TAG_KEYS.map((key) => step.tags[key]).join(' · ')}</td>
                      <td className="num">{formatPercent(step.baseChurn, 1)}</td>
                      <td className="num">{formatCount(step.remainingCountTotal)}</td>
                      <td className="num">{formatPercent(step.cumulativeRetention)}</td>
                      <td className="num">{formatPercent(step.consecutiveReadRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">태그: {TAG_KEYS.map((key) => `${key} ${TAG_LABELS[key]}`).join(', ')}</p>
          </Panel>
        </>
      )}

      <Panel title="가상 반응">
        <p className="hint">가상 댓글·반응 생성은 아직 연결하지 않았습니다. 이 실행은 수치만 계산했습니다(반응 상태: 요청 안 함).</p>
      </Panel>

      <Panel title="입력 스냅샷">
        <RunInputs run={run} />
        <div className="run-actions">
          <button type="button" className="button-secondary" onClick={() => void recompute()}>
            같은 입력으로 다시 계산해 확인
          </button>
        </div>
        {verify === 'error' && <ErrorBanner title="다시 계산하지 못했습니다" message="실행에 쓴 태그 기록이나 독자 성향을 찾을 수 없습니다." />}
        {verify && verify !== 'error' && (
          <InfoBanner tone={verify.same && verify.hash ? 'info' : 'warning'}>
            {verify.same && verify.hash
              ? '같은 입력으로 다시 계산한 수치가 저장된 결과와 비트 단위로 같습니다.'
              : verify.hash
                ? '입력은 같지만 수치가 다릅니다. 커널 버전이 바뀌었는지 확인하세요.'
                : '그 사이 독자 성향이나 집단 인원이 바뀌어 입력 해시가 다릅니다. 새로 실행해 비교하세요.'}
          </InfoBanner>
        )}
      </Panel>
    </div>
  );
}

function RunInputs({ run }: { run: SimulationRun }) {
  return (
    <dl className="meta-list">
      <div>
        <dt>시드</dt>
        <dd>
          <code>{run.seed}</code> (난수 없음: {run.prngVersion})
        </dd>
      </div>
      <div>
        <dt>커널</dt>
        <dd>
          <code>{run.kernelVersion}</code>
        </dd>
      </div>
      <div>
        <dt>입력 해시</dt>
        <dd>
          <code className="hash">{run.inputSnapshotHash}</code> <CopyButton value={run.inputSnapshotHash} label="해시 복사" />
        </dd>
      </div>
      <div>
        <dt>독자 집단</dt>
        <dd>
          <ul className="plain-list">
            {run.cohortSnapshot.cohorts.map((cohort) => {
              const persona = run.cohortSnapshot.personas.find((item) => item.id === cohort.personaId);
              return (
                <li key={cohort.id}>
                  {cohort.name} {formatCount(cohort.initialCount)}명 · 가중치{' '}
                  {persona ? TAG_KEYS.map((key) => `${TAG_LABELS[key]} ${persona.weights[key]}`).join(', ') : '—'} · 배신 민감도 {persona?.betrayalSensitivity ?? '—'}
                </li>
              );
            })}
          </ul>
        </dd>
      </div>
    </dl>
  );
}

function StepReadout({ step }: { step: SimulationStep }) {
  return (
    <div className="step-readout" aria-live="polite">
      <p className="banner-title">
        {step.chapterLabel}: 남은 인원 <span className="num">{formatCount(step.remainingCountTotal)}</span>명 · 누적 잔존률{' '}
        <span className="num">{formatPercent(step.cumulativeRetention)}</span> · 연독률 <span className="num">{formatPercent(step.consecutiveReadRate)}</span>
      </p>
      <ul className="plain-list">
        {step.cohortStates.map((cohort) => (
          <li key={cohort.cohortId} className="hint num">
            {cohort.name}: {formatCount(cohort.previousCount)} → {formatCount(cohort.remaining)}명 (이탈 확률 {formatPercent(cohort.churnProbability)})
          </li>
        ))}
      </ul>
    </div>
  );
}

const W = 640;
const H = 240;
const PAD = { top: 16, right: 20, bottom: 36, left: 48 };

/** 단일 계열 선 그래프. 0–100% 고정 축, 2px 선, 8px 점(표면색 테두리), 점은 키보드로 고를 수 있다. 값은 아래 읽기 영역과 표에 있다. */
function LineChart({ steps, measure, selected, onSelect }: { steps: SimulationStep[]; measure: Measure; selected: number; onSelect: (index: number) => void }) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (steps.length <= 1 ? innerW / 2 : (index / (steps.length - 1)) * innerW);
  const y = (value: number) => PAD.top + (1 - Math.min(1, Math.max(0, value))) * innerH;
  const segments: string[] = [];
  let current = '';
  steps.forEach((step, index) => {
    const value = step[measure];
    if (value === null) {
      if (current) segments.push(current);
      current = '';
      return;
    }
    current += `${current ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
  });
  if (current) segments.push(current);
  const labelEvery = Math.ceil(steps.length / 8);

  return (
    <div className="chart-wrap">
      <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`회차별 ${MEASURE_LABELS[measure]} 그래프, 점을 골라 값을 볼 수 있습니다`}>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick} aria-hidden="true">
            <line className="chart-grid" x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text className="chart-axis-label" x={PAD.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}
        {steps[selected] && <line className="chart-crosshair" aria-hidden="true" x1={x(selected)} x2={x(selected)} y1={PAD.top} y2={PAD.top + innerH} />}
        {segments.map((d) => (
          <path key={d} className="chart-line" d={d} aria-hidden="true" />
        ))}
        {steps.map((step, index) => {
          const value = step[measure];
          const label = `${step.chapterLabel} ${MEASURE_LABELS[measure]} ${formatPercent(value)}`;
          return (
            <g key={step.stepIndex}>
              {index % labelEvery === 0 && (
                <text className="chart-axis-label" x={x(index)} y={H - 12} textAnchor="middle" aria-hidden="true">
                  {index + 1}
                </text>
              )}
              <g
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-pressed={selected === index}
                className={selected === index ? 'chart-point is-selected' : 'chart-point'}
                onClick={() => onSelect(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(index);
                  } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                    event.preventDefault();
                    const next = Math.min(steps.length - 1, Math.max(0, index + (event.key === 'ArrowRight' ? 1 : -1)));
                    onSelect(next);
                    const target = (event.currentTarget.parentElement?.parentElement?.querySelectorAll<SVGGElement>('.chart-point') ?? [])[next];
                    target?.focus();
                  }
                }}
              >
                <circle className="chart-hit" cx={x(index)} cy={value === null ? PAD.top + innerH : y(value)} r={14} />
                {value === null ? (
                  <text className="chart-null" x={x(index)} y={PAD.top + innerH - 6} textAnchor="middle" aria-hidden="true">
                    ×
                  </text>
                ) : (
                  <circle className="chart-dot" cx={x(index)} cy={y(value)} r={4} />
                )}
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

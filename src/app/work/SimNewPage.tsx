/**
 * 가상 연재 설정(screen.simNew): 1) 회차 판본 고르기 2) 회차 태그(0–3) 확정 3) 시드 확인 후 실행.
 * 계산은 이 탭에서 결정적 커널(V10 기본)로만 한다. 외부 전송·AI 호출 없음.
 * 가상 댓글·반응 생성은 아직 연결하지 않았다(비용·전송 동의 설계 전).
 */
import { useState } from 'react';
import { latestTagSnapshot } from '../../domain/store';
import { chapterLabel, chaptersOf } from '../../domain/selectors';
import { TAG_KEYS, type TagIntensities } from '../../domain/types';
import { buildSimulationRun, freezeSimulationInput, SimulationInputError } from '../../sim/buildRun';
import { KERNEL_VERSION, TAG_LABELS, zeroTags } from '../../sim/kernel';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useCommandId, useNavigate, useServices, useWorkspace } from '../context';
import { ActionBar, CheckboxField, EmptyState, ErrorBanner, PageHeader, Panel, SyntheticNotice, TextField } from '../ui/primitives';

export function SimNewPage({ params }: PageProps) {
  const { store, newId } = useServices();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const workId = params.workId!;
  const [commandId, renew] = useCommandId();
  const chapters = chaptersOf(workspace, workId).filter((chapter) => chapter.currentVersionId);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selected, setSelected] = useState<string[]>(() => chapters.map((chapter) => chapter.currentVersionId!));
  const [tags, setTags] = useState<Record<string, TagIntensities>>(() =>
    Object.fromEntries(chapters.map((chapter) => [chapter.currentVersionId!, { ...(latestTagSnapshot(workspace, chapter.currentVersionId!)?.tags ?? zeroTags()) }])),
  );
  const [seed, setSeed] = useState(() => newId().slice(0, 8));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ordered = chapters.map((chapter) => chapter.currentVersionId!).filter((id) => selected.includes(id));
  const cohorts = Object.values(workspace.cohorts).filter((cohort) => cohort.workId === workId);

  const saveTags = (): boolean => {
    for (const versionId of ordered) {
      const result = store.setTags(workId, versionId, tags[versionId] ?? zeroTags());
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
    }
    setError(null);
    return true;
  };

  const run = async () => {
    setBusy(true);
    try {
      if (!saveTags()) return;
      const state = store.getState();
      const input = freezeSimulationInput(state, workId, ordered, seed);
      const built = await buildSimulationRun(state, input, { newId, now: () => new Date().toISOString() });
      const saved = store.saveSimulationRun(built, commandId);
      if (!saved.ok) {
        setError(saved.error.message);
        return;
      }
      renew();
      navigate(pathFor('page.simDetail', { workId, runId: saved.value.id }));
    } catch (caught) {
      setError(caught instanceof SimulationInputError ? caught.message : '계산하지 못했습니다. 입력을 확인하세요.');
    } finally {
      setBusy(false);
    }
  };

  if (chapters.length === 0) {
    return (
      <div className="page">
        <PageHeader title="가상 연재 설정" />
        <SyntheticNotice />
        <EmptyState
          message="계산할 회차가 없습니다. 먼저 회차를 올리세요."
          action={
            <Link to={pathFor('page.import', { workId })} className="button-primary">
              회차 업로드
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <PageHeader title="가상 연재 설정" description="회차마다 이야기 요소의 강도(0–3)를 작가가 직접 정하면, 가상 독자 집단이 회차를 거치며 남는 비율을 계산합니다." />
      <SyntheticNotice />
      <ol className="stepper" aria-label="진행 단계">
        {['회차 고르기', '회차 태그', '확인·실행'].map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? 'step' : undefined} className={step > index + 1 ? 'is-done' : undefined}>
            <span className="step-number num">{index + 1}</span> {label}
          </li>
        ))}
      </ol>
      {error && <ErrorBanner title="진행할 수 없습니다" message={error} />}

      {step === 1 && (
        <Panel title="1. 회차 고르기">
          <p className="hint">각 회차의 현재 판본을 회차 순서대로 계산합니다.</p>
          <ul className="check-list">
            {chapters.map((chapter) => {
              const versionId = chapter.currentVersionId!;
              const version = workspace.versions[versionId]!;
              return (
                <li key={chapter.id}>
                  <CheckboxField
                    label={`${chapterLabel(chapter)} (판본 v${version.versionOrdinal})`}
                    checked={selected.includes(versionId)}
                    onChange={(checked) => setSelected((list) => (checked ? [...list, versionId] : list.filter((id) => id !== versionId)))}
                  />
                </li>
              );
            })}
          </ul>
          <ActionBar>
            <button type="button" className="button-primary" disabled={ordered.length === 0} onClick={() => setStep(2)}>
              다음: 태그
            </button>
          </ActionBar>
        </Panel>
      )}

      {step === 2 && (
        <Panel title="2. 회차 태그">
          <p className="hint">0은 없음, 3은 매우 강함입니다. AI 자동 태깅은 아직 없고, 작가가 정한 값만 씁니다. 저장하면 판본별 태그 기록으로 남습니다.</p>
          <div className="table-wrap">
            <table className="data-table tag-table">
              <thead>
                <tr>
                  <th scope="col">회차</th>
                  {TAG_KEYS.map((key) => (
                    <th scope="col" key={key}>
                      {TAG_LABELS[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordered.map((versionId) => {
                  const version = workspace.versions[versionId]!;
                  const chapter = workspace.chapters[version.chapterId]!;
                  return (
                    <tr key={versionId}>
                      <th scope="row">{chapterLabel(chapter)}</th>
                      {TAG_KEYS.map((key) => (
                        <td key={key}>
                          <select
                            className="text-input input-compact"
                            aria-label={`${chapterLabel(chapter)} ${TAG_LABELS[key]} 강도`}
                            value={tags[versionId]?.[key] ?? 0}
                            onChange={(event) =>
                              setTags((all) => ({ ...all, [versionId]: { ...(all[versionId] ?? zeroTags()), [key]: Number(event.target.value) } }))
                            }
                          >
                            {[0, 1, 2, 3].map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ActionBar>
            <button type="button" className="button-secondary" onClick={() => setStep(1)}>
              이전
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                if (saveTags()) setStep(3);
              }}
            >
              태그 저장하고 다음
            </button>
          </ActionBar>
        </Panel>
      )}

      {step === 3 && (
        <Panel title="3. 확인·실행">
          <dl className="meta-list">
            <div>
              <dt>회차</dt>
              <dd className="num">{ordered.length}개</dd>
            </div>
            <div>
              <dt>독자 집단</dt>
              <dd>
                {cohorts.map((cohort) => `${cohort.name} ${cohort.initialCount.toLocaleString('ko-KR')}명`).join(' · ')}{' '}
                <Link to={pathFor('page.personas', { workId })}>성향 바꾸기</Link>
              </dd>
            </div>
            <div>
              <dt>커널</dt>
              <dd>
                <code>{KERNEL_VERSION}</code> (난수 없음, 결정적 계산)
              </dd>
            </div>
          </dl>
          <TextField label="시드" value={seed} onChange={setSeed} hint="이 커널은 난수를 쓰지 않아 시드가 결과를 바꾸지 않습니다. 실행 기록을 구분하는 표시로 남깁니다." />
          <CheckboxField
            label="가상 댓글·반응 생성"
            checked={false}
            disabled
            onChange={() => undefined}
            hint="아직 지원하지 않습니다. 생성하려면 원고를 AI로 보내야 해서 비용·전송 동의 설계가 필요합니다. 지금은 수치 계산만 합니다."
          />
          <ActionBar>
            <button type="button" className="button-secondary" onClick={() => setStep(2)} disabled={busy}>
              이전
            </button>
            <button type="button" className="button-primary" onClick={() => void run()} disabled={busy || !seed.trim()} aria-busy={busy}>
              {busy ? '계산 중…' : '가상 연재 계산'}
            </button>
          </ActionBar>
        </Panel>
      )}
    </div>
  );
}

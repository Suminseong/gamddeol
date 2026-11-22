/**
 * 가상 독자 성향(screen.personas): 집단 인원 비율(합계 100%)과 성향(좋아함·싫어함 칩, 태그 가중치, 배신 민감도) 편집.
 * 오락용 가상 실험 입력이며 실제 독자 데이터가 아니다.
 */
import { useState } from 'react';
import { formatPercent } from '../../domain/labels';
import { TAG_KEYS, type Persona, type TagIntensities } from '../../domain/types';
import { TAG_LABELS } from '../../sim/kernel';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useServices, useUnsavedGuard, useWorkspace } from '../context';
import { ActionBar, ChipsField, ErrorBanner, LiveStatus, PageHeader, Panel, SyntheticNotice, TextField } from '../ui/primitives';

export function PersonasPage({ params }: PageProps) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const workId = params.workId!;
  const cohorts = Object.values(workspace.cohorts)
    .filter((cohort) => cohort.workId === workId)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries(cohorts.map((cohort) => [cohort.id, String(cohort.initialCount)])));
  const [countError, setCountError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const countsDirty = cohorts.some((cohort) => counts[cohort.id] !== String(cohort.initialCount));
  useUnsavedGuard(countsDirty, '집단 인원을 저장하지 않았습니다.');
  const draftTotal = cohorts.reduce((sum, cohort) => sum + (Number(counts[cohort.id]) || 0), 0);

  return (
    <div className="page">
      <PageHeader
        title="가상 독자 성향"
        description="가상 연재 계산에 쓰는 독자 집단과 성향입니다."
        actions={
          <Link to={pathFor('page.simNew', { workId })} className="neu-cta-button button-cta">
            가상 연재 실행
          </Link>
        }
      />
      <SyntheticNotice />
      <LiveStatus message={announce} />
      <Panel title="집단 구성">
        <div className="share-bar" role="img" aria-label={cohorts.map((cohort) => `${cohort.name} ${formatPercent(cohort.share, 1)}`).join(', ')}>
          {cohorts.map((cohort, index) => (
            <span key={cohort.id} className={`share-segment share-${index % 4}`} style={{ flexGrow: Math.max(cohort.share, 0.0001) }}>
              {cohort.name} {formatPercent(cohort.share, 1)}
            </span>
          ))}
        </div>
        <form
          className="form-stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const parsed: Record<string, number> = {};
            for (const cohort of cohorts) parsed[cohort.id] = Number(counts[cohort.id]);
            const result = store.updateCohortCounts(workId, parsed);
            if (!result.ok) {
              setCountError(result.error.message);
              return;
            }
            setCountError(null);
            setAnnounce('집단 인원을 저장했습니다. 비율 합계는 100%입니다.');
          }}
        >
          {countError && <ErrorBanner title="저장하지 못했습니다" message={countError} />}
          <div className="field-row">
            {cohorts.map((cohort) => (
              <TextField
                key={cohort.id}
                label={`${cohort.name} 초기 인원`}
                type="number"
                inputMode="numeric"
                value={counts[cohort.id] ?? ''}
                onChange={(value) => setCounts((all) => ({ ...all, [cohort.id]: value }))}
              />
            ))}
          </div>
          <p className="hint num">
            입력 합계 {draftTotal.toLocaleString('ko-KR')}명 · 저장하면 비율을 합계 100%로 다시 계산합니다.
          </p>
          <button type="submit" className="button-primary" disabled={!countsDirty}>
            인원 저장
          </button>
        </form>
      </Panel>
      <div className="persona-grid">
        {cohorts.map((cohort) => {
          const persona = workspace.personas[cohort.personaId];
          return persona ? <PersonaEditor key={persona.id} workId={workId} persona={persona} onSaved={(message) => setAnnounce(message)} /> : null;
        })}
      </div>
      <p className="hint">집단 추가·삭제는 아직 지원하지 않습니다. 기본 두 집단(순애·피폐)의 인원과 성향을 바꿔 실험하세요.</p>
    </div>
  );
}

function PersonaEditor({ workId, persona, onSaved }: { workId: string; persona: Persona; onSaved: (message: string) => void }) {
  const { store } = useServices();
  const [name, setName] = useState(persona.displayName);
  const [likes, setLikes] = useState(persona.likes);
  const [dislikes, setDislikes] = useState(persona.dislikes);
  const [weights, setWeights] = useState<Record<keyof TagIntensities, string>>(
    () => Object.fromEntries(TAG_KEYS.map((key) => [key, String(persona.weights[key])])) as Record<keyof TagIntensities, string>,
  );
  const [sensitivity, setSensitivity] = useState(persona.betrayalSensitivity);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const dirty =
    name !== persona.displayName ||
    likes.join('|') !== persona.likes.join('|') ||
    dislikes.join('|') !== persona.dislikes.join('|') ||
    TAG_KEYS.some((key) => weights[key] !== String(persona.weights[key])) ||
    sensitivity !== persona.betrayalSensitivity;
  useUnsavedGuard(dirty, '독자 성향을 저장하지 않았습니다.');

  return (
    <Panel title={`${persona.displayName} 성향`}>
      <form
        className="form-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = Object.fromEntries(TAG_KEYS.map((key) => [key, Number(weights[key])])) as TagIntensities;
          const result = store.updatePersona(workId, persona.id, { displayName: name, likes, dislikes, weights: parsed, betrayalSensitivity: sensitivity });
          if (!result.ok) {
            setError({ field: result.error.field, message: result.error.message });
            return;
          }
          setError(null);
          onSaved(`${result.value.displayName} 성향을 저장했습니다.`);
        }}
      >
        {error && !error.field && <ErrorBanner title="저장하지 못했습니다" message={error.message} />}
        <TextField label="이름" value={name} onChange={setName} error={error?.field === 'displayName' ? error.message : null} />
        <ChipsField label="좋아함" values={likes} onChange={setLikes} />
        <ChipsField label="싫어함" values={dislikes} onChange={setDislikes} />
        <fieldset className="weights">
          <legend>태그 가중치 (−5 ~ 5)</legend>
          <div className="field-row field-row-5">
            {TAG_KEYS.map((key) => (
              <TextField
                key={key}
                label={TAG_LABELS[key]}
                type="number"
                inputMode="decimal"
                value={weights[key]}
                onChange={(value) => setWeights((all) => ({ ...all, [key]: value }))}
                error={error?.field === `weight-${key}` ? error.message : null}
              />
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor={`sensitivity-${persona.id}`}>
            배신 민감도 <span className="num">{sensitivity.toFixed(2)}</span>
          </label>
          <input
            id={`sensitivity-${persona.id}`}
            type="range"
            className="range-input"
            min={0}
            max={1}
            step={0.05}
            value={sensitivity}
            onChange={(event) => setSensitivity(Number(event.target.value))}
          />
        </div>
        <ActionBar label={`${persona.displayName} 성향 저장`}>
          <button type="submit" className="button-primary" disabled={!dirty}>
            성향 저장
          </button>
        </ActionBar>
      </form>
    </Panel>
  );
}

/** 작품 설정(screen.workSettings): 작품 정보, 작중 달력 이름, 이야기 약속(장르 약속·독자 기대). 리비전 확인으로 오래된 화면의 저장을 막는다. */
import { useState } from 'react';
import { SERIALIZATION_LABELS } from '../../domain/labels';
import type { SerializationStatus } from '../../domain/types';
import type { PageProps } from '../App';
import { useServices, useUnsavedGuard, useWorkspace } from '../context';
import { ActionBar, ChipsField, ErrorBanner, LiveStatus, PageHeader, Panel, SelectField, StaleBanner, TextAreaField, TextField } from '../ui/primitives';

const STATUS_OPTIONS = (Object.keys(SERIALIZATION_LABELS) as SerializationStatus[]).map((value) => ({ value, label: SERIALIZATION_LABELS[value] }));

export function WorkSettingsPage({ params }: PageProps) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const workId = params.workId!;
  const work = workspace.works[workId]!;
  const promise = workspace.promises[workId];
  const initialExpectations = Object.entries(promise?.readerExpectations ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  const [baseRevision, setBaseRevision] = useState(work.revision);
  const [title, setTitle] = useState(work.title);
  const [genre, setGenre] = useState(work.genre ?? '');
  const [tags, setTags] = useState(work.tags);
  const [synopsis, setSynopsis] = useState(work.synopsis ?? '');
  const [status, setStatus] = useState(work.serializationStatus);
  const [calendar, setCalendar] = useState(work.storyCalendarLabel ?? '');
  const [promises, setPromises] = useState(promise?.genrePromises ?? []);
  const [expectations, setExpectations] = useState(initialExpectations);
  const [problem, setProblem] = useState<{ stale: boolean; field?: string; message: string } | null>(null);
  const [announce, setAnnounce] = useState('');
  const dirty =
    title !== work.title ||
    genre !== (work.genre ?? '') ||
    tags.join('|') !== work.tags.join('|') ||
    synopsis !== (work.synopsis ?? '') ||
    status !== work.serializationStatus ||
    calendar !== (work.storyCalendarLabel ?? '') ||
    promises.join('|') !== (promise?.genrePromises ?? []).join('|') ||
    expectations !== initialExpectations;
  useUnsavedGuard(dirty, '작품 설정을 저장하지 않았습니다.');

  return (
    <div className="page page-narrow">
      <PageHeader title="작품 설정" description="작품 정보와 이야기 약속을 바꿉니다. 이야기 약속은 가상 연재 실행 기록에 함께 남습니다." />
      <LiveStatus message={announce} />
      {problem?.stale && (
        <StaleBanner
          onReload={() => {
            setBaseRevision(work.revision);
            setProblem(null);
          }}
        />
      )}
      {problem && !problem.stale && !problem.field && <ErrorBanner title="저장하지 못했습니다" message={problem.message} />}
      <form
        className="form-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const result = store.updateWorkSettings(
            workId,
            {
              title,
              genre: genre || null,
              tags,
              synopsis: synopsis || null,
              serializationStatus: status,
              storyCalendarLabel: calendar || null,
              genrePromises: promises,
              readerExpectations: expectations,
            },
            baseRevision,
          );
          if (!result.ok) {
            setProblem({ stale: result.error.code === 'stale', field: result.error.field, message: result.error.message });
            return;
          }
          setProblem(null);
          setBaseRevision(result.value.revision);
          setAnnounce('작품 설정을 저장했습니다.');
        }}
      >
        <Panel title="작품 정보">
          <TextField label="작품명" required value={title} onChange={setTitle} maxLength={120} error={problem?.field === 'title' ? problem.message : null} />
          <TextField label="장르" value={genre} onChange={setGenre} maxLength={40} />
          <ChipsField label="태그" values={tags} onChange={setTags} />
          <TextAreaField label="작품 소개" value={synopsis} onChange={setSynopsis} rows={4} />
          <SelectField label="연재 상태" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          <TextField label="작중 달력 이름" value={calendar} onChange={setCalendar} placeholder="예: 제국력" hint="작중 시점 표현에 쓰는 이름입니다. 날짜 계산은 하지 않습니다." />
        </Panel>
        <Panel title="이야기 약속">
          <ChipsField label="장르 약속" values={promises} onChange={setPromises} hint="예: 회귀, 복수, 해피엔딩. 독자가 기대하는 장르의 약속입니다." />
          <TextAreaField
            label="독자 기대"
            value={expectations}
            onChange={setExpectations}
            rows={4}
            hint="한 줄에 하나씩 '항목: 내용'으로 적습니다. 예) 주인공 성장: 매 권 한 단계씩"
          />
          <p className="hint">{promise?.confirmedByOwner ? '작가가 확인한 약속입니다.' : '아직 확인하지 않은 기본값입니다. 저장하면 작가 확인으로 기록됩니다.'}</p>
        </Panel>
        <ActionBar>
          <button type="submit" className="button-primary" disabled={!dirty}>
            설정 저장
          </button>
        </ActionBar>
      </form>
    </div>
  );
}

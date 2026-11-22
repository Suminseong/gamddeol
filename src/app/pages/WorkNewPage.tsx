/** 작품 생성(screen.workNew): 명시적 저장, 저장 전 이탈 확인, 실패해도 입력 유지(같은 명령 ID로 재시도). */
import { useState } from 'react';
import { SERIALIZATION_LABELS } from '../../domain/labels';
import type { SerializationStatus } from '../../domain/types';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { useCommandId, useNavigate, useServices, useUnsavedGuard } from '../context';
import { ActionBar, ChipsField, ErrorBanner, PageHeader, SelectField, TextAreaField, TextField } from '../ui/primitives';

const STATUS_OPTIONS = (Object.keys(SERIALIZATION_LABELS) as SerializationStatus[]).map((value) => ({ value, label: SERIALIZATION_LABELS[value] }));

export function WorkNewPage(_: PageProps) {
  const { store } = useServices();
  const navigate = useNavigate();
  const [commandId] = useCommandId();
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [synopsis, setSynopsis] = useState('');
  const [status, setStatus] = useState<SerializationStatus>('draft');
  const [error, setError] = useState<{ field: string | undefined; message: string } | null>(null);
  const dirty = Boolean(title || genre || tags.length || synopsis);
  useUnsavedGuard(dirty, '작성 중인 작품 정보가 있습니다.');

  const save = () => {
    const result = store.createWork(
      { title, genre: genre || null, tags, synopsis: synopsis || null, serializationStatus: status },
      commandId,
    );
    if (!result.ok) {
      setError({ field: result.error.field, message: result.error.message });
      return;
    }
    navigate(pathFor('page.workHome', { workId: result.value.id }), { force: true });
  };

  return (
    <div className="page page-narrow">
      <PageHeader
        title="작품 생성"
        description="작품 정보는 이 탭 메모리에만 저장됩니다. 탭을 닫기 전에 작품 JSON으로 내보내 보관하세요."
      />
      <form
        className="form-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {error && !error.field && <ErrorBanner title="저장하지 못했습니다" message={error.message} />}
        <TextField
          label="작품명"
          required
          value={title}
          onChange={setTitle}
          maxLength={120}
          error={error?.field === 'title' ? error.message : null}
        />
        <TextField label="장르" value={genre} onChange={setGenre} placeholder="예: 로맨스 판타지" maxLength={40} />
        <ChipsField label="태그" values={tags} onChange={setTags} hint="쉼표나 Enter로 여러 개를 넣을 수 있습니다." />
        <TextAreaField label="작품 소개" value={synopsis} onChange={setSynopsis} rows={5} />
        <SelectField label="연재 상태" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <ActionBar>
          <button type="button" className="button-secondary" onClick={() => navigate('/works')}>
            취소
          </button>
          <button type="submit" className="button-primary">
            작품 만들기
          </button>
        </ActionBar>
      </form>
    </div>
  );
}

/** 설정 항목 추가(screen.wikiNew): 같은 이름이 있으면 알려만 주고 막지 않는다(자동 병합 없음). */
import { useState } from 'react';
import { ENTITY_KIND_LABELS } from '../../domain/labels';
import { entitiesOf } from '../../domain/selectors';
import { normalizeName } from '../../domain/text';
import { ENTITY_KINDS, type EntityKind } from '../../domain/types';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useCommandId, useNavigate, useServices, useUnsavedGuard, useWorkspace } from '../context';
import { ActionBar, ErrorBanner, InfoBanner, PageHeader, SelectField, TextAreaField, TextField } from '../ui/primitives';

export function WikiNewPage({ params }: PageProps) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const workId = params.workId!;
  const [commandId] = useCommandId();
  const [kind, setKind] = useState<EntityKind>('character');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  useUnsavedGuard(Boolean(name.trim() || description.trim()), '작성 중인 설정 항목이 있습니다.');

  const needle = normalizeName(name);
  const aliasHits = Object.values(workspace.aliases).filter((alias) => alias.workId === workId && needle && alias.normalizedAlias === needle);
  const sameName = needle
    ? entitiesOf(workspace, workId).filter((entity) => normalizeName(entity.canonicalName) === needle || aliasHits.some((alias) => alias.entityId === entity.id))
    : [];

  return (
    <div className="page page-narrow">
      <PageHeader title="설정 항목 추가" description="인물·조직·장소 같은 설정 항목을 만듭니다. 속성 값은 항목 화면에서 진술로 추가합니다." />
      <form
        className="form-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const result = store.createEntity(workId, { kind, canonicalName: name, description: description || null }, commandId);
          if (!result.ok) {
            setError({ field: result.error.field, message: result.error.message });
            return;
          }
          navigate(pathFor('page.wikiDetail', { workId, entityId: result.value.id }), { force: true });
        }}
      >
        {error && !error.field && <ErrorBanner title="저장하지 못했습니다" message={error.message} />}
        <SelectField label="종류" value={kind} onChange={setKind} options={ENTITY_KINDS.map((item) => ({ value: item, label: ENTITY_KIND_LABELS[item] }))} />
        <TextField label="정식 명칭" required value={name} onChange={setName} error={error?.field === 'canonicalName' ? error.message : null} />
        {sameName.length > 0 && (
          <InfoBanner tone="warning">
            <p>같은 이름(또는 별칭)의 항목이 이미 있습니다. 같은 대상이면 기존 항목에 진술을 더하세요. 다른 대상이면 그대로 만들 수 있습니다(자동으로 합치지 않음).</p>
            <ul>
              {sameName.map((entity) => (
                <li key={entity.id}>
                  <Link to={pathFor('page.wikiDetail', { workId, entityId: entity.id })}>
                    {entity.canonicalName} ({ENTITY_KIND_LABELS[entity.kind]})
                  </Link>
                </li>
              ))}
            </ul>
          </InfoBanner>
        )}
        <TextAreaField label="설명" value={description} onChange={setDescription} rows={4} />
        <ActionBar>
          <button type="button" className="button-secondary" onClick={() => navigate(pathFor('page.wiki', { workId }))}>
            취소
          </button>
          <button type="submit" className="button-primary">
            항목 만들기
          </button>
        </ActionBar>
      </form>
    </div>
  );
}

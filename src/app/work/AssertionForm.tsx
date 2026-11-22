/**
 * 설정 진술 입력 폼. 판본 화면에서는 고른 원문 구간을 근거로 붙이고, 설정 항목 화면에서는 항목을 고정한다.
 * 출처(sourceKind)와 승인 상태는 따로 정한다. AI 추론 출처는 직접 입력할 수 없다.
 */
import { useState } from 'react';
import { ENTITY_KIND_LABELS, SOURCE_KIND_LABELS } from '../../domain/labels';
import { assertionsOf, attributeLabel, attributesFor, entitiesOf, entityName } from '../../domain/selectors';
import { ENTITY_KINDS, type AssertionSourceKind, type EntityKind } from '../../domain/types';
import { useCommandId, useServices, useUnsavedGuard, useWorkspace } from '../context';
import { CheckboxField, ErrorBanner, SelectField, TextField } from '../ui/primitives';

const MANUAL_SOURCES: AssertionSourceKind[] = ['narration', 'character_speech', 'author_decision', 'author_idea'];
const NEW_ENTITY = '__new__';

export interface EvidenceDraft {
  versionId: string;
  startCp: number;
  endCp: number;
  quote: string;
}

function parseOrder(value: string): number | null | 'invalid' {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : 'invalid';
}

export function AssertionForm({
  workId,
  fixedEntityId,
  evidence,
  onDone,
}: {
  workId: string;
  fixedEntityId?: string;
  evidence?: EvidenceDraft;
  onDone?: (assertionId: string) => void;
}) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const [commandId, renew] = useCommandId();
  const [entityCommandId, renewEntity] = useCommandId();
  const entities = entitiesOf(workspace, workId).filter((entity) => entity.reviewStatus !== 'rejected');
  const [entityId, setEntityId] = useState(fixedEntityId ?? entities[0]?.id ?? NEW_ENTITY);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<EntityKind>('character');
  const kind = entityId === NEW_ENTITY ? newKind : workspace.entities[entityId]?.kind ?? 'character';
  const attributes = attributesFor(workspace, workId, kind);
  const [attributeKey, setAttributeKey] = useState('summary');
  const attribute = attributes.find((item) => item.key === attributeKey) ?? attributes[0];
  const [value, setValue] = useState('');
  const [sourceKind, setSourceKind] = useState<AssertionSourceKind>(evidence ? 'narration' : 'author_decision');
  const [speakerId, setSpeakerId] = useState('');
  const [timeExpression, setTimeExpression] = useState('');
  const [startOrder, setStartOrder] = useState('');
  const [endOrder, setEndOrder] = useState('');
  const [approveNow, setApproveNow] = useState(!evidence);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = Boolean(value.trim() || newName.trim() || timeExpression.trim());
  useUnsavedGuard(dirty, '작성 중인 진술이 있습니다.');

  const characters = entities.filter((entity) => entity.kind === 'character');

  const submit = async () => {
    const start = parseOrder(startOrder);
    const end = parseOrder(endOrder);
    if (start === 'invalid' || end === 'invalid') {
      setError({ field: 'order', message: '작중 순서는 숫자로 입력하세요.' });
      return;
    }
    setBusy(true);
    try {
      let subjectId = entityId;
      if (entityId === NEW_ENTITY) {
        const created = store.createEntity(workId, { kind: newKind, canonicalName: newName, description: null }, entityCommandId);
        if (!created.ok) {
          setError({ field: 'newName', message: created.error.message });
          return;
        }
        subjectId = created.value.id;
        setEntityId(subjectId);
        renewEntity();
      }
      const subject = store.getState().entities[subjectId];
      const attributeDef = attributesFor(store.getState(), workId, subject?.kind ?? kind).find((item) => item.key === (attribute?.key ?? 'summary'));
      if (!attributeDef) {
        setError({ message: '속성을 고르세요.' });
        return;
      }
      const evidenceIds: string[] = [];
      if (evidence) {
        const anchor = await store.createAnchor(workId, evidence.versionId, evidence.startCp, evidence.endCp);
        if (!anchor.ok) {
          setError({ message: anchor.error.message });
          return;
        }
        evidenceIds.push(anchor.value.id);
      }
      const result = store.createAssertion(
        workId,
        {
          subjectEntityId: subjectId,
          attributeDefId: attributeDef.id,
          value,
          sourceKind,
          speakerEntityId: sourceKind === 'character_speech' && speakerId ? speakerId : null,
          speakerUnresolved: sourceKind === 'character_speech' && !speakerId,
          storyTimeExpression: timeExpression || null,
          startStoryOrder: start,
          endStoryOrderExclusive: end,
          evidenceIds,
          approveNow,
        },
        commandId,
      );
      if (!result.ok) {
        setError({ field: result.error.field, message: result.error.message });
        return;
      }
      setError(null);
      setValue('');
      setTimeExpression('');
      setStartOrder('');
      setEndOrder('');
      setNewName('');
      renew();
      onDone?.(result.value.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="form-stack"
      noValidate
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error && !error.field && <ErrorBanner title="저장하지 못했습니다" message={error.message} />}
      {evidence && (
        <blockquote className="quote-box">
          <span className="sr-only">근거 구간: </span>
          {evidence.quote.length > 300 ? `${evidence.quote.slice(0, 300)}…` : evidence.quote}
        </blockquote>
      )}
      {!fixedEntityId && (
        <SelectField
          label="설정 항목"
          value={entityId}
          onChange={setEntityId}
          options={[...entities.map((entity) => ({ value: entity.id, label: `${entity.canonicalName} (${ENTITY_KIND_LABELS[entity.kind]})` })), { value: NEW_ENTITY, label: '+ 새 항목 만들기' }]}
        />
      )}
      {entityId === NEW_ENTITY && !fixedEntityId && (
        <div className="field-row">
          <TextField label="새 항목 이름" required value={newName} onChange={setNewName} error={error?.field === 'newName' || error?.field === 'canonicalName' ? error.message : null} />
          <SelectField label="종류" value={newKind} onChange={setNewKind} options={ENTITY_KINDS.map((item) => ({ value: item, label: ENTITY_KIND_LABELS[item] }))} />
        </div>
      )}
      <SelectField
        label="속성"
        value={attribute?.key ?? ''}
        onChange={setAttributeKey}
        options={attributes.map((item) => ({ value: item.key, label: `${item.label}${item.timeVariant ? '' : ' (시점 무관)'}` }))}
      />
      <TextField label="값" required value={value} onChange={setValue} error={error?.field === 'value' ? error.message : null} />
      <SelectField
        label="출처"
        value={sourceKind}
        onChange={(next) => {
          setSourceKind(next);
          setApproveNow(next === 'author_decision' || next === 'author_idea');
        }}
        options={MANUAL_SOURCES.map((item) => ({ value: item, label: SOURCE_KIND_LABELS[item] }))}
        hint="원고 서술·인물 발언은 원문 사실이나 주장, 작가 결정·구상은 원고 밖 설정입니다."
      />
      {sourceKind === 'character_speech' && (
        <SelectField
          label="화자"
          value={speakerId}
          onChange={setSpeakerId}
          options={[{ value: '', label: '화자 미상' }, ...characters.map((entity) => ({ value: entity.id, label: entity.canonicalName }))]}
        />
      )}
      <TextField label="작중 시점 (표현)" value={timeExpression} onChange={setTimeExpression} placeholder="예: 3년 전 겨울" />
      <div className="field-row">
        <TextField label="작중 순서 시작" type="number" inputMode="decimal" value={startOrder} onChange={setStartOrder} error={error?.field === 'order' ? error.message : null} />
        <TextField
          label="작중 순서 끝(미포함)"
          type="number"
          inputMode="decimal"
          value={endOrder}
          onChange={setEndOrder}
          error={error?.field === 'endStoryOrderExclusive' ? error.message : null}
        />
      </div>
      <p className="hint">작중 순서를 비워 두면 &lsquo;시점 미상&rsquo;으로 저장되고, 시점이 바뀌는 속성은 충돌로 단정하지 않습니다.</p>
      <CheckboxField label="바로 확정 설정으로 저장" checked={approveNow} onChange={setApproveNow} hint="끄면 후보로 저장되어 검토함에서 확정할 수 있습니다." />
      <button type="submit" className="button-primary" disabled={busy || !value.trim() || (entityId === NEW_ENTITY && !newName.trim())}>
        {evidence ? '근거와 함께 진술 저장' : '진술 저장'}
      </button>
    </form>
  );
}

/** 이미 있는 진술에 고른 구간을 근거로 더한다. */
export function AttachEvidenceForm({ workId, evidence, onDone }: { workId: string; evidence: EvidenceDraft; onDone?: () => void }) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const options = assertionsOf(workspace, workId)
    .filter((assertion) => assertion.approvalStatus !== 'rejected')
    .map((assertion) => ({
      value: assertion.id,
      label: `${entityName(workspace, assertion.subjectEntityId)} · ${attributeLabel(workspace, assertion.attributeDefId)} = ${assertion.value}`,
    }));
  const [assertionId, setAssertionId] = useState(options[0]?.value ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (options.length === 0) return <p className="hint">근거를 더할 진술이 아직 없습니다. 새 진술로 저장하세요.</p>;

  return (
    <form
      className="form-stack"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        const assertion = workspace.assertions[assertionId];
        if (!assertion) return;
        setBusy(true);
        try {
          const anchor = await store.createAnchor(workId, evidence.versionId, evidence.startCp, evidence.endCp);
          if (!anchor.ok) {
            setError(anchor.error.message);
            return;
          }
          const result = store.addEvidence(workId, assertionId, anchor.value.id, assertion.revision);
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          setError(null);
          onDone?.();
        } finally {
          setBusy(false);
        }
      }}
    >
      <SelectField label="근거를 더할 진술" value={assertionId} onChange={setAssertionId} options={options} error={error} />
      <button type="submit" className="button-secondary" disabled={busy || !assertionId}>
        이 진술의 근거로 더하기
      </button>
    </form>
  );
}

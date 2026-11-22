/**
 * AI 연결 및 전송 동의(screen.aiSettings): 키(탭 메모리) + 자료 종류·모델별 전송 동의.
 * 동의가 없으면 작품 안 AI 작업(판본 감평·설정 후보 추출)은 요청을 만들지 않는다.
 * 키를 서버로 대신 보내는 방식은 쓰지 않는다(보안 조건: 키·원고는 OpenAI 공식 API로만).
 */
import { useState } from 'react';
import { formatDateTime } from '../../domain/labels';
import { AI_DATA_KINDS, type AiDataKind } from '../../domain/types';
import { OPENAI_RESPONSES_ENDPOINT } from '../../transport/endpoint';
import type { PageProps } from '../App';
import { useHasKey, useQuery, useServices, useWorkspace } from '../context';
import { KeyPanel } from '../quick/KeyPanel';
import { SecurityNotice } from '../quick/SecurityNotice';
import { Badge, CheckboxField, ErrorBanner, LiveStatus, PageHeader, Panel } from '../ui/primitives';
import { SettingsLayout } from './SettingsNav';

const KIND_LABELS: Record<AiDataKind, { label: string; hint: string }> = {
  manuscript_review: { label: '원고 감평', hint: '판본 본문과 감평 지시를 보냅니다.' },
  lore_extraction: { label: '설정 후보 추출', hint: '판본 본문, 등록한 설정 항목 이름, 추출 지시를 보냅니다.' },
};

export function AiSettingsPage(_: PageProps) {
  const { store, keySession, aiRunner } = useServices();
  const workspace = useWorkspace();
  const hasKey = useHasKey();
  const query = useQuery();
  const consent = workspace.consent && !workspace.consent.revokedAt ? workspace.consent : null;
  const requested = query.get('kind');
  const [kinds, setKinds] = useState<AiDataKind[]>(() => {
    if (consent) return consent.allowedDataKinds;
    return requested && (AI_DATA_KINDS as readonly string[]).includes(requested) ? [requested as AiDataKind] : [...AI_DATA_KINDS];
  });
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const modelChanged = consent !== null && consent.allowedModelSnapshot !== aiRunner.config.model;

  return (
    <div className="page">
      <PageHeader title="AI 연결 및 전송 동의" description="작품 안 AI 작업은 키 등록과 전송 동의가 모두 있어야 실행됩니다. 빠른 감평 화면은 실행 버튼을 누르는 것 자체를 그 요청의 동의로 봅니다." />
      <SettingsLayout>
        <LiveStatus message={announce} />
        <SecurityNotice />
        <KeyPanel keySession={keySession} hasKey={hasKey} />
        <Panel title="전송 동의">
          <dl className="meta-list">
            <div>
              <dt>제공자</dt>
              <dd>OpenAI (브라우저에서 직접 호출)</dd>
            </div>
            <div>
              <dt>엔드포인트</dt>
              <dd>
                <code className="endpoint">{OPENAI_RESPONSES_ENDPOINT}</code>
              </dd>
            </div>
            <div>
              <dt>모델</dt>
              <dd>
                <code>{aiRunner.config.model}</code>
              </dd>
            </div>
            <div>
              <dt>현재 상태</dt>
              <dd>
                {consent ? (
                  <span className="badge-row">
                    <Badge tier={modelChanged ? 'warning' : 'canon'}>{modelChanged ? '모델 바뀜 · 다시 동의 필요' : '동의함'}</Badge>
                    <span className="hint num">{formatDateTime(consent.grantedAt)}</span>
                  </span>
                ) : (
                  <Badge tier="neutral">동의 없음</Badge>
                )}
              </dd>
            </div>
          </dl>
          {error && <ErrorBanner title="저장하지 못했습니다" message={error} />}
          <fieldset className="check-group">
            <legend>보내도 되는 자료</legend>
            {AI_DATA_KINDS.map((kind) => (
              <CheckboxField
                key={kind}
                label={KIND_LABELS[kind].label}
                hint={KIND_LABELS[kind].hint}
                checked={kinds.includes(kind)}
                onChange={(checked) => setKinds((list) => (checked ? [...new Set([...list, kind])] : list.filter((item) => item !== kind)))}
              />
            ))}
          </fieldset>
          <p className="hint">
            예산 상한은 앱에서 관리하지 않습니다(가격표 미연결). OpenAI 대시보드에서 프로젝트 사용 한도를 낮게 정해 두세요. 동의 기록은 이 탭 메모리에만 있습니다.
          </p>
          <div className="run-actions">
            <button
              type="button"
              className="button-primary"
              disabled={kinds.length === 0}
              onClick={() => {
                const result = store.grantConsent(kinds, aiRunner.config.model);
                if (!result.ok) {
                  setError(result.error.message);
                  return;
                }
                setError(null);
                setAnnounce('전송 동의를 저장했습니다.');
              }}
            >
              {consent ? '동의 범위 저장' : '동의하고 저장'}
            </button>
            {consent && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  store.revokeConsent();
                  setAnnounce('전송 동의를 철회했습니다. 작품 안 AI 작업은 다시 동의할 때까지 실행되지 않습니다.');
                }}
              >
                동의 철회
              </button>
            )}
          </div>
        </Panel>
      </SettingsLayout>
    </div>
  );
}

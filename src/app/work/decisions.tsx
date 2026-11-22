/**
 * 진술 승인·기각·확정 취소 조작. 화면이 본 리비전을 함께 보내 오래된 화면의 결정을 막는다.
 * 같은 리비전·같은 행동의 결정은 같은 명령 ID를 써서 두 번 눌러도 한 번만 기록된다.
 */
import { useState } from 'react';
import type { Assertion, DecisionAction } from '../../domain/types';
import { useServices } from '../context';
import { ErrorBanner, StaleBanner } from '../ui/primitives';

export const DECISION_LABELS: Record<DecisionAction, string> = { approve: '확정', reject: '기각', revoke: '확정 취소' };

export function allowedActions(assertion: Pick<Assertion, 'approvalStatus'>): DecisionAction[] {
  switch (assertion.approvalStatus) {
    case 'candidate':
      return ['approve', 'reject'];
    case 'approved':
      return ['revoke'];
    case 'rejected':
    case 'revoked':
      return ['approve'];
  }
}

export function decisionCommandId(assertion: Pick<Assertion, 'id' | 'revision'>, action: DecisionAction) {
  return `decide:${assertion.id}:${assertion.revision}:${action}`;
}

export function useDecide(workId: string) {
  const { store } = useServices();
  const [problem, setProblem] = useState<{ stale: boolean; message: string } | null>(null);
  const decide = (assertion: Assertion, action: DecisionAction, reason: string | null) => {
    const result = store.decide(workId, assertion.id, action, assertion.revision, reason, decisionCommandId(assertion, action));
    if (!result.ok) setProblem({ stale: result.error.code === 'stale', message: result.error.message });
    else setProblem(null);
    return result.ok;
  };
  const banner = problem ? (
    problem.stale ? (
      <StaleBanner onReload={() => setProblem(null)} />
    ) : (
      <ErrorBanner title="결정을 저장하지 못했습니다" message={problem.message} />
    )
  ) : null;
  return { decide, banner };
}

export function DecisionButtons({
  assertion,
  onDecide,
  label,
}: {
  assertion: Assertion;
  onDecide: (action: DecisionAction) => void;
  /** 스크린리더용 대상 이름(예: "레온 · 소속 = 기사단"). */
  label: string;
}) {
  return (
    <span className="decision-buttons">
      {allowedActions(assertion).map((action) => {
        const text = action === 'approve' && assertion.approvalStatus !== 'candidate' ? '다시 확정' : DECISION_LABELS[action];
        return (
          <button
            key={action}
            type="button"
            className={action === 'approve' ? 'button-primary button-small' : 'button-secondary button-small'}
            onClick={() => onDecide(action)}
            aria-label={`${text}: ${label}`}
          >
            {text}
          </button>
        );
      })}
    </span>
  );
}

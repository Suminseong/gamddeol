import { useState, useSyncExternalStore } from 'react';
import { DEFAULT_REVIEW_PERSPECTIVE, type ReviewPerspective } from '../../review/perspectives';
import type { ReviewService } from '../../review/reviewService';
import { checkManuscript } from '../../review/validate';
import type { KeySession } from '../../session/keySession';
import type { MockTransport } from '../../transport/mockTransport';
import { KeyPanel } from './KeyPanel';
import { ManuscriptPanel } from './ManuscriptPanel';
import { MockBanner } from './MockBanner';
import { ResultPanel } from './ResultPanel';
import { RunPanel, type RunBlocker } from './RunPanel';
import { SecurityNotice } from './SecurityNotice';
import { useReviewRunner } from './useReviewRunner';

export interface QuickReviewProps {
  service: ReviewService;
  keySession: KeySession;
  /** 모의 모드일 때만 넘긴다. 넘기면 화면에 모의 모드 배너가 보인다(앱 쉘이 이미 띄우면 넘기지 않는다). */
  mockTransport?: MockTransport | null;
}

/**
 * 빠른 감평(기존 알파 한 화면 흐름 보존): 키 입력·원고 입력·관점·실행·취소·결과를 한 화면에 잇는다.
 * 원고와 결과는 이 화면 상태에만 있고 작품 자료로 저장하지 않는다. 요청과 전송은 service가 맡는다.
 */
export function QuickReview({ service, keySession, mockTransport = null }: QuickReviewProps) {
  const hasKey = useSyncExternalStore(keySession.subscribe, keySession.has, keySession.has);
  const [manuscript, setManuscript] = useState('');
  const [perspective, setPerspective] = useState<ReviewPerspective>(DEFAULT_REVIEW_PERSPECTIVE);
  const { state, run, cancel } = useReviewRunner(service, keySession);
  const running = state.phase === 'running';
  const manuscriptCheck = checkManuscript(manuscript, service.config);
  const blocker: RunBlocker = running
    ? 'running'
    : !hasKey
      ? 'no_key'
      : !manuscriptCheck.ok
        ? manuscriptCheck.reason
        : null;

  const startRun = () => {
    if (blocker === null) void run(manuscript, perspective);
  };

  return (
    <div className="quick-review">
      {mockTransport && <MockBanner transport={mockTransport} />}
      <SecurityNotice />
      <div className="app-grid">
        <div className="app-column">
          <KeyPanel keySession={keySession} hasKey={hasKey} />
          <ManuscriptPanel
            value={manuscript}
            onChange={setManuscript}
            readOnly={running}
            maxChars={service.config.maxInputChars}
            check={manuscriptCheck}
          />
          <RunPanel
            config={service.config}
            blocker={blocker}
            perspective={perspective}
            onPerspectiveChange={setPerspective}
            onRun={startRun}
            onCancel={cancel}
          />
        </div>
        <div className="app-column">
          <ResultPanel
            state={state}
            config={service.config}
            hasKey={hasKey}
            selectedPerspective={perspective}
            canRetry={blocker === null}
            onRetry={startRun}
          />
        </div>
      </div>
    </div>
  );
}

import { useState, useSyncExternalStore } from 'react';
import type { ReviewService } from '../review/reviewService';
import { checkManuscript } from '../review/validate';
import type { KeySession } from '../session/keySession';
import type { MockTransport } from '../transport/mockTransport';
import { KeyPanel } from './components/KeyPanel';
import { ManuscriptPanel } from './components/ManuscriptPanel';
import { MockBanner } from './components/MockBanner';
import { ResultPanel } from './components/ResultPanel';
import { RunPanel, type RunBlocker } from './components/RunPanel';
import { SecurityNotice } from './components/SecurityNotice';
import { copy } from './copy';
import { useReviewRunner } from './useReviewRunner';

export interface AppProps {
  service: ReviewService;
  keySession: KeySession;
  buildId: string;
  /** 모의 모드일 때만 넘긴다. 넘기면 화면에 모의 모드 배너가 보인다. */
  mockTransport?: MockTransport | null;
}

const REPOSITORY_URL = 'https://github.com/Suminseong/gamddeol';

/** UI 계층: 키 입력·원고 입력·실행·결과를 한 화면에 잇는다. 요청과 전송은 service가 맡는다. */
export function App({ service, keySession, buildId, mockTransport = null }: AppProps) {
  const hasKey = useSyncExternalStore(keySession.subscribe, keySession.has, keySession.has);
  const [manuscript, setManuscript] = useState('');
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
    if (blocker === null) void run(manuscript);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">{copy.title}</h1>
        <p className="app-tagline">{copy.tagline}</p>
      </header>

      {mockTransport && <MockBanner transport={mockTransport} />}
      <SecurityNotice />

      <main className="app-grid">
        <div className="app-column">
          <KeyPanel keySession={keySession} hasKey={hasKey} />
          <ManuscriptPanel
            value={manuscript}
            onChange={setManuscript}
            readOnly={running}
            maxChars={service.config.maxInputChars}
            check={manuscriptCheck}
          />
          <RunPanel config={service.config} blocker={blocker} onRun={startRun} onCancel={cancel} />
        </div>
        <div className="app-column">
          <ResultPanel
            state={state}
            config={service.config}
            hasKey={hasKey}
            canRetry={blocker === null}
            onRetry={startRun}
          />
        </div>
      </main>

      <footer className="app-footer">
        <span>{copy.footer.build(buildId)}</span>
        <span aria-hidden="true">·</span>
        <span>MIT</span>
        <span aria-hidden="true">·</span>
        <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
          {copy.footer.source}
        </a>
      </footer>
    </div>
  );
}

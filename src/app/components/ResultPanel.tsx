import { useEffect, useState } from 'react';
import type { ReviewConfig } from '../../review/config';
import type { ReviewError, ReviewResult } from '../../review/types';
import { copy } from '../copy';
import type { RunState } from '../useReviewRunner';

interface ResultPanelProps {
  state: RunState;
  config: ReviewConfig;
  hasKey: boolean;
  canRetry: boolean;
  onRetry(): void;
}

export function ResultPanel({ state, config, hasKey, canRetry, onRetry }: ResultPanelProps) {
  return (
    <section
      className="panel result-panel"
      aria-labelledby="result-heading"
      aria-busy={state.phase === 'running'}
      data-phase={state.phase}
    >
      <h2 id="result-heading">{copy.result.heading}</h2>
      {state.phase === 'idle' && (
        <p className="empty-state" role="status">
          {hasKey ? copy.result.empty : copy.result.emptyNoKey}
        </p>
      )}
      {state.phase === 'running' && <Waiting startedAt={state.startedAt} />}
      {state.phase === 'success' && <ResultView result={state.result} config={config} />}
      {state.phase === 'error' && <ErrorView error={state.error} canRetry={canRetry} onRetry={onRetry} />}
    </section>
  );
}

function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

function Waiting({ startedAt }: { startedAt: number }) {
  const seconds = useElapsedSeconds(startedAt);
  return (
    <p className="waiting" role="status">
      <span className="spinner" aria-hidden="true" />
      {copy.result.waiting(seconds)}
    </p>
  );
}

function ResultView({ result, config }: { result: ReviewResult; config: ReviewConfig }) {
  const mock = result.source === 'mock';
  const meta = [
    result.model ? `${copy.result.meta.model} ${result.model}` : null,
    result.responseId ? `${copy.result.meta.responseId} ${result.responseId}` : null,
    result.usage ? copy.result.meta.tokens(result.usage.inputTokens, result.usage.outputTokens) : null,
    copy.result.meta.elapsed(result.elapsedMs),
  ].filter((item): item is string => item !== null);

  return (
    <div className="result-view" data-source={result.source}>
      <p className="result-head" role="status">
        <span className={mock ? 'badge badge-mock' : 'badge badge-ai'}>
          {mock ? copy.result.badgeMock : copy.result.badgeOpenAI}
        </span>
        <span className="result-meta">{meta.join(' · ')}</span>
      </p>
      {result.incompleteReason && (
        <p className="truncated-note">{copy.result.truncated(result.incompleteReason, config.maxOutputTokens)}</p>
      )}
      <div className="result-text flat-reader-surface" translate="no" data-testid="result-text">
        <div className="flat-reader-column">{result.text}</div>
      </div>
      <p className="hint">{copy.result.aiNote}</p>
    </div>
  );
}

function ErrorView({ error, canRetry, onRetry }: { error: ReviewError; canRetry: boolean; onRetry(): void }) {
  const text = copy.errors[error.kind];
  const { status, serverMessage, serverCode, incompleteReason } = error.details;
  return (
    <div className="error-view" data-error-kind={error.kind}>
      <p className="error-title" role="alert">
        {text.title}
        {status ? ` (${status})` : ''}
      </p>
      <p>{text.guide}</p>
      {(serverMessage || serverCode || incompleteReason) && (
        <dl className="error-details">
          {serverMessage && (
            <>
              <dt>{copy.result.serverMessage}</dt>
              <dd>{serverMessage}</dd>
            </>
          )}
          {serverCode && (
            <>
              <dt>code</dt>
              <dd>{serverCode}</dd>
            </>
          )}
          {incompleteReason && (
            <>
              <dt>incomplete</dt>
              <dd>{incompleteReason}</dd>
            </>
          )}
        </dl>
      )}
      <p className="hint">{copy.result.inputKept}</p>
      <button type="button" className="button-secondary" onClick={onRetry} disabled={!canRetry}>
        {copy.result.retry}
      </button>
    </div>
  );
}

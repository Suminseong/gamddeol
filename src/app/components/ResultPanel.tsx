import { useEffect, useState } from 'react';
import type { ReviewConfig } from '../../review/config';
import { REVIEW_PERSPECTIVES, type ReviewPerspective } from '../../review/perspectives';
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
      {state.phase === 'success' && (
        <ResultView result={state.result} config={config} perspective={state.perspective} />
      )}
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

function ResultView({
  result,
  config,
  perspective,
}: {
  result: ReviewResult;
  config: ReviewConfig;
  perspective: ReviewPerspective;
}) {
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
      <p className="result-perspective">{copy.result.perspective(REVIEW_PERSPECTIVES[perspective].label)}</p>
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
  const { status } = error.details;
  return (
    <div className="error-view" data-error-kind={error.kind}>
      <p className="error-title" role="alert">
        {text.title}
        {status ? ` (${status})` : ''}
      </p>
      <p>{text.guide}</p>
      <p className="hint">{copy.result.inputKept}</p>
      <p className="hint">{copy.result.retryPerspective}</p>
      <button type="button" className="button-secondary" onClick={onRetry} disabled={!canRetry}>
        {copy.result.retry}
      </button>
    </div>
  );
}

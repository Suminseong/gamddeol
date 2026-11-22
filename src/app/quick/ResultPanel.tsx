import { useEffect, useState } from 'react';
import type { ReviewConfig } from '../../review/config';
import { REVIEW_PERSPECTIVES, type ReviewPerspective } from '../../review/perspectives';
import type { ReviewError, ReviewResult } from '../../review/types';
import { copy } from '../copy';
import type { RunState } from './useReviewRunner';

interface ResultPanelProps {
  state: RunState;
  config: ReviewConfig;
  hasKey: boolean;
  /** 지금 화면에서 선택된 관점 (다음 실행에 쓰일 값). */
  selectedPerspective: ReviewPerspective;
  canRetry: boolean;
  onRetry(): void;
}

export function ResultPanel({ state, config, hasKey, selectedPerspective, canRetry, onRetry }: ResultPanelProps) {
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
        <ResultView
          result={state.result}
          config={config}
          perspective={state.perspective}
          selectedPerspective={selectedPerspective}
        />
      )}
      {state.phase === 'error' && (
        <ErrorView
          error={state.error}
          selectedPerspective={selectedPerspective}
          canRetry={canRetry}
          onRetry={onRetry}
        />
      )}
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

/**
 * 스크린리더에는 고정 문구 하나만 알린다(role=status는 이 문구에만 둔다).
 * 1초마다 바뀌는 경과 시간은 화면 표시용이라 상태 영역 밖에 두고 낭독에서 뺀다.
 */
function Waiting({ startedAt }: { startedAt: number }) {
  const seconds = useElapsedSeconds(startedAt);
  return (
    <div className="waiting">
      <span className="spinner" aria-hidden="true" />
      <p className="waiting-text" role="status">
        {copy.result.waiting}
      </p>
      <span className="waiting-elapsed" aria-hidden="true">
        {copy.result.elapsed(seconds)}
      </span>
    </div>
  );
}

function ResultView({
  result,
  config,
  perspective,
  selectedPerspective,
}: {
  result: ReviewResult;
  config: ReviewConfig;
  perspective: ReviewPerspective;
  selectedPerspective: ReviewPerspective;
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
      {selectedPerspective !== perspective && (
        <p className="perspective-changed hint">
          {copy.result.perspectiveChanged(REVIEW_PERSPECTIVES[selectedPerspective].label)}
        </p>
      )}
      {result.incompleteReason && (
        <p className="truncated-note">{copy.result.truncated(result.incompleteReason, config.maxOutputTokens)}</p>
      )}
      {/* 내부 스크롤 영역은 키보드 사용자도 들어가 스크롤할 수 있도록 초점을 받는다. */}
      <div
        className="result-text flat-reader-surface"
        translate="no"
        data-testid="result-text"
        role="region"
        aria-label={copy.result.bodyLabel}
        aria-describedby="result-body-hint"
        tabIndex={0}
      >
        <div className="flat-reader-column">{result.text}</div>
      </div>
      <p id="result-body-hint" className="hint">
        {copy.result.bodyHint}
      </p>
      <p className="hint">{copy.result.aiNote}</p>
    </div>
  );
}

function ErrorView({
  error,
  selectedPerspective,
  canRetry,
  onRetry,
}: {
  error: ReviewError;
  selectedPerspective: ReviewPerspective;
  canRetry: boolean;
  onRetry(): void;
}) {
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
      <p className="hint">{copy.result.retryPerspective(REVIEW_PERSPECTIVES[selectedPerspective].label)}</p>
      <button type="button" className="button-secondary" onClick={onRetry} disabled={!canRetry}>
        {copy.result.retry}
      </button>
    </div>
  );
}

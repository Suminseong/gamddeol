import { useEffect, useRef } from 'react';
import type { ReviewConfig } from '../../review/config';
import { isReviewPerspective, REVIEW_PERSPECTIVES, type ReviewPerspective } from '../../review/perspectives';
import { OPENAI_RESPONSES_ENDPOINT } from '../../transport/endpoint';
import { copy } from '../copy';

export type RunBlocker = 'running' | 'no_key' | 'empty' | 'too_long' | null;

interface RunPanelProps {
  config: ReviewConfig;
  blocker: RunBlocker;
  perspective: ReviewPerspective;
  onPerspectiveChange(next: ReviewPerspective): void;
  onRun(): void;
  onCancel(): void;
}

/** 전송 사실 고지 + 실행·취소 버튼. 고지는 실행 버튼보다 먼저(위에) 보인다. */
export function RunPanel({
  config,
  blocker,
  perspective,
  onPerspectiveChange,
  onRun,
  onCancel,
}: RunPanelProps) {
  const running = blocker === 'running';
  const runRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const focusOnRun = useRef(false);

  // 실행 버튼은 실행 중 비활성화되어 초점을 잃는다. 키보드 사용자가 초점을 잃지 않도록
  // 실행 중에는 취소 버튼으로, 끝나면(취소 버튼이 사라지면) 실행 버튼으로 초점을 옮긴다.
  // 사용자가 다른 곳에 초점을 둔 경우(본문 등)는 건드리지 않는다.
  useEffect(() => {
    const active = document.activeElement;
    const lost = active === null || active === document.body;
    if (running) {
      focusOnRun.current = false;
      if (lost || active === runRef.current) cancelRef.current?.focus();
    } else if (focusOnRun.current && lost) {
      focusOnRun.current = false;
      runRef.current?.focus();
    }
  }, [running]);

  const selected = REVIEW_PERSPECTIVES[perspective];
  return (
    <section className="panel run-panel" aria-labelledby="disclosure-heading">
      <div className="review-perspective">
        <label htmlFor="review-perspective">{copy.run.perspective}</label>
        <select
          id="review-perspective"
          className="text-input"
          value={perspective}
          disabled={running}
          aria-describedby="review-perspective-description review-perspective-timing"
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (isReviewPerspective(value)) onPerspectiveChange(value);
          }}
        >
          {Object.entries(REVIEW_PERSPECTIVES).map(([value, { label }]) => (
            <option value={value} key={value}>{label}</option>
          ))}
        </select>
        <p id="review-perspective-description" className="hint perspective-description">
          {selected.description}
        </p>
        <p id="review-perspective-timing" className="hint">
          {copy.run.perspectiveTiming}
        </p>
      </div>
      <div className="disclosure" id="send-disclosure">
        <h2 id="disclosure-heading" className="disclosure-heading">
          {copy.run.disclosureLead}
        </h2>
        <code className="endpoint">{OPENAI_RESPONSES_ENDPOINT}</code>
        <ul>
          <li>{copy.run.sendKey}</li>
          <li>{copy.run.sendManuscript}</li>
          <li>{copy.run.sendInstructions(selected.label)}</li>
        </ul>
        <p>{copy.run.disclosureTail}</p>
        <p className="params">
          {copy.run.params(config.model, config.reasoningEffort, config.maxOutputTokens, config.requestTimeoutMs)}
        </p>
      </div>
      <div className="run-actions">
        <button
          ref={runRef}
          type="button"
          className="neu-cta-button run-button"
          onClick={onRun}
          disabled={blocker !== null}
          aria-describedby={blocker && !running ? 'send-disclosure run-blocker' : 'send-disclosure'}
        >
          {running ? copy.run.buttonRunning : copy.run.button}
        </button>
        {running && (
          <button
            ref={cancelRef}
            type="button"
            className="button-secondary"
            onClick={onCancel}
            onFocus={() => {
              focusOnRun.current = true;
            }}
          >
            {copy.run.cancel}
          </button>
        )}
      </div>
      {blocker && !running && (
        <p id="run-blocker" className="hint">
          {copy.run.blockers[blocker]}
        </p>
      )}
    </section>
  );
}

import type { ReviewConfig } from '../../review/config';
import { OPENAI_RESPONSES_ENDPOINT } from '../../transport/endpoint';
import { copy } from '../copy';

export type RunBlocker = 'running' | 'no_key' | 'empty' | 'too_long' | null;

interface RunPanelProps {
  config: ReviewConfig;
  blocker: RunBlocker;
  onRun(): void;
  onCancel(): void;
}

/** 전송 사실 고지 + 실행·취소 버튼. 고지는 실행 버튼보다 먼저(위에) 보인다. */
export function RunPanel({ config, blocker, onRun, onCancel }: RunPanelProps) {
  const running = blocker === 'running';
  return (
    <section className="panel run-panel" aria-labelledby="disclosure-heading">
      <div className="disclosure" id="send-disclosure">
        <h2 id="disclosure-heading" className="disclosure-heading">
          {copy.run.disclosureLead}
        </h2>
        <code className="endpoint">{OPENAI_RESPONSES_ENDPOINT}</code>
        <ul>
          <li>{copy.run.sendKey}</li>
          <li>{copy.run.sendManuscript}</li>
        </ul>
        <p>{copy.run.disclosureTail}</p>
        <p className="params">
          {copy.run.params(config.model, config.reasoningEffort, config.maxOutputTokens, config.requestTimeoutMs)}
        </p>
      </div>
      <div className="run-actions">
        <button
          type="button"
          className="neu-cta-button run-button"
          onClick={onRun}
          disabled={blocker !== null}
          aria-describedby={blocker && !running ? 'send-disclosure run-blocker' : 'send-disclosure'}
        >
          {running ? copy.run.buttonRunning : copy.run.button}
        </button>
        {running && (
          <button type="button" className="button-secondary" onClick={onCancel}>
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

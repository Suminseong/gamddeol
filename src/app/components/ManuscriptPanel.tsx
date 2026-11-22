import type { ManuscriptCheck } from '../../review/validate';
import { copy } from '../copy';

interface ManuscriptPanelProps {
  value: string;
  onChange(next: string): void;
  readOnly: boolean;
  maxChars: number;
  check: ManuscriptCheck;
}

/**
 * 평문 원고 입력칸. 맞춤법 검사·자동 수정·번역·문법 확장 프로그램을 끄는 속성을 붙여
 * 브라우저 기능이 원고를 다른 서버로 보내지 않도록 한다(가능한 범위에서).
 */
export function ManuscriptPanel({ value, onChange, readOnly, maxChars, check }: ManuscriptPanelProps) {
  const tooLong = !check.ok && check.reason === 'too_long';
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 id="manuscript-heading">
          <label htmlFor="manuscript">{copy.manuscript.label}</label>
        </h2>
        <span id="manuscript-count" className={tooLong ? 'counter is-over' : 'counter'}>
          {copy.manuscript.counter(check.length, maxChars)}
        </span>
      </div>
      <textarea
        id="manuscript"
        className="manuscript-input flat-reader-surface"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        placeholder={copy.manuscript.placeholder}
        rows={16}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        translate="no"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        data-lt-active="false"
        aria-describedby="manuscript-count"
        aria-invalid={tooLong}
      />
      {tooLong && (
        <p className="field-error" role="alert">
          {copy.manuscript.tooLong(maxChars)}
        </p>
      )}
    </section>
  );
}

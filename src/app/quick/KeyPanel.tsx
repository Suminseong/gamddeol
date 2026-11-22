import { useRef, useState, type KeyboardEvent } from 'react';
import { normalizeApiKey, type KeyProblem, type KeySession } from '../../session/keySession';
import { copy } from '../copy';

interface KeyPanelProps {
  keySession: KeySession;
  hasKey: boolean;
}

/**
 * 키 입력칸은 React 상태로 들고 있지 않는다(비제어 입력).
 * 등록하면 값을 keySession(탭 메모리)으로 옮기고 입력칸은 바로 비운다.
 */
export function KeyPanel({ keySession, hasKey }: KeyPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<KeyProblem | null>(null);

  const register = () => {
    const input = inputRef.current;
    if (!input) return;
    const result = normalizeApiKey(input.value);
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    keySession.set(result.key);
    input.value = '';
    setProblem(null);
  };

  const clear = () => {
    keySession.clear();
    if (inputRef.current) inputRef.current.value = '';
    setProblem(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      register();
    }
  };

  return (
    <section className="panel">
      <h2 id="key-heading">
        <label htmlFor="openai-key">{copy.key.label}</label>
      </h2>
      <div className="key-row">
        <input
          ref={inputRef}
          id="openai-key"
          className="text-input key-input"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={hasKey ? copy.key.placeholderSet : copy.key.placeholderEmpty}
          aria-describedby="key-status key-hint"
          aria-invalid={problem !== null}
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
          onKeyDown={onKeyDown}
        />
        <button type="button" className="button-secondary" onClick={register}>
          {copy.key.register}
        </button>
        <button type="button" className="button-secondary" onClick={clear}>
          {copy.key.clear}
        </button>
      </div>
      <p id="key-status" role="status" className={hasKey ? 'key-status is-set' : 'key-status'}>
        {hasKey ? copy.key.registered : copy.key.notRegistered}
      </p>
      {problem && (
        <p className="field-error" role="alert">
          {copy.key.problems[problem]}
        </p>
      )}
      <p id="key-hint" className="hint">
        {copy.key.hint}
      </p>
    </section>
  );
}

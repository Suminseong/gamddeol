/**
 * OpenAI API 키를 이 탭의 메모리(클로저 변수)에만 둔다.
 * localStorage·sessionStorage·쿠키·URL 어디에도 쓰지 않으므로
 * 지우기를 누르거나 새로고침·탭 닫기를 하면 사라진다.
 * 등록만으로는 아무 요청도 보내지 않는다.
 */
export interface KeySession {
  has(): boolean;
  get(): string | null;
  set(key: string): void;
  clear(): void;
  /** React useSyncExternalStore용 구독. */
  subscribe(listener: () => void): () => void;
}

export function createKeySession(): KeySession {
  let key: string | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    has: () => key !== null,
    get: () => key,
    set(next) {
      key = next;
      notify();
    },
    clear() {
      if (key === null) return;
      key = null;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type KeyProblem = 'empty' | 'whitespace' | 'invalid_chars' | 'too_short';

/**
 * 입력값을 등록 가능한 키로 정리한다. 앞뒤 공백만 지우고 나머지는 그대로 쓴다.
 * HTTP 헤더에 넣을 수 없는 문자(한글 등)가 섞이면 등록하지 않는다.
 */
export function normalizeApiKey(raw: string): { ok: true; key: string } | { ok: false; problem: KeyProblem } {
  const key = raw.trim();
  if (key.length === 0) return { ok: false, problem: 'empty' };
  if (/\s/.test(key)) return { ok: false, problem: 'whitespace' };
  if (!/^[\x21-\x7e]+$/.test(key)) return { ok: false, problem: 'invalid_chars' };
  if (key.length < 20) return { ok: false, problem: 'too_short' };
  return { ok: true, key };
}

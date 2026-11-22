import { describe, expect, it, vi } from 'vitest';
import { FAKE_API_KEY } from '../testing/fixtures';
import { createKeySession, normalizeApiKey } from './keySession';

describe('createKeySession', () => {
  it('키를 메모리에만 두고 지우면 사라진다', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const session = createKeySession();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    expect(session.has()).toBe(false);
    session.set(FAKE_API_KEY);
    expect(session.has()).toBe(true);
    expect(session.get()).toBe(FAKE_API_KEY);
    session.clear();
    expect(session.has()).toBe(false);
    expect(session.get()).toBeNull();
    session.clear();

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    session.set(FAKE_API_KEY);
    expect(listener).toHaveBeenCalledTimes(2);

    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('세션마다 따로 보관한다', () => {
    const first = createKeySession();
    const second = createKeySession();
    first.set(FAKE_API_KEY);
    expect(second.has()).toBe(false);
  });
});

describe('normalizeApiKey', () => {
  it('앞뒤 공백만 지운다', () => {
    expect(normalizeApiKey(`  ${FAKE_API_KEY}\n`)).toEqual({ ok: true, key: FAKE_API_KEY });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['sk-uitest FAKE-KEY-000000000000', 'whitespace'],
    ['sk-uitest-가짜-KEY-000000000000000', 'invalid_chars'],
    ['sk-short', 'too_short'],
  ])('%j → %s', (raw, problem) => {
    expect(normalizeApiKey(raw)).toEqual({ ok: false, problem });
  });
});

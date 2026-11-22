/**
 * 화면 선호(테마·원고 글꼴). 이 탭 메모리에만 두고 저장하지 않는다.
 * 테마 'system'은 기기 설정(prefers-color-scheme)을 따른다.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';
export type ReaderFont = 'serif' | 'sans';

export interface UiPrefsState {
  theme: ThemeChoice;
  readerFont: ReaderFont;
}

export interface UiPrefs {
  get(): UiPrefsState;
  subscribe(listener: () => void): () => void;
  setTheme(theme: ThemeChoice): void;
  setReaderFont(font: ReaderFont): void;
  /** 지금 화면에 적용된 테마(라이트/다크). */
  effectiveTheme(): 'light' | 'dark';
}

export function createUiPrefs(root: HTMLElement, media: MediaQueryList | null): UiPrefs {
  let state: UiPrefsState = { theme: 'system', readerFont: 'serif' };
  const listeners = new Set<() => void>();
  const effective = () => (state.theme === 'system' ? (media?.matches ? 'dark' : 'light') : state.theme);
  const apply = () => {
    root.dataset.theme = effective();
    root.dataset.readerFont = state.readerFont;
  };
  const update = (next: Partial<UiPrefsState>) => {
    state = { ...state, ...next };
    apply();
    for (const listener of listeners) listener();
  };
  media?.addEventListener('change', () => {
    if (state.theme === 'system') update({});
  });
  apply();
  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setTheme: (theme) => update({ theme }),
    setReaderFont: (readerFont) => update({ readerFont }),
    effectiveTheme: effective,
  };
}

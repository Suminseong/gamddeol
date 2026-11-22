/**
 * 디자인 토큰(docs/design/tokens/design-tokens.css)의 [data-theme="dark"]를 시스템 설정에 맞춰 켠다.
 * 선택값은 어디에도 저장하지 않는다.
 */
export function syncThemeWithSystem(root: HTMLElement, media: MediaQueryList | null): () => void {
  const apply = () => {
    root.dataset.theme = media?.matches ? 'dark' : 'light';
  };
  apply();
  media?.addEventListener('change', apply);
  return () => media?.removeEventListener('change', apply);
}

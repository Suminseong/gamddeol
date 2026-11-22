import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../docs/design/tokens/design-tokens.css';
import './app/app.css';
import './app/refinement.css';
import { createAiRunner } from './ai/aiRunner';
import { App } from './app/App';
import type { AppServices } from './app/context';
import { copy } from './app/copy';
import { createUiPrefs } from './app/prefs';
import { createWorkspaceStore } from './domain/store';
import { REVIEW_CONFIG } from './review/config';
import { createReviewService } from './review/reviewService';
import { createBrowserRouter } from './router/router';
import { isFramed } from './security/frameGuard';
import { createKeySession } from './session/keySession';
import { createMockTransport } from './transport/mockTransport';
import { createOpenAITransport } from './transport/openaiTransport';

/**
 * 조립 지점: 여기서만 실제 OpenAI 전송과 모의 전송 중 하나를 고른다.
 * 작품 자료·키·화면 선호는 모두 이 탭 메모리에만 있다(브라우저 저장소·서버 미사용).
 */

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root element is missing');

const prefs = createUiPrefs(document.documentElement, window.matchMedia?.('(prefers-color-scheme: dark)') ?? null);

if (isFramed()) {
  rootElement.textContent = copy.framed;
} else {
  const keySession = createKeySession();
  // 뒤로 가기 캐시(bfcache)로 페이지가 되살아나도 키가 남지 않도록, 페이지를 떠날 때 지운다.
  window.addEventListener('pagehide', () => keySession.clear());

  // 배포 빌드에서는 __GAMDDEOL_MOCK__이 false로 고정되어 모의 전송 코드가 번들에서 빠진다.
  const mockTransport = __GAMDDEOL_MOCK__ ? createMockTransport({ delayMs: 800 }) : null;
  const transport = mockTransport ?? createOpenAITransport();
  const store = createWorkspaceStore();
  const services: AppServices = {
    store,
    router: createBrowserRouter(import.meta.env.BASE_URL),
    keySession,
    reviewService: createReviewService(transport),
    aiRunner: createAiRunner(store, transport, keySession, REVIEW_CONFIG),
    prefs,
    buildId: __GAMDDEOL_BUILD_ID__,
    mockTransport,
    newId: () => crypto.randomUUID(),
  };

  createRoot(rootElement).render(
    <StrictMode>
      <App services={services} />
    </StrictMode>,
  );
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../docs/design/tokens/design-tokens.css';
import './app/app.css';
import { App } from './app/App';
import { copy } from './app/copy';
import { syncThemeWithSystem } from './app/theme';
import { createReviewService } from './review/reviewService';
import { isFramed } from './security/frameGuard';
import { createKeySession } from './session/keySession';
import { createMockTransport } from './transport/mockTransport';
import { createOpenAITransport } from './transport/openaiTransport';

/** 조립 지점: 여기서만 실제 OpenAI 전송과 모의 전송 중 하나를 고른다. */

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root element is missing');

syncThemeWithSystem(document.documentElement, window.matchMedia?.('(prefers-color-scheme: dark)') ?? null);

if (isFramed()) {
  rootElement.textContent = copy.framed;
} else {
  const keySession = createKeySession();
  // 뒤로 가기 캐시(bfcache)로 페이지가 되살아나도 키가 남지 않도록, 페이지를 떠날 때 지운다.
  window.addEventListener('pagehide', () => keySession.clear());

  // 배포 빌드에서는 __GAMDDEOL_MOCK__이 false로 고정되어 모의 전송 코드가 번들에서 빠진다.
  const mockTransport = __GAMDDEOL_MOCK__ ? createMockTransport({ delayMs: 800 }) : null;
  const service = createReviewService(mockTransport ?? createOpenAITransport());

  createRoot(rootElement).render(
    <StrictMode>
      <App
        service={service}
        keySession={keySession}
        buildId={__GAMDDEOL_BUILD_ID__}
        mockTransport={mockTransport}
      />
    </StrictMode>,
  );
}

/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { buildContentSecurityPolicy } from './src/security/csp.ts';

/** GitHub Pages 프로젝트 경로: https://suminseong.github.io/gamddeol/ */
const BASE_PATH = '/gamddeol/';

/** 빌드 식별자. CI에서는 커밋 SHA를 넣는다. 영숫자·.-_ 외 문자는 받지 않는다. */
function resolveBuildId(): string {
  const raw = process.env.GAMDDEOL_BUILD_ID ?? 'local';
  return /^[A-Za-z0-9._-]{1,64}$/.test(raw) ? raw : 'invalid-build-id';
}

/**
 * index.html 처리: 빌드 식별자를 넣고, 배포 빌드에는 CSP <meta>를 넣는다.
 * 개발 서버는 Vite가 인라인 스크립트를 쓰므로 CSP를 넣지 않는다.
 */
function gamddeolHtml(buildId: string): Plugin {
  return {
    name: 'gamddeol-html',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const withBuildId = html.replaceAll('__GAMDDEOL_BUILD_ID__', buildId);
        if (context.server) return withBuildId.replace('<!-- gamddeol:csp -->', '');
        const csp = buildContentSecurityPolicy();
        return withBuildId.replace(
          '<!-- gamddeol:csp -->',
          `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
        );
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const buildId = resolveBuildId();
  return {
    base: BASE_PATH,
    plugins: [react(), gamddeolHtml(buildId)],
    define: {
      __GAMDDEOL_MOCK__: JSON.stringify(mode === 'mock'),
      __GAMDDEOL_BUILD_ID__: JSON.stringify(buildId),
    },
    build: {
      sourcemap: false,
    },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
      unstubGlobals: true,
    },
  };
});

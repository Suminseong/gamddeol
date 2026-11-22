import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 실험(experiments/) 전용 테스트 설정. 감평 알파의 `npm test`·Pages 워크플로와 분리해
 * 실험이 깨져도 알파 배포를 막지 않고, 알파 설정이 실험을 끌어들이지도 않게 한다.
 */
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['experiments/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});

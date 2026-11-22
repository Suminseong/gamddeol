import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 검증. 가짜 키와 짧은 UI 검사 문자열, 네트워크 모의 응답만 쓴다.
 * - 기본: 로컬 배포 빌드(vite preview)를 GitHub Pages와 같은 /gamddeol/ 경로로 띄워 검사한다.
 * - E2E_BASE_URL을 주면 그 주소(예: 배포된 GitHub Pages)를 검사한다.
 * 스크린샷·영상·트레이스는 남기지 않는다.
 */
const externalBaseURL = process.env.E2E_BASE_URL;
const localBaseURL = 'http://127.0.0.1:4173/gamddeol/';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: externalBaseURL ?? localBaseURL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'npm run preview',
        url: localBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});

import { expect, type Page, type Route } from '@playwright/test';
import { FAKE_API_KEY, UI_CHECK_TEXT } from '../src/testing/fixtures.ts';
import { OPENAI_RESPONSES_ENDPOINT } from '../src/transport/endpoint.ts';

export { FAKE_API_KEY, OPENAI_RESPONSES_ENDPOINT, UI_CHECK_TEXT };

/** 네트워크 모의 응답 문구. 화면에 보이면 모의 응답임을 알 수 있게 표시를 붙인다. */
export const NETWORK_MOCK_TEXT = '[네트워크 모의 응답] UI 검사용 1행\n[네트워크 모의 응답] UI 검사용 2행';
export const NETWORK_MOCK_RESPONSE_ID = 'resp_e2e_network_mock';

export function mockSuccessBody(text = NETWORK_MOCK_TEXT) {
  return {
    id: NETWORK_MOCK_RESPONSE_ID,
    object: 'response',
    status: 'completed',
    model: 'gpt-6-luna',
    output: [
      {
        type: 'message',
        id: 'msg_e2e',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
  };
}

export function openAIErrorBody(message: string, type: string, code: string | null) {
  return { error: { message, type, param: null, code } };
}

/** 모의 응답에도 CORS 헤더를 붙인다 (브라우저는 가로챈 응답에도 CORS 검사를 한다). */
export async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

export interface PageAudit {
  requests: string[];
  /** OpenAI 엔드포인트로 간 요청의 HTTP 메서드. */
  apiMethods: string[];
  failedRequests: string[];
  badResponses: string[];
  consoleMessages: { type: string; text: string }[];
  pageErrors: string[];
  /** 앱이 보낸 API 요청 수. 브라우저가 스스로 보내는 CORS 사전 확인(OPTIONS, 키·본문 없음)은 세지 않는다. */
  apiRequestCount(): number;
  /** 같은 출처의 프로젝트 경로와 OpenAI 엔드포인트 외로 나간 요청. */
  outsideAllowList(): string[];
}

/** 페이지가 보내는 모든 요청·콘솔·오류를 기록한다. */
export function auditPage(page: Page, baseURL: string): PageAudit {
  const base = new URL(baseURL);
  const audit: PageAudit = {
    requests: [],
    apiMethods: [],
    failedRequests: [],
    badResponses: [],
    consoleMessages: [],
    pageErrors: [],
    apiRequestCount: () => audit.apiMethods.filter((method) => method !== 'OPTIONS').length,
    outsideAllowList: () =>
      audit.requests.filter((raw) => {
        if (raw === OPENAI_RESPONSES_ENDPOINT || raw.startsWith('data:')) return false;
        const url = new URL(raw);
        return !(url.origin === base.origin && url.pathname.startsWith(base.pathname));
      }),
  };
  page.on('request', (request) => {
    audit.requests.push(request.url());
    if (request.url() === OPENAI_RESPONSES_ENDPOINT) audit.apiMethods.push(request.method());
  });
  page.on('requestfailed', (request) =>
    audit.failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? ''}`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url() !== OPENAI_RESPONSES_ENDPOINT) {
      audit.badResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('console', (message) => audit.consoleMessages.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => audit.pageErrors.push(String(error)));
  return audit;
}

/** 콘솔에 오류·경고가 없고, 키나 검사 문자열이 찍히지 않았는지 확인한다. */
export function expectCleanConsole(audit: PageAudit) {
  const problems = audit.consoleMessages.filter(
    (message) =>
      message.type === 'error' ||
      message.type === 'warning' ||
      message.text.includes(FAKE_API_KEY) ||
      message.text.includes('UI 검사 문자열'),
  );
  expect(problems).toEqual([]);
  expect(audit.pageErrors).toEqual([]);
}

export const keyInput = (page: Page) => page.getByLabel('OpenAI API 키');
export const manuscriptInput = (page: Page) => page.getByLabel('원고 (평문)');
export const runButton = (page: Page) => page.getByRole('button', { name: /감평 실행|감평 중/ });
export const errorTitle = (page: Page) => page.locator('.error-title');
export const resultText = (page: Page) => page.getByTestId('result-text');

export async function registerFakeKey(page: Page) {
  await keyInput(page).fill(FAKE_API_KEY);
  await page.getByRole('button', { name: '등록' }).click();
  await expect(page.getByText(/키 등록됨/)).toBeVisible();
  await expect(keyInput(page)).toHaveValue('');
}

export async function fillUiCheckText(page: Page) {
  await manuscriptInput(page).fill(UI_CHECK_TEXT);
  await expect(manuscriptInput(page)).toHaveValue(UI_CHECK_TEXT);
}

/** 브라우저 영구 저장소·쿠키·서비스 워커·URL 상태를 읽는다. */
export async function readBrowserState(page: Page) {
  return page.evaluate(async () => ({
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length,
    cookie: document.cookie,
    indexedDB: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).length : 0,
    caches: 'caches' in globalThis ? (await caches.keys()).length : 0,
    serviceWorkers: 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    url: location.href,
    html: document.documentElement.outerHTML,
  }));
}

export async function expectNothingPersisted(page: Page, baseURL: string) {
  const state = await readBrowserState(page);
  expect({
    localStorage: state.localStorage,
    sessionStorage: state.sessionStorage,
    cookie: state.cookie,
    indexedDB: state.indexedDB,
    caches: state.caches,
    serviceWorkers: state.serviceWorkers,
  }).toEqual({ localStorage: 0, sessionStorage: 0, cookie: '', indexedDB: 0, caches: 0, serviceWorkers: 0 });
  expect(state.url).toBe(new URL('./', baseURL).href);
  expect(state.html).not.toContain(FAKE_API_KEY);
}

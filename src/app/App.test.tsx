import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildResponsesRequest } from '../review/buildRequest';
import { REVIEW_CONFIG } from '../review/config';
import { createReviewService } from '../review/reviewService';
import { createKeySession } from '../session/keySession';
import { FAKE_API_KEY, UI_CHECK_TEXT } from '../testing/fixtures';
import {
  createMockTransport,
  MOCK_RESPONSE_TEXT,
  type MockScenario,
  type MockTransportOptions,
} from '../transport/mockTransport';
import { App } from './App';

afterEach(() => {
  cleanup();
});

function setup(options: MockTransportOptions = {}, { showMockBanner = true } = {}) {
  const transport = createMockTransport(options);
  const keySession = createKeySession();
  const user = userEvent.setup();
  render(
    <App
      service={createReviewService(transport)}
      keySession={keySession}
      buildId="test-build"
      mockTransport={showMockBanner ? transport : null}
    />,
  );
  return { transport, keySession, user };
}

const keyInput = () => screen.getByLabelText<HTMLInputElement>('OpenAI API 키');
const manuscriptInput = () => screen.getByLabelText<HTMLTextAreaElement>('원고 (평문)');
const runButton = () => screen.getByRole<HTMLButtonElement>('button', { name: /감평 실행|감평 중/ });

async function registerKey(user: ReturnType<typeof userEvent.setup>, key = FAKE_API_KEY) {
  await user.type(keyInput(), key);
  await user.click(screen.getByRole('button', { name: '등록' }));
}

async function typeManuscript(user: ReturnType<typeof userEvent.setup>) {
  await user.type(manuscriptInput(), UI_CHECK_TEXT.replace('\n', '{Enter}'));
}

describe('App', () => {
  it('전송 고지·OpenAI 권고를 먼저 보여 주고, 모의 모드면 배너를 띄운다', () => {
    setup();
    expect(screen.getByText('https://api.openai.com/v1/responses')).toBeTruthy();
    expect(screen.getByText(/OpenAI는 API 키를 브라우저나 모바일 앱 같은 클라이언트 환경에 두지 말고/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'OpenAI 도움말: API 키 안전 수칙' }).getAttribute('rel')).toBe(
      'noopener noreferrer',
    );
    expect(screen.getByText(/모의 모드/)).toBeTruthy();
  });

  it('키 등록만으로는 아무것도 보내지 않고, 입력칸을 비운다', async () => {
    const { transport, keySession, user } = setup();
    await registerKey(user);

    expect(keySession.get()).toBe(FAKE_API_KEY);
    expect(keyInput().value).toBe('');
    expect(screen.getByText(/키 등록됨/)).toBeTruthy();
    expect(transport.calls).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain(FAKE_API_KEY);
  });

  it('잘못된 키는 등록하지 않는다', async () => {
    const { keySession, user } = setup();
    await registerKey(user, 'sk-short');
    expect(keySession.has()).toBe(false);
    expect(screen.getByRole('alert').textContent).toContain('너무 짧습니다');
  });

  it('키가 없거나 원고가 비면 실행할 수 없다', async () => {
    const { user } = setup();
    expect(runButton().disabled).toBe(true);
    expect(screen.getByText('먼저 OpenAI API 키를 등록하세요.')).toBeTruthy();

    await registerKey(user);
    expect(runButton().disabled).toBe(true);
    expect(screen.getByText('원고를 입력하세요.')).toBeTruthy();

    await user.type(manuscriptInput(), '   ');
    expect(runButton().disabled).toBe(true);
  });

  it('줄바꿈을 보존해 보내고, 결과를 모의 응답으로 구분해 보여 준다', async () => {
    const { transport, user } = setup();
    await registerKey(user);
    await typeManuscript(user);
    expect(manuscriptInput().value).toBe(UI_CHECK_TEXT);

    await user.click(runButton());

    const resultText = await screen.findByTestId('result-text');
    expect(resultText.textContent).toBe(MOCK_RESPONSE_TEXT);
    expect(screen.getByText('모의 응답 · 네트워크 미사용')).toBeTruthy();
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]?.body).toMatchObject({
      input: UI_CHECK_TEXT,
      instructions: REVIEW_CONFIG.instructions,
      model: 'gpt-6-luna',
      store: false,
    });
  });

  it('선택한 관점을 지시에 추가하고 결과에는 제출한 관점을 표시한다', async () => {
    const { transport, user } = setup();
    await registerKey(user);
    await typeManuscript(user);

    const selector = screen.getByRole('combobox', { name: '감평 관점' });
    await user.selectOptions(selector, 'pacing');
    expect(transport.calls).toHaveLength(0);
    await user.click(runButton());

    expect(await screen.findByText('적용한 감평 관점 · 전개·몰입')).toBeTruthy();
    expect(transport.calls).toHaveLength(1);
    const base = buildResponsesRequest(UI_CHECK_TEXT, REVIEW_CONFIG);
    expect(transport.calls[0]?.body).toEqual({
      ...base,
      instructions: expect.stringContaining(`${REVIEW_CONFIG.instructions}\n\n전개 속도`),
    });

    await user.selectOptions(selector, 'coherence');
    expect(screen.getByText('적용한 감평 관점 · 전개·몰입')).toBeTruthy();
    expect(transport.calls).toHaveLength(1);
    await user.click(runButton());

    expect(await screen.findByText('적용한 감평 관점 · 인물·설정 일관성')).toBeTruthy();
    expect(transport.calls).toHaveLength(2);
    expect(transport.calls[1]?.body).toEqual({
      ...base,
      instructions: expect.stringContaining(`${REVIEW_CONFIG.instructions}\n\n인물의 행동과 동기`),
    });
  });

  it('키를 등록하면 빈 결과 문구가 다시 키 등록을 요구하지 않는다', async () => {
    const { user } = setup();
    expect(screen.getByText(/키가 없으면 감평을 실행할 수 없습니다/)).toBeTruthy();
    await registerKey(user);
    const empty = screen.getByText(/아직 결과가 없습니다/);
    expect(empty.textContent).not.toMatch(/키를 등록/);
    expect(empty.textContent).toMatch(/감평 관점/);
  });

  it('전송 고지에 선택한 관점의 감평 지시가 함께 간다고 알리고, 관점 설명을 연결한다', async () => {
    const { user } = setup();
    const disclosure = document.getElementById('send-disclosure');
    expect(disclosure?.textContent).toContain('감평 지시(기본 지시 + 선택한 관점 「일반 감평」) → 요청 본문');

    const selector = screen.getByRole<HTMLSelectElement>('combobox', { name: '감평 관점' });
    await user.selectOptions(selector, 'coherence');
    expect(disclosure?.textContent).toContain('선택한 관점 「인물·설정 일관성」');
    const describedBy = selector.getAttribute('aria-describedby')?.split(' ') ?? [];
    const description = describedBy.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(description).toMatch(/인물의 행동·동기/);
    expect(description).toMatch(/다음 실행부터 적용/);
  });

  it('결과를 받은 뒤 관점을 바꾸면 이번 결과에는 반영되지 않고 다음 실행에 적용된다고 알린다', async () => {
    const { transport, user } = setup();
    await registerKey(user);
    await typeManuscript(user);
    await user.click(runButton());
    expect(await screen.findByText('적용한 감평 관점 · 일반 감평')).toBeTruthy();
    expect(screen.queryByText(/이 결과에 반영되지 않았습니다/)).toBeNull();

    await user.selectOptions(screen.getByRole('combobox', { name: '감평 관점' }), 'pacing');
    expect(screen.getByText('적용한 감평 관점 · 일반 감평')).toBeTruthy();
    expect(screen.getByText(/「전개·몰입」은 이 결과에 반영되지 않았습니다. 다음 감평 실행에 적용됩니다./)).toBeTruthy();
    expect(transport.calls).toHaveLength(1);

    await user.selectOptions(screen.getByRole('combobox', { name: '감평 관점' }), 'general');
    expect(screen.queryByText(/이 결과에 반영되지 않았습니다/)).toBeNull();
  });

  it('긴 결과 본문은 키보드로 초점을 받을 수 있는 이름 있는 영역이다', async () => {
    const { user } = setup();
    await registerKey(user);
    await typeManuscript(user);
    await user.click(runButton());
    const region = await screen.findByRole('region', { name: '감평 결과 본문' });
    expect(region.tabIndex).toBe(0);
    expect(region).toBe(screen.getByTestId('result-text'));
  });

  it('대기 중 상태 영역에는 경과 시간을 넣지 않는다', async () => {
    const { user } = setup({ delayMs: 300 });
    await registerKey(user);
    await typeManuscript(user);
    await user.click(runButton());
    const status = await screen.findByText('OpenAI 응답을 기다리는 중입니다.');
    expect(status.getAttribute('role')).toBe('status');
    const elapsed = document.querySelector('.waiting-elapsed');
    expect(elapsed?.getAttribute('aria-hidden')).toBe('true');
    expect(elapsed?.closest('[role="status"]')).toBeNull();
    await screen.findByTestId('result-text');
  });

  it('실행 중에는 중복 제출을 막고 진행 상태를 보여 준다', async () => {
    const { transport, user } = setup({ delayMs: 300 });
    await registerKey(user);
    await typeManuscript(user);

    await user.dblClick(runButton());
    expect(await screen.findByText(/OpenAI 응답을 기다리는 중/)).toBeTruthy();
    expect(runButton().disabled).toBe(true);
    expect(runButton().textContent).toBe('감평 중…');
    expect(manuscriptInput().readOnly).toBe(true);
    await user.click(runButton());

    await screen.findByTestId('result-text');
    expect(transport.calls).toHaveLength(1);
    expect(manuscriptInput().readOnly).toBe(false);
  });

  it.each<[MockScenario, string]>([
    ['auth_error', '인증 실패 (401)'],
    ['quota', '할당량 부족 (429)'],
    ['rate_limit', '요청이 너무 많음 (429)'],
    ['server_error', 'OpenAI 서버 오류 (500)'],
    ['network_error', '네트워크 오류 또는 브라우저 차단'],
    ['timeout', '시간 초과'],
    ['empty', '빈 응답'],
    ['refusal', '모델이 감평을 거절함'],
  ])('%s 오류 뒤에도 입력을 유지하고 다시 시도할 수 있다', async (scenario, title) => {
    const { transport, keySession, user } = setup();
    transport.queue(scenario);
    await registerKey(user);
    await typeManuscript(user);
    await user.click(runButton());

    expect((await screen.findByRole('alert')).textContent).toBe(title);
    expect(manuscriptInput().value).toBe(UI_CHECK_TEXT);
    expect(keySession.get()).toBe(FAKE_API_KEY);
    expect(screen.getByText('입력한 원고와 등록한 키는 그대로 있습니다.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect((await screen.findByTestId('result-text')).textContent).toBe(MOCK_RESPONSE_TEXT);
    expect(transport.calls).toHaveLength(2);
  });

  it('출력 상한에 걸린 응답은 잘렸다고 알린다', async () => {
    const { user } = setup({ scenario: 'truncated' });
    await registerKey(user);
    await typeManuscript(user);
    await user.click(runButton());
    expect(await screen.findByText(/출력 상한\(4,000 토큰\)에 걸려/)).toBeTruthy();
  });

  it('실행 중 취소할 수 있다', async () => {
    const { user } = setup({ delayMs: 60_000 });
    await registerKey(user);
    await typeManuscript(user);
    await user.click(runButton());
    await user.click(await screen.findByRole('button', { name: '취소' }));

    expect((await screen.findByRole('alert')).textContent).toBe('취소됨');
    expect(manuscriptInput().value).toBe(UI_CHECK_TEXT);
  });

  it('지우기를 누르면 키가 사라지고 실행할 수 없다', async () => {
    const { keySession, user } = setup();
    await registerKey(user);
    await typeManuscript(user);
    expect(runButton().disabled).toBe(false);

    await user.click(screen.getByRole('button', { name: '지우기' }));
    expect(keySession.has()).toBe(false);
    expect(screen.getByText('등록된 키 없음')).toBeTruthy();
    expect(runButton().disabled).toBe(true);
  });

  it('브라우저 저장소·쿠키·콘솔에 아무것도 남기지 않는다', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const { user } = setup();
    await registerKey(user);
    await typeManuscript(user);
    await user.click(runButton());
    await screen.findByTestId('result-text');

    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it('실제 전송 모드에서는 모의 배너를 보이지 않는다', () => {
    setup({}, { showMockBanner: false });
    expect(screen.queryByText(/모의 모드/)).toBeNull();
  });

  it('원고가 상한을 넘으면 실행을 막는다', async () => {
    const transport = createMockTransport();
    const keySession = createKeySession();
    keySession.set(FAKE_API_KEY);
    const service = createReviewService(transport, {
      ...createReviewService(transport).config,
      maxInputChars: 5,
    });
    const user = userEvent.setup();
    render(<App service={service} keySession={keySession} buildId="test-build" />);

    await user.type(manuscriptInput(), '가나다라마바');
    expect(runButton().disabled).toBe(true);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('최대 5자'));
  });
});

import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiRunner } from '../../ai/aiRunner';
import { createWorkspaceStore } from '../../domain/store';
import { REVIEW_CONFIG } from '../../review/config';
import { createReviewService } from '../../review/reviewService';
import { createMemoryRouter } from '../../router/router';
import { createKeySession } from '../../session/keySession';
import { FAKE_API_KEY, UI_CHECK_TEXT } from '../../testing/fixtures';
import { createMockTransport } from '../../transport/mockTransport';
import { TransportError } from '../../transport/types';
import { App } from '../App';
import type { AppServices } from '../context';
import { createUiPrefs } from '../prefs';

afterEach(cleanup);

function setup(delayMs = 0) {
  const store = createWorkspaceStore();
  const router = createMemoryRouter('/review');
  const keySession = createKeySession();
  const transport = createMockTransport({ delayMs });
  const send = vi.spyOn(transport, 'send');
  const services: AppServices = {
    store, router, keySession,
    reviewService: createReviewService(transport),
    aiRunner: createAiRunner(store, transport, keySession, REVIEW_CONFIG),
    prefs: createUiPrefs(document.documentElement, null),
    buildId: 'test', mockTransport: null, newId: () => crypto.randomUUID(),
  };
  render(<App services={services} />);
  return { router, keySession, transport, send, user: userEvent.setup() };
}

function unloadIsBlocked() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('빠른 감평의 메모리 전용 원고와 결과 보호', () => {
  it('원고나 결과가 없으면 키 등록만으로 이동이나 새로고침을 막지 않는다', async () => {
    const { keySession, router, user } = setup();
    keySession.set(FAKE_API_KEY);
    expect(unloadIsBlocked()).toBe(false);
    await user.click(screen.getByRole('link', { name: /^작품$/ }));
    expect(router.current().path).toBe('/works');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('원고가 있으면 새로고침과 앱 안 이동을 확인하고, 취소하면 원고를 보존한다', async () => {
    const { router, user } = setup();
    const manuscript = screen.getByLabelText<HTMLTextAreaElement>('원고 (평문)');
    await user.type(manuscript, UI_CHECK_TEXT.replace('\n', '{Enter}'));
    expect(unloadIsBlocked()).toBe(true);
    await user.click(screen.getByRole('link', { name: '빠른 감평 (알파)' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(unloadIsBlocked()).toBe(true);
    await user.click(screen.getByRole('link', { name: /^작품$/ }));
    expect(router.current().path).toBe('/review');
    expect(screen.getByRole('dialog').textContent).toContain('빠른 감평의 원고 또는 결과');
    await user.click(screen.getByRole('button', { name: '계속 편집' }));
    expect(manuscript.value).toBe(UI_CHECK_TEXT);
    await user.click(screen.getByRole('link', { name: /^작품$/ }));
    await user.click(screen.getByRole('button', { name: '저장하지 않고 이동' }));
    expect(router.current().path).toBe('/works');
    expect(unloadIsBlocked()).toBe(false);
  });

  it('결과를 받은 뒤 원고를 지워도 결과가 사라지기 전에는 확인한다', async () => {
    const { router, keySession, user } = setup();
    keySession.set(FAKE_API_KEY);
    const manuscript = screen.getByLabelText<HTMLTextAreaElement>('원고 (평문)');
    await user.type(manuscript, UI_CHECK_TEXT.replace('\n', '{Enter}'));
    await user.click(screen.getByRole('button', { name: '감평 실행' }));
    await screen.findByTestId('result-text');
    await user.clear(manuscript);
    expect(unloadIsBlocked()).toBe(true);
    await user.click(screen.getByRole('link', { name: /^작품$/ }));
    expect(router.current().path).toBe('/review');
    expect(screen.getByRole('dialog').textContent).toContain('빠른 감평의 원고 또는 결과');
    await user.click(screen.getByRole('button', { name: '계속 편집' }));
    expect(screen.getByTestId('result-text')).toBeTruthy();
  });

  it.each(['error', 'cancel'] as const)('재요청 %s 후 이전 결과만 남아도 이탈을 막는다', async (scenario) => {
    const { router, keySession, transport, send, user } = setup();
    keySession.set(FAKE_API_KEY);
    const manuscript = screen.getByLabelText<HTMLTextAreaElement>('원고 (평문)');
    await user.type(manuscript, UI_CHECK_TEXT.replace('\n', '{Enter}'));
    await user.click(screen.getByRole('button', { name: '감평 실행' }));
    const firstResult = (await screen.findByTestId('result-text')).textContent;
    if (scenario === 'error') transport.queue('server_error');
    else {
      send.mockImplementationOnce(({ signal }) => new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new TransportError('aborted')), { once: true });
      }));
    }
    await user.click(screen.getByRole('button', { name: '감평 실행' }));
    if (scenario === 'cancel') await user.click(screen.getByRole('button', { name: '취소' }));
    await screen.findByRole('alert');
    expect(screen.getByTestId('result-text').textContent).toBe(firstResult);
    await user.clear(manuscript);
    expect(unloadIsBlocked()).toBe(true);
    await user.click(screen.getByRole('link', { name: /^작품$/ }));
    expect(router.current().path).toBe('/review');
    expect(screen.getByRole('dialog').textContent).toContain('빠른 감평의 원고 또는 결과');
  });

  it('질의 변경을 확인해도 유지된 감평 화면은 다음 이탈을 다시 막고, 언마운트 후 차단기를 해제한다', async () => {
    const { router, user } = setup();
    await user.type(screen.getByLabelText('원고 (평문)'), UI_CHECK_TEXT.replace('\n', '{Enter}'));
    act(() => router.navigate('/review?kind=manuscript_review'));
    await user.click(screen.getByRole('button', { name: '저장하지 않고 이동' }));
    expect(router.current().search).toBe('?kind=manuscript_review');
    expect(screen.getByLabelText<HTMLTextAreaElement>('원고 (평문)').value).toBe(UI_CHECK_TEXT);
    await user.click(screen.getByRole('link', { name: /^작품$/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '저장하지 않고 이동' }));
    expect(router.current().path).toBe('/works');
    expect(router.blocked()).toBeNull();
  });

  it('진행 중 이동을 취소하면 요청을 유지하고, 이동을 확정하면 요청을 중단한다', async () => {
    const { router, keySession, send, user } = setup(10000);
    keySession.set(FAKE_API_KEY);
    await user.type(screen.getByLabelText('원고 (평문)'), UI_CHECK_TEXT.replace('\n', '{Enter}'));
    await user.click(screen.getByRole('button', { name: '감평 실행' }));
    const signal = send.mock.calls[0]![0].signal!;
    await user.click(screen.getByRole('link', { name: /^작품$/ }));
    expect(screen.getByRole('dialog').textContent).toContain('이동하면 요청이 취소');
    await user.click(screen.getByRole('button', { name: '계속 편집' }));
    expect(signal.aborted).toBe(false);
    await user.click(screen.getByRole('link', { name: /^작품$/ }));
    await user.click(screen.getByRole('button', { name: '저장하지 않고 이동' }));
    expect(router.current().path).toBe('/works');
    expect(signal.aborted).toBe(true);
  });
});

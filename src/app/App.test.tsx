import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createAiRunner } from '../ai/aiRunner';
import { createWorkspaceStore } from '../domain/store';
import { REVIEW_CONFIG } from '../review/config';
import { createReviewService } from '../review/reviewService';
import { createMemoryRouter } from '../router/router';
import { createKeySession } from '../session/keySession';
import { createMockTransport } from '../transport/mockTransport';
import { App } from './App';
import type { AppServices } from './context';
import { createUiPrefs } from './prefs';

/** 앱 쉘·라우팅 연기 검사(메모리 라우터, 모의 전송). 본문은 짧은 확인용 문장만 쓴다. */

afterEach(() => {
  cleanup();
});

function setup(initial = '/') {
  const store = createWorkspaceStore();
  const router = createMemoryRouter(initial);
  const keySession = createKeySession();
  const transport = createMockTransport();
  const services: AppServices = {
    store,
    router,
    keySession,
    reviewService: createReviewService(transport),
    aiRunner: createAiRunner(store, transport, keySession, REVIEW_CONFIG),
    prefs: createUiPrefs(document.documentElement, null),
    buildId: 'test',
    mockTransport: transport,
    newId: () => crypto.randomUUID(),
  };
  render(<App services={services} />);
  const go = (to: string) => act(() => router.navigate(to, { force: true }));
  return { store, router, go, user: userEvent.setup() };
}

const h1 = () => screen.getAllByRole('heading', { level: 1 });

function makeWork(store: ReturnType<typeof createWorkspaceStore>, title: string) {
  const created = store.createWork({ title, genre: null, tags: [], synopsis: null, serializationStatus: 'draft' }, crypto.randomUUID());
  if (!created.ok) throw created.error;
  return created.value;
}

describe('앱 쉘·라우팅', () => {
  it('첫 화면은 작품 목록이고, 작품을 만들면 그 작품 대시보드로 간다', async () => {
    const { router, user } = setup();
    expect(router.current().path).toBe('/works');
    expect(h1().map((node) => node.textContent)).toEqual(['작품 목록']);
    expect(document.title).toBe('작품 목록 · 감떨');
    await user.click(screen.getAllByRole('link', { name: '새 작품 만들기' })[0]!);
    expect(h1()[0]!.textContent).toBe('작품 생성');
    await user.type(screen.getByLabelText(/작품명/), '확인용 작품');
    await user.click(screen.getByRole('button', { name: '작품 만들기' }));
    expect(router.current().path).toMatch(/^\/works\/[0-9a-f-]{36}$/);
    expect(h1().map((node) => node.textContent)).toEqual(['확인용 작품']);
    expect(screen.getByText(/가상 시뮬레이션 · 실제 독자 지표 아님/)).toBeTruthy();
  });

  it('v1·later 화면, 잘못된 ID, 열려 있지 않은 작품은 각각 안내 화면을 보인다', async () => {
    const { store, go } = setup();
    const work = makeWork(store, '확인용 작품');
    await go(`/works/${work.id}/timeline`);
    expect(h1()[0]!.textContent).toBe('페이지를 찾을 수 없습니다');
    await go('/works/not-a-uuid');
    expect(h1()[0]!.textContent).toBe('페이지를 찾을 수 없습니다');
    await go(`/works/${crypto.randomUUID()}`);
    expect(h1()[0]!.textContent).toBe('이 탭에 열려 있지 않은 작품입니다');
  });

  it('다른 작품의 회차 ID로는 열 수 없다(403), 없는 회차는 404다', async () => {
    const { store, go } = setup();
    const mine = makeWork(store, '작품 가');
    const other = makeWork(store, '작품 나');
    const [item] = await store.importChapters(other.id, [
      { commandId: 'cmd-1', displayNumber: '1', title: null, source: { rawBytes: null, rawText: '확인 문장.', sourceType: 'paste', fileName: null, encoding: 'utf-8' } },
    ]);
    if (!item!.result.ok) throw item!.result.error;
    await go(`/works/${mine.id}/chapters/${item!.result.value.chapterId}`);
    expect(h1()[0]!.textContent).toBe('이 화면에 접근할 권한이 없습니다');
    await go(`/works/${mine.id}/chapters/${crypto.randomUUID()}`);
    expect(h1()[0]!.textContent).toBe('페이지를 찾을 수 없습니다');
    await go(`/works/${other.id}/chapters/${item!.result.value.chapterId}`);
    expect(h1()[0]!.textContent).toBe('1화');
  });

  it('검색어는 주소·방문 기록에 남지 않는다', async () => {
    const { store, router, go, user } = setup();
    const work = makeWork(store, '확인용 작품');
    await go(`/works/${work.id}/search`);
    await user.type(screen.getByLabelText('검색어'), '확인어{Enter}');
    expect(router.entries.join('\n')).not.toContain('확인어');
    expect(router.entries.join('\n')).not.toContain(encodeURIComponent('확인어'));
  });
});

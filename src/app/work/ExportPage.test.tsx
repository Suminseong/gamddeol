import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiRunner } from '../../ai/aiRunner';
import * as exportFormat from '../../domain/exportFormat';
import { hasUnexportedChanges } from '../../domain/selectors';
import { createWorkspaceStore } from '../../domain/store';
import { REVIEW_CONFIG } from '../../review/config';
import { createReviewService } from '../../review/reviewService';
import { createMemoryRouter } from '../../router/router';
import { createKeySession } from '../../session/keySession';
import { createMockTransport } from '../../transport/mockTransport';
import { ServicesProvider, type AppServices } from '../context';
import { createUiPrefs } from '../prefs';
import { ExportPage } from './ExportPage';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup() {
  const store = createWorkspaceStore();
  const work = store.createWork({ title: 'UI 확인', genre: null, tags: [], synopsis: null, serializationStatus: 'draft' }, 'work-test');
  if (!work.ok) throw work.error;
  const router = createMemoryRouter('/works');
  const keySession = createKeySession();
  const transport = createMockTransport();
  const services: AppServices = {
    store, router, keySession, reviewService: createReviewService(transport),
    aiRunner: createAiRunner(store, transport, keySession, REVIEW_CONFIG),
    prefs: createUiPrefs(document.documentElement, null), buildId: 'test', mockTransport: null,
    newId: () => crypto.randomUUID(),
  };
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
  render(<ServicesProvider services={services}><ExportPage params={{ workId: work.value.id }} /></ServicesProvider>);
  return { store, workId: work.value.id, user: userEvent.setup() };
}

function requestDownload() {
  const link = screen.getByRole('link', { name: 'JSON 내려받기' });
  link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  fireEvent.click(link);
}

describe('내보내기 저장 확인', () => {
  it('다운로드 요청만으로는 백업 완료를 표시하지 않고, 확인한 파일 이후 변경은 경고한다', async () => {
    const { store, workId, user } = setup();
    await user.click(screen.getByRole('button', { name: '내보내기 파일 만들기' }));
    await screen.findByRole('link', { name: 'JSON 내려받기' });
    expect(screen.queryByRole('button', { name: '이 파일의 저장을 확인했어요' })).toBeNull();
    act(() => { store.createEntity(workId, { kind: 'place', canonicalName: 'UI 확인 항목', description: null }, 'entity-test'); });
    expect(screen.getByText(/이 파일을 만들기 시작한 뒤 작품이 변경/)).toBeTruthy();
    requestDownload();
    expect(hasUnexportedChanges(store.getState(), workId)).toBe(true);
    await user.click(screen.getByRole('button', { name: '이 파일의 저장을 확인했어요' }));
    expect(hasUnexportedChanges(store.getState(), workId)).toBe(true);
    await user.click(screen.getByRole('button', { name: '내보내기 파일 만들기' }));
    await screen.findByRole('link', { name: 'JSON 내려받기' });
    requestDownload();
    expect(hasUnexportedChanges(store.getState(), workId)).toBe(true);
    await user.click(screen.getByRole('button', { name: '이 파일의 저장을 확인했어요' }));
    expect(hasUnexportedChanges(store.getState(), workId)).toBe(false);
  });

  it('이력 제외 파일은 누락을 알리고 저장 확인으로 변경 경고를 지우지 않는다', async () => {
    const { store, workId, user } = setup();
    await user.click(screen.getByRole('checkbox', { name: '결정 이력·감사 기록 포함' }));
    await user.click(screen.getByRole('button', { name: '내보내기 파일 만들기' }));
    await screen.findByRole('link', { name: 'JSON 내려받기' });
    expect(screen.getByText(/이 파일에는 결정·감사 이력이 포함되지 않습니다/)).toBeTruthy();
    requestDownload();
    expect(screen.queryByRole('button', { name: '이 파일의 저장을 확인했어요' })).toBeNull();
    expect(hasUnexportedChanges(store.getState(), workId)).toBe(true);
  });

  it('현재 버전에서 다시 열 수 없는 크기의 파일은 경고하고 저장 확인을 막는다', async () => {
    const actualBuild = exportFormat.buildWorkExport;
    vi.spyOn(exportFormat, 'buildWorkExport').mockImplementation(async (...args) => {
      const result = await actualBuild(...args);
      return { ...result, text: 'x'.repeat(exportFormat.MAX_IMPORT_CODE_UNITS + 1) };
    });
    const { store, workId, user } = setup();
    await user.click(screen.getByRole('button', { name: '내보내기 파일 만들기' }));
    await screen.findByRole('link', { name: 'JSON 내려받기' });
    expect(screen.getByText(/현재 앱의 불러오기 길이 제한을 초과해 다시 열 수 없습니다/)).toBeTruthy();
    requestDownload();
    expect(screen.queryByRole('button', { name: '이 파일의 저장을 확인했어요' })).toBeNull();
    expect(hasUnexportedChanges(store.getState(), workId)).toBe(true);
  }, 15_000);
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createWorkspaceStore } from '../domain/store';
import { REVIEW_CONFIG } from '../review/config';
import { ReviewError } from '../review/types';
import { createKeySession } from '../session/keySession';
import { createMockTransport } from '../transport/mockTransport';
import { createAiRunner } from './aiRunner';
import { parseExtractionOutput } from './extraction';

/** 작품 안 AI 작업: 키·전송 동의 확인, 작업 기록에 본문·키를 남기지 않음, 같은 추출 재사용. 네트워크 없이 모의 전송으로 확인한다. */

const FAKE_KEY = 'sk-test-not-a-real-key';
const TEXT = '확인용 문장입니다.';

async function setup() {
  const store = createWorkspaceStore();
  const created = store.createWork({ title: '확인용 작품', genre: null, tags: [], synopsis: null, serializationStatus: 'draft' }, 'cmd-work');
  if (!created.ok) throw created.error;
  const [item] = await store.importChapters(created.value.id, [
    { commandId: 'cmd-1', displayNumber: '1', title: null, source: { rawBytes: null, rawText: TEXT, sourceType: 'paste', fileName: null, encoding: 'utf-8' } },
  ]);
  if (!item!.result.ok) throw item!.result.error;
  const transport = createMockTransport();
  const keySession = createKeySession();
  const runner = createAiRunner(store, transport, keySession, REVIEW_CONFIG);
  return { store, transport, keySession, runner, workId: created.value.id, versionId: item!.result.value.versionId };
}

describe('AI 작업 실행기', () => {
  it('키나 전송 동의가 없으면 요청을 만들지 않는다', async () => {
    const { store, transport, keySession, runner, workId, versionId } = await setup();
    expect(runner.gate('manuscript_review', TEXT.length)).toBe('no_key');
    await expect(runner.runReview(workId, versionId, 'general')).rejects.toBeInstanceOf(ReviewError);
    keySession.set(FAKE_KEY);
    expect(runner.gate('manuscript_review', TEXT.length)).toBe('no_consent');
    store.grantConsent(['lore_extraction'], REVIEW_CONFIG.model);
    expect(runner.gate('manuscript_review', TEXT.length)).toBe('kind_not_allowed');
    store.grantConsent(['manuscript_review'], 'other-model');
    expect(runner.gate('manuscript_review', TEXT.length)).toBe('model_changed');
    expect(transport.calls).toHaveLength(0);
  });

  it('동의한 범위에서 감평을 보내고, 작업 기록에는 원고 본문·키를 남기지 않는다', async () => {
    const { store, transport, keySession, runner, workId, versionId } = await setup();
    keySession.set(FAKE_KEY);
    store.grantConsent(['manuscript_review', 'lore_extraction'], REVIEW_CONFIG.model);
    const { jobId, error } = await runner.runReview(workId, versionId, 'general');
    expect(error).toBeNull();
    expect(transport.calls).toHaveLength(1);
    const state = store.getState();
    expect(state.aiJobs[jobId]!.status).toBe('completed');
    const records = JSON.stringify([state.aiJobs, state.aiUsage, state.audit]);
    expect(records).not.toContain(TEXT);
    expect(records).not.toContain(FAKE_KEY);
    expect(JSON.stringify(state)).not.toContain(FAKE_KEY);
    expect(Object.values(state.reviews)).toHaveLength(1);
  });

  it('같은 판본의 추출이 이미 끝났으면 다시 보내지 않고, 작가가 고를 때만 새로 보낸다', async () => {
    const { store, transport, keySession, runner, workId, versionId } = await setup();
    keySession.set(FAKE_KEY);
    store.grantConsent(['lore_extraction'], REVIEW_CONFIG.model);
    const first = await runner.runExtraction(workId, versionId);
    const second = await runner.runExtraction(workId, versionId);
    expect(second).toMatchObject({ jobId: first.jobId, reused: true });
    expect(transport.calls).toHaveLength(1);
    await runner.runExtraction(workId, versionId, { force: true });
    expect(transport.calls).toHaveLength(2);
  });

  it('오류는 작업 기록에 종류만 남기고, 실패 뒤 다시 실행할 수 있다', async () => {
    const { store, transport, keySession, runner, workId, versionId } = await setup();
    keySession.set(FAKE_KEY);
    store.grantConsent(['manuscript_review'], REVIEW_CONFIG.model);
    transport.queue('rate_limit');
    const failed = await runner.runReview(workId, versionId, 'general');
    expect(failed.error).toBe('rate_limit');
    expect(store.getState().aiJobs[failed.jobId]!.status).toBe('failed');
    const retried = await runner.runReview(workId, versionId, 'general');
    expect(retried.error).toBeNull();
  });
});

describe('설정 후보 추출 응답 해석', () => {
  it('형식이 맞는 항목만 후보로 받고, 길이를 자른다', () => {
    const output = JSON.stringify({
      candidates: [
        { entityName: '가', entityKind: 'character', attributeKey: 'trait', value: '값', sourceKind: 'narration', speakerName: '', quote: '인용' },
        { entityName: '나', entityKind: 'dragon', attributeKey: 'trait', value: '값', sourceKind: 'narration', speakerName: null, quote: '인용' },
        { entityName: '다', entityKind: 'place', attributeKey: 'summary', value: 'x'.repeat(3000), sourceKind: 'guess', speakerName: null, quote: '인용' },
        { entityName: '라', entityKind: 'place', attributeKey: 'summary', value: 'x'.repeat(3000), sourceKind: 'ai_inference', speakerName: '화자', quote: '인용' },
      ],
    });
    const parsed = parseExtractionOutput(output);
    expect(parsed.map((item) => item.entityName)).toEqual(['가', '라']);
    expect(parsed[0]!.speakerName).toBeNull();
    expect(parsed[1]!.value).toHaveLength(2000);
  });

  it('JSON이 아니거나 후보 목록이 없으면 예상하지 못한 응답 오류다', () => {
    expect(() => parseExtractionOutput('not json')).toThrow(ReviewError);
    expect(() => parseExtractionOutput('{"items":[]}')).toThrow(ReviewError);
  });
});

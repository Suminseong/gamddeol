/**
 * 데이터·삭제 정책(screen.dataSettings): 저장 위치를 있는 그대로 알리고, 작품별 내보내기와 이 탭 자료 비우기(2단계 확인)를 제공한다.
 * 서버에 저장한 자료가 없으므로 서버 삭제 요청은 대상이 없다.
 */
import { useState } from 'react';
import { hasUnexportedChanges } from '../../domain/selectors';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useServices, useWorkspace } from '../context';
import { ConfirmDialog } from '../ui/dialog';
import { Badge, LiveStatus, PageHeader, Panel, TextField } from '../ui/primitives';
import { forgetSearches } from '../work/SearchPage';
import { SettingsLayout } from './SettingsNav';

const CONFIRM_WORD = '비우기';

export function DataSettingsPage(_: PageProps) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const works = Object.values(workspace.works).sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState('');
  const [announce, setAnnounce] = useState('');
  const dirtyCount = works.filter((work) => hasUnexportedChanges(workspace, work.id)).length;

  const close = () => {
    setStep(0);
    setTyped('');
  };

  return (
    <div className="page">
      <PageHeader title="데이터·삭제 정책" />
      <SettingsLayout>
        <LiveStatus message={announce} />
        <Panel title="자료가 있는 곳">
          <ul className="policy-list">
            <li>작품·원고·설정·검토 기록은 이 브라우저 탭의 메모리에만 있습니다. 서버·계정·브라우저 저장소(로컬 스토리지·IndexedDB·쿠키)에 쓰지 않습니다.</li>
            <li>탭을 닫거나 새로고침하면 모두 사라집니다. 보관하려면 작품별로 JSON 파일을 내려받으세요.</li>
            <li>OpenAI API 키는 탭 메모리에만 있고, 페이지를 떠날 때 지웁니다.</li>
            <li>원고는 작가가 AI 작업을 실행할 때만, 전송 동의 범위 안에서 OpenAI 공식 API(api.openai.com)로 보냅니다. 다른 서버·분석 도구로는 보내지 않습니다.</li>
            <li>가상 독자 수치와 AI 감평·후보는 가상·참고 자료이며 실제 독자 지표가 아닙니다.</li>
          </ul>
        </Panel>
        <Panel title="작품별 내보내기">
          {works.length === 0 ? (
            <p className="hint">열린 작품이 없습니다.</p>
          ) : (
            <ul className="row-list">
              {works.map((work) => (
                <li key={work.id}>
                  <Link to={pathFor('page.export', { workId: work.id })}>{work.title}</Link>
                  {hasUnexportedChanges(workspace, work.id) ? <Badge tier="warning">내보내지 않은 변경 있음</Badge> : <Badge tier="neutral">변경 없음</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="삭제">
          <p>서버에 저장한 자료가 없어 서버 삭제 요청은 필요하지 않습니다. OpenAI로 보낸 요청은 응답 저장을 끄도록(store: false) 요청했으며, OpenAI 쪽 보존 정책은 OpenAI 약관을 따릅니다.</p>
          <p>이 탭의 작품 자료를 지금 모두 비울 수 있습니다. 되돌릴 수 없습니다.</p>
          <button type="button" className="button-danger" onClick={() => setStep(1)} disabled={works.length === 0}>
            이 탭의 작품 자료 모두 비우기
          </button>
        </Panel>
      </SettingsLayout>
      <ConfirmDialog
        open={step === 1}
        title="이 탭의 작품 자료를 비울까요?"
        confirmLabel="다음"
        cancelLabel="취소"
        onConfirm={() => setStep(2)}
        onCancel={close}
      >
        <p>
          작품 {works.length}개{dirtyCount > 0 ? `(그중 ${dirtyCount}개는 내보내지 않은 변경 있음)` : ''}의 원고·설정·검토 기록이 모두 사라집니다. 내려받은 JSON 파일이 있으면 나중에 다시 불러올 수 있습니다.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={step === 2}
        title="마지막 확인"
        confirmLabel="모두 비우기"
        cancelLabel="취소"
        danger
        confirmDisabled={typed.trim() !== CONFIRM_WORD}
        onConfirm={() => {
          if (typed.trim() !== CONFIRM_WORD) return;
          store.clearWorkspace();
          forgetSearches();
          close();
          setAnnounce('이 탭의 작품 자료를 모두 비웠습니다.');
        }}
        onCancel={close}
      >
        <TextField label={`확인을 위해 '${CONFIRM_WORD}'를 입력하세요`} value={typed} onChange={setTyped} />
        {typed.trim() !== CONFIRM_WORD && <p className="hint">입력이 맞아야 비울 수 있습니다.</p>}
      </ConfirmDialog>
    </div>
  );
}

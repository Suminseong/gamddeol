/**
 * 내보내기(screen.export, flow.export): 작품 JSON 파일을 만들어 작가가 직접 내려받는다.
 * 파일은 이 브라우저에서만 만들고 어디에도 올리지 않는다. 다시 열 때는 작품 목록의 'JSON 불러오기'로 해시를 검증한다.
 */
import { useEffect, useState } from 'react';
import { buildWorkExport } from '../../domain/exportFormat';
import { formatDateTime, shortHash } from '../../domain/labels';
import { hasUnexportedChanges } from '../../domain/selectors';
import type { PageProps } from '../App';
import { Link, useServices, useWorkspace } from '../context';
import { Badge, CheckboxField, ErrorBanner, InfoBanner, LiveStatus, PageHeader, Panel } from '../ui/primitives';

const LINK_LIFETIME_MS = 10 * 60 * 1000;

interface ReadyFile {
  url: string;
  name: string;
  bytes: number;
  hash: string;
  createdAt: number;
  includeHistory: boolean;
}

function fileName(title: string, date: Date) {
  const safe = title.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'work';
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  return `gamddeol-${safe}-${stamp}.json`;
}

export function ExportPage({ params }: PageProps) {
  const { store } = useServices();
  const workspace = useWorkspace();
  const workId = params.workId!;
  const work = workspace.works[workId]!;
  const [includeHistory, setIncludeHistory] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'busy' | 'error'>('idle');
  const [ready, setReady] = useState<ReadyFile | null>(null);
  const [expired, setExpired] = useState(false);
  const [announce, setAnnounce] = useState('');
  const dirty = hasUnexportedChanges(workspace, workId);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      URL.revokeObjectURL(ready.url);
      setReady(null);
      setExpired(true);
    }, LINK_LIFETIME_MS);
    return () => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(ready.url);
    };
  }, [ready]);

  const build = async () => {
    setPhase('busy');
    setExpired(false);
    try {
      const now = new Date();
      const { file, text } = await buildWorkExport(store.getState(), workId, includeHistory, now.toISOString());
      const blob = new Blob([text], { type: 'application/json' });
      setReady({
        url: URL.createObjectURL(blob),
        name: fileName(work.title, now),
        bytes: blob.size,
        hash: file.integrity.dataSha256,
        createdAt: now.getTime(),
        includeHistory,
      });
      setPhase('idle');
      setAnnounce('내보내기 파일을 만들었습니다. 내려받기를 누르세요.');
    } catch {
      setPhase('error');
    }
  };

  return (
    <div className="page page-narrow">
      <PageHeader
        title="내보내기"
        description="작품 전체(판본 본문·해시, 근거, 진술, 메모, 가상 연재 기록)를 JSON 파일 하나로 내려받습니다. 파일에는 원고 본문이 들어 있으니 보관에 주의하세요."
      />
      <LiveStatus message={announce} />
      {dirty ? (
        <InfoBanner tone="warning">마지막 내보내기 이후 바뀐 내용이 있습니다. 탭을 닫거나 새로고침하면 사라집니다.</InfoBanner>
      ) : (
        <InfoBanner>마지막 내보내기 이후 바뀐 내용이 없습니다.</InfoBanner>
      )}
      <Panel title="파일 만들기">
        <dl className="meta-list">
          <div>
            <dt>형식</dt>
            <dd>JSON (gamddeol.work, 스키마 1, SHA-256 무결성 해시 포함)</dd>
          </div>
        </dl>
        <CheckboxField
          label="결정 이력·작업 기록 포함"
          checked={includeHistory}
          onChange={setIncludeHistory}
          hint="끄면 승인 결정 기록과 감사 기록을 빼고, 해결된 재검토 요청도 뺍니다. 판본·근거·진술은 항상 들어갑니다."
        />
        <div className="run-actions">
          <button type="button" className="button-primary" onClick={() => void build()} disabled={phase === 'busy'} aria-busy={phase === 'busy'}>
            {phase === 'busy' ? '만드는 중…' : '내보내기 파일 만들기'}
          </button>
        </div>
        {phase === 'error' && <ErrorBanner title="파일을 만들지 못했습니다" message="다시 시도하세요. 작품 자료는 그대로 있습니다." onRetry={() => void build()} />}
        {expired && <p className="hint">내려받기 링크가 만료되었습니다. 다시 만드세요.</p>}
      </Panel>
      {ready && (
        <Panel title="내려받기">
          <p className="badge-row">
            <Badge tier="canon">준비됨</Badge>
            <span className="hint num">
              {formatDateTime(new Date(ready.createdAt).toISOString())} 생성 · 10분 뒤 링크 만료 · {(ready.bytes / 1024).toFixed(1)}KB
            </span>
          </p>
          <dl className="meta-list">
            <div>
              <dt>파일 이름</dt>
              <dd>{ready.name}</dd>
            </div>
            <div>
              <dt>무결성 해시</dt>
              <dd>
                <code className="hash">{shortHash(ready.hash, 16)}…</code>
              </dd>
            </div>
            <div>
              <dt>이력 포함</dt>
              <dd>{ready.includeHistory ? '예' : '아니요'}</dd>
            </div>
          </dl>
          <a
            className="neu-cta-button button-cta"
            href={ready.url}
            download={ready.name}
            onClick={() => {
              store.markExported(workId);
              setAnnounce('내려받기를 시작했습니다.');
            }}
          >
            JSON 내려받기
          </a>
          <p className="hint">
            다시 열 때는 <Link to="/works">작품 목록</Link>의 &lsquo;작품 JSON 불러오기&rsquo;를 쓰세요. 파일을 고치면 해시 검증에서 거부됩니다.
          </p>
        </Panel>
      )}
    </div>
  );
}

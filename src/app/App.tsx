/**
 * 앱 루트: 주소 해석 → 쉘 + 화면. 이동하면 문서 제목을 바꾸고 화면 제목(h1)으로 초점을 옮긴다.
 * 작품 하위 경로는 작품·하위 자료가 이 탭에 있는지, 같은 작품 소속인지 먼저 확인한다(다르면 403, 없으면 404).
 */
import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { Workspace } from '../domain/types';
import { resolvePath, type RouteMatch } from '../router/routes';
import { ServicesProvider, useLocation, useServices, useWorkspace, type AppServices } from './context';
import { AppShell } from './shell/AppShell';
import { buildCrumbs } from './shell/useCrumbs';
import { ConfirmDialog } from './ui/dialog';
import { ForbiddenPage, MissingWorkPage, NotFoundPage } from './pages/SystemPages';
import { WorksPage } from './pages/WorksPage';
import { WorkNewPage } from './pages/WorkNewPage';
import { SettingsPage } from './pages/SettingsPage';
import { AiSettingsPage } from './pages/AiSettingsPage';
import { UsagePage } from './pages/UsagePage';
import { DataSettingsPage } from './pages/DataSettingsPage';
import { QuickReviewPage } from './pages/QuickReviewPage';
import { WorkHomePage } from './work/WorkHomePage';
import { ChaptersPage } from './work/ChaptersPage';
import { ImportPage } from './work/ImportPage';
import { ChapterPage } from './work/ChapterPage';
import { VersionPage } from './work/VersionPage';
import { ComparePage } from './work/ComparePage';
import { WikiPage } from './work/WikiPage';
import { WikiNewPage } from './work/WikiNewPage';
import { WikiDetailPage } from './work/WikiDetailPage';
import { ReviewQueuePage } from './work/ReviewQueuePage';
import { ConflictsPage } from './work/ConflictsPage';
import { ConflictDetailPage } from './work/ConflictDetailPage';
import { SearchPage } from './work/SearchPage';
import { PersonasPage } from './work/PersonasPage';
import { SimRunsPage } from './work/SimRunsPage';
import { SimNewPage } from './work/SimNewPage';
import { SimDetailPage } from './work/SimDetailPage';
import { ExportPage } from './work/ExportPage';
import { WorkSettingsPage } from './work/WorkSettingsPage';

export type PageProps = { params: Record<string, string> };

const PAGES: Record<string, ComponentType<PageProps>> = {
  'page.works': WorksPage,
  'page.workNew': WorkNewPage,
  'page.workHome': WorkHomePage,
  'page.chapters': ChaptersPage,
  'page.import': ImportPage,
  'page.chapter': ChapterPage,
  'page.version': VersionPage,
  'page.compare': ComparePage,
  'page.wiki': WikiPage,
  'page.wikiNew': WikiNewPage,
  'page.wikiDetail': WikiDetailPage,
  'page.reviewQueue': ReviewQueuePage,
  'page.conflicts': ConflictsPage,
  'page.conflictDetail': ConflictDetailPage,
  'page.search': SearchPage,
  'page.personas': PersonasPage,
  'page.simRuns': SimRunsPage,
  'page.simNew': SimNewPage,
  'page.simDetail': SimDetailPage,
  'page.export': ExportPage,
  'page.workSettings': WorkSettingsPage,
  'page.settings': SettingsPage,
  'page.aiSettings': AiSettingsPage,
  'page.usage': UsagePage,
  'page.dataSettings': DataSettingsPage,
  'page.notFound': NotFoundPage,
  'page.forbidden': ForbiddenPage,
  'page.quickReview': QuickReviewPage,
};

type Access = 'ok' | 'missingWork' | 'notFound' | 'forbidden';

/** URL의 ID만으로 다른 작품 자료를 열 수 없게 한다(IA routingRules.paramPolicy). */
export function checkAccess(match: RouteMatch, workspace: Workspace): Access {
  const { workId, chapterId, versionId, entityId, conflictId, runId } = match.params;
  if (!workId) return 'ok';
  if (!workspace.works[workId]) return 'missingWork';
  const owned = (record: { workId: string } | undefined) => (!record ? 'notFound' : record.workId !== workId ? 'forbidden' : 'ok');
  const checks: Access[] = [];
  if (chapterId) checks.push(owned(workspace.chapters[chapterId]));
  if (versionId) {
    const version = workspace.versions[versionId];
    checks.push(owned(version));
    if (version && chapterId && version.chapterId !== chapterId) checks.push('forbidden');
  }
  if (entityId) checks.push(owned(workspace.entities[entityId]));
  if (conflictId) checks.push(owned(workspace.conflicts[conflictId]));
  if (runId) checks.push(owned(workspace.simRuns[runId]));
  if (checks.includes('forbidden')) return 'forbidden';
  if (checks.includes('notFound')) return 'notFound';
  return 'ok';
}

function Routed() {
  const { router } = useServices();
  const workspace = useWorkspace();
  const location = useLocation();
  const resolution = resolvePath(location.path);
  const [blocked, setBlocked] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (resolution.kind === 'redirect') router.navigate(resolution.to, { replace: true, force: true });
  }, [resolution, router]);

  useEffect(() => {
    router.onBlocked((proceed) => setBlocked(() => proceed));
    return () => router.onBlocked(null);
  }, [router]);

  const match = resolution.kind === 'page' ? resolution.match : null;
  const access = match ? checkAccess(match, workspace) : 'notFound';
  const title = match && access === 'ok' ? match.route.title : access === 'forbidden' ? '접근 거부' : '페이지 없음';

  // 이동마다: 문서 제목 갱신, 화면 맨 위로, 제목으로 초점(스크린리더가 새 화면을 알 수 있게). 첫 진입은 초점을 옮기지 않는다.
  const firstRender = useRef(true);
  useEffect(() => {
    document.title = `${title} · 감떨`;
  }, [title]);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (typeof window.scrollTo === 'function' && !navigator.userAgent.includes('jsdom')) window.scrollTo(0, 0);
    const heading = document.getElementById('page-title');
    if (heading && document.activeElement !== heading) heading.focus({ preventScroll: true });
  }, [location.path]);

  if (resolution.kind === 'redirect') return null;
  const workId = match?.params.workId && workspace.works[match.params.workId] ? match.params.workId : null;
  let body;
  if (!match || access === 'notFound') body = <NotFoundPage params={{}} />;
  else if (access === 'missingWork') body = <MissingWorkPage params={match.params} />;
  else if (access === 'forbidden') body = <ForbiddenPage params={{}} />;
  else {
    const Page = PAGES[match.route.id] ?? NotFoundPage;
    body = <Page key={`${match.route.id}:${Object.values(match.params).join('/')}`} params={match.params} />;
  }

  return (
    <>
      <AppShell workId={access === 'forbidden' ? null : workId} crumbs={access === 'ok' ? buildCrumbs(match, workspace) : [{ label: title }]}>
        {body}
      </AppShell>
      <ConfirmDialog
        open={blocked !== null}
        title="저장하지 않고 이동할까요?"
        confirmLabel="저장하지 않고 이동"
        cancelLabel="계속 편집"
        danger
        onConfirm={() => {
          const proceed = blocked;
          setBlocked(null);
          proceed?.();
        }}
        onCancel={() => setBlocked(null)}
      >
        <p>{router.blocked() ?? '저장하지 않은 입력이 있습니다.'} 이동하면 입력한 내용이 사라집니다.</p>
      </ConfirmDialog>
    </>
  );
}

export function App({ services }: { services: AppServices }) {
  // 내보내지 않은 작품 변경이 있으면 탭을 닫거나 새로고침할 때 브라우저 확인을 띄운다.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const state = services.store.getState();
      const dirty = Object.keys(state.works).some((id) => (state.changedRevision[id] ?? 0) > (state.exportedRevision[id] ?? 0));
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [services.store]);

  return (
    <ServicesProvider services={services}>
      <Routed />
    </ServicesProvider>
  );
}

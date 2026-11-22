/**
 * 앱 쉘(component.appShell): 상단 바(브랜드·위치·검색·키 상태·테마) + 사이드바/드로어 내비게이션 + 본문 + 바닥글.
 * 1200px 이상은 사이드바 고정, 그보다 좁으면 메뉴 버튼으로 여는 드로어(초점 가둠, Esc로 닫기).
 */
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, useHasKey, useLocation, useNavigate, useServices, useWorkspace } from '../context';
import { MockBanner } from '../quick/MockBanner';
import { useFocusTrap } from '../ui/dialog';
import { pathFor } from '../../router/routes';
import { NavTree } from './NavTree';
import type { Crumb } from './useCrumbs';

const REPOSITORY_URL = 'https://github.com/Suminseong/gamddeol';

export function AppShell({ workId, crumbs, children }: { workId: string | null; crumbs: Crumb[]; children: ReactNode }) {
  const { buildId, mockTransport, prefs } = useServices();
  const workspace = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const hasKey = useHasKey();
  const theme = useSyncExternalStore(prefs.subscribe, prefs.effectiveTheme, prefs.effectiveTheme);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const drawerRef = useFocusTrap(drawerOpen, closeDrawer);
  const work = workId ? workspace.works[workId] : undefined;

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.path]);

  // Ctrl/Cmd + K: 작품 안에서 통합 검색으로 이동.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && work) {
        event.preventDefault();
        navigate(pathFor('page.search', { workId: work.id }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, work]);

  const unexported = work ? (workspace.changedRevision[work.id] ?? 0) > (workspace.exportedRevision[work.id] ?? 0) : false;

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <header className="topbar">
        <button
          type="button"
          className="icon-button menu-button"
          aria-expanded={drawerOpen}
          aria-controls="nav-drawer"
          aria-label="메뉴 열기"
          onClick={() => setDrawerOpen(true)}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <Link to="/works" className="wordmark">
          감떨
        </Link>
        <nav className="breadcrumbs" aria-label="현재 위치">
          <ol>
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`}>
                {crumb.to && index < crumbs.length - 1 ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current={index === crumbs.length - 1 ? 'page' : undefined}>{crumb.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
        <div className="topbar-actions">
          {work && (
            <Link to={pathFor('page.search', { workId: work.id })} className="topbar-button" aria-keyshortcuts="Control+K Meta+K">
              검색<span className="kbd" aria-hidden="true"> Ctrl K</span>
            </Link>
          )}
          <Link to="/settings/ai" className={hasKey ? 'key-pill is-set' : 'key-pill'}>
            {hasKey ? 'API 키 등록됨' : 'API 키 없음'}
          </Link>
          <button
            type="button"
            className="topbar-button"
            aria-label={theme === 'dark' ? '라이트 테마로 바꾸기' : '다크 테마로 바꾸기'}
            onClick={() => prefs.setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '라이트' : '다크'}
          </button>
        </div>
      </header>

      <div className="shell-body">
        <aside className="sidebar" aria-label="주 메뉴">
          <NavTree workId={workId} />
        </aside>
        {drawerOpen && (
          <div className="drawer-backdrop" onClick={closeDrawer}>
            <div
              ref={drawerRef}
              id="nav-drawer"
              className="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="메뉴"
              tabIndex={-1}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="drawer-head">
                <span className="wordmark">감떨</span>
                <button type="button" className="icon-button" aria-label="메뉴 닫기" onClick={closeDrawer}>
                  <span aria-hidden="true">✕</span>
                </button>
              </div>
              <NavTree workId={workId} />
            </div>
          </div>
        )}
        <div className="content">
          {mockTransport && <MockBanner transport={mockTransport} />}
          {work && unexported && (
            <p className="storage-strip">
              <span>이 작품에 내보내지 않은 변경이 있습니다. 자료는 이 탭 메모리에만 있어 탭을 닫거나 새로고침하면 사라집니다.</span>
              <Link to={pathFor('page.export', { workId: work.id })}>JSON으로 내보내기</Link>
            </p>
          )}
          <main id="main-content" className="main" tabIndex={-1}>
            {children}
          </main>
          <footer className="app-footer">
            <span>빌드 {buildId.slice(0, 12)}</span>
            <span aria-hidden="true">·</span>
            <span>자료는 이 탭 메모리에만 있습니다(서버·브라우저 저장소 미사용)</span>
            <span aria-hidden="true">·</span>
            <span>MIT</span>
            <span aria-hidden="true">·</span>
            <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
              소스 코드
            </a>
          </footer>
        </div>
      </div>
    </div>
  );
}

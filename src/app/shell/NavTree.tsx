/** 내비게이션 트리 (IA navigation.root). 배포 단계가 열린 화면만 그린다. 사이드바와 드로어에 함께 그려지므로 id는 useId로 만든다. */
import { useId } from 'react';
import { Link, useLocation, useNavigate, useWorkspace } from '../context';
import { isReleased, pathFor } from '../../router/routes';

interface NavItem {
  pageId: string;
  label: string;
  badge?: number;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const GLOBAL: NavItem[] = [
  { pageId: 'page.works', label: '작품' },
  { pageId: 'page.quickReview', label: '빠른 감평 (알파)' },
  { pageId: 'page.settings', label: '설정' },
];

function workGroups(counts: { candidates: number; conflicts: number }): NavGroup[] {
  return [
    {
      id: 'nav.manuscript',
      label: '원고',
      items: [
        { pageId: 'page.workHome', label: '작품 대시보드' },
        { pageId: 'page.chapters', label: '원고 및 회차' },
        { pageId: 'page.search', label: '작품 통합 검색' },
        { pageId: 'page.export', label: '내보내기' },
      ],
    },
    {
      id: 'nav.canon',
      label: '설정 관리',
      items: [
        { pageId: 'page.wiki', label: '설정집 및 위키' },
        { pageId: 'page.reviewQueue', label: 'AI 후보 검토함', badge: counts.candidates },
        { pageId: 'page.conflicts', label: '충돌 후보', badge: counts.conflicts },
      ],
    },
    {
      id: 'nav.sim',
      label: '가상 독자',
      items: [
        { pageId: 'page.simRuns', label: '가상 연재 기록' },
        { pageId: 'page.personas', label: '가상 독자 성향' },
      ],
    },
    {
      id: 'nav.story',
      label: '이야기 관리',
      items: [
        { pageId: 'page.foreshadows', label: '복선 목록' },
        { pageId: 'page.timeline', label: '작중 연표' },
        { pageId: 'page.knowledge', label: '인물 인지 기록' },
        { pageId: 'page.relations', label: '관계도' },
      ],
    },
    {
      id: 'nav.tools',
      label: '창작 도구',
      items: [
        { pageId: 'page.maps', label: '지도 목록' },
        { pageId: 'page.random', label: '랜덤 생성표' },
      ],
    },
  ]
    .map((group) => ({ ...group, items: group.items.filter((item) => isReleased(item.pageId)) }))
    .filter((group) => group.items.length > 0);
}

function isActive(current: string, target: string, exact: boolean) {
  return exact ? current === target : current === target || current.startsWith(`${target}/`);
}

function NavIcon({ pageId }: { pageId: string }) {
  const paths: Record<string, string> = {
    'page.works': 'M4 5h7l2 2h7v11H4z',
    'page.quickReview': 'M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z M18 15v4 M16 17h4',
    'page.settings': 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6 7 7 M17 17l1.4 1.4 M18.4 5.6 17 7 M7 17l-1.4 1.4',
    'page.workHome': 'M4 11 12 4l8 7v9H4z M9 20v-6h6v6',
    'page.chapters': 'M6 4h9l3 3v13H6z M15 4v4h3 M9 12h6 M9 15h6',
    'page.search': 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.5 15.5 20 20',
    'page.export': 'M12 4v10 M8 10l4 4 4-4 M5 17v3h14v-3',
    'page.wiki': 'M4 5c3-1 5-.7 8 1v13c-3-1.7-5-2-8-1z M20 5c-3-1-5-.7-8 1v13c3-1.7 5-2 8-1z',
    'page.reviewQueue': 'M5 5h14v14H5z M8 9h8 M8 13h5 M8 16h3',
    'page.conflicts': 'M12 4 21 20H3z M12 9v5 M12 17h.01',
    'page.simRuns': 'M5 19V5 M5 19h15 M8 15l3-4 3 2 5-7',
    'page.personas': 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3.5 19c.3-3 2.2-5 5.5-5s5.2 2 5.5 5 M16 6a3 3 0 0 1 0 5.5 M16 14c2.5.2 4 2 4.5 5',
  };
  return <svg className="nav-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[pageId] ?? paths['page.settings']} /></svg>;
}

export function NavTree({ workId }: { workId: string | null }) {
  const workspace = useWorkspace();
  const { path } = useLocation();
  const navigate = useNavigate();
  const pickerId = useId();
  const works = Object.values(workspace.works).sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  const work = workId ? workspace.works[workId] : undefined;

  const counts = work
    ? {
        candidates: Object.values(workspace.assertions).filter(
          (assertion) => assertion.workId === work.id && assertion.approvalStatus === 'candidate',
        ).length,
        conflicts: Object.values(workspace.conflicts).filter(
          (conflict) => conflict.workId === work.id && (conflict.status === 'open' || conflict.status === 'reopened'),
        ).length,
      }
    : { candidates: 0, conflicts: 0 };

  return (
    <nav className="nav-tree" aria-label="앱 메뉴">
      <p className="nav-section-label">작업 공간</p>
      <ul className="nav-list">
        {GLOBAL.map((item) => {
          const to = pathFor(item.pageId);
          const active =
            item.pageId === 'page.works' ? path === '/works' || path === '/works/new' : isActive(path, to, false);
          return (
            <li key={item.pageId}>
              <Link to={to} className="nav-link" aria-current={active ? 'page' : undefined}>
                <span className="nav-link-label"><NavIcon pageId={item.pageId} />{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {works.length > 0 && (
        <div className="work-picker">
          <label htmlFor={pickerId}>현재 작품</label>
          <select
            id={pickerId}
            className="text-input"
            value={work?.id ?? ''}
            onChange={(event) => {
              if (event.target.value) navigate(pathFor('page.workHome', { workId: event.target.value }));
            }}
          >
            {!work && <option value="">작품 선택</option>}
            {works.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {work &&
        workGroups(counts).map((group) => (
          <details key={group.id} className="nav-group" open>
            <summary>{group.label}</summary>
            <ul className="nav-list">
              {group.items.map((item) => {
                const to = pathFor(item.pageId, { workId: work.id });
                const active = isActive(path, to, item.pageId === 'page.workHome');
                return (
                  <li key={item.pageId}>
                    <Link to={to} className="nav-link" aria-current={active ? 'page' : undefined}>
                      <span className="nav-link-label"><NavIcon pageId={item.pageId} />{item.label}</span>
                      {item.badge ? (
                        <span className="nav-badge">
                          {item.badge}
                          <span className="sr-only">건</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      {work && (
        <ul className="nav-list nav-footer">
          <li>
            <Link
              to={pathFor('page.workSettings', { workId: work.id })}
              className="nav-link"
              aria-current={isActive(path, pathFor('page.workSettings', { workId: work.id }), true) ? 'page' : undefined}
            >
              <span className="nav-link-label"><NavIcon pageId="page.settings" />작품 설정</span>
            </Link>
          </li>
        </ul>
      )}
    </nav>
  );
}

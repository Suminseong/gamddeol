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
      <ul className="nav-list">
        {GLOBAL.map((item) => {
          const to = pathFor(item.pageId);
          const active =
            item.pageId === 'page.works' ? path === '/works' || path === '/works/new' : isActive(path, to, false);
          return (
            <li key={item.pageId}>
              <Link to={to} className="nav-link" aria-current={active ? 'page' : undefined}>
                {item.label}
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
                      <span>{item.label}</span>
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
              작품 설정
            </Link>
          </li>
        </ul>
      )}
    </nav>
  );
}

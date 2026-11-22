/** 설정 하위 메뉴: 넓은 화면은 왼쪽 220px 세로 목록, 좁은 화면은 가로 탭. */
import type { ReactNode } from 'react';
import { pathFor } from '../../router/routes';
import { Link, useLocation } from '../context';

const ITEMS = [
  { id: 'page.settings', label: '사용자 설정' },
  { id: 'page.aiSettings', label: 'AI 연결 및 전송 동의' },
  { id: 'page.usage', label: 'AI 작업 사용량' },
  { id: 'page.dataSettings', label: '데이터·삭제 정책' },
];

export function SettingsLayout({ children }: { children: ReactNode }) {
  const { path } = useLocation();
  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="설정 메뉴">
        <ul>
          {ITEMS.map((item) => {
            const to = pathFor(item.id);
            return (
              <li key={item.id}>
                <Link to={to} className="settings-link" aria-current={path === to ? 'page' : undefined}>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="settings-main">{children}</div>
    </div>
  );
}

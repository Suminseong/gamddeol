/** 앱 서비스 주입과 공용 훅. 화면은 저장소 구현이 아니라 이 인터페이스로만 읽고 쓴다. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { AiRunner } from '../ai/aiRunner';
import type { WorkspaceStore } from '../domain/store';
import type { Workspace } from '../domain/types';
import type { ReviewService } from '../review/reviewService';
import type { Router, RouterLocation } from '../router/router';
import type { KeySession } from '../session/keySession';
import type { MockTransport } from '../transport/mockTransport';
import type { UiPrefs } from './prefs';

export interface AppServices {
  store: WorkspaceStore;
  router: Router;
  keySession: KeySession;
  reviewService: ReviewService;
  aiRunner: AiRunner;
  prefs: UiPrefs;
  buildId: string;
  mockTransport: MockTransport | null;
  newId: () => string;
}

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('ServicesProvider is missing');
  return services;
}

export function useWorkspace(): Workspace {
  const { store } = useServices();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function useLocation(): RouterLocation {
  const { router } = useServices();
  return useSyncExternalStore(
    router.subscribe.bind(router),
    router.current.bind(router),
    router.current.bind(router),
  );
}

export function useQuery(): URLSearchParams {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search), [location.search]);
}

export function useHasKey(): boolean {
  const { keySession } = useServices();
  return useSyncExternalStore(keySession.subscribe, keySession.has, keySession.has);
}

export function useNavigate() {
  const { router } = useServices();
  return useCallback((to: string, options?: { replace?: boolean; force?: boolean }) => router.navigate(to, options), [router]);
}

/** 한 폼(명령)당 하나의 명령 ID. 성공하면 renew()로 새로 받는다. 실패 뒤 재시도는 같은 ID를 쓴다. */
export function useCommandId(): [string, () => void] {
  const { newId } = useServices();
  const [id, setId] = useState(() => newId());
  return [id, useCallback(() => setId(newId()), [newId])];
}

/** 저장하지 않은 입력이 있으면 앱 안 이동과 탭 닫기를 확인한다. */
export function useUnsavedGuard(dirty: boolean, reason = '저장하지 않은 입력이 있습니다.') {
  const { router } = useServices();
  useEffect(() => {
    if (!dirty) return;
    const release = router.block(reason);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      release();
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty, reason, router]);
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  replace?: boolean;
}

export function Link({ to, replace, onClick, children, ...rest }: LinkProps) {
  const { router } = useServices();
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (rest.target && rest.target !== '_self') return;
    event.preventDefault();
    router.navigate(to, { replace });
  };
  return (
    <a href={router.href(to)} onClick={handle} {...rest}>
      {children}
    </a>
  );
}

/** 이전 값과 비교하는 데 쓰는 ref. */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

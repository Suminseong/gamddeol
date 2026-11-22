/**
 * 브라우저 주소 기반 라우터. GitHub Pages 프로젝트 경로(/gamddeol/) 아래에서 동작한다.
 * 직접 진입·새로고침은 배포 산출물의 404.html(= index.html 사본)이 앱을 다시 띄워 처리한다.
 *
 * 저장하지 않은 입력이 있는 화면은 block()으로 이동을 막고, 앱 쉘이 확인 창을 띄운다.
 *
 * 주소와 방문 기록에는 화면 경로(정적 조각·UUID)와 허용된 질의 값(ID·코드포인트 위치·전송 종류)만 쓴다.
 * 검색어·원고 본문 같은 값은 화면이 실수로 넘겨도 sanitizeLocation()이 버린다.
 */
import { UUID_PATTERN } from './routes';

export interface RouterLocation {
  /** 앱 기준 경로 (예: /works/…). 프로젝트 경로는 빠져 있다. */
  path: string;
  search: string;
  hash: string;
}

export type BlockHandler = (proceed: () => void) => void;

export interface Router {
  readonly base: string;
  current(): RouterLocation;
  subscribe(listener: () => void): () => void;
  navigate(to: string, options?: { replace?: boolean; force?: boolean }): void;
  href(to: string): string;
  /** 이동 차단을 켠다. 돌려받은 함수로 끈다. */
  block(reason: string): () => void;
  blocked(): string | null;
  onBlocked(handler: BlockHandler | null): void;
}

/** 주소에 남길 수 있는 질의 키와 값 형식. */
export const SAFE_QUERY: Readonly<Record<string, RegExp>> = {
  anchor: UUID_PATTERN,
  chapterId: UUID_PATTERN,
  versionId: UUID_PATTERN,
  left: UUID_PATTERN,
  right: UUID_PATTERN,
  hl: /^\d{1,9}-\d{1,9}$/,
  kind: /^[a-z_]{1,40}$/,
};

const SAFE_PATH = /^\/(?:[A-Za-z0-9-]+\/?)*$/;
const SAFE_HASH = /^#[A-Za-z0-9_-]{1,64}$/;

/** 허용 목록 밖의 경로는 /404로, 질의 값·해시는 버린다. */
export function sanitizeLocation(location: RouterLocation): RouterLocation {
  const kept = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(location.search)) {
    if (!kept.has(key) && SAFE_QUERY[key]?.test(value)) kept.set(key, value);
  }
  const search = kept.toString();
  return {
    path: SAFE_PATH.test(location.path) ? location.path : '/404',
    search: search ? `?${search}` : '',
    hash: SAFE_HASH.test(location.hash) ? location.hash : '',
  };
}

function splitTarget(to: string): RouterLocation {
  const hashIndex = to.indexOf('#');
  const hash = hashIndex >= 0 ? to.slice(hashIndex) : '';
  const rest = hashIndex >= 0 ? to.slice(0, hashIndex) : to;
  const queryIndex = rest.indexOf('?');
  return {
    path: queryIndex >= 0 ? rest.slice(0, queryIndex) || '/' : rest || '/',
    search: queryIndex >= 0 ? rest.slice(queryIndex) : '',
    hash,
  };
}

abstract class BaseRouter implements Router {
  abstract readonly base: string;
  protected location: RouterLocation;
  private listeners = new Set<() => void>();
  private blockers: string[] = [];
  private blockHandler: BlockHandler | null = null;

  constructor(initial: RouterLocation) {
    this.location = initial;
  }

  current() {
    return this.location;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  protected emit() {
    for (const listener of this.listeners) listener();
  }

  protected abstract write(location: RouterLocation, replace: boolean): void;

  href(to: string): string {
    const target = splitTarget(to);
    return `${this.base}${target.path.replace(/^\//, '')}${target.search}${target.hash}`;
  }

  navigate(to: string, options: { replace?: boolean; force?: boolean } = {}) {
    const go = () => {
      const target = sanitizeLocation(splitTarget(to));
      this.write(target, options.replace ?? false);
      this.location = target;
      this.emit();
    };
    if (!options.force && this.blockers.length > 0 && this.blockHandler) {
      this.blockHandler(() => {
        this.blockers = [];
        go();
      });
      return;
    }
    go();
  }

  block(reason: string) {
    this.blockers.push(reason);
    return () => {
      const index = this.blockers.indexOf(reason);
      if (index >= 0) this.blockers.splice(index, 1);
    };
  }

  blocked() {
    return this.blockers[0] ?? null;
  }

  onBlocked(handler: BlockHandler | null) {
    this.blockHandler = handler;
  }

  /**
   * 뒤로·앞으로 가기로 바뀐 주소를 반영한다. 막혀 있으면 원래 주소로 되돌리고 확인을 받는다.
   * 같은 화면 안의 해시 이동(본문으로 건너뛰기 등)은 막지 않는다.
   */
  protected popTo(target: RouterLocation) {
    const sameScreen = target.path === this.location.path && target.search === this.location.search;
    if (!sameScreen && this.blockers.length > 0 && this.blockHandler) {
      const previous = this.location;
      this.write(previous, false);
      this.blockHandler(() => {
        this.blockers = [];
        this.write(target, false);
        this.location = target;
        this.emit();
      });
      return;
    }
    this.location = target;
    this.emit();
  }
}

class BrowserRouter extends BaseRouter {
  readonly base: string;
  private readonly win: Window;

  constructor(base: string, win: Window) {
    super({ path: '/', search: '', hash: '' });
    this.base = base.endsWith('/') ? base : `${base}/`;
    this.win = win;
    // 직접 진입한 주소에 허용되지 않은 질의 값이 있으면 방문 기록에서 지운다(경로는 그대로 두고 화면이 404로 처리한다).
    const entered = this.read();
    const clean = sanitizeLocation(entered);
    this.location = { ...clean, path: entered.path };
    if (clean.search !== entered.search || clean.hash !== entered.hash) this.write(this.location, true);
    win.addEventListener('popstate', () => this.popTo(this.read()));
  }

  private read(): RouterLocation {
    const { pathname, search, hash } = this.win.location;
    const baseNoSlash = this.base.slice(0, -1);
    let path = pathname;
    if (path === baseNoSlash) path = '/';
    else if (path.startsWith(this.base)) path = `/${path.slice(this.base.length)}`;
    return { path, search, hash };
  }

  protected write(location: RouterLocation, replace: boolean) {
    const url = this.href(`${location.path}${location.search}${location.hash}`);
    if (replace) this.win.history.replaceState(null, '', url);
    else this.win.history.pushState(null, '', url);
  }
}

class MemoryRouter extends BaseRouter {
  readonly base = '/';
  readonly entries: string[] = [];
  protected write(location: RouterLocation, replace: boolean) {
    const url = `${location.path}${location.search}${location.hash}`;
    if (replace) this.entries[this.entries.length - 1] = url;
    else this.entries.push(url);
  }
}

export function createBrowserRouter(base: string, win: Window = window): Router {
  return new BrowserRouter(base, win);
}

/** 테스트용: 브라우저 주소를 건드리지 않는 라우터. */
export function createMemoryRouter(initial = '/'): Router & { entries: string[] } {
  const router = new MemoryRouter(sanitizeLocation(splitTarget(initial)));
  router.entries.push(initial);
  return router;
}

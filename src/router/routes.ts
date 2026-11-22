/**
 * 라우트 표 (IA sitemap 37개 화면 + 기존 알파 빠른 감평 1개).
 *
 * - 노출 정책(IA navigation.visibilityPolicy): 배포 단계가 열린 화면(mvp, 알파)만 쓴다.
 *   v1·later 화면은 메뉴에서 숨기고, 주소로 직접 들어와도 404로 처리한다.
 * - 정적 경로(/new, /import, /schema)는 같은 자리의 동적 :id보다 먼저 맞춘다.
 * - ID 경로 값은 UUID 형식이어야 한다. 아니면 404.
 */
export type ReleasePhase = 'mvp' | 'v1' | 'later' | 'alpha';

export const RELEASED_PHASES: ReadonlySet<ReleasePhase> = new Set(['mvp', 'alpha']);

export interface RouteDef {
  id: string;
  pattern: string;
  title: string;
  phase: ReleasePhase;
}

export const ROUTES: readonly RouteDef[] = [
  { id: 'page.works', pattern: '/works', title: '작품 목록', phase: 'mvp' },
  { id: 'page.workNew', pattern: '/works/new', title: '작품 생성', phase: 'mvp' },
  { id: 'page.workHome', pattern: '/works/:workId', title: '작품 대시보드', phase: 'mvp' },
  { id: 'page.chapters', pattern: '/works/:workId/chapters', title: '원고 및 회차', phase: 'mvp' },
  { id: 'page.import', pattern: '/works/:workId/chapters/import', title: '회차 업로드', phase: 'mvp' },
  { id: 'page.chapter', pattern: '/works/:workId/chapters/:chapterId', title: '회차 상세', phase: 'mvp' },
  { id: 'page.version', pattern: '/works/:workId/chapters/:chapterId/versions/:versionId', title: '원고 판본 보기', phase: 'mvp' },
  { id: 'page.compare', pattern: '/works/:workId/chapters/:chapterId/compare', title: '판본 비교', phase: 'mvp' },
  { id: 'page.wiki', pattern: '/works/:workId/wiki', title: '설정집 및 위키', phase: 'mvp' },
  { id: 'page.wikiNew', pattern: '/works/:workId/wiki/new', title: '설정 항목 추가', phase: 'mvp' },
  { id: 'page.wikiDetail', pattern: '/works/:workId/wiki/:entityId', title: '설정 항목 상세', phase: 'mvp' },
  { id: 'page.wikiSchema', pattern: '/works/:workId/wiki/schema', title: '사용자 정의 설정 필드', phase: 'v1' },
  { id: 'page.reviewQueue', pattern: '/works/:workId/review-queue', title: 'AI 후보 검토함', phase: 'mvp' },
  { id: 'page.conflicts', pattern: '/works/:workId/conflicts', title: '충돌 후보', phase: 'mvp' },
  { id: 'page.conflictDetail', pattern: '/works/:workId/conflicts/:conflictId', title: '충돌 근거 비교', phase: 'mvp' },
  { id: 'page.search', pattern: '/works/:workId/search', title: '작품 통합 검색', phase: 'mvp' },
  { id: 'page.personas', pattern: '/works/:workId/personas', title: '가상 독자 성향', phase: 'mvp' },
  { id: 'page.simRuns', pattern: '/works/:workId/simulations', title: '가상 연재 기록', phase: 'mvp' },
  { id: 'page.simNew', pattern: '/works/:workId/simulations/new', title: '가상 연재 설정', phase: 'mvp' },
  { id: 'page.simDetail', pattern: '/works/:workId/simulations/:runId', title: '가상 연재 결과', phase: 'mvp' },
  { id: 'page.export', pattern: '/works/:workId/export', title: '내보내기', phase: 'mvp' },
  { id: 'page.foreshadows', pattern: '/works/:workId/foreshadows', title: '복선 목록', phase: 'v1' },
  { id: 'page.foreshadowDetail', pattern: '/works/:workId/foreshadows/:foreshadowId', title: '복선 상세', phase: 'v1' },
  { id: 'page.timeline', pattern: '/works/:workId/timeline', title: '작중 연표', phase: 'v1' },
  { id: 'page.eventDetail', pattern: '/works/:workId/events/:eventId', title: '사건 상세', phase: 'v1' },
  { id: 'page.knowledge', pattern: '/works/:workId/knowledge', title: '인물 인지 기록', phase: 'v1' },
  { id: 'page.relations', pattern: '/works/:workId/relations', title: '관계도', phase: 'later' },
  { id: 'page.maps', pattern: '/works/:workId/maps', title: '지도 목록', phase: 'later' },
  { id: 'page.mapDetail', pattern: '/works/:workId/maps/:mapId', title: '이미지 지도 편집', phase: 'later' },
  { id: 'page.random', pattern: '/works/:workId/tools/random', title: '랜덤 생성표', phase: 'later' },
  { id: 'page.workSettings', pattern: '/works/:workId/settings', title: '작품 설정', phase: 'mvp' },
  { id: 'page.settings', pattern: '/settings', title: '사용자 설정', phase: 'mvp' },
  { id: 'page.aiSettings', pattern: '/settings/ai', title: 'AI 연결 및 전송 동의', phase: 'mvp' },
  { id: 'page.usage', pattern: '/settings/usage', title: 'AI 작업 사용량', phase: 'mvp' },
  { id: 'page.dataSettings', pattern: '/settings/data', title: '데이터·삭제 정책', phase: 'mvp' },
  { id: 'page.notFound', pattern: '/404', title: '페이지 없음', phase: 'mvp' },
  { id: 'page.forbidden', pattern: '/403', title: '접근 거부', phase: 'mvp' },
  { id: 'page.quickReview', pattern: '/review', title: '빠른 감평', phase: 'alpha' },
];

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RouteMatch {
  route: RouteDef;
  params: Record<string, string>;
}

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/** 경로를 라우트에 맞춘다. 같은 경로에 여러 라우트가 맞으면 정적 조각이 많은 쪽이 이긴다. */
export function matchRoute(path: string): RouteMatch | null {
  const segments = splitPath(path);
  let best: { match: RouteMatch; staticCount: number } | null = null;
  for (const route of ROUTES) {
    const parts = splitPath(route.pattern);
    if (parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let staticCount = 0;
    let matched = true;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const segment = segments[i]!;
      if (part.startsWith(':')) {
        let value: string;
        try {
          value = decodeURIComponent(segment);
        } catch {
          matched = false;
          break;
        }
        params[part.slice(1)] = value;
      } else if (part === segment) {
        staticCount++;
      } else {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    if (!best || staticCount > best.staticCount) best = { match: { route, params }, staticCount };
  }
  return best?.match ?? null;
}

export type Resolution =
  | { kind: 'redirect'; to: string }
  | { kind: 'page'; match: RouteMatch }
  | { kind: 'notFound' };

/** 주소 → 화면. 미배포 단계·잘못된 ID 형식·없는 경로는 모두 404. */
export function resolvePath(path: string): Resolution {
  const clean = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  if (clean === '' || clean === '/') return { kind: 'redirect', to: '/works' };
  const match = matchRoute(clean);
  if (!match || !RELEASED_PHASES.has(match.route.phase)) return { kind: 'notFound' };
  if (Object.values(match.params).some((value) => !UUID_PATTERN.test(value))) return { kind: 'notFound' };
  return { kind: 'page', match };
}

export function routeById(id: string): RouteDef | undefined {
  return ROUTES.find((route) => route.id === id);
}

export function isReleased(id: string): boolean {
  const route = routeById(id);
  return route !== undefined && RELEASED_PHASES.has(route.phase);
}

/** 패턴에 값을 넣어 경로를 만든다. */
export function pathFor(id: string, params: Record<string, string> = {}): string {
  const route = routeById(id);
  if (!route) throw new Error(`unknown route ${id}`);
  return route.pattern.replace(/:(\w+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`missing param ${name} for ${id}`);
    return encodeURIComponent(value);
  });
}

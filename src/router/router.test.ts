// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMemoryRouter, sanitizeLocation } from './router';
import { isReleased, pathFor, resolvePath, ROUTES } from './routes';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('라우트 해석', () => {
  it('루트는 작품 목록으로 보내고, MVP 화면은 그대로 연다', () => {
    expect(resolvePath('/')).toEqual({ kind: 'redirect', to: '/works' });
    const page = resolvePath(`/works/${ID}/chapters/${ID2}/versions/${ID}`);
    expect(page.kind === 'page' && page.match.route.id).toBe('page.version');
    expect(resolvePath(`/works/${ID}/`).kind).toBe('page');
  });

  it('정적 경로가 같은 자리의 ID 경로보다 먼저 맞는다', () => {
    const cases: [string, string][] = [
      ['/works/new', 'page.workNew'],
      [`/works/${ID}/chapters/import`, 'page.import'],
      [`/works/${ID}/wiki/new`, 'page.wikiNew'],
      [`/works/${ID}/simulations/new`, 'page.simNew'],
    ];
    for (const [path, id] of cases) {
      const resolved = resolvePath(path);
      expect(resolved.kind === 'page' && resolved.match.route.id).toBe(id);
    }
  });

  it('v1·later 화면은 주소로 들어와도 404다 (IA visibilityPolicy)', () => {
    const hidden = ROUTES.filter((route) => route.phase === 'v1' || route.phase === 'later');
    expect(hidden.map((route) => route.id).sort()).toEqual(
      ['page.eventDetail', 'page.foreshadowDetail', 'page.foreshadows', 'page.knowledge', 'page.mapDetail', 'page.maps', 'page.random', 'page.relations', 'page.timeline', 'page.wikiSchema'].sort(),
    );
    for (const route of hidden) {
      expect(isReleased(route.id)).toBe(false);
      const path = route.pattern.replace(/:\w+/g, ID);
      expect(resolvePath(path)).toEqual({ kind: 'notFound' });
    }
  });

  it('ID 자리에 UUID가 아닌 값이 오면 404다', () => {
    expect(resolvePath('/works/abc').kind).toBe('notFound');
    expect(resolvePath(`/works/${ID}/chapters/%E0%A4%A`).kind).toBe('notFound');
    expect(resolvePath('/nothing-here').kind).toBe('notFound');
  });

  it('pathFor는 패턴에 값을 넣고, 빠진 값은 오류로 알린다', () => {
    expect(pathFor('page.chapter', { workId: ID, chapterId: ID2 })).toBe(`/works/${ID}/chapters/${ID2}`);
    expect(() => pathFor('page.chapter', { workId: ID })).toThrow('missing param chapterId');
  });
});

describe('주소·방문 기록에 남는 값', () => {
  it('허용된 질의 키와 형식만 남기고 나머지는 버린다', () => {
    expect(sanitizeLocation({ path: '/works', search: `?anchor=${ID}&q=검색어&hl=3-9&kind=manuscript_review&left=x`, hash: '' })).toEqual({
      path: '/works',
      search: `?anchor=${ID}&hl=3-9&kind=manuscript_review`,
      hash: '',
    });
    expect(sanitizeLocation({ path: '/works/한글', search: '', hash: '#본문' })).toEqual({ path: '/404', search: '', hash: '' });
    expect(sanitizeLocation({ path: '/works', search: '', hash: '#main-content' }).hash).toBe('#main-content');
  });

  it('라우터는 걸러낸 주소만 기록한다', () => {
    const router = createMemoryRouter('/works?secret=1');
    expect(router.current().search).toBe('');
    router.navigate(`/works/${ID}/search?q=원고 문장&versionId=${ID2}`);
    expect(router.entries.at(-1)).toBe(`/works/${ID}/search?versionId=${ID2}`);
  });

  it('저장하지 않은 입력이 있으면 이동 전에 확인을 받고, force 이동은 막지 않는다', () => {
    const router = createMemoryRouter('/works');
    const asked: (() => void)[] = [];
    router.onBlocked((proceed) => asked.push(proceed));
    const release = router.block('작성 중인 내용이 있습니다.');
    router.navigate('/settings');
    expect(router.current().path).toBe('/works');
    expect(asked).toHaveLength(1);
    asked[0]!();
    expect(router.current().path).toBe('/settings');
    release();
    router.block('다시 작성 중');
    router.navigate('/works', { force: true });
    expect(router.current().path).toBe('/works');
  });
});

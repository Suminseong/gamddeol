/** 상단 바 위치 표시(작품명 > 섹션 > 항목). */
import type { Workspace } from '../../domain/types';
import { pathFor, type RouteMatch } from '../../router/routes';

export interface Crumb {
  label: string;
  to?: string;
}

const SECTION_OF: Record<string, string> = {
  'page.chapters': 'page.chapters',
  'page.import': 'page.chapters',
  'page.chapter': 'page.chapters',
  'page.version': 'page.chapters',
  'page.compare': 'page.chapters',
  'page.wiki': 'page.wiki',
  'page.wikiNew': 'page.wiki',
  'page.wikiDetail': 'page.wiki',
  'page.reviewQueue': 'page.reviewQueue',
  'page.conflicts': 'page.conflicts',
  'page.conflictDetail': 'page.conflicts',
  'page.search': 'page.search',
  'page.personas': 'page.personas',
  'page.simRuns': 'page.simRuns',
  'page.simNew': 'page.simRuns',
  'page.simDetail': 'page.simRuns',
  'page.export': 'page.export',
  'page.workSettings': 'page.workSettings',
};

const SECTION_LABEL: Record<string, string> = {
  'page.chapters': '원고 및 회차',
  'page.wiki': '설정집 및 위키',
  'page.reviewQueue': 'AI 후보 검토함',
  'page.conflicts': '충돌 후보',
  'page.search': '통합 검색',
  'page.personas': '가상 독자 성향',
  'page.simRuns': '가상 연재',
  'page.export': '내보내기',
  'page.workSettings': '작품 설정',
};

export function buildCrumbs(match: RouteMatch | null, workspace: Workspace): Crumb[] {
  if (!match) return [{ label: '페이지 없음' }];
  const { route, params } = match;
  const workId = params.workId;
  const work = workId ? workspace.works[workId] : undefined;
  if (!workId) {
    if (route.id.startsWith('page.settings') || ['page.aiSettings', 'page.usage', 'page.dataSettings'].includes(route.id)) {
      return route.id === 'page.settings' ? [{ label: '설정' }] : [{ label: '설정', to: '/settings' }, { label: route.title }];
    }
    return [{ label: route.title }];
  }
  const crumbs: Crumb[] = [{ label: work?.title ?? '작품', to: pathFor('page.workHome', { workId }) }];
  const section = SECTION_OF[route.id];
  if (section) {
    crumbs.push({ label: SECTION_LABEL[section]!, to: pathFor(section, { workId }) });
    if (route.id === 'page.chapter' || route.id === 'page.version' || route.id === 'page.compare') {
      const chapter = params.chapterId ? workspace.chapters[params.chapterId] : undefined;
      if (chapter) crumbs.push({ label: `${chapter.displayNumber}화`, to: pathFor('page.chapter', { workId, chapterId: chapter.id }) });
      if (route.id === 'page.version') {
        const version = params.versionId ? workspace.versions[params.versionId] : undefined;
        crumbs.push({ label: version ? `판본 v${version.versionOrdinal}` : '판본' });
      } else if (route.id === 'page.compare') crumbs.push({ label: '판본 비교' });
    } else if (route.id === 'page.wikiDetail') {
      const entity = params.entityId ? workspace.entities[params.entityId] : undefined;
      crumbs.push({ label: entity?.canonicalName ?? '항목' });
    } else if (route.id !== section) {
      crumbs.push({ label: route.title });
    }
  }
  return crumbs;
}

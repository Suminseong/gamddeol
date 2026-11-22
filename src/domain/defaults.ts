/** 작품을 만들 때 함께 만드는 기본 속성 정의와 가상 독자 2집단 프리셋 (IA defaultSchemas·deterministicKernel). */
import { ENTITY_KINDS, type EntityKind, type TagIntensities } from './types';

interface AttributeSeed {
  key: string;
  label: string;
  timeVariant: boolean;
}

const COMMON: AttributeSeed[] = [
  { key: 'summary', label: '개요', timeVariant: false },
  { key: 'status', label: '현재 상태', timeVariant: true },
  { key: 'trait', label: '특징', timeVariant: true },
];

const BY_KIND: Partial<Record<EntityKind, AttributeSeed[]>> = {
  character: [
    { key: 'name', label: '이름', timeVariant: false },
    { key: 'age', label: '나이', timeVariant: true },
    { key: 'affiliation', label: '소속', timeVariant: true },
    { key: 'role', label: '역할', timeVariant: true },
    { key: 'aliveStatus', label: '생존 여부', timeVariant: true },
    { key: 'injuryStatus', label: '부상 상태', timeVariant: true },
  ],
  nation: [
    { key: 'politics', label: '정치', timeVariant: true },
    { key: 'economy', label: '경제', timeVariant: true },
    { key: 'population', label: '인구', timeVariant: true },
    { key: 'territory', label: '영토', timeVariant: true },
    { key: 'military', label: '군사', timeVariant: true },
    { key: 'diplomacy', label: '외교', timeVariant: true },
  ],
};

export function attributeSeeds(): { entityKind: EntityKind; seeds: AttributeSeed[] }[] {
  return ENTITY_KINDS.map((entityKind) => ({ entityKind, seeds: [...(BY_KIND[entityKind] ?? []), ...COMMON] }));
}

export interface PersonaPreset {
  presetKey: string;
  displayName: string;
  likes: string[];
  dislikes: string[];
  weights: TagIntensities;
  betrayalSensitivity: number;
  initialCount: number;
}

/** V10 검산 기본값: 순애 6000명·피폐 4000명, 가중치와 배신 민감도. */
export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    presetKey: 'pure_love_fan',
    displayName: '순애',
    likes: ['사이다', '복선 회수'],
    dislikes: ['관계 배신', '비극', '고구마'],
    weights: { G: -0.2, B: -0.55, C: 0.35, R: 0.15, H: -0.25 },
    betrayalSensitivity: 1,
    initialCount: 6000,
  },
  {
    presetKey: 'angst_fan',
    displayName: '피폐',
    likes: ['비극', '관계 배신', '사이다'],
    dislikes: [],
    weights: { G: 0.05, B: 0.2, C: 0.15, R: 0.15, H: 0.25 },
    betrayalSensitivity: 0,
    initialCount: 4000,
  },
];

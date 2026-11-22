export const REVIEW_PERSPECTIVES = {
  general: {
    label: '일반 감평',
    instructions: null,
  },
  pacing: {
    label: '전개·몰입',
    instructions:
      '전개 속도, 장면 사이의 연결, 독자의 몰입을 특히 살펴보세요. 원고에서 독자가 흥미를 느끼거나 흐름을 놓칠 만한 지점을 구체적으로 짚어 주세요.',
  },
  coherence: {
    label: '인물·설정 일관성',
    instructions:
      '인물의 행동과 동기, 작품 속 규칙의 일관성을 특히 살펴보세요. 확실한 모순과 이 원고 일부만으로 판단하기 어려운 부분을 구분해 주세요.',
  },
} as const;

export type ReviewPerspective = keyof typeof REVIEW_PERSPECTIVES;

export const DEFAULT_REVIEW_PERSPECTIVE: ReviewPerspective = 'general';

export function isReviewPerspective(value: string): value is ReviewPerspective {
  return Object.hasOwn(REVIEW_PERSPECTIVES, value);
}

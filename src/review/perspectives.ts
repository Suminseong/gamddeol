/**
 * 고정 감평 관점. label·description은 화면 표시용이고 OpenAI로 보내지 않는다.
 * instructions만 실행 시 기본 지시 뒤에 붙어 요청 본문 instructions로 간다.
 */
export const REVIEW_PERSPECTIVES = {
  general: {
    label: '일반 감평',
    description: '특정 관점 없이 기본 감평 지시만 보냅니다.',
    instructions: null,
  },
  pacing: {
    label: '전개·몰입',
    description: '기본 지시에 전개 속도, 장면 연결, 몰입이 끊기는 지점을 살펴 달라는 지시를 더합니다.',
    instructions:
      '전개 속도, 장면 사이의 연결, 독자의 몰입을 특히 살펴보세요. 원고에서 독자가 흥미를 느끼거나 흐름을 놓칠 만한 지점을 구체적으로 짚어 주세요.',
  },
  coherence: {
    label: '인물·설정 일관성',
    description: '기본 지시에 인물의 행동·동기와 작품 속 규칙이 어긋나는 곳을 살펴 달라는 지시를 더합니다.',
    instructions:
      '인물의 행동과 동기, 작품 속 규칙의 일관성을 특히 살펴보세요. 확실한 모순과 이 원고 일부만으로 판단하기 어려운 부분을 구분해 주세요.',
  },
} as const;

export type ReviewPerspective = keyof typeof REVIEW_PERSPECTIVES;

export const DEFAULT_REVIEW_PERSPECTIVE: ReviewPerspective = 'general';

export function isReviewPerspective(value: string): value is ReviewPerspective {
  return Object.hasOwn(REVIEW_PERSPECTIVES, value);
}

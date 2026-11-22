/**
 * 작가용 창작 관리 플랫폼 & 가상 연재 시뮬레이터
 * TypeScript Design System Tokens & Domain UI Types v0.2
 * Author: Gemini (Design, UX & Copy) | Date: 2026-11-22
 */

export type ThemeMode = 'light' | 'dark';

export type ReaderFontMode = 'serif' | 'sans';

/**
 * 기획서 6.2절 기반 정보 출처 및 확정 상태 6단계 분류
 */
export type EpistemicStatus =
  | 'canon'           // 작가가 확정한 설정
  | 'manuscript_fact' // 원고에 직접 서술된 사실
  | 'character_claim' // 등장인물의 발언/주장 (거짓·오해 가능)
  | 'ai_candidate'    // AI 추출·추론 미확정 후보
  | 'conflict_warning'// 기존 설정과 충돌하는 검토 후보
  | 'deprecated';     // 부정·폐기된 정보 또는 의도된 예외

export type PersonaId =
  | 'nureongi'        // 1. 누렁이 독자
  | 'picky_reader'    // 2. 까다로운 독자
  | 'fellow_writer'   // 3. 동료 작가
  | 'lore_hardcore'   // 4. 설정 고인물
  | 'munchkin_fan'    // 5. 먼치킨 선호 독자
  | 'pure_love_fan'   // 6. 순애 선호 독자
  | 'angst_fan'       // 7. 피폐물 선호 독자
  | 'character_fan';  // 8. 캐릭터 중심 독자

export interface EpistemicStyleToken {
  label: string;
  description: string;
  fg: string;
  bg: string;
  border: string;
  cssVarPrefix: string;
}

export interface ThemePalette {
  canvasPrimary: string;
  canvasSecondary: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  borderSubtle: string;
  borderStrong: string;
  accentPrimary: string;
  accentPrimaryHover: string;
  accentPrimarySoft: string;
  accentContrast: string;
  epistemic: Record<EpistemicStatus, EpistemicStyleToken>;
  neumorphism: {
    surfaceRaised: string;
    surfacePressed: string;
    buttonPrimary: string;
  };
}

export const DESIGN_TOKENS: Record<ThemeMode, ThemePalette> = {
  light: {
    canvasPrimary: '#F6F5F2',
    canvasSecondary: '#ECEAE4',
    surfaceElevated: '#FFFFFF',
    textPrimary: '#1E1F22',
    textSecondary: '#646870',
    textMuted: '#969BA5',
    borderSubtle: '#E2E0D8',
    borderStrong: '#C9C5B9',
    accentPrimary: '#2B5B84',
    accentPrimaryHover: '#234B6E',
    accentPrimarySoft: '#E8F0F7',
    accentContrast: '#FFFFFF',
    epistemic: {
      canon: {
        label: '확정 설정',
        description: '작가가 승인하거나 직접 등록한 공식 설정',
        fg: '#234B6E',
        bg: '#E8F0F7',
        border: '#B8CFE3',
        cssVarPrefix: '--status-canon',
      },
      manuscript_fact: {
        label: '원고 사실',
        description: '작중 서술자로부터 직접 명시된 사실',
        fg: '#2E6F5E',
        bg: '#E7F3EF',
        border: '#B5D8CE',
        cssVarPrefix: '--status-fact',
      },
      character_claim: {
        label: '인물 발언',
        description: '등장인물의 대사·주장 (거짓 진술 및 오해 가능성 포함)',
        fg: '#3B7A8C',
        bg: '#EBF4F7',
        border: '#B9D7E0',
        cssVarPrefix: '--status-claim',
      },
      ai_candidate: {
        label: 'AI 추출 후보',
        description: 'AI가 추출 또는 추론한 미확정 항목',
        fg: '#7A6B99',
        bg: '#F1EEF7',
        border: '#CFC6E0',
        cssVarPrefix: '--status-candidate',
      },
      conflict_warning: {
        label: '충돌 검토',
        description: '기존 확정 설정과 대조가 필요한 후보',
        fg: '#C86D2D',
        bg: '#FBF0E8',
        border: '#EBC6AC',
        cssVarPrefix: '--status-warning',
      },
      deprecated: {
        label: '폐기·예외',
        description: '부정·폐기되었거나 의도된 연출로 예외 처리된 항목',
        fg: '#646870',
        bg: '#ECEAE4',
        border: '#D2CFC5',
        cssVarPrefix: '--status-deprecated',
      },
    },
    neumorphism: {
      surfaceRaised:
        '-4px -4px 10px rgba(255, 255, 255, 0.85), 4px 4px 10px rgba(214, 211, 201, 0.65)',
      surfacePressed:
        'inset 3px 3px 6px rgba(214, 211, 201, 0.7), inset -3px -3px 6px rgba(255, 255, 255, 0.85)',
      buttonPrimary:
        '-3px -3px 8px rgba(255, 255, 255, 0.8), 4px 4px 10px rgba(43, 91, 132, 0.28)',
    },
  },
  dark: {
    canvasPrimary: '#18191B',
    canvasSecondary: '#121315',
    surfaceElevated: '#222428',
    textPrimary: '#E6E6E8',
    textSecondary: '#969BA5',
    textMuted: '#646870',
    borderSubtle: '#2F3238',
    borderStrong: '#454952',
    accentPrimary: '#5B9BD5',
    accentPrimaryHover: '#73ACE0',
    accentPrimarySoft: '#1A2B3C',
    accentContrast: '#121315',
    epistemic: {
      canon: {
        label: '확정 설정',
        description: '작가가 승인하거나 직접 등록한 공식 설정',
        fg: '#7BB2E3',
        bg: '#1A2B3C',
        border: '#2B4661',
        cssVarPrefix: '--status-canon',
      },
      manuscript_fact: {
        label: '원고 사실',
        description: '작중 서술자로부터 직접 명시된 사실',
        fg: '#6AC2AA',
        bg: '#192E28',
        border: '#294D43',
        cssVarPrefix: '--status-fact',
      },
      character_claim: {
        label: '인물 발언',
        description: '등장인물의 대사·주장 (거짓 진술 및 오해 가능성 포함)',
        fg: '#79BED1',
        bg: '#1B2E34',
        border: '#2C4B54',
        cssVarPrefix: '--status-claim',
      },
      ai_candidate: {
        label: 'AI 추출 후보',
        description: 'AI가 추출 또는 추론한 미확정 항목',
        fg: '#B3A4D6',
        bg: '#282334',
        border: '#3F3752',
        cssVarPrefix: '--status-candidate',
      },
      conflict_warning: {
        label: '충돌 검토',
        description: '기존 확정 설정과 대조가 필요한 후보',
        fg: '#E89B63',
        bg: '#382417',
        border: '#593924',
        cssVarPrefix: '--status-warning',
      },
      deprecated: {
        label: '폐기·예외',
        description: '부정·폐기되었거나 의도된 연출로 예외 처리된 항목',
        fg: '#969BA5',
        bg: '#222428',
        border: '#383B42',
        cssVarPrefix: '--status-deprecated',
      },
    },
    neumorphism: {
      surfaceRaised:
        '-4px -4px 10px rgba(36, 38, 43, 0.75), 4px 4px 10px rgba(12, 13, 15, 0.85)',
      surfacePressed:
        'inset 3px 3px 6px rgba(12, 13, 15, 0.85), inset -3px -3px 6px rgba(36, 38, 43, 0.7)',
      buttonPrimary:
        '-3px -3px 8px rgba(36, 38, 43, 0.7), 4px 4px 12px rgba(0, 0, 0, 0.75)',
    },
  },
};

export const READER_LAYOUT_TOKENS = {
  sidebarWidthPx: 220,
  sidebarCollapsedWidthPx: 64,
  inspectorWidthPx: 380,
  readerMaxWidthPx: 700,
  targetCharsPerLine: { min: 38, max: 45 },
  lineHeight: 1.8,
} as const;

export const PERSONA_BADGE_TOKENS: Record<
  PersonaId,
  { name: string; shortTag: string; lightAccent: string; darkAccent: string }
> = {
  nureongi: { name: '누렁이 독자', shortTag: '누렁이', lightAccent: '#3D7A5A', darkAccent: '#6BC295' },
  picky_reader: { name: '까다로운 독자', shortTag: '까다로움', lightAccent: '#8C4A4A', darkAccent: '#D98282' },
  fellow_writer: { name: '동료 작가', shortTag: '동료작가', lightAccent: '#2B5B84', darkAccent: '#6BA6DB' },
  lore_hardcore: { name: '설정 고인물', shortTag: '설정고인물', lightAccent: '#C86D2D', darkAccent: '#E89B63' },
  munchkin_fan: { name: '먼치킨 선호', shortTag: '먼치킨파', lightAccent: '#B57B24', darkAccent: '#E3AA54' },
  pure_love_fan: { name: '순애 선호', shortTag: '순애파', lightAccent: '#A84E73', darkAccent: '#DE85AA' },
  angst_fan: { name: '피폐물 선호', shortTag: '피폐파', lightAccent: '#655885', darkAccent: '#9F91C4' },
  character_fan: { name: '캐릭터 중심', shortTag: '캐릭팬', lightAccent: '#3B7A8C', darkAccent: '#6CB5C9' },
};

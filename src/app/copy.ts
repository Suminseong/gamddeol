import type { ReviewErrorKind } from '../review/types';
import type { KeyProblem } from '../session/keySession';

/**
 * 화면 문구를 한 곳에 모은다 (알파용 초안, UX 라이팅은 디자인 담당이 다듬는다).
 */

export const OPENAI_KEY_SAFETY_URL =
  'https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety';

export const copy = {
  title: '감떨 알파',
  tagline: '원고를 붙여넣고 OpenAI 감평 응답을 확인하는 개인 검증용 화면',

  notice: {
    heading: '개인 검증용 알파',
    body: '이 페이지는 입력한 OpenAI API 키를 브라우저에서 직접 씁니다. OpenAI는 API 키를 브라우저나 모바일 앱 같은 클라이언트 환경에 두지 말고 자체 서버를 거쳐 쓰라고 권고합니다. 이 알파는 그 권고를 알고 개인 검증 목적으로만 쓰는 화면입니다.',
    linkLabel: 'OpenAI 도움말: API 키 안전 수칙',
    points: [
      '공용·공유 컴퓨터에서는 쓰지 마세요.',
      '검증용으로 사용 한도를 낮게 둔 별도 키를 쓰고, 검증이 끝나면 OpenAI 대시보드에서 폐기하는 것을 권합니다.',
    ],
  },

  key: {
    label: 'OpenAI API 키',
    placeholderEmpty: 'sk-로 시작하는 키',
    placeholderSet: '새 키를 넣고 등록하면 교체됩니다',
    register: '등록',
    clear: '지우기',
    notRegistered: '등록된 키 없음',
    registered: '키 등록됨 · 이 탭 메모리에만 있습니다 (지우기·새로고침 시 삭제)',
    hint: '등록만으로는 OpenAI에 아무 요청도 보내지 않습니다. 브라우저가 비밀번호 저장을 제안하면 저장하지 마세요.',
    problems: {
      empty: '키를 입력하세요.',
      whitespace: '키 중간에 공백이나 줄바꿈이 있습니다.',
      invalid_chars: '키에 쓸 수 없는 문자(한글 등)가 섞여 있습니다.',
      too_short: '키가 너무 짧습니다. 전체를 붙여넣었는지 확인하세요.',
    } satisfies Record<KeyProblem, string>,
  },

  manuscript: {
    label: '원고 (평문)',
    placeholder: '원고를 직접 쓰거나 붙여넣으세요. 줄바꿈은 그대로 보냅니다.',
    counter: (length: number, max: number) =>
      `${length.toLocaleString('ko-KR')}자 / 최대 ${max.toLocaleString('ko-KR')}자`,
    tooLong: (max: number) => `원고가 너무 깁니다. 최대 ${max.toLocaleString('ko-KR')}자까지 보낼 수 있습니다.`,
  },

  run: {
    disclosureLead: '감평 실행을 누를 때만, 아래 두 가지를 OpenAI 공식 엔드포인트 한 곳으로 보냅니다.',
    sendKey: 'API 키 → Authorization 헤더',
    sendManuscript: '지금 입력한 원고 본문 → 요청 본문',
    disclosureTail:
      '키 등록만으로는 아무것도 보내지 않습니다. 다른 서버·분석 도구·외부 스크립트에는 연결하지 않습니다. 키·원고·결과는 이 탭 메모리에만 있고 새로고침하면 사라집니다. OpenAI에는 응답을 저장하지 말라고(store: false) 요청합니다.',
    params: (model: string, effort: string | null, maxOutputTokens: number, timeoutMs: number) =>
      [
        `모델 ${model}`,
        effort ? `추론 ${effort}` : null,
        `출력 상한 ${maxOutputTokens.toLocaleString('ko-KR')} 토큰`,
        `시간 제한 ${Math.round(timeoutMs / 60000)}분`,
      ]
        .filter(Boolean)
        .join(' · '),
    button: '감평 실행',
    buttonRunning: '감평 중…',
    cancel: '취소',
    blockers: {
      no_key: '먼저 OpenAI API 키를 등록하세요.',
      empty: '원고를 입력하세요.',
      too_long: '원고가 너무 깁니다.',
    },
  },

  result: {
    heading: '감평 결과',
    empty: '아직 결과가 없습니다. 키를 등록하고 원고를 넣은 뒤 감평 실행을 누르세요.',
    emptyNoKey: '키가 없으면 감평을 실행할 수 없습니다. 원고 입력은 키 없이도 할 수 있습니다.',
    waiting: (seconds: number) => `OpenAI 응답을 기다리는 중… ${seconds}초`,
    badgeOpenAI: 'OpenAI 응답',
    badgeMock: '모의 응답 · 네트워크 미사용',
    aiNote: 'AI 감평은 참고용입니다. 작품 설정이나 원고에 자동으로 반영되지 않습니다.',
    truncated: (reason: string, maxOutputTokens: number) =>
      reason === 'max_output_tokens'
        ? `출력 상한(${maxOutputTokens.toLocaleString('ko-KR')} 토큰)에 걸려 응답이 중간에 끊겼습니다.`
        : `응답이 끝까지 생성되지 않았습니다 (사유: ${reason}).`,
    meta: {
      model: '모델',
      responseId: '응답 ID',
      tokens: (input: number | null, output: number | null) =>
        `토큰 입력 ${input ?? '?'} / 출력 ${output ?? '?'}`,
      elapsed: (ms: number) => `${(ms / 1000).toFixed(1)}초`,
    },
    retry: '다시 시도',
    inputKept: '입력한 원고와 등록한 키는 그대로 있습니다.',
    serverMessage: 'OpenAI 메시지',
    httpStatus: 'HTTP 상태',
  },

  errors: {
    no_key: { title: '키가 등록되지 않았습니다', guide: 'OpenAI API 키를 등록한 뒤 다시 시도하세요.' },
    invalid_input: { title: '원고를 확인하세요', guide: '빈 원고나 너무 긴 원고는 보낼 수 없습니다.' },
    auth: {
      title: '인증 실패',
      guide: 'API 키가 틀렸거나 폐기·비활성화되었습니다. 키를 지우고 올바른 키를 다시 등록한 뒤 다시 시도하세요.',
    },
    permission: {
      title: '권한 없음',
      guide: '이 키나 프로젝트로는 설정된 모델을 쓸 수 없거나, 지원하지 않는 지역일 수 있습니다. OpenAI 메시지를 확인하세요.',
    },
    not_found: {
      title: '모델을 찾을 수 없음',
      guide: '설정된 모델을 이 키로 쓸 수 없습니다. 개발 담당에게 모델 설정(src/review/config.ts) 변경을 요청하세요.',
    },
    bad_request: {
      title: '요청 오류',
      guide: '원고가 모델 한도보다 길거나 요청 형식이 맞지 않습니다. OpenAI 메시지를 확인하세요.',
    },
    quota: {
      title: '할당량 부족',
      guide: 'OpenAI 계정의 크레딧이나 사용 한도를 확인한 뒤 다시 시도하세요.',
    },
    rate_limit: { title: '요청이 너무 많음', guide: '잠시 기다렸다가 다시 시도하세요.' },
    server: { title: 'OpenAI 서버 오류', guide: 'OpenAI 쪽 일시적인 문제일 수 있습니다. 잠시 후 다시 시도하세요.' },
    network: {
      title: '네트워크 오류 또는 브라우저 차단',
      guide: '브라우저가 OpenAI 응답을 읽지 못했습니다. OpenAI는 잘못된 키에 대한 오류 응답(401)에 브라우저 허용 헤더(CORS)를 붙이지 않아서, 키가 틀려도 이 메시지가 나옵니다. 할당량 부족 같은 다른 오류도 그럴 수 있습니다. 키를 지우고 다시 등록한 뒤, OpenAI 계정의 크레딧과 사용 한도를 확인하세요. 그래도 계속되면 인터넷 연결과, 확장 프로그램·보안 프로그램이 api.openai.com 요청을 막는지 확인하세요.',
    },
    timeout: {
      title: '시간 초과',
      guide: '제한 시간 안에 응답이 오지 않았습니다. 다시 시도하거나 원고를 나눠서 보내 보세요.',
    },
    cancelled: { title: '취소됨', guide: '요청을 취소했습니다. 다시 실행할 수 있습니다.' },
    empty_response: {
      title: '빈 응답',
      guide: 'OpenAI가 텍스트 없이 응답했습니다. 다시 시도하세요.',
    },
    refusal: { title: '모델이 감평을 거절함', guide: '모델이 이 원고에 대한 응답을 거절했습니다. 아래 사유를 확인하세요.' },
    response_failed: { title: '응답 생성 실패', guide: 'OpenAI가 응답 생성에 실패했다고 알려 왔습니다. 다시 시도하세요.' },
    unexpected: { title: '예상하지 못한 응답', guide: '응답 형식을 해석하지 못했습니다. 다시 시도하세요.' },
  } satisfies Record<ReviewErrorKind, { title: string; guide: string }>,

  mock: {
    banner: '모의 모드 — OpenAI로 아무것도 보내지 않고 가짜 응답을 보여 줍니다.',
    scenarioLabel: '모의 시나리오',
  },

  footer: {
    build: (buildId: string) => `빌드 ${buildId.slice(0, 12)}`,
    source: '소스 코드',
  },

  framed: '보안을 위해 이 페이지는 다른 사이트 안(iframe)에서 열 수 없습니다. 주소창에서 직접 여세요.',
} as const;

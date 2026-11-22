import { OPENAI_RESPONSES_ENDPOINT } from '../transport/endpoint.ts';

/**
 * 배포 빌드의 index.html에 넣는 Content-Security-Policy.
 * GitHub Pages는 응답 헤더를 바꿀 수 없어 <meta>로 넣는다 (vite.config.ts).
 *
 * - 스크립트·스타일·글꼴·이미지는 같은 출처의 정적 파일만 허용한다 (외부 스크립트·분석 도구 없음).
 * - fetch 등 연결(connect-src)은 OpenAI 공식 Responses 엔드포인트 하나만 허용한다.
 */
export const CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': [OPENAI_RESPONSES_ENDPOINT],
  'manifest-src': ["'self'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'object-src': ["'none'"],
});

export function buildContentSecurityPolicy(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

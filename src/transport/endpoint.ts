/**
 * 이 앱이 연결하는 유일한 외부 주소: OpenAI 공식 Responses API 엔드포인트.
 *
 * - 감평 실행을 누를 때만 이 주소로 요청한다 (src/transport/openaiTransport.ts).
 * - 배포 빌드의 Content-Security-Policy connect-src도 이 값 하나만 허용한다 (src/security/csp.ts).
 * - 다른 서버, 프록시, 대체 엔드포인트를 추가하지 않는다.
 */
export const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';

/**
 * 자동 검증 전용 값. 실제 키나 원고가 아니다.
 * - FAKE_API_KEY: 형식만 키처럼 생긴 가짜 문자열 (OpenAI가 발급하지 않는 접두사).
 * - UI_CHECK_TEXT: 줄바꿈 보존을 확인하기 위한 짧은 UI 검사 문자열 (소설 원고 아님).
 */
export const FAKE_API_KEY = 'sk-uitest-FAKE-KEY-0000000000000000';
export const UI_CHECK_TEXT = 'UI 검사 문자열 1행\nUI 검사 문자열 2행';

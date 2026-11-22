/**
 * 다른 사이트가 이 페이지를 iframe으로 감싸 키 입력이나 실행 버튼을 유도하지 못하게 한다.
 * (GitHub Pages는 frame-ancestors 헤더를 줄 수 없어 스크립트로 막는다.)
 */
export function isFramed(win: Window = window): boolean {
  try {
    return win.self !== win.top;
  } catch {
    return true;
  }
}

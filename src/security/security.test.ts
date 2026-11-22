import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPENAI_RESPONSES_ENDPOINT } from '../transport/endpoint';
import { buildContentSecurityPolicy, CSP_DIRECTIVES } from './csp';
import { isFramed } from './frameGuard';

/** vitest는 저장소 루트에서 실행된다. */
const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'testing' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** 주석은 빼고 코드만 검사한다 (문서 주석에 저장소 이름이 나오는 것은 괜찮다). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

const files = sourceFiles(SRC).map((path) => ({
  name: relative(SRC, path).split('\\').join('/'),
  text: stripComments(readFileSync(path, 'utf8')),
}));

describe('CSP', () => {
  it('연결은 OpenAI Responses 엔드포인트 하나만 허용한다', () => {
    expect(CSP_DIRECTIVES['connect-src']).toEqual([OPENAI_RESPONSES_ENDPOINT]);
    expect(OPENAI_RESPONSES_ENDPOINT).toBe('https://api.openai.com/v1/responses');
  });

  it('외부 스크립트·인라인 실행을 허용하지 않는다', () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toMatch(/unsafe-(inline|eval)|https?:\/\/(?!api\.openai\.com\/v1\/responses)/);
  });
});

describe('소스 코드 위생', () => {
  it('검사 대상 소스 파일이 있다', () => {
    expect(files.map((file) => file.name)).toContain('transport/openaiTransport.ts');
  });

  it('네트워크 요청은 transport/openaiTransport.ts에서만 한다', () => {
    const offenders = files
      .filter((file) => /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(file.text))
      .map((file) => file.name);
    expect(offenders).toEqual(['transport/openaiTransport.ts']);
  });

  it('브라우저 영구 저장소와 콘솔 로그를 쓰지 않는다', () => {
    const offenders = files
      .filter((file) => /localStorage|sessionStorage|indexedDB|document\.cookie|caches\.|console\./.test(file.text))
      .map((file) => file.name);
    expect(offenders).toEqual([]);
  });

  it('방문 기록(history)은 라우터만 쓰고, location에 직접 값을 넣지 않는다', () => {
    const historyWriters = files.filter((file) => /history\.(push|replace)State/.test(file.text)).map((file) => file.name);
    expect(historyWriters).toEqual(['router/router.ts']);
    const locationWriters = files
      .filter((file) => /location\.(hash|search|href|pathname)\s*=|location\.(assign|replace)\s*\(/.test(file.text))
      .map((file) => file.name);
    expect(locationWriters).toEqual([]);
  });

  it('라우터는 쓰기 전에 주소를 허용 목록으로 거른다', () => {
    const router = files.find((file) => file.name === 'router/router.ts')!;
    expect(router.text).toMatch(/const target = sanitizeLocation\(splitTarget\(to\)\)/);
  });
});

describe('isFramed', () => {
  it('최상위 창이면 false, iframe 안이면 true', () => {
    const top = {} as Window;
    expect(isFramed({ self: top, top } as unknown as Window)).toBe(false);
    expect(isFramed({ self: {}, top } as unknown as Window)).toBe(true);
  });
});

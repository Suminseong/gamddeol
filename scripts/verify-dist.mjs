// 배포 산출물(dist/) 검사. `npm run build` 마지막에 실행된다.
// 키·원고 없이 돌아가며, 문제가 있으면 빌드를 실패시킨다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const ENDPOINT = 'https://api.openai.com/v1/responses';
const problems = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(DIST).map((path) => relative(DIST, path).split('\\').join('/'));
const html = readFileSync(join(DIST, 'index.html'), 'utf8');

// GitHub Pages 직접 진입·새로고침: 404.html이 index.html과 똑같아야 앱이 주소를 읽어 화면을 그린다.
if (!files.includes('404.html')) problems.push('404.html이 없습니다(직접 진입·새로고침 대비).');
else if (readFileSync(join(DIST, '404.html'), 'utf8') !== html) problems.push('404.html이 index.html과 다릅니다.');

const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
if (!csp) {
  problems.push('index.html에 CSP meta가 없습니다.');
} else {
  if (!csp.includes(`connect-src ${ENDPOINT};`)) problems.push(`connect-src가 ${ENDPOINT} 하나로 제한되지 않았습니다.`);
  if (csp.includes('unsafe-inline') || csp.includes('unsafe-eval')) problems.push('CSP에 unsafe-* 가 있습니다.');
}

if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) problems.push('index.html에 인라인 스크립트가 있습니다.');
for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
  const url = match[1];
  if (!url.startsWith('/gamddeol/')) problems.push(`프로젝트 경로 밖 리소스 참조: ${url}`);
}

const jsFiles = files.filter((file) => file.endsWith('.js'));
const bundle = jsFiles.map((file) => readFileSync(join(DIST, file), 'utf8')).join('\n');
const forbidden = [
  ['[모의 응답]', '모의 전송 코드가 배포 번들에 들어 있습니다.'],
  ['localStorage', '번들에 localStorage 사용이 있습니다.'],
  ['sessionStorage', '번들에 sessionStorage 사용이 있습니다.'],
  ['indexedDB', '번들에 indexedDB 사용이 있습니다.'],
  ['document.cookie', '번들에 document.cookie 사용이 있습니다.'],
  ['sourceMappingURL', '번들에 소스맵 참조가 있습니다.'],
];
for (const [needle, message] of forbidden) {
  if (bundle.includes(needle)) problems.push(message);
}
if (files.some((file) => file.endsWith('.map'))) problems.push('소스맵 파일이 있습니다.');
if (!bundle.includes(ENDPOINT)) problems.push('번들에 OpenAI 엔드포인트가 없습니다.');

if (problems.length > 0) {
  process.stderr.write(`dist 검사 실패:\n- ${problems.join('\n- ')}\n`);
  process.exit(1);
}
process.stdout.write(`dist 검사 통과: 파일 ${files.length}개, JS ${jsFiles.length}개, CSP·404.html 확인\n`);

// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 실험이 감평 알파(src/)·배포 경로와 섞이지 않고, 계산 코드가 외부 호출·난수·시계를 쓰지 않는지
 * 소스 파일로 확인한다. 알파 번들은 index.html → src/main.tsx에서 닿는 파일만 담으므로
 * src/가 experiments/를 가져오지 않으면 실험 코드는 배포 파일에 들어가지 않는다.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const srcDir = join(repo, 'src');
const experimentsDir = join(repo, 'experiments');

const inside = (path: string, dir: string) => path === dir || path.startsWith(dir + sep);

function filesUnder(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8', withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !path.split(sep).includes('node_modules'))
    .sort();
}

/** import·export의 from 절, 부수 효과 import, 동적 import()의 모듈 지정자(따옴표 문자열). */
function specifiers(source: string): string[] {
  const pattern =
    /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]/g;
  return [...source.matchAll(pattern)].map((match) => (match[1] ?? match[2] ?? match[3])!);
}

const read = (path: string) => readFileSync(path, 'utf8');
const name = (path: string) => relative(repo, path).split(sep).join('/');

const srcFiles = filesUnder(srcDir, /\.(?:ts|tsx|js|mjs|jsx)$/);
const experimentFiles = filesUnder(experimentsDir, /\.ts$/);
const isTest = (path: string) => /\.test\.ts$/.test(path);
const isConfig = (path: string) => /(?:^|[\\/])vitest\.config\.ts$/.test(path);
const kernelFiles = experimentFiles.filter((path) => !isTest(path) && !isConfig(path));

describe('실험과 감평 알파의 분리', () => {
  it('검사 대상 파일을 찾았다', () => {
    expect(srcFiles.length).toBeGreaterThan(10);
    expect(kernelFiles.map(name)).toEqual(
      expect.arrayContaining([
        'experiments/virtual-readers/kernel.ts',
        'experiments/virtual-readers/model.ts',
        'experiments/virtual-readers/run.ts',
      ]),
    );
    expect(specifiers(read(join(here, 'kernel.ts')))).toContain('./model.ts');
  });

  it('src/의 어떤 파일도 experiments/를 가져오지 않는다', () => {
    for (const file of srcFiles) {
      for (const specifier of specifiers(read(file))) {
        const target = specifier.startsWith('.') ? resolve(dirname(file), specifier) : specifier;
        expect(inside(target, experimentsDir) || /(?:^|\/)experiments\//.test(specifier), `${name(file)} → ${specifier}`).toBe(false);
      }
    }
  });

  it('알파 빌드·테스트 설정과 Pages 워크플로는 실험을 참조하지 않는다', () => {
    for (const file of ['index.html', 'vite.config.ts', 'tsconfig.json', '.github/workflows/pages.yml']) {
      expect(read(join(repo, file)), file).not.toMatch(/experiments/);
    }
  });

  it('실험 파일은 src/를 가져오지 않고, 정해진 모듈만 쓴다', () => {
    const allowed = (file: string) =>
      isTest(file)
        ? ['vitest', 'node:fs', 'node:path', 'node:url']
        : isConfig(file)
          ? ['vitest/config', 'node:url']
          : file.endsWith(`${sep}snapshot.ts`)
            ? ['node:crypto']
            : [];
    for (const file of experimentFiles) {
      for (const specifier of specifiers(read(file))) {
        if (specifier.startsWith('.')) {
          const target = resolve(dirname(file), specifier);
          expect(inside(target, experimentsDir), `${name(file)} → ${specifier}`).toBe(true);
          expect(inside(target, srcDir), `${name(file)} → ${specifier}`).toBe(false);
        } else {
          expect(allowed(file), `${name(file)} → ${specifier}`).toContain(specifier);
        }
      }
    }
  });

  it('계산 코드는 네트워크·난수·현재 시각을 쓰지 않는다', () => {
    const forbidden =
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|Math\.random|getRandomValues|randomUUID|randomBytes|Date\.now|new Date|performance\.now|process\.env)\b/;
    for (const file of kernelFiles) {
      expect(read(file), name(file)).not.toMatch(forbidden);
    }
  });
});

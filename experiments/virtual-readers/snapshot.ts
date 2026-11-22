/**
 * 입력 스냅샷과 해시. 실행 기록에 "무엇으로 계산했는가"를 남긴다(Node 전용: node:crypto).
 *
 * - 커널 버전과 상수, 섭동·난수 알고리즘·시드(이 PoC는 모두 없음 = null)를 함께 넣는다.
 * - 판본 ID와 작품 약속 프로필은 수동 태그 예제라 입력에 없다(README의 미해결 가정).
 * - 집단은 계산이 입력 순서와 무관하므로 id 순으로 정렬한다. 회차는 순서가 결과를 바꾸므로 그대로 둔다.
 * - 회차 태그는 5개 태그 전부를 적은 형태로 바꾼다(적지 않은 태그 = 0이라 같은 뜻의 입력은 같은 해시).
 * - 객체 키는 정렬하고, 숫자는 JSON 표준 표기(왕복 가능한 최단 표기)를 쓴다.
 */
import { createHash } from 'node:crypto';
import { compareIds, KERNEL, type SimulationInput, TAG_IDS, validateInput } from './model.ts';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(',')}}`;
}

export function canonicalSnapshot(input: SimulationInput): string {
  validateInput(input);
  const groups = [...input.groups].sort((a, b) => compareIds(a.id, b.id));
  const episodes = input.episodes.map((episode) => ({
    baseChurn: episode.baseChurn,
    tags: Object.fromEntries(TAG_IDS.map((tag) => [tag, episode.tags[tag] ?? 0])),
  }));
  return canonicalJson({ kernel: KERNEL, perturbation: null, rng: null, seed: null, groups, episodes });
}

export function inputHash(input: SimulationInput): string {
  return `sha256:${createHash('sha256').update(canonicalSnapshot(input)).digest('hex')}`;
}

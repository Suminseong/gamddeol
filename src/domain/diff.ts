/** 판본 비교: 줄 단위 최장 공통 부분열(LCS) 차이. 앞뒤 공통 부분을 먼저 걷어 계산량을 줄인다. */

export type DiffOp =
  | { type: 'equal'; text: string; leftLine: number; rightLine: number }
  | { type: 'removed'; text: string; leftLine: number }
  | { type: 'added'; text: string; rightLine: number };

export interface DiffResult {
  ops: DiffOp[];
  added: number;
  removed: number;
  tooLarge: boolean;
}

/** 중간 비교 표 칸 수 상한(메모리 약 16MB). 넘으면 비교하지 않고 알린다. */
export const MAX_DIFF_CELLS = 4_000_000;

export function diffLines(leftText: string, rightText: string): DiffResult {
  const left = leftText.split('\n');
  const right = rightText.split('\n');
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix++;
  }
  const a = left.slice(prefix, left.length - suffix);
  const b = right.slice(prefix, right.length - suffix);
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > MAX_DIFF_CELLS) return { ops: [], added: 0, removed: 0, tooLarge: true };

  const width = m + 1;
  const table = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j] ? table[(i + 1) * width + j + 1]! + 1 : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  for (let k = 0; k < prefix; k++) ops.push({ type: 'equal', text: left[k]!, leftLine: k + 1, rightLine: k + 1 });
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push({ type: 'equal', text: a[i]!, leftLine: prefix + i + 1, rightLine: prefix + j + 1 });
      i++;
      j++;
    } else if (j < m && (i >= n || table[i * width + j + 1]! >= table[(i + 1) * width + j]!)) {
      ops.push({ type: 'added', text: b[j]!, rightLine: prefix + j + 1 });
      added++;
      j++;
    } else {
      ops.push({ type: 'removed', text: a[i]!, leftLine: prefix + i + 1 });
      removed++;
      i++;
    }
  }
  for (let k = 0; k < suffix; k++) {
    ops.push({
      type: 'equal',
      text: left[left.length - suffix + k]!,
      leftLine: left.length - suffix + k + 1,
      rightLine: right.length - suffix + k + 1,
    });
  }
  return { ops, added, removed, tooLarge: false };
}

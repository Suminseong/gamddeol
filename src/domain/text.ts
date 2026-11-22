/**
 * 원고 정규화·코드포인트 오프셋·해시 (IA normalizationContract).
 * - BOM 제거, CRLF·CR → LF, Unicode NFC. 공백 축약·문장부호 변환은 하지 않는다.
 * - 저장·근거 오프셋은 코드포인트 반열림 구간 [startCp, endCp). UTF-16 오프셋은 화면 강조 경계에서만 쓴다.
 */
import type { SegmentKind } from './types';

export const NORMALIZER_VERSION = 'nfc-lf-1';
export const ANCHOR_CONTEXT_CP = 32;

export function normalizeManuscript(raw: string): string {
  const withoutBom = raw.startsWith('\uFEFF') ? raw.slice(1) : raw;
  return withoutBom.replace(/\r\n?/g, '\n').normalize('NFC');
}

/** 문자열 전체의 코드포인트 수. */
export function cpLength(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    count++;
  }
  return count;
}

/** 코드포인트 오프셋 → UTF-16 오프셋. 범위를 넘으면 문자열 끝. */
export function cpToUtf16(text: string, cp: number): number {
  let index = 0;
  let count = 0;
  while (index < text.length && count < cp) {
    const code = text.charCodeAt(index);
    index += code >= 0xd800 && code <= 0xdbff && index + 1 < text.length ? 2 : 1;
    count++;
  }
  return index;
}

/** UTF-16 오프셋 → 코드포인트 오프셋. */
export function utf16ToCp(text: string, utf16: number): number {
  return cpLength(text.slice(0, Math.max(0, Math.min(utf16, text.length))));
}

export function cpSlice(text: string, startCp: number, endCp: number): string {
  return text.slice(cpToUtf16(text, startCp), cpToUtf16(text, endCp));
}

/** 문구가 나오는 모든 위치(코드포인트 구간). 겹치는 위치도 센다. */
export function findAllCp(text: string, needle: string, limit = 200): { startCp: number; endCp: number }[] {
  if (!needle) return [];
  const results: { startCp: number; endCp: number }[] = [];
  const needleCp = cpLength(needle);
  let from = 0;
  let lastUtf16 = 0;
  let lastCp = 0;
  while (results.length < limit) {
    const index = text.indexOf(needle, from);
    if (index < 0) break;
    lastCp += cpLength(text.slice(lastUtf16, index));
    lastUtf16 = index;
    results.push({ startCp: lastCp, endCp: lastCp + needleCp });
    from = index + 1;
  }
  return results;
}

export interface SegmentDraft {
  startCp: number;
  endCp: number;
  kind: SegmentKind;
  text: string;
}

const HEADING = /^(#{1,6}\s+\S|제?\s*\d+\s*(화|장|회)(?![\p{L}\p{N}])|프롤로그|에필로그)/u;

/** 빈 줄로 나뉜 단락 구간. 정규화된 본문을 그대로 덮는다(구간 밖 글자 없음). */
export function segmentText(normalized: string): SegmentDraft[] {
  const segments: SegmentDraft[] = [];
  const pattern = /\n{2,}/g;
  let start = 0;
  let cpCursor = 0;
  const push = (endUtf16: number) => {
    const text = normalized.slice(start, endUtf16);
    const length = cpLength(text);
    if (text.trim().length > 0) {
      segments.push({
        startCp: cpCursor,
        endCp: cpCursor + length,
        kind: HEADING.test(text.trim()) && !text.trim().includes('\n') ? 'heading' : 'paragraph',
        text,
      });
    }
    cpCursor += length;
  };
  for (const match of normalized.matchAll(pattern)) {
    push(match.index);
    cpCursor += cpLength(match[0]);
    start = match.index + match[0].length;
  }
  push(normalized.length);
  return segments;
}

/** 다중 회차 파일에서 경계 후보가 될 수 있는 줄(회차 제목처럼 보이는 줄)의 시작 위치. */
export function boundaryCandidates(normalized: string): { utf16: number; line: string }[] {
  const lines: { utf16: number; line: string }[] = [];
  let offset = 0;
  for (const line of normalized.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length <= 40 && HEADING.test(trimmed) && offset > 0) {
      lines.push({ utf16: offset, line: trimmed });
    }
    offset += line.length + 1;
  }
  return lines;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', copy.buffer));
}

export async function sha256Text(text: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(text));
}

/** 키 순서와 무관한 JSON 직렬화(해시 입력용). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 별칭·이름 비교용: NFC, 앞뒤 공백 제거, 연속 공백 하나로, 소문자. 저장 원문은 바꾸지 않는다. */
export function normalizeName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

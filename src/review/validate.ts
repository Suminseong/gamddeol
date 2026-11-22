import type { ReviewConfig } from './config';

export type ManuscriptCheck =
  | { ok: true; length: number }
  | { ok: false; reason: 'empty' | 'too_long'; length: number };

/** 원고 길이·빈 입력 검사. 원고 본문 자체는 바꾸지 않는다. */
export function checkManuscript(
  text: string,
  config: Pick<ReviewConfig, 'maxInputChars'>,
): ManuscriptCheck {
  const length = text.length;
  if (text.trim().length === 0) return { ok: false, reason: 'empty', length };
  if (length > config.maxInputChars) return { ok: false, reason: 'too_long', length };
  return { ok: true, length };
}

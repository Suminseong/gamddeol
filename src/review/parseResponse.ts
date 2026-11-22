import { ReviewError, type ReviewUsage } from './types';

export interface ParsedResponse {
  text: string;
  model: string | null;
  responseId: string | null;
  incompleteReason: string | null;
  usage: ReviewUsage | null;
}

type JsonRecord = Record<string, unknown>;

const MAX_SERVER_MESSAGE = 500;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function clipMessage(message: string | null | undefined): string | undefined {
  if (!message) return undefined;
  return message.length > MAX_SERVER_MESSAGE ? `${message.slice(0, MAX_SERVER_MESSAGE)}…` : message;
}

function contentParts(item: JsonRecord): JsonRecord[] {
  return Array.isArray(item.content) ? item.content.filter(isRecord) : [];
}

/** 어시스턴트 메시지의 output_text와 refusal을 모은다. final_answer 단계가 있으면 그것만 쓴다. */
function collectAssistantOutput(output: unknown): { texts: string[]; refusals: string[] } {
  const items = Array.isArray(output) ? output.filter(isRecord) : [];
  const messages = items.filter(
    (item) => item.type === 'message' && (item.role === undefined || item.role === 'assistant'),
  );
  const finals = messages.filter((message) => message.phase === 'final_answer');
  const chosen = finals.length > 0 ? finals : messages;

  const texts = chosen
    .map((message) =>
      contentParts(message)
        .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
        .map((part) => part.text as string)
        .join(''),
    )
    .filter((text) => text.length > 0);

  const refusals = messages.flatMap((message) =>
    contentParts(message)
      .filter((part) => part.type === 'refusal' && typeof part.refusal === 'string')
      .map((part) => part.refusal as string),
  );

  return { texts, refusals };
}

function parseUsage(value: unknown): ReviewUsage | null {
  if (!isRecord(value)) return null;
  const details = isRecord(value.output_tokens_details) ? value.output_tokens_details : {};
  return {
    inputTokens: asCount(value.input_tokens),
    outputTokens: asCount(value.output_tokens),
    reasoningTokens: asCount(details.reasoning_tokens),
  };
}

/** 2xx 응답 본문을 해석한다. 보여 줄 텍스트가 없으면 ReviewError를 던진다. */
export function parseResponsesBody(bodyText: string): ParsedResponse {
  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new ReviewError('unexpected', { serverMessage: clipMessage(bodyText.trim()) });
  }
  if (!isRecord(json)) throw new ReviewError('unexpected');

  const status = asString(json.status);
  const incompleteReason = isRecord(json.incomplete_details)
    ? asString(json.incomplete_details.reason)
    : null;

  if (status === 'failed' || status === 'cancelled') {
    const error = isRecord(json.error) ? json.error : {};
    throw new ReviewError('response_failed', {
      serverMessage: clipMessage(asString(error.message)),
      serverCode: asString(error.code) ?? status,
    });
  }

  const { texts, refusals } = collectAssistantOutput(json.output);
  let text = texts.join('\n\n').trim();
  if (!text && typeof json.output_text === 'string') text = json.output_text.trim();

  if (!text) {
    if (refusals.length > 0) {
      throw new ReviewError('refusal', { serverMessage: clipMessage(refusals.join('\n')) });
    }
    throw new ReviewError('empty_response', { incompleteReason: incompleteReason ?? undefined });
  }

  return {
    text,
    model: asString(json.model),
    responseId: asString(json.id),
    incompleteReason: status === 'incomplete' ? (incompleteReason ?? 'unknown') : null,
    usage: parseUsage(json.usage),
  };
}

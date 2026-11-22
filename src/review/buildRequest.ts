import type { ReviewConfig } from './config';
import { DEFAULT_REVIEW_PERSPECTIVE, REVIEW_PERSPECTIVES, type ReviewPerspective } from './perspectives';

/** OpenAI Responses API 요청 본문 (이 앱이 쓰는 필드만). */
export interface ResponsesRequestBody {
  model: string;
  instructions: string;
  input: string;
  max_output_tokens: number;
  store: boolean;
  reasoning?: { effort: string };
}

/** 원고는 손대지 않고 input에 그대로 넣는다 (줄바꿈 보존). */
export function buildResponsesRequest(
  manuscript: string,
  config: ReviewConfig,
  perspective: ReviewPerspective = DEFAULT_REVIEW_PERSPECTIVE,
): ResponsesRequestBody {
  const focus = REVIEW_PERSPECTIVES[perspective].instructions;
  const body: ResponsesRequestBody = {
    model: config.model,
    instructions: focus ? `${config.instructions}\n\n${focus}` : config.instructions,
    input: manuscript,
    max_output_tokens: config.maxOutputTokens,
    store: config.store,
  };
  if (config.reasoningEffort !== null) {
    body.reasoning = { effort: config.reasoningEffort };
  }
  return body;
}

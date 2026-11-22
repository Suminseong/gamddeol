import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReviewPerspective } from '../../review/perspectives';
import type { ReviewService } from '../../review/reviewService';
import { ReviewError, type ReviewResult } from '../../review/types';
import type { KeySession } from '../../session/keySession';

export type SavedReview = { result: ReviewResult; perspective: ReviewPerspective };

export type RunState =
  | { phase: 'idle' }
  | { phase: 'running'; startedAt: number; previous: SavedReview | null }
  | { phase: 'success'; result: ReviewResult; perspective: ReviewPerspective }
  | { phase: 'error'; error: ReviewError; previous: SavedReview | null };

function lastSuccessful(state: RunState): SavedReview | null {
  if (state.phase === 'success') return { result: state.result, perspective: state.perspective };
  if (state.phase === 'running' || state.phase === 'error') return state.previous;
  return null;
}

/**
 * 감평 실행 상태(진행·결과·오류)를 관리한다.
 * 실행 중에는 추가 실행을 무시해 중복 제출을 막는다.
 */
export function useReviewRunner(service: ReviewService, keySession: KeySession) {
  const [state, setState] = useState<RunState>({ phase: 'idle' });
  const inFlight = useRef<AbortController | null>(null);

  const run = useCallback(
    async (manuscript: string, perspective: ReviewPerspective) => {
      if (inFlight.current) return;
      const apiKey = keySession.get();
      if (!apiKey) {
        setState((current) => ({ phase: 'error', error: new ReviewError('no_key'), previous: lastSuccessful(current) }));
        return;
      }

      const controller = new AbortController();
      inFlight.current = controller;
      const startedAt = Date.now();
      setState((current) => ({ phase: 'running', startedAt, previous: lastSuccessful(current) }));
      try {
        const result = await service.review({ apiKey, manuscript, perspective }, { signal: controller.signal });
        setState({ phase: 'success', result, perspective });
      } catch (error) {
        setState((current) => ({
          phase: 'error',
          error: error instanceof ReviewError ? error : new ReviewError('unexpected'),
          previous: lastSuccessful(current),
        }));
      } finally {
        inFlight.current = null;
      }
    },
    [service, keySession],
  );

  const cancel = useCallback(() => {
    inFlight.current?.abort();
  }, []);

  useEffect(() => () => inFlight.current?.abort(), []);

  return { state, run, cancel };
}

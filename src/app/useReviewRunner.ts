import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReviewService } from '../review/reviewService';
import { ReviewError, type ReviewResult } from '../review/types';
import type { KeySession } from '../session/keySession';

export type RunState =
  | { phase: 'idle' }
  | { phase: 'running'; startedAt: number }
  | { phase: 'success'; result: ReviewResult }
  | { phase: 'error'; error: ReviewError };

/**
 * 감평 실행 상태(진행·결과·오류)를 관리한다.
 * 실행 중에는 추가 실행을 무시해 중복 제출을 막는다.
 */
export function useReviewRunner(service: ReviewService, keySession: KeySession) {
  const [state, setState] = useState<RunState>({ phase: 'idle' });
  const inFlight = useRef<AbortController | null>(null);

  const run = useCallback(
    async (manuscript: string) => {
      if (inFlight.current) return;
      const apiKey = keySession.get();
      if (!apiKey) {
        setState({ phase: 'error', error: new ReviewError('no_key') });
        return;
      }

      const controller = new AbortController();
      inFlight.current = controller;
      setState({ phase: 'running', startedAt: Date.now() });
      try {
        const result = await service.review({ apiKey, manuscript }, { signal: controller.signal });
        setState({ phase: 'success', result });
      } catch (error) {
        setState({
          phase: 'error',
          error: error instanceof ReviewError ? error : new ReviewError('unexpected'),
        });
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

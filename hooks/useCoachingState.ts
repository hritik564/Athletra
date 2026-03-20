import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { CoachingState } from '@/lib/coachingScript';
import { computeCoachingStates, selectCoachingState, LandmarkMap } from '@/lib/coachingLogic';
import { getApiUrl } from '@/lib/query-client';

const POLL_INTERVAL_MS  = 900;   // how often we grab a frame
const STABLE_WINDOW_MS  = 380;   // state must hold this long before shown
const ALIGNED_LOCK_MS   = 1200;  // hold ALIGNED this long before flagging readyToRecord

export interface CoachingStateResult {
  state: CoachingState;
  isReadyToRecord: boolean;
  frameCount: number;
}

export function useCoachingState(
  isActive: boolean,
  getCameraFrame: () => Promise<string | null>,
): CoachingStateResult {
  const [stableState,     setStableState]     = useState<CoachingState>('NOT_VISIBLE');
  const [isReadyToRecord, setIsReadyToRecord] = useState(false);
  const [frameCount,      setFrameCount]      = useState(0);

  const candidateStateRef  = useRef<CoachingState>('NOT_VISIBLE');
  const candidateStartRef  = useRef<number>(0);
  const prevLandmarksRef   = useRef<LandmarkMap | null>(null);
  const alignedSinceRef    = useRef<number | null>(null);
  const isFetchingRef      = useRef(false);
  const stableStateRef     = useRef<CoachingState>('NOT_VISIBLE');
  const isActiveRef        = useRef(isActive);

  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  const applyCandidate = useCallback((next: CoachingState) => {
    const now = Date.now();

    if (next !== candidateStateRef.current) {
      candidateStateRef.current = next;
      candidateStartRef.current = now;
      return;
    }

    if (now - candidateStartRef.current < STABLE_WINDOW_MS) return;
    if (next === stableStateRef.current) return;

    stableStateRef.current = next;
    setStableState(next);

    if (next === 'ALIGNED') {
      alignedSinceRef.current = now;
    } else {
      alignedSinceRef.current = null;
      setIsReadyToRecord(false);
    }
  }, []);

  const pollFrame = useCallback(async () => {
    if (!isActiveRef.current || isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const frame = await getCameraFrame();
      if (!frame || !isActiveRef.current) return;

      const baseUrl = getApiUrl();
      const res = await globalThis.fetch(`${baseUrl}api/coach/live-pose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: frame }),
      });

      if (!res.ok) return;
      const data = await res.json();

      setFrameCount(c => c + 1);

      if (!data.detected || !data.landmarks) {
        applyCandidate('NOT_VISIBLE');
        prevLandmarksRef.current = null;
        return;
      }

      const landmarks: LandmarkMap = data.landmarks;
      const rawStates = computeCoachingStates(landmarks, prevLandmarksRef.current);
      const next      = selectCoachingState(rawStates);
      prevLandmarksRef.current = landmarks;

      applyCandidate(next);
    } catch {
      // Network error — keep last state, don't flicker
    } finally {
      isFetchingRef.current = false;
    }
  }, [getCameraFrame, applyCandidate]);

  // ALIGNED lock check
  useEffect(() => {
    if (stableState !== 'ALIGNED') return;
    const id = setTimeout(() => {
      if (stableStateRef.current === 'ALIGNED') {
        setIsReadyToRecord(true);
      }
    }, ALIGNED_LOCK_MS);
    return () => clearTimeout(id);
  }, [stableState]);

  // Polling loop
  useEffect(() => {
    if (!isActive) {
      setStableState('NOT_VISIBLE');
      stableStateRef.current = 'NOT_VISIBLE';
      candidateStateRef.current = 'NOT_VISIBLE';
      prevLandmarksRef.current = null;
      alignedSinceRef.current = null;
      setIsReadyToRecord(false);
      setFrameCount(0);
      return;
    }

    const id = setInterval(pollFrame, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isActive, pollFrame]);

  return { state: stableState, isReadyToRecord, frameCount };
}

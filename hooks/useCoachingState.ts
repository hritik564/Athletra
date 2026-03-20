import { useEffect, useRef, useState, useCallback } from 'react';
import {
  newFilterBank,
  applyFilters,
  ema,
  adaptiveWindowMs,
  LandmarkFilterBank,
  LastKnownMap,
} from '@/lib/coachingFilters';
import { computeCoachingOutput, CoachingOutput } from '@/lib/coachingLogic';
import { CoachingState } from '@/lib/coachingScript';
import { getApiUrl } from '@/lib/query-client';

// ── Timing constants ──────────────────────────────────────────────────────────
const POLL_INTERVAL_MS   = 850;   // frame capture cadence
const EMA_ALPHA          = 0.35;  // velocity smoothing factor

// Progressive ALIGNED stage thresholds
const STAGE1_MS = 800;   // "Hold still…"  → "Almost there…"
const STAGE2_MS = 1200;  // "Almost there…" → trigger capture

// ── Public surface ────────────────────────────────────────────────────────────
export type AlignedStage = 0 | 1 | 2;   // 0=hold still, 1=almost there, 2=go!

export interface CoachingStateResult {
  state:           CoachingState;
  messageOverride: string | undefined;
  alignedStage:    AlignedStage;
  isReadyToRecord: boolean;
  smoothedVelocity: number;
}

export function useCoachingState(
  isActive: boolean,
  getCameraFrame: () => Promise<string | null>,
): CoachingStateResult {
  // ── Render state (triggers re-render) ───────────────────────────────────────
  const [stableState,     setStableState]     = useState<CoachingState>('NOT_VISIBLE');
  const [messageOverride, setMessageOverride] = useState<string | undefined>(undefined);
  const [alignedStage,    setAlignedStage]    = useState<AlignedStage>(0);
  const [isReadyToRecord, setIsReadyToRecord] = useState(false);
  const [smoothedVelocity, setSmoothedVelocity] = useState(0);

  // ── Mutable refs (no re-render) ──────────────────────────────────────────────
  const isActiveRef        = useRef(isActive);
  const isFetchingRef      = useRef(false);
  const stableStateRef     = useRef<CoachingState>('NOT_VISIBLE');

  // Candidate state machine
  const candidateRef       = useRef<CoachingState>('NOT_VISIBLE');
  const candidateStartRef  = useRef<number>(0);
  const candidateOverride  = useRef<string | undefined>(undefined);

  // Aligned duration tracking
  const alignedSinceRef   = useRef<number | null>(null);
  const alignedStageRef   = useRef<AlignedStage>(0);

  // Signal processing state
  const filterBankRef     = useRef<LandmarkFilterBank>(newFilterBank());
  const lastKnownRef      = useRef<LastKnownMap>({});
  const prevFilteredRef   = useRef<Record<string, { x: number; y: number }>>({});
  const smoothedVelRef    = useRef<number>(0);

  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  // ── Full reset ────────────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    setStableState('NOT_VISIBLE');
    setMessageOverride(undefined);
    setAlignedStage(0);
    setIsReadyToRecord(false);
    setSmoothedVelocity(0);
    stableStateRef.current   = 'NOT_VISIBLE';
    candidateRef.current     = 'NOT_VISIBLE';
    candidateStartRef.current = 0;
    candidateOverride.current = undefined;
    alignedSinceRef.current  = null;
    alignedStageRef.current  = 0;
    filterBankRef.current    = newFilterBank();
    lastKnownRef.current     = {};
    prevFilteredRef.current  = {};
    smoothedVelRef.current   = 0;
  }, []);

  // ── Aligned stage ticker ──────────────────────────────────────────────────────
  const updateAlignedStage = useCallback(() => {
    if (alignedSinceRef.current === null) return;
    const elapsed = Date.now() - alignedSinceRef.current;

    let next: AlignedStage;
    if (elapsed < STAGE1_MS) {
      next = 0;
    } else if (elapsed < STAGE2_MS) {
      next = 1;
    } else {
      next = 2;
    }

    if (next !== alignedStageRef.current) {
      alignedStageRef.current = next;
      setAlignedStage(next);

      if (next === 2) {
        setIsReadyToRecord(true);
      }
    }
  }, []);

  // ── Candidate → stable state transition ───────────────────────────────────────
  const applyCandidate = useCallback((output: CoachingOutput) => {
    const now     = Date.now();
    const nextSt  = output.state;

    // Reset aligned timer any time we leave ALIGNED
    if (nextSt !== 'ALIGNED' && stableStateRef.current === 'ALIGNED') {
      alignedSinceRef.current = null;
      alignedStageRef.current = 0;
      setAlignedStage(0);
      setIsReadyToRecord(false);
    }

    // Candidate accumulation
    if (nextSt !== candidateRef.current) {
      candidateRef.current      = nextSt;
      candidateStartRef.current = now;
      candidateOverride.current = output.messageOverride;
      return;
    }

    // Check if candidate has been stable long enough (adaptive window)
    const windowMs = adaptiveWindowMs(smoothedVelRef.current);
    if (now - candidateStartRef.current < windowMs) return;

    // Candidate is stable — check if it's already the displayed state
    if (nextSt === stableStateRef.current) {
      // Same state — just update override if changed (e.g. NOT_VISIBLE message variant)
      if (output.messageOverride !== candidateOverride.current) {
        candidateOverride.current = output.messageOverride;
        setMessageOverride(output.messageOverride);
      }
      return;
    }

    // ── Promote candidate to stable ──────────────────────────────────────────
    stableStateRef.current = nextSt;
    setStableState(nextSt);
    setMessageOverride(output.messageOverride);

    if (nextSt === 'ALIGNED') {
      alignedSinceRef.current  = now;
      alignedStageRef.current  = 0;
      setAlignedStage(0);
    }
  }, []);

  // ── Frame polling ─────────────────────────────────────────────────────────────
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

      const now = Date.now();
      const rawLandmarks: Record<string, { x: number; y: number; z: number; visibility: number }> =
        data.landmarks ?? {};

      // ── Compute raw inter-frame velocity before filtering ──────────────────
      let rawVelocity = 0;
      const velLandmarks = ['nose', 'left_hip', 'right_hip'];
      for (const name of velLandmarks) {
        const cur  = rawLandmarks[name];
        const prev = prevFilteredRef.current[name];
        if (cur && prev && cur.visibility >= 0.5) {
          rawVelocity += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
        }
      }
      rawVelocity /= velLandmarks.length;

      // ── EMA velocity smoothing ─────────────────────────────────────────────
      smoothedVelRef.current = ema(rawVelocity, smoothedVelRef.current, EMA_ALPHA);
      setSmoothedVelocity(smoothedVelRef.current);

      // ── Apply 1 Euro filters + decay ──────────────────────────────────────
      const { filtered, nextBank, nextLK } = applyFilters(
        rawLandmarks,
        filterBankRef.current,
        lastKnownRef.current,
        smoothedVelRef.current,
        now,
      );
      filterBankRef.current = nextBank;
      lastKnownRef.current  = nextLK;

      // Store filtered positions as prev for next velocity computation
      for (const name of velLandmarks) {
        const f = filtered[name];
        if (f) prevFilteredRef.current[name] = { x: f.x, y: f.y };
      }

      // ── Coaching logic ─────────────────────────────────────────────────────
      const output = computeCoachingOutput(
        filtered,
        rawLandmarks,
        smoothedVelRef.current,
        !!data.detected,
      );

      applyCandidate(output);

      // Tick aligned stage progression on every frame while stable
      if (stableStateRef.current === 'ALIGNED') {
        updateAlignedStage();
      }
    } catch {
      // Network error — keep last state, no flicker
    } finally {
      isFetchingRef.current = false;
    }
  }, [getCameraFrame, applyCandidate, updateAlignedStage]);

  // ── Polling lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) { resetAll(); return; }

    const id = setInterval(pollFrame, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isActive, pollFrame, resetAll]);

  return {
    state: stableState,
    messageOverride,
    alignedStage,
    isReadyToRecord,
    smoothedVelocity,
  };
}

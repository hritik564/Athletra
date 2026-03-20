import { CoachingState, getHighestPriorityState } from './coachingScript';

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export type LandmarkMap = Record<string, Landmark>;

const VIS_THRESHOLD = 0.45;

function lm(landmarks: LandmarkMap, name: string): Landmark | null {
  const l = landmarks[name];
  if (!l || l.visibility < VIS_THRESHOLD) return null;
  return l;
}

function requireAll(landmarks: LandmarkMap, ...names: string[]): Landmark[] | null {
  const out: Landmark[] = [];
  for (const n of names) {
    const l = lm(landmarks, n);
    if (!l) return null;
    out.push(l);
  }
  return out;
}

export function computeCoachingStates(
  landmarks: LandmarkMap,
  prevLandmarks: LandmarkMap | null,
): CoachingState[] {
  const issues: CoachingState[] = [];

  // ── NOT_VISIBLE ──────────────────────────────────────────────────────────────
  const nose       = lm(landmarks, 'nose');
  const lShoulder  = lm(landmarks, 'left_shoulder');
  const rShoulder  = lm(landmarks, 'right_shoulder');
  const lAnkle     = lm(landmarks, 'left_ankle');
  const rAnkle     = lm(landmarks, 'right_ankle');
  const lHip       = lm(landmarks, 'left_hip');
  const rHip       = lm(landmarks, 'right_hip');

  const coreVisible = nose && lShoulder && rShoulder && lHip && rHip;
  if (!coreVisible) {
    return ['NOT_VISIBLE'];
  }

  // ── TOO_CLOSE / TOO_FAR ───────────────────────────────────────────────────────
  // Body height = vertical span from nose to ankle midpoint (in normalized frame)
  const ankleAvailLeft  = lm(landmarks, 'left_ankle');
  const ankleAvailRight = lm(landmarks, 'right_ankle');

  if (ankleAvailLeft && ankleAvailRight) {
    const ankleY = (ankleAvailLeft.y + ankleAvailRight.y) / 2;
    const bodyHeight = ankleY - nose!.y;

    if (bodyHeight > 0.82) {
      issues.push('TOO_CLOSE');
    } else if (bodyHeight < 0.38) {
      issues.push('TOO_FAR');
    }
  }

  // ── NOT_SIDEWAYS ─────────────────────────────────────────────────────────────
  // When sideways: both shoulders near same x → small separation
  // When facing camera: large separation
  const shoulderSep = Math.abs(lShoulder!.x - rShoulder!.x);
  // hip separation as a cross-check
  const hipSep = Math.abs(lHip!.x - rHip!.x);

  // If shoulder separation OR hip separation is large → facing camera, not sideways
  if (shoulderSep > 0.20 || hipSep > 0.22) {
    issues.push('NOT_SIDEWAYS');
  }

  // ── MISALIGNED_HEAD ───────────────────────────────────────────────────────────
  if (ankleAvailLeft && ankleAvailRight) {
    const ankleMidX = (ankleAvailLeft.x + ankleAvailRight.x) / 2;
    const headOffset = Math.abs(nose!.x - ankleMidX);
    if (headOffset > 0.18) {
      issues.push('MISALIGNED_HEAD');
    }
  }

  // ── UNSTABLE ─────────────────────────────────────────────────────────────────
  if (prevLandmarks) {
    const prevNose     = prevLandmarks['nose'];
    const prevLHip     = prevLandmarks['left_hip'];
    const prevRHip     = prevLandmarks['right_hip'];

    let velocity = 0;
    if (prevNose && nose) {
      velocity += Math.abs(nose.x - prevNose.x) + Math.abs(nose.y - prevNose.y);
    }
    if (prevLHip && lHip) {
      velocity += Math.abs(lHip.x - prevLHip.x) + Math.abs(lHip.y - prevLHip.y);
    }
    if (prevRHip && rHip) {
      velocity += Math.abs(rHip.x - prevRHip.x) + Math.abs(rHip.y - prevRHip.y);
    }

    // Threshold: 0.06 total motion across 3 landmarks per polling interval (~800ms)
    if (velocity > 0.06) {
      issues.push('UNSTABLE');
    }
  } else {
    // First frame — assume unstable until we have history
    issues.push('UNSTABLE');
  }

  if (issues.length === 0) {
    return ['ALIGNED'];
  }

  return issues;
}

export function selectCoachingState(states: CoachingState[]): CoachingState {
  return getHighestPriorityState(states);
}

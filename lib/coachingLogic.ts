import { CoachingState, getHighestPriorityState } from './coachingScript';
import { FilteredLandmark, FilteredLandmarkMap } from './coachingFilters';

// ── Visibility thresholds ──────────────────────────────────────────────────────
const BBOX_CONF_THRESHOLD = 0.50;  // below this → NOT_VISIBLE (low confidence)
const VIS_USE_THRESHOLD   = 0.35;  // below this on a specific lm → skip check

// ── Normalized thresholds (shoulder-width anchored where applicable) ───────────
// Distance: based on body height fraction of frame (0 = top, 1 = bottom)
const BODY_HEIGHT_MAX = 0.82;    // body > 82% of frame → TOO_CLOSE
const BODY_HEIGHT_MIN = 0.38;    // body < 38% of frame → TOO_FAR

// Sideways: shoulder x-separation (normalized to frame width)
// Sideways person: < 0.10, Facing camera: > 0.20
const SHOULDER_SEP_SIDEWAYS_MAX  = 0.12;  // above this → likely not sideways
const HIP_SEP_SIDEWAYS_MAX       = 0.14;  // cross-check

// Head alignment: |nose_x - ankle_mid_x| / body_height
// Normalizing by body_height makes this scale-invariant
const HEAD_ALIGN_THRESHOLD = 0.16;  // 16% of body height

// Velocity — threshold for UNSTABLE state
const UNSTABLE_VELOCITY_THRESHOLD = 0.008;  // EMA-smoothed velocity per axis per frame

export interface CoachingOutput {
  state:           CoachingState;
  messageOverride?: string;  // shown instead of default script message
}

function get(lms: FilteredLandmarkMap, name: string): FilteredLandmark | null {
  const l = lms[name];
  if (!l || l.visibility < VIS_USE_THRESHOLD) return null;
  return l;
}

// Compute average visibility of the core body landmarks → bbox_confidence
function bboxConfidence(lms: FilteredLandmarkMap, raw: Record<string, { visibility: number }>): number {
  const core = ['nose', 'left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'];
  let sum = 0; let count = 0;
  for (const name of core) {
    const v = raw[name]?.visibility ?? lms[name]?.visibility ?? 0;
    sum += v; count++;
  }
  return count > 0 ? sum / count : 0;
}

export function computeCoachingOutput(
  filteredLandmarks: FilteredLandmarkMap,
  rawLandmarks: Record<string, { x: number; y: number; z: number; visibility: number }>,
  smoothed_velocity: number,
  poseDetected: boolean,
): CoachingOutput {

  // ── NOT_VISIBLE (hard fail: no pose detected) ───────────────────────────────
  if (!poseDetected) {
    return { state: 'NOT_VISIBLE', messageOverride: 'Step into frame.' };
  }

  // ── NOT_VISIBLE (soft fail: low confidence) ──────────────────────────────────
  const conf = bboxConfidence(filteredLandmarks, rawLandmarks);
  if (conf < BBOX_CONF_THRESHOLD) {
    return { state: 'NOT_VISIBLE', messageOverride: "I can't see you clearly — step into view." };
  }

  // Core landmarks (may be interpolated, still usable)
  const nose      = get(filteredLandmarks, 'nose');
  const lShoulder = get(filteredLandmarks, 'left_shoulder');
  const rShoulder = get(filteredLandmarks, 'right_shoulder');
  const lHip      = get(filteredLandmarks, 'left_hip');
  const rHip      = get(filteredLandmarks, 'right_hip');
  const lAnkle    = get(filteredLandmarks, 'left_ankle');
  const rAnkle    = get(filteredLandmarks, 'right_ankle');

  if (!nose || !lShoulder || !rShoulder || !lHip || !rHip) {
    return { state: 'NOT_VISIBLE', messageOverride: "Step into frame." };
  }

  const issues: CoachingState[] = [];

  // ── Normalization anchor: shoulder width ──────────────────────────────────────
  const shoulder_width = Math.abs(lShoulder.x - rShoulder.x);
  // We use shoulder_width as scale reference for the head alignment check.
  // For distance and sideways, raw frame-relative values are more reliable.

  // ── TOO_CLOSE / TOO_FAR ───────────────────────────────────────────────────────
  if (lAnkle && rAnkle) {
    const ankleY     = (lAnkle.y + rAnkle.y) / 2;
    const bodyHeight = Math.max(ankleY - nose.y, 0.05); // avoid div-by-zero

    if (bodyHeight > BODY_HEIGHT_MAX) {
      issues.push('TOO_CLOSE');
    } else if (bodyHeight < BODY_HEIGHT_MIN) {
      issues.push('TOO_FAR');
    }
  }

  // ── NOT_SIDEWAYS ─────────────────────────────────────────────────────────────
  // When facing camera: large shoulder & hip x-separation
  // When sideways: both collapse toward same x (small separation)
  const hipSep = Math.abs(lHip.x - rHip.x);

  if (shoulder_width > SHOULDER_SEP_SIDEWAYS_MAX || hipSep > HIP_SEP_SIDEWAYS_MAX) {
    issues.push('NOT_SIDEWAYS');
  }

  // ── MISALIGNED_HEAD ───────────────────────────────────────────────────────────
  // Normalize head offset by body_height (scale-invariant)
  if (lAnkle && rAnkle) {
    const ankleY     = (lAnkle.y + rAnkle.y) / 2;
    const bodyHeight = Math.max(ankleY - nose.y, 0.05);
    const ankleMidX  = (lAnkle.x + rAnkle.x) / 2;
    const headOffset = Math.abs(nose.x - ankleMidX);

    if (headOffset / bodyHeight > HEAD_ALIGN_THRESHOLD) {
      issues.push('MISALIGNED_HEAD');
    }
  }

  // ── UNSTABLE ─────────────────────────────────────────────────────────────────
  // Use the EMA-smoothed velocity computed by the hook (fed in here)
  if (smoothed_velocity > UNSTABLE_VELOCITY_THRESHOLD) {
    issues.push('UNSTABLE');
  }

  if (issues.length === 0) {
    return { state: 'ALIGNED' };
  }

  return { state: getHighestPriorityState(issues) };
}

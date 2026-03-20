// ── 1 Euro Filter (per-axis, per-landmark) ─────────────────────────────────────
// beta is dynamic: beta = base_beta + k_vel * smoothed_velocity
// High velocity  → larger beta → higher cutoff → tracks fast movement faithfully
// Low velocity   → smaller beta → lower cutoff → suppresses noise during stance

export interface OneEuroState {
  x_prev: number | null;
  dx_prev: number;
  t_prev: number | null;
}

export function newOneEuroState(): OneEuroState {
  return { x_prev: null, dx_prev: 0, t_prev: null };
}

export interface OneEuroOptions {
  min_cutoff?: number;  // Hz — minimum low-pass cutoff (default 1.0)
  base_beta?:  number;  // speed coefficient base (default 0.007)
  k_vel?:      number;  // dynamic beta scaling factor (default 0.5)
  d_cutoff?:   number;  // derivative low-pass cutoff (default 1.0 Hz)
}

function computeAlpha(cutoff_hz: number, dt_s: number): number {
  const tau = 1.0 / (2 * Math.PI * cutoff_hz);
  return 1.0 / (1.0 + tau / Math.max(dt_s, 1e-6));
}

export function oneEuroFilter(
  state: OneEuroState,
  value: number,
  timestamp_ms: number,
  smoothed_velocity: number,
  opts: OneEuroOptions = {},
): { filtered: number; next: OneEuroState } {
  const {
    min_cutoff = 1.0,
    base_beta  = 0.007,
    k_vel      = 0.5,
    d_cutoff   = 1.0,
  } = opts;

  const next: OneEuroState = { ...state };

  if (next.t_prev === null || next.x_prev === null) {
    next.t_prev = timestamp_ms;
    next.x_prev = value;
    return { filtered: value, next };
  }

  const dt = Math.max((timestamp_ms - next.t_prev) / 1000, 0.001); // seconds
  next.t_prev = timestamp_ms;

  // Estimate derivative (raw), then apply fixed low-pass
  const dx_raw    = (value - next.x_prev) / dt;
  const alpha_d   = computeAlpha(d_cutoff, dt);
  const dx_hat    = alpha_d * dx_raw + (1 - alpha_d) * next.dx_prev;
  next.dx_prev    = dx_hat;

  // Dynamic beta: ramps up proportionally to motion
  const dynamic_beta  = base_beta + k_vel * smoothed_velocity;
  const cutoff        = min_cutoff + dynamic_beta * Math.abs(dx_hat);
  const alpha         = computeAlpha(cutoff, dt);

  const x_hat  = alpha * value + (1 - alpha) * next.x_prev;
  next.x_prev  = x_hat;

  return { filtered: x_hat, next };
}

export function resetOneEuroState(): OneEuroState {
  return newOneEuroState();
}

// ── Exponential Moving Average ─────────────────────────────────────────────────
// alpha=1 → instant update, alpha=0 → no update
// For velocity smoothing we use 0.35 — responsive but smoothed
export function ema(current: number, previous: number, alpha: number): number {
  return alpha * current + (1 - alpha) * previous;
}

// ── Adaptive Stability Window ──────────────────────────────────────────────────
// Moving body → longer window (needs more stability time)
// Still body  → shorter window (fast confirmation)
const WIN_MIN_MS = 300;
const WIN_MAX_MS = 600;
const VEL_SCALE  = 0.03; // velocity at which window is 50% of range

export function adaptiveWindowMs(smoothed_velocity: number): number {
  const t = Math.min(smoothed_velocity / VEL_SCALE, 1);
  return WIN_MIN_MS + t * (WIN_MAX_MS - WIN_MIN_MS);
}

// ── LandmarkFilterBank ──────────────────────────────────────────────────────────
// Manages 1-Euro states for every landmark × axis we care about
export type LandmarkFilterBank = Record<string, { x: OneEuroState; y: OneEuroState }>;

const TRACKED_LANDMARKS = [
  'nose', 'left_shoulder', 'right_shoulder',
  'left_hip', 'right_hip', 'left_ankle', 'right_ankle',
  'left_wrist', 'right_wrist',
];

export function newFilterBank(): LandmarkFilterBank {
  const bank: LandmarkFilterBank = {};
  for (const name of TRACKED_LANDMARKS) {
    bank[name] = { x: newOneEuroState(), y: newOneEuroState() };
  }
  return bank;
}

export interface RawLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface FilteredLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
  interpolated: boolean; // true = derived from decay, not fresh
}

export type FilteredLandmarkMap  = Record<string, FilteredLandmark>;
export type LastKnownMap         = Record<string, RawLandmark & { frames_since: number }>;

// Apply 1 Euro filter + missing-landmark decay to a raw landmark batch
export function applyFilters(
  rawLandmarks: Record<string, RawLandmark>,
  bank: LandmarkFilterBank,
  lastKnown: LastKnownMap,
  smoothed_velocity: number,
  timestamp_ms: number,
): { filtered: FilteredLandmarkMap; nextBank: LandmarkFilterBank; nextLastKnown: LastKnownMap } {
  const nextBank: LandmarkFilterBank  = { ...bank };
  const nextLK: LastKnownMap          = { ...lastKnown };
  const filtered: FilteredLandmarkMap = {};

  for (const name of TRACKED_LANDMARKS) {
    const raw = rawLandmarks[name];

    if (raw && raw.visibility >= 0.5) {
      // Fresh landmark — apply 1 Euro filter
      const bankEntry  = nextBank[name] ?? { x: newOneEuroState(), y: newOneEuroState() };
      const { filtered: fx, next: nx } = oneEuroFilter(bankEntry.x, raw.x, timestamp_ms, smoothed_velocity);
      const { filtered: fy, next: ny } = oneEuroFilter(bankEntry.y, raw.y, timestamp_ms, smoothed_velocity);

      nextBank[name] = { x: nx, y: ny };
      nextLK[name]   = { ...raw, frames_since: 0 };

      filtered[name] = { x: fx, y: fy, z: raw.z, visibility: raw.visibility, interpolated: false };
    } else {
      // Missing / occluded — use decayed last-known position
      const lk = nextLK[name];
      if (lk) {
        // 10% confidence decay per frame; position stays but trust degrades
        const frames = lk.frames_since + 1;
        const decayedVis = lk.visibility * Math.pow(0.90, frames);
        nextLK[name] = { ...lk, frames_since: frames };

        filtered[name] = {
          x: lk.x,
          y: lk.y,
          z: lk.z,
          visibility: decayedVis,
          interpolated: true,
        };
      }
      // If no last known, the landmark simply won't appear in the map
    }
  }

  return { filtered, nextBank, nextLK };
}

export type CoachingState =
  | 'NOT_VISIBLE'
  | 'TOO_CLOSE'
  | 'TOO_FAR'
  | 'NOT_SIDEWAYS'
  | 'MISALIGNED_HEAD'
  | 'UNSTABLE'
  | 'ALIGNED';

export const STATE_PRIORITY: Record<CoachingState, number> = {
  NOT_VISIBLE:     0,
  TOO_CLOSE:       1,
  TOO_FAR:         1,
  NOT_SIDEWAYS:    2,
  MISALIGNED_HEAD: 3,
  UNSTABLE:        4,
  ALIGNED:         5,
};

export interface CoachingScript {
  primary: string;
  almost?: string;
  icon: string;
}

export const COACHING_SCRIPTS: Record<CoachingState, CoachingScript> = {
  NOT_VISIBLE:     { primary: 'Step into frame…',                 almost: 'Almost there…',              icon: 'person-outline' },
  TOO_CLOSE:       { primary: 'Step back a bit.',                 almost: 'Little further back…',       icon: 'arrow-back-circle-outline' },
  TOO_FAR:         { primary: 'Step a little closer.',            almost: 'Almost the right distance.', icon: 'arrow-forward-circle-outline' },
  NOT_SIDEWAYS:    { primary: 'Turn sideways into your stance.',  almost: 'Almost sideways…',           icon: 'refresh-outline' },
  MISALIGNED_HEAD: { primary: 'Keep your head above your feet.',  almost: 'Nearly aligned…',            icon: 'body-outline' },
  UNSTABLE:        { primary: 'Hold still…',                      almost: 'Almost steady…',             icon: 'pause-circle-outline' },
  ALIGNED:         { primary: 'Perfect. Let\'s go.',                                                    icon: 'checkmark-circle' },
};

export const STATE_COLORS: Record<CoachingState, string> = {
  NOT_VISIBLE:     '#9E9E9E',
  TOO_CLOSE:       '#FF6B35',
  TOO_FAR:         '#FF6B35',
  NOT_SIDEWAYS:    '#FFC107',
  MISALIGNED_HEAD: '#FFC107',
  UNSTABLE:        '#FFC107',
  ALIGNED:         '#4CAF50',
};

export function getHighestPriorityState(states: CoachingState[]): CoachingState {
  if (states.length === 0) return 'NOT_VISIBLE';
  return states.reduce((a, b) =>
    STATE_PRIORITY[a] <= STATE_PRIORITY[b] ? a : b
  );
}

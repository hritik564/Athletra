import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoachingState, COACHING_SCRIPTS, STATE_COLORS } from '@/lib/coachingScript';
import { useCoachingState, AlignedStage } from '@/hooks/useCoachingState';

// ── Stage messages for ALIGNED progression ────────────────────────────────────
const ALIGNED_STAGE_MESSAGES: Record<AlignedStage, string> = {
  0: 'Hold still…',
  1: 'Almost there…',
  2: 'Perfect. Let\'s go.',
};

const FADE_DURATION = 300; // ms — all transitions
const FAST_FADE     = 150; // ms — fade out only

// ── Sub-components ────────────────────────────────────────────────────────────

function AlignedPulse({ color, stage }: { color: string; stage: AlignedStage }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const speed   = stage === 2 ? 400 : stage === 1 ? 600 : 800;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.10, duration: speed, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.65, duration: speed, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1,    duration: speed, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1,    duration: speed, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [scale, opacity, speed]);

  const iconName = stage === 2 ? 'checkmark-circle' : 'radio-button-on';

  return (
    <Animated.View style={{ transform: [{ scale }], opacity }}>
      <Ionicons name={iconName} size={32} color={color} />
    </Animated.View>
  );
}

// Progress ring that fills from 0→1 over the ALIGNED duration
function AlignedProgressRing({ stage }: { stage: AlignedStage }) {
  const fillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue:  stage === 0 ? 0.33 : stage === 1 ? 0.67 : 1,
      duration: FADE_DURATION,
      easing:   Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [stage, fillAnim]);

  const color = stage === 2 ? '#4CAF50' : '#1B7FE3';

  return (
    <Animated.View style={{
      width: fillAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
      height: 3,
      backgroundColor: color,
      borderRadius: 2,
    }} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface CoachingOverlayProps {
  isActive:        boolean;
  getCameraFrame:  () => Promise<string | null>;
  onReadyToRecord?: () => void;
}

export default function CoachingOverlay({
  isActive,
  getCameraFrame,
  onReadyToRecord,
}: CoachingOverlayProps) {
  const { state, messageOverride, alignedStage, isReadyToRecord } =
    useCoachingState(isActive, getCameraFrame);

  const didFireRef         = useRef(false);
  const messageOpacity     = useRef(new Animated.Value(1)).current;
  const containerOpacity   = useRef(new Animated.Value(0)).current;

  // Display key = what message we actually show
  const prevDisplayKeyRef  = useRef<string>('');
  const currentDisplayKey  = state === 'ALIGNED'
    ? `ALIGNED_${alignedStage}`
    : (messageOverride ?? state);

  // Mount fade-in
  useEffect(() => {
    if (!isActive) {
      Animated.timing(containerOpacity, { toValue: 0, duration: FAST_FADE, useNativeDriver: true }).start();
    } else {
      Animated.timing(containerOpacity, { toValue: 1, duration: FADE_DURATION, useNativeDriver: true }).start();
    }
  }, [isActive, containerOpacity]);

  // Message cross-fade on any display key change
  useEffect(() => {
    if (prevDisplayKeyRef.current === currentDisplayKey) return;
    prevDisplayKeyRef.current = currentDisplayKey;

    Animated.sequence([
      Animated.timing(messageOpacity, { toValue: 0, duration: FAST_FADE,   useNativeDriver: true }),
      Animated.timing(messageOpacity, { toValue: 1, duration: FADE_DURATION, useNativeDriver: true }),
    ]).start();
  }, [currentDisplayKey, messageOpacity]);

  // Fire onReadyToRecord exactly once when stage 2 is reached
  useEffect(() => {
    if (isReadyToRecord && !didFireRef.current) {
      didFireRef.current = true;
      // Slight delay so the "Perfect. Let's go." message renders first
      const tid = setTimeout(() => { onReadyToRecord?.(); }, 350);
      return () => clearTimeout(tid);
    }
    if (!isActive) { didFireRef.current = false; }
  }, [isReadyToRecord, isActive, onReadyToRecord]);

  if (!isActive) return null;

  const isAligned    = state === 'ALIGNED';
  const script       = COACHING_SCRIPTS[state];
  const color        = STATE_COLORS[state];

  const displayMsg   = isAligned
    ? ALIGNED_STAGE_MESSAGES[alignedStage]
    : (messageOverride ?? script.primary);

  const iconName     = isAligned ? undefined : script.icon;

  // Progress dots: Sideways ✓ · Head ✓ · Stable ✓ · Aligned ✓
  const STEP_STATES: CoachingState[] = ['NOT_SIDEWAYS', 'MISALIGNED_HEAD', 'UNSTABLE', 'ALIGNED'];
  const PRIORITY_ORDER: CoachingState[] = [
    'NOT_VISIBLE', 'TOO_CLOSE', 'TOO_FAR', 'NOT_SIDEWAYS', 'MISALIGNED_HEAD', 'UNSTABLE', 'ALIGNED',
  ];
  const currentRank = PRIORITY_ORDER.indexOf(state);

  function isDotDone(s: CoachingState) {
    const sRank = PRIORITY_ORDER.indexOf(s);
    return currentRank > sRank || (state === 'ALIGNED' && alignedStage === 2);
  }

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>

      {/* ── Main coaching card ─────────────────────────────────────────────── */}
      <View style={styles.messageBox}>
        <Animated.View style={[
          styles.messageInner,
          { opacity: messageOpacity, borderColor: color + '60', backgroundColor: 'rgba(8,14,28,0.80)' },
        ]}>

          <View style={styles.messageRow}>
            {isAligned ? (
              <AlignedPulse color={color} stage={alignedStage} />
            ) : (
              <Ionicons name={iconName as any} size={26} color={color} />
            )}
            <Text style={[styles.messageText, { color }]} numberOfLines={2}>
              {displayMsg}
            </Text>
          </View>

          {/* Aligned progress bar (only during ALIGNED state) */}
          {isAligned && (
            <View style={styles.progressTrack}>
              <AlignedProgressRing stage={alignedStage} />
            </View>
          )}

        </Animated.View>

        {/* ── Validation dots ─────────────────────────────────────────────── */}
        <View style={styles.dotsRow}>
          {STEP_STATES.map((s) => {
            const done    = isDotDone(s);
            const active  = state === s;
            const dotColor = done   ? STATE_COLORS['ALIGNED']
                           : active ? color
                           : 'rgba(255,255,255,0.22)';
            return (
              <Animated.View key={s} style={[styles.dot, { backgroundColor: dotColor }]} />
            );
          })}
        </View>
      </View>

      {/* ── Distance indicator (TOO_CLOSE / TOO_FAR only) ─────────────────── */}
      {(state === 'TOO_CLOSE' || state === 'TOO_FAR') && (
        <View style={styles.distanceBar}>
          <Text style={styles.distanceLabel}>{'← Back'}</Text>
          <View style={styles.distanceTrack}>
            <View style={[styles.distanceZone, { backgroundColor: '#FF6B3544', flex: 0.3 }]} />
            <View style={[styles.distanceZone, { backgroundColor: '#4CAF5044', flex: 0.4 }]} />
            <View style={[styles.distanceZone, { backgroundColor: '#FF6B3544', flex: 0.3 }]} />
            <View style={[styles.distanceMarker, {
              left:            state === 'TOO_CLOSE' ? '7%' : '88%',
              backgroundColor: color,
            }]} />
          </View>
          <Text style={styles.distanceLabel}>{'Closer →'}</Text>
        </View>
      )}

      {/* ── Sideways hint arrow ───────────────────────────────────────────── */}
      {state === 'NOT_SIDEWAYS' && (
        <View style={styles.hintRow}>
          <Ionicons name="arrow-undo" size={16} color="rgba(255,193,7,0.8)" />
          <Text style={styles.hintText}>Turn 90° to face sideways</Text>
          <Ionicons name="arrow-redo" size={16} color="rgba(255,193,7,0.8)" />
        </View>
      )}

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 82 : 104,
    zIndex: 100,
    pointerEvents: 'none' as any,
  },
  messageBox: {
    alignItems: 'center',
    width: '88%',
    maxWidth: 400,
  },
  messageInner: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 10,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  messageText: {
    fontSize: 19,
    fontFamily: 'Outfit_700Bold',
    flexShrink: 1,
    lineHeight: 25,
  },
  progressTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 11,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  distanceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    width: '84%',
  },
  distanceLabel: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    color: 'rgba(255,255,255,0.60)',
  },
  distanceTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'visible',
    position: 'relative',
  },
  distanceZone: {
    height: '100%',
  },
  distanceMarker: {
    position: 'absolute',
    top: -3,
    width: 13,
    height: 13,
    borderRadius: 7,
    transform: [{ translateX: -6 }],
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(255,193,7,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hintText: {
    fontSize: 12,
    fontFamily: 'Outfit_600SemiBold',
    color: 'rgba(255,193,7,0.85)',
  },
});

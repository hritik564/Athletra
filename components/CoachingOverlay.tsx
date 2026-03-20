import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoachingState, COACHING_SCRIPTS, STATE_COLORS } from '@/lib/coachingScript';
import { useCoachingState } from '@/hooks/useCoachingState';

interface CoachingOverlayProps {
  isActive: boolean;
  getCameraFrame: () => Promise<string | null>;
  onReadyToRecord?: () => void;
}

function AlignedPulse({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.08, duration: 600, easing: Easing.ease, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.7, duration: 600, easing: Easing.ease, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 600, easing: Easing.ease, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 600, easing: Easing.ease, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [scale, opacity]);

  return (
    <Animated.View style={{ transform: [{ scale }], opacity }}>
      <Ionicons name="checkmark-circle" size={36} color={color} />
    </Animated.View>
  );
}

function CountdownRing({ color, onDone }: { color: string; onDone: () => void }) {
  const [count, setCount] = useState(3);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (count <= 0) { onDone(); return; }
    const id = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [count, onDone]);

  return (
    <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
      <Text style={{ fontSize: 56, fontFamily: 'Outfit_700Bold', color, lineHeight: 60 }}>
        {count > 0 ? count : '🎯'}
      </Text>
      <Text style={{ fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: '#fff', marginTop: 4 }}>
        Get ready…
      </Text>
    </Animated.View>
  );
}

export default function CoachingOverlay({ isActive, getCameraFrame, onReadyToRecord }: CoachingOverlayProps) {
  const { state, isReadyToRecord, frameCount } = useCoachingState(isActive, getCameraFrame);
  const [showCountdown, setShowCountdown] = useState(false);

  const messageOpacity = useRef(new Animated.Value(1)).current;
  const prevStateRef   = useRef<CoachingState>('NOT_VISIBLE');

  const script  = COACHING_SCRIPTS[state];
  const color   = STATE_COLORS[state];
  const isReady = state === 'ALIGNED';

  // Fade transition when state changes
  useEffect(() => {
    if (prevStateRef.current === state) return;
    prevStateRef.current = state;

    Animated.sequence([
      Animated.timing(messageOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(messageOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [state, messageOpacity]);

  // Trigger countdown when ready to record
  useEffect(() => {
    if (isReadyToRecord && !showCountdown) {
      setShowCountdown(true);
    }
    if (!isReadyToRecord) {
      setShowCountdown(false);
    }
  }, [isReadyToRecord]);

  if (!isActive) return null;

  const barSegments: CoachingState[] = [
    'NOT_VISIBLE', 'TOO_FAR', 'NOT_SIDEWAYS', 'MISALIGNED_HEAD', 'UNSTABLE', 'ALIGNED',
  ];
  const badStates: CoachingState[] = ['NOT_VISIBLE', 'TOO_CLOSE', 'TOO_FAR', 'NOT_SIDEWAYS', 'MISALIGNED_HEAD', 'UNSTABLE'];
  const isAlignedState = state === 'ALIGNED';

  return (
    <View style={[styles.container, { pointerEvents: 'none' }]}>
      {/* Main coaching message */}
      <View style={styles.messageBox}>
        <Animated.View style={[styles.messageInner, { opacity: messageOpacity, borderColor: color + '55', backgroundColor: 'rgba(0,0,0,0.72)' }]}>
          {showCountdown ? (
            <CountdownRing color={color} onDone={() => { setShowCountdown(false); onReadyToRecord?.(); }} />
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {isAlignedState
                  ? <AlignedPulse color={color} />
                  : <Ionicons name={script.icon as any} size={28} color={color} />
                }
                <Text style={[styles.messageText, { color }]} numberOfLines={2}>
                  {script.primary}
                </Text>
              </View>
              {!isAlignedState && frameCount < 3 && (
                <Text style={styles.warmupText}>Calibrating…</Text>
              )}
            </>
          )}
        </Animated.View>

        {/* Alignment progress dots */}
        {!showCountdown && (
          <View style={styles.dotsRow}>
            {(['NOT_SIDEWAYS', 'MISALIGNED_HEAD', 'UNSTABLE', 'ALIGNED'] as CoachingState[]).map((s) => {
              const done = !badStates.includes(state) || badStates.indexOf(state) > badStates.indexOf(s as any);
              const isDone = isAlignedState || (
                s === 'NOT_SIDEWAYS'    ? !(['NOT_VISIBLE','TOO_CLOSE','TOO_FAR','NOT_SIDEWAYS'] as CoachingState[]).includes(state) :
                s === 'MISALIGNED_HEAD' ? !(['NOT_VISIBLE','TOO_CLOSE','TOO_FAR','NOT_SIDEWAYS','MISALIGNED_HEAD'] as CoachingState[]).includes(state) :
                s === 'UNSTABLE'        ? !(['NOT_VISIBLE','TOO_CLOSE','TOO_FAR','NOT_SIDEWAYS','MISALIGNED_HEAD','UNSTABLE'] as CoachingState[]).includes(state) :
                s === 'ALIGNED'         ? isAlignedState : false
              );
              return (
                <View key={s} style={[
                  styles.dot,
                  { backgroundColor: isDone ? STATE_COLORS['ALIGNED'] : (state === s ? color : 'rgba(255,255,255,0.25)') },
                ]} />
              );
            })}
          </View>
        )}
      </View>

      {/* Distance bar (only shown for distance issues) */}
      {(state === 'TOO_CLOSE' || state === 'TOO_FAR') && (
        <View style={styles.distanceBar}>
          <Text style={styles.distanceLabel}>{'⟵ Back'}</Text>
          <View style={styles.distanceTrack}>
            <View style={[styles.distanceZone, { backgroundColor: '#FF6B35' + '55', flex: 0.3 }]} />
            <View style={[styles.distanceZone, { backgroundColor: '#4CAF50' + '55', flex: 0.4 }]} />
            <View style={[styles.distanceZone, { backgroundColor: '#FF6B35' + '55', flex: 0.3 }]} />
            <View style={[styles.distanceArrow, {
              left: state === 'TOO_CLOSE' ? '5%' : '90%',
              backgroundColor: color,
            }]} />
          </View>
          <Text style={styles.distanceLabel}>{'Closer ⟶'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 80 : 100,
    zIndex: 100,
  },
  messageBox: {
    alignItems: 'center',
    width: '90%',
    maxWidth: 400,
  },
  messageInner: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
  },
  messageText: {
    fontSize: 20,
    fontFamily: 'Outfit_700Bold',
    textAlign: 'center',
    flexShrink: 1,
    lineHeight: 26,
  },
  warmupText: {
    fontSize: 12,
    fontFamily: 'Outfit_500Medium',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  distanceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    width: '85%',
  },
  distanceLabel: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    color: 'rgba(255,255,255,0.65)',
  },
  distanceTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  distanceZone: {
    height: '100%',
  },
  distanceArrow: {
    position: 'absolute',
    top: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    transform: [{ translateX: -6 }],
  },
});

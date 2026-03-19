import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Animated,
  Dimensions, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@/contexts/UserContext';
import { useColors } from '@/contexts/ThemeContext';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const TOTAL_STEPS = 4;
const PERSIST_KEY = 'onboarding_progress';

// ─── Sport Definitions ────────────────────────────────────────────────────────

const SPORTS_PRIMARY = [
  {
    key: 'cricket', label: 'Cricket', icon: 'baseball' as const,
    colors: ['#1B5E20', '#2E7D32'] as [string, string],
    tagline: 'Batting, bowling & field analysis',
    emoji: '🏏',
  },
  {
    key: 'badminton', label: 'Badminton', icon: 'tennisball' as const,
    colors: ['#F57F17', '#E65100'] as [string, string],
    tagline: 'Smash technique & footwork coaching',
    emoji: '🏸',
  },
  {
    key: 'skating', label: 'Skating', icon: 'navigate' as const,
    colors: ['#0D47A1', '#1565C0'] as [string, string],
    tagline: 'Edge control & jump power analysis',
    emoji: '⛸️',
  },
  {
    key: 'yoga', label: 'Yoga', icon: 'body' as const,
    colors: ['#6A1B9A', '#7B1FA2'] as [string, string],
    tagline: 'Pose alignment & flow tracking',
    emoji: '🧘',
  },
];


const PLAY_LEVELS = [
  { key: 'beginner', label: 'Beginner', sub: 'Learning the fundamentals', badge: '🌱' },
  { key: 'intermediate', label: 'Club Player', sub: 'Competing at amateur level', badge: '⚡' },
  { key: 'advanced', label: 'Semi-Pro', sub: 'Structured competitive play', badge: '🏆' },
  { key: 'pro', label: 'Professional', sub: 'Elite performance & coaching', badge: '🥇' },
];

const PRIMARY_GOALS = [
  { key: 'technique', label: 'Technique', icon: 'analytics' as const, desc: 'Perfect form and mechanics' },
  { key: 'power', label: 'Power', icon: 'flash' as const, desc: 'Maximize speed and strength' },
  { key: 'weight_loss', label: 'Weight Loss', icon: 'flame' as const, desc: 'Lean out while staying athletic' },
];

// ─── Pro-Mode Cricket Init ────────────────────────────────────────────────────

function calcBatSize(heightCm: number): number {
  if (heightCm < 137) return 1;
  if (heightCm < 149) return 2;
  if (heightCm < 155) return 3;
  if (heightCm < 163) return 4;
  if (heightCm < 170) return 5;
  return 6;
}

function buildSportData(sport: string, heightCm: number): Record<string, any> {
  if (sport === 'cricket') {
    return {
      cricket: {
        bat_size: { value: calcBatSize(heightCm), confidence: 0.7, source: 'height_calc' },
        bat_weight: { value: 1200, confidence: 0.6, source: 'default' },
        batting_guard: { value: 'middle', confidence: 0.6, source: 'default' },
      },
    };
  }
  return { [sport]: {} };
}

// ─── Unit Helpers ─────────────────────────────────────────────────────────────

function cmToFtIn(cm: number): { ft: string; inch: string } {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn % 12);
  return { ft: String(ft), inch: String(inch) };
}

function ftInToCm(ft: string, inch: string): number {
  return Math.round((parseInt(ft || '0') * 12 + parseInt(inch || '0')) * 2.54);
}

function kgToLbs(kg: number): string {
  return String(Math.round(kg * 2.20462));
}

function lbsToKg(lbs: string): number {
  return Math.round(parseFloat(lbs || '0') / 2.20462 * 10) / 10;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ step, Colors }: { step: number; Colors: any }) {
  const progress = step / TOTAL_STEPS;
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(widthAnim, {
      toValue: progress,
      tension: 60, friction: 10,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const barWidth = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
      <View style={{
        height: 4, backgroundColor: Colors.surfaceLight,
        borderRadius: 2, overflow: 'hidden',
      }}>
        <Animated.View style={{
          height: '100%', width: barWidth,
          backgroundColor: Colors.primary, borderRadius: 2,
        }} />
      </View>
      <Text style={{
        fontSize: 11, fontFamily: 'Outfit_500Medium',
        color: Colors.textMuted, marginTop: 4, textAlign: 'right',
      }}>
        {step < TOTAL_STEPS ? `Step ${step + 1} of ${TOTAL_STEPS}` : 'Complete'}
      </Text>
    </View>
  );
}

function UnitToggle({
  value, onChange, Colors,
}: { value: 'metric' | 'imperial'; onChange: (v: 'metric' | 'imperial') => void; Colors: any }) {
  return (
    <View style={{
      flexDirection: 'row', backgroundColor: Colors.surfaceLight,
      borderRadius: 20, padding: 3, alignSelf: 'center', marginBottom: 20,
    }}>
      {(['metric', 'imperial'] as const).map(u => (
        <Pressable
          key={u}
          onPress={() => onChange(u)}
          style={{
            paddingHorizontal: 20, paddingVertical: 6, borderRadius: 16,
            backgroundColor: value === u ? Colors.primary : 'transparent',
          }}
        >
          <Text style={{
            fontSize: 13, fontFamily: 'Outfit_600SemiBold',
            color: value === u ? '#fff' : Colors.textSecondary,
          }}>
            {u === 'metric' ? 'Metric' : 'Imperial'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Profile Strength Component ──────────────────────────────────────────────

function ProfileStrengthScreen({
  Colors, styles, heightCm, weightKg, sport, leadHand, onLaunch,
}: {
  Colors: any; styles: any;
  heightCm: number; weightKg: number;
  sport: string; leadHand: 'left' | 'right';
  onLaunch: () => void;
}) {
  const strengthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(strengthAnim, { toValue: 0.75, duration: 1200, useNativeDriver: false }).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const barWidth = strengthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const done = [
    `Height & weight calibrated (${heightCm} cm, ${weightKg} kg)`,
    `Primary sport: ${sport ? sport.charAt(0).toUpperCase() + sport.slice(1) : 'General'}`,
    `${leadHand === 'left' ? 'Left' : 'Right'}-hand stance locked in`,
  ];

  return (
    <ScrollView contentContainerStyle={[styles.stepContent, { paddingBottom: 40 }]} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.stepIcon}>
        <Ionicons name="shield-checkmark" size={32} color="#fff" />
      </LinearGradient>
      <Text style={styles.stepTitle}>Profile Strength</Text>
      <Text style={styles.stepSub}>Your biomechanical baseline is ready</Text>

      <View style={styles.strengthCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={styles.strengthLabel}>Calibration Score</Text>
          <Text style={styles.strengthPercent}>75%</Text>
        </View>
        <View style={styles.strengthTrack}>
          <Animated.View style={[styles.strengthFill, { width: barWidth }]} />
        </View>
        <Text style={styles.strengthNote}>Basic Calibration Active</Text>
      </View>

      <View style={styles.doneList}>
        {done.map((item, i) => (
          <View key={i} style={styles.doneItem}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.doneText}>{item}</Text>
          </View>
        ))}
        <View style={styles.doneItem}>
          <Ionicons name="lock-closed" size={20} color={Colors.textMuted} />
          <Text style={[styles.doneText, { color: Colors.textMuted }]}>Gear & equipment details (Pro)</Text>
        </View>
      </View>

      <View style={styles.upgradeCard}>
        <Ionicons name="sparkles" size={18} color={Colors.primary} />
        <Text style={styles.upgradeText}>
          To unlock 100% Biomechanical Accuracy, upgrade your gear details in Pro Settings.
        </Text>
      </View>

      <Pressable onPress={onLaunch} style={styles.launchBtn}>
        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.launchBtnGradient}>
          <Text style={styles.launchBtnText}>Launch Athletra</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </LinearGradient>
      </Pressable>
    </ScrollView>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const Colors = useColors();
  const styles = createStyles(Colors);
  const { profile, updateProfile, updateSportData, addUnlockedSport, isLoading } = useUser();
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(0)).current;
  const [step, setStep] = useState(0);

  // Step 0 – Vitals
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [name, setName] = useState('');
  const [age, setAge] = useState('25');
  const [heightCm, setHeightCm] = useState('170');
  const [heightFt, setHeightFt] = useState('5');
  const [heightIn, setHeightIn] = useState('7');
  const [weightKg, setWeightKg] = useState('70');
  const [weightLbs, setWeightLbs] = useState('154');

  // Step 1 – Sport
  const [sport, setSport] = useState('');

  // Step 2 – Stance
  const [leadHand, setLeadHand] = useState<'left' | 'right'>('right');

  // Step 3 – Experience & Goal
  const [skillLevel, setSkillLevel] = useState('intermediate');
  const [fitnessGoal, setFitnessGoal] = useState('technique');

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  // Redirect if already onboarded
  useEffect(() => {
    if (!isLoading && profile.onboarded) router.replace('/(tabs)');
  }, [isLoading, profile.onboarded]);

  // Restore progress
  useEffect(() => {
    AsyncStorage.getItem(PERSIST_KEY).then(raw => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (saved.step) setStep(saved.step);
        if (saved.name) setName(saved.name);
        if (saved.age) setAge(saved.age);
        if (saved.unitSystem) setUnitSystem(saved.unitSystem);
        if (saved.heightCm) setHeightCm(saved.heightCm);
        if (saved.heightFt) setHeightFt(saved.heightFt);
        if (saved.heightIn) setHeightIn(saved.heightIn);
        if (saved.weightKg) setWeightKg(saved.weightKg);
        if (saved.weightLbs) setWeightLbs(saved.weightLbs);
        if (saved.sport) setSport(saved.sport);
        if (saved.leadHand) setLeadHand(saved.leadHand);
        if (saved.skillLevel) setSkillLevel(saved.skillLevel);
        if (saved.fitnessGoal) setFitnessGoal(saved.fitnessGoal);
      } catch {}
    });
  }, []);

  const persist = useCallback(async (nextStep: number) => {
    await AsyncStorage.setItem(PERSIST_KEY, JSON.stringify({
      step: nextStep, name, age, unitSystem,
      heightCm, heightFt, heightIn, weightKg, weightLbs,
      sport, leadHand, skillLevel, fitnessGoal,
    }));
  }, [name, age, unitSystem, heightCm, heightFt, heightIn, weightKg, weightLbs,
    sport, leadHand, skillLevel, fitnessGoal]);

  const goTo = useCallback((next: number, dir: 'forward' | 'back' = 'forward') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    persist(next);
    const OUT = dir === 'forward' ? -width : width;
    Animated.timing(translateX, { toValue: OUT, duration: 240, useNativeDriver: true }).start(() => {
      setStep(next);
      translateX.setValue(-OUT);
      Animated.spring(translateX, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }).start();
    });
  }, [persist, translateX]);

  const toggleUnit = (u: 'metric' | 'imperial') => {
    if (u === unitSystem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (u === 'imperial') {
      const { ft, inch } = cmToFtIn(parseFloat(heightCm) || 170);
      setHeightFt(ft); setHeightIn(inch);
      setWeightLbs(kgToLbs(parseFloat(weightKg) || 70));
    } else {
      setHeightCm(String(ftInToCm(heightFt, heightIn)));
      setWeightKg(String(lbsToKg(weightLbs)));
    }
    setUnitSystem(u);
  };

  const getHeightCmValue = (): number =>
    unitSystem === 'metric' ? parseFloat(heightCm) || 170 : ftInToCm(heightFt, heightIn);

  const getWeightKgValue = (): number =>
    unitSystem === 'metric' ? parseFloat(weightKg) || 70 : lbsToKg(weightLbs);

  const handleComplete = async () => {
    const hCm = getHeightCmValue();
    const wKg = getWeightKgValue();
    const sportData = buildSportData(sport, hCm);

    await updateProfile({
      name: name.trim() || 'Athlete',
      age: parseInt(age) || 25,
      weight: unitSystem === 'metric' ? parseFloat(weightKg) || 70 : parseFloat(weightLbs) || 154,
      weightUnit: unitSystem === 'metric' ? 'kg' : 'lbs',
      height: unitSystem === 'metric' ? parseFloat(heightCm) || 170 : parseInt(heightFt) || 5,
      heightUnit: unitSystem === 'metric' ? 'cm' : 'ft',
      heightCm: hCm,
      weightKg: wKg,
      primarySport: sport as any,
      leadHand,
      skillLevel: skillLevel as any,
      fitnessGoal: fitnessGoal as any,
      preferredUnitSystem: unitSystem,
      sportSpecificData: sportData,
      unlockedSports: sport ? [sport] : [],
      isAthlete: !!sport,
      sport,
      goal: fitnessGoal === 'weight_loss' ? 'lose_weight' : 'stay_fit',
      fitnessLevel: skillLevel === 'pro' ? 'advanced' : skillLevel as any,
      onboarded: true,
    });

    await AsyncStorage.removeItem(PERSIST_KEY);
    router.replace('/(tabs)');
  };

  if (isLoading) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  if (profile.onboarded) return null;

  // ── Step Renderers ────────────────────────────────────────────────────────

  // ── Vitals validation helpers ────────────────────────────────────────────
  const handleNameChange = (v: string) => {
    const letters = v.replace(/[^a-zA-Z\s'-]/g, '');
    if (letters.length <= 30) setName(letters);
  };

  const handleAgeChange = (v: string) => {
    const digits = v.replace(/[^0-9]/g, '');
    if (digits === '') { setAge(''); return; }
    const n = parseInt(digits);
    if (n > 100) setAge('100');
    else setAge(digits);
  };

  const handleHeightCmChange = (v: string) => {
    const digits = v.replace(/[^0-9]/g, '');
    if (digits === '') { setHeightCm(''); return; }
    const n = parseInt(digits);
    if (n > 250) setHeightCm('250');
    else setHeightCm(digits);
  };

  const handleHeightFtChange = (v: string) => {
    const digits = v.replace(/[^0-9]/g, '');
    if (digits === '') { setHeightFt(''); return; }
    const n = parseInt(digits);
    if (n > 8) setHeightFt('8');
    else setHeightFt(digits);
  };

  const handleHeightInChange = (v: string) => {
    const digits = v.replace(/[^0-9]/g, '');
    if (digits === '') { setHeightIn(''); return; }
    const n = parseInt(digits);
    if (n > 11) setHeightIn('11');
    else setHeightIn(digits);
  };

  const handleWeightKgChange = (v: string) => {
    const clean = v.replace(/[^0-9.]/g, '');
    if (clean === '') { setWeightKg(''); return; }
    const n = parseFloat(clean);
    if (n > 180) setWeightKg('180');
    else setWeightKg(clean);
  };

  const handleWeightLbsChange = (v: string) => {
    const clean = v.replace(/[^0-9.]/g, '');
    if (clean === '') { setWeightLbs(''); return; }
    const n = parseFloat(clean);
    if (n > 397) setWeightLbs('397');
    else setWeightLbs(clean);
  };

  const vitalsValid = (): boolean => {
    if (name.trim().length === 0) return false;
    const a = parseInt(age);
    if (isNaN(a) || a < 5 || a > 100) return false;
    if (unitSystem === 'metric') {
      const h = parseInt(heightCm);
      const w = parseFloat(weightKg);
      if (isNaN(h) || h < 50 || h > 250) return false;
      if (isNaN(w) || w < 20 || w > 180) return false;
    } else {
      const ft = parseInt(heightFt);
      const inc = parseInt(heightIn);
      const lbs = parseFloat(weightLbs);
      if (isNaN(ft) || ft < 1 || ft > 8) return false;
      if (isNaN(inc) || inc < 0 || inc > 11) return false;
      if (isNaN(lbs) || lbs < 44 || lbs > 397) return false;
    }
    return true;
  };

  const renderVitals = () => (
    <ScrollView
      contentContainerStyle={styles.stepContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.stepIcon}>
        <Ionicons name="person" size={32} color="#fff" />
      </LinearGradient>
      <Text style={styles.stepTitle}>Your Athletic Profile</Text>
      <Text style={styles.stepSub}>The foundation of your personalized program</Text>

      <UnitToggle value={unitSystem} onChange={toggleUnit} Colors={Colors} />

      {/* Name */}
      <View style={styles.field}>
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>Full Name</Text>
          <Text style={styles.fieldCounter}>{name.length}/30</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Enter your name"
          placeholderTextColor={Colors.textMuted}
          value={name}
          onChangeText={handleNameChange}
          autoCapitalize="words"
          returnKeyType="next"
          maxLength={30}
        />
      </View>

      {/* Age */}
      <View style={styles.field}>
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>Age</Text>
          <Text style={styles.fieldHint}>5 – 100 years</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="25"
          placeholderTextColor={Colors.textMuted}
          value={age}
          onChangeText={handleAgeChange}
          keyboardType="number-pad"
          maxLength={3}
        />
      </View>

      {/* Height */}
      <View style={styles.field}>
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>Height</Text>
          <Text style={styles.fieldHint}>
            {unitSystem === 'metric' ? 'max 250 cm' : 'max 8 ft 2 in'}
          </Text>
        </View>
        {unitSystem === 'metric' ? (
          <View style={styles.inputWithUnit}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="170"
              placeholderTextColor={Colors.textMuted}
              value={heightCm}
              onChangeText={handleHeightCmChange}
              keyboardType="number-pad"
              maxLength={3}
            />
            <View style={styles.unitBadge}>
              <Text style={styles.unitBadgeText}>cm</Text>
            </View>
          </View>
        ) : (
          <View style={styles.ftInRow}>
            <View style={styles.ftInField}>
              <TextInput
                style={styles.input}
                placeholder="5"
                placeholderTextColor={Colors.textMuted}
                value={heightFt}
                onChangeText={handleHeightFtChange}
                keyboardType="number-pad"
                maxLength={1}
              />
              <Text style={styles.ftInLabel}>ft</Text>
            </View>
            <View style={styles.ftInField}>
              <TextInput
                style={styles.input}
                placeholder="7"
                placeholderTextColor={Colors.textMuted}
                value={heightIn}
                onChangeText={handleHeightInChange}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.ftInLabel}>in</Text>
            </View>
          </View>
        )}
      </View>

      {/* Weight */}
      <View style={styles.field}>
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>Weight</Text>
          <Text style={styles.fieldHint}>
            {unitSystem === 'metric' ? 'max 180 kg' : 'max 397 lbs'}
          </Text>
        </View>
        <View style={styles.inputWithUnit}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder={unitSystem === 'metric' ? '70' : '154'}
            placeholderTextColor={Colors.textMuted}
            value={unitSystem === 'metric' ? weightKg : weightLbs}
            onChangeText={unitSystem === 'metric' ? handleWeightKgChange : handleWeightLbsChange}
            keyboardType="decimal-pad"
            maxLength={6}
          />
          <View style={styles.unitBadge}>
            <Text style={styles.unitBadgeText}>{unitSystem === 'metric' ? 'kg' : 'lbs'}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderSportSelection = () => (
    <ScrollView
      contentContainerStyle={styles.stepContent}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.stepIcon}>
        <Ionicons name="trophy" size={32} color="#fff" />
      </LinearGradient>
      <Text style={styles.stepTitle}>Choose Your Sport</Text>
      <Text style={styles.stepSub}>AI analysis is calibrated for each sport's biomechanics</Text>

      <View style={styles.sportGrid}>
        {SPORTS_PRIMARY.map(s => {
          const active = sport === s.key;
          return (
            <Pressable
              key={s.key}
              onPress={() => { setSport(s.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
              style={[styles.sportCard, active && styles.sportCardActive]}
            >
              <LinearGradient
                colors={active ? s.colors : [Colors.surface, Colors.surface]}
                style={styles.sportCardGradient}
              >
                <Text style={styles.sportEmoji}>{s.emoji}</Text>
                <Text style={[styles.sportName, active && { color: '#fff' }]}>{s.label}</Text>
                <Text style={[styles.sportTagline, active && { color: 'rgba(255,255,255,0.75)' }]}>
                  {s.tagline}
                </Text>
                {active && (
                  <View style={styles.sportCheck}>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  </View>
                )}
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderStance = () => {
    const isCricket = sport === 'cricket';
    const leftLabel = isCricket ? 'Left-Handed\nBatsman' : 'Left\nDominant';
    const rightLabel = isCricket ? 'Right-Handed\nBatsman' : 'Right\nDominant';

    return (
      <View style={styles.stepContent}>
        <LinearGradient colors={['#1B7FE3', '#0D47A1']} style={styles.stepIcon}>
          <Ionicons name="hand-left" size={32} color="#fff" />
        </LinearGradient>
        <Text style={styles.stepTitle}>Stance Calibration</Text>
        <Text style={styles.stepSub}>
          {isCricket
            ? 'Your batting stance shapes every biomechanical model'
            : 'Your dominant side calibrates pose detection'}
        </Text>

        <View style={styles.stanceContainer}>
          <Pressable
            onPress={() => { setLeadHand('left'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
            style={[styles.stanceCard, leadHand === 'left' && styles.stanceCardActive]}
          >
            <LinearGradient
              colors={leadHand === 'left' ? [Colors.primary, Colors.primaryDark] : [Colors.surface, Colors.surface]}
              style={styles.stanceGradient}
            >
              <Text style={styles.stanceEmoji}>🤚</Text>
              <Text style={[styles.stanceLabel, leadHand === 'left' && { color: '#fff' }]}>
                {leftLabel}
              </Text>
              {leadHand === 'left' && (
                <View style={styles.stanceCheckmark}>
                  <Ionicons name="checkmark-circle" size={24} color="#fff" />
                </View>
              )}
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => { setLeadHand('right'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
            style={[styles.stanceCard, leadHand === 'right' && styles.stanceCardActive]}
          >
            <LinearGradient
              colors={leadHand === 'right' ? [Colors.primary, Colors.primaryDark] : [Colors.surface, Colors.surface]}
              style={styles.stanceGradient}
            >
              <Text style={styles.stanceEmoji}>✋</Text>
              <Text style={[styles.stanceLabel, leadHand === 'right' && { color: '#fff' }]}>
                {rightLabel}
              </Text>
              {leadHand === 'right' && (
                <View style={styles.stanceCheckmark}>
                  <Ionicons name="checkmark-circle" size={24} color="#fff" />
                </View>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        {sport === 'cricket' && (
          <View style={styles.proNote}>
            <Ionicons name="sparkles" size={14} color={Colors.primary} />
            <Text style={styles.proNoteText}>
              Pro Mode: Bat size auto-calculated from your height. Bat weight and guard initialized to tournament defaults.
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderExperience = () => (
    <ScrollView
      contentContainerStyle={styles.stepContent}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.stepIcon}>
        <Ionicons name="medal" size={32} color="#fff" />
      </LinearGradient>
      <Text style={styles.stepTitle}>Experience & Goal</Text>
      <Text style={styles.stepSub}>We calibrate training intensity and feedback depth to your level</Text>

      <Text style={styles.sectionLabel}>Play Level</Text>
      {PLAY_LEVELS.map(l => (
        <Pressable
          key={l.key}
          onPress={() => { setSkillLevel(l.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={[styles.levelCard, skillLevel === l.key && styles.levelCardActive]}
        >
          <Text style={styles.levelBadge}>{l.badge}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.levelName, skillLevel === l.key && { color: Colors.primary }]}>{l.label}</Text>
            <Text style={styles.levelSub}>{l.sub}</Text>
          </View>
          {skillLevel === l.key && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
        </Pressable>
      ))}

      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Primary Goal</Text>
      <View style={styles.goalRow}>
        {PRIMARY_GOALS.map(g => (
          <Pressable
            key={g.key}
            onPress={() => { setFitnessGoal(g.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={[styles.goalCard, fitnessGoal === g.key && styles.goalCardActive]}
          >
            <Ionicons
              name={g.icon}
              size={24}
              color={fitnessGoal === g.key ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.goalLabel, fitnessGoal === g.key && { color: Colors.primary }]}>{g.label}</Text>
            <Text style={styles.goalDesc}>{g.desc}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );

  const renderProfileStrength = () => (
    <ProfileStrengthScreen
      Colors={Colors}
      styles={styles}
      heightCm={Math.round(getHeightCmValue())}
      weightKg={Math.round(getWeightKgValue())}
      sport={sport}
      leadHand={leadHand}
      onLaunch={handleComplete}
    />
  );

  // ── Navigation ────────────────────────────────────────────────────────────

  const canGoNext = (): boolean => {
    switch (step) {
      case 0: return vitalsValid();
      case 1: return true;
      case 2: return true;
      case 3: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      goTo(step + 1, 'forward');
    } else {
      goTo(TOTAL_STEPS, 'forward');
    }
  };

  const renderCurrentStep = () => {
    switch (step) {
      case 0: return renderVitals();
      case 1: return renderSportSelection();
      case 2: return renderStance();
      case 3: return renderExperience();
      case 4: return renderProfileStrength();
      default: return null;
    }
  };

  const topPad = (insets.top || webTopInset) + 8;
  const bottomPad = insets.bottom || webBottomInset;
  const isLastDataStep = step === TOTAL_STEPS - 1;
  const isCompleteStep = step === TOTAL_STEPS;

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        {!isCompleteStep && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 4 }}>
              {step > 0 ? (
                <Pressable onPress={() => goTo(step - 1, 'back')} hitSlop={12}>
                  <Ionicons name="chevron-back" size={24} color={Colors.text} />
                </Pressable>
              ) : <View style={{ width: 24 }} />}
              <Text style={styles.headerBrand}>athletra</Text>
              <View style={{ width: 40 }} />
            </View>
            <ProgressBar step={step} Colors={Colors} />
          </>
        )}
      </View>

      {/* Animated step content */}
      <Animated.View style={{ flex: 1, transform: [{ translateX }] }}>
        {renderCurrentStep()}
      </Animated.View>

      {/* Footer nav */}
      {!isCompleteStep && (
        <View style={[styles.footer, { paddingBottom: bottomPad + 16 }]}>
          <Pressable
            onPress={handleNext}
            disabled={!canGoNext()}
            style={[styles.nextBtn, !canGoNext() && { opacity: 0.5 }]}
          >
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              style={styles.nextBtnGradient}
            >
              <Text style={styles.nextBtnText}>
                {isLastDataStep ? 'See Results' : 'Continue'}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(C: any) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: { zIndex: 10 },
    headerBrand: {
      fontSize: 18, fontFamily: 'Outfit_700Bold',
      color: C.primary, letterSpacing: 1,
    },
    skipText: {
      fontSize: 14, fontFamily: 'Outfit_500Medium', color: C.textMuted,
    },
    stepContent: {
      padding: 24, paddingTop: 16,
    },
    stepIcon: {
      width: 68, height: 68, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center',
      alignSelf: 'center', marginBottom: 20,
    },
    stepTitle: {
      fontSize: 26, fontFamily: 'Outfit_700Bold',
      color: C.text, textAlign: 'center', marginBottom: 6,
    },
    stepSub: {
      fontSize: 14, fontFamily: 'Outfit_400Regular',
      color: C.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 20,
    },
    field: { marginBottom: 16 },
    fieldLabelRow: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 6,
    },
    fieldLabel: {
      fontSize: 13, fontFamily: 'Outfit_600SemiBold',
      color: C.textSecondary,
    },
    fieldCounter: {
      fontSize: 11, fontFamily: 'Outfit_500Medium', color: C.textMuted,
    },
    fieldHint: {
      fontSize: 11, fontFamily: 'Outfit_500Medium', color: C.textMuted,
    },
    rowFields: { flexDirection: 'row', gap: 12 },
    input: {
      height: 50, borderRadius: 14, paddingHorizontal: 16,
      backgroundColor: C.surface, color: C.text,
      fontSize: 15, fontFamily: 'Outfit_500Medium',
      borderWidth: 1, borderColor: C.border,
    },
    inputWithUnit: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
    },
    unitBadge: {
      height: 50, paddingHorizontal: 16, borderRadius: 14,
      backgroundColor: C.surfaceLight, borderWidth: 1, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center',
    },
    unitBadgeText: {
      fontSize: 14, fontFamily: 'Outfit_700Bold', color: C.textSecondary,
    },
    ftInRow: {
      flexDirection: 'row', gap: 12,
    },
    ftInField: {
      flex: 1, gap: 6,
    },
    ftInLabel: {
      fontSize: 12, fontFamily: 'Outfit_600SemiBold',
      color: C.textMuted, textAlign: 'center', marginTop: 4,
    },
    sportGrid: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8,
    },
    sportCard: {
      width: (width - 60) / 2,
      borderRadius: 18, overflow: 'hidden',
      borderWidth: 2, borderColor: 'transparent',
    },
    sportCardActive: { borderColor: C.primary },
    sportCardGradient: {
      padding: 18, minHeight: 140,
      alignItems: 'flex-start', justifyContent: 'flex-end',
    },
    sportEmoji: { fontSize: 36, marginBottom: 8 },
    sportName: {
      fontSize: 16, fontFamily: 'Outfit_700Bold', color: C.text,
    },
    sportTagline: {
      fontSize: 11, fontFamily: 'Outfit_400Regular',
      color: C.textMuted, marginTop: 3, lineHeight: 15,
    },
    sportCheck: { position: 'absolute', top: 10, right: 10 },
    moreSportsToggle: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 4, paddingVertical: 10,
    },
    moreSportsText: {
      fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: C.primary,
    },
    moreSportsGrid: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4,
    },
    miniSportCard: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    miniSportCardActive: { borderColor: C.primary, backgroundColor: C.primary + '14' },
    miniSportLabel: {
      fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: C.textSecondary,
    },
    stanceContainer: { flexDirection: 'row', gap: 14, marginTop: 8 },
    stanceCard: {
      flex: 1, borderRadius: 20, overflow: 'hidden',
      borderWidth: 2, borderColor: 'transparent',
    },
    stanceCardActive: { borderColor: C.primary },
    stanceGradient: {
      padding: 24, alignItems: 'center', minHeight: 170,
      justifyContent: 'center',
    },
    stanceEmoji: { fontSize: 48, marginBottom: 14 },
    stanceLabel: {
      fontSize: 15, fontFamily: 'Outfit_700Bold',
      color: C.text, textAlign: 'center', lineHeight: 22,
    },
    stanceCheckmark: { position: 'absolute', top: 12, right: 12 },
    proNote: {
      flexDirection: 'row', gap: 8, alignItems: 'flex-start',
      marginTop: 20, padding: 14,
      backgroundColor: C.primary + '12', borderRadius: 14,
      borderLeftWidth: 3, borderLeftColor: C.primary,
    },
    proNoteText: {
      flex: 1, fontSize: 13, fontFamily: 'Outfit_500Medium',
      color: C.textSecondary, lineHeight: 19,
    },
    sectionLabel: {
      fontSize: 15, fontFamily: 'Outfit_700Bold',
      color: C.text, marginBottom: 12,
    },
    levelCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      padding: 14, borderRadius: 14, marginBottom: 8,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    levelCardActive: { borderColor: C.primary, backgroundColor: C.primary + '0A' },
    levelBadge: { fontSize: 24 },
    levelName: {
      fontSize: 15, fontFamily: 'Outfit_700Bold', color: C.text,
    },
    levelSub: {
      fontSize: 12, fontFamily: 'Outfit_400Regular', color: C.textMuted, marginTop: 2,
    },
    goalRow: { flexDirection: 'row', gap: 10 },
    goalCard: {
      flex: 1, padding: 14, borderRadius: 14, alignItems: 'center',
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, gap: 6,
    },
    goalCardActive: { borderColor: C.primary, backgroundColor: C.primary + '0A' },
    goalLabel: {
      fontSize: 13, fontFamily: 'Outfit_700Bold', color: C.text, textAlign: 'center',
    },
    goalDesc: {
      fontSize: 11, fontFamily: 'Outfit_400Regular',
      color: C.textMuted, textAlign: 'center', lineHeight: 15,
    },
    strengthCard: {
      padding: 20, borderRadius: 18, backgroundColor: C.surface,
      borderWidth: 1, borderColor: C.border, marginBottom: 20,
    },
    strengthLabel: {
      fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: C.textSecondary,
    },
    strengthPercent: {
      fontSize: 22, fontFamily: 'Outfit_700Bold', color: C.primary,
    },
    strengthTrack: {
      height: 10, backgroundColor: C.surfaceLight, borderRadius: 5,
      overflow: 'hidden', marginBottom: 10,
    },
    strengthFill: {
      height: '100%', backgroundColor: C.primary, borderRadius: 5,
    },
    strengthNote: {
      fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: C.success,
    },
    doneList: { gap: 10, marginBottom: 20 },
    doneItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    doneText: {
      fontSize: 14, fontFamily: 'Outfit_500Medium', color: C.text, flex: 1,
    },
    upgradeCard: {
      flexDirection: 'row', gap: 10, alignItems: 'flex-start',
      padding: 16, borderRadius: 16,
      backgroundColor: C.primary + '10', borderWidth: 1, borderColor: C.primary + '30',
      marginBottom: 24,
    },
    upgradeText: {
      flex: 1, fontSize: 13, fontFamily: 'Outfit_500Medium',
      color: C.textSecondary, lineHeight: 19,
    },
    launchBtn: { borderRadius: 16, overflow: 'hidden' },
    launchBtnGradient: {
      height: 56, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 10,
    },
    launchBtnText: {
      fontSize: 17, fontFamily: 'Outfit_700Bold', color: '#fff',
    },
    footer: {
      paddingHorizontal: 24, paddingTop: 12,
      backgroundColor: C.background,
      borderTopWidth: 1, borderTopColor: C.border,
    },
    nextBtn: { borderRadius: 16, overflow: 'hidden' },
    nextBtnGradient: {
      height: 54, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 10,
    },
    nextBtnText: {
      fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#fff',
    },
  });
}

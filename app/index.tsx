import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Animated,
  Dimensions, Platform, ScrollView,
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
const TOTAL_STEPS = 6;
const PERSIST_KEY = 'onboarding_progress_v2';

// ─── Chapters ──────────────────────────────────────────────────────────────────
const CHAPTERS = [
  { label: 'Athletics', steps: [0, 1, 2], color: '#1B7FE3' },
  { label: 'Health',    steps: [3, 4],    color: '#2E7D32' },
  { label: 'Goals',     steps: [5],       color: '#FF6B35' },
];

// ─── Sports ────────────────────────────────────────────────────────────────────
const SPORTS_PRIMARY = [
  { key: 'cricket',  label: 'Cricket',  colors: ['#1B5E20', '#2E7D32'] as [string,string], tagline: 'Batting, bowling & field analysis', emoji: '🏏' },
  { key: 'badminton',label: 'Badminton',colors: ['#F57F17', '#E65100'] as [string,string], tagline: 'Smash technique & footwork coaching', emoji: '🏸' },
  { key: 'skating',  label: 'Skating',  colors: ['#0D47A1', '#1565C0'] as [string,string], tagline: 'Edge control & jump power analysis', emoji: '⛸️' },
  { key: 'yoga',     label: 'Yoga',     colors: ['#6A1B9A', '#7B1FA2'] as [string,string], tagline: 'Pose alignment & flow tracking', emoji: '🧘' },
];

// ─── Athletics data ────────────────────────────────────────────────────────────
const CRICKET_ROLES = [
  { key: 'batter',      label: 'Batter',      emoji: '🏏', desc: 'Batting specialist' },
  { key: 'bowler',      label: 'Bowler',       emoji: '⚡', desc: 'Bowling specialist' },
  { key: 'all_rounder', label: 'All-Rounder',  emoji: '🌟', desc: 'Bat and ball' },
];

// ─── Health data ───────────────────────────────────────────────────────────────
const CONDITIONS = ['Diabetes', 'Hypertension', 'Asthma'];
const INJURY_AREAS = [
  { key: 'shoulder',   label: 'Shoulder' },
  { key: 'lower_back', label: 'Lower Back' },
  { key: 'knee',       label: 'Knee' },
  { key: 'wrist',      label: 'Wrist' },
];
const DIETARY_OPTIONS = [
  { key: 'non_vegetarian', label: 'Non-Veg',     emoji: '🍗' },
  { key: 'vegetarian',     label: 'Vegetarian',  emoji: '🥗' },
  { key: 'vegan',          label: 'Vegan',       emoji: '🌱' },
  { key: 'eggetarian',     label: 'Eggetarian',  emoji: '🥚' },
];
const ALLERGY_CHIPS = ['Nuts', 'Dairy', 'Gluten'];

// ─── Goals data ────────────────────────────────────────────────────────────────
const PLAY_LEVELS = [
  { key: 'beginner',     label: 'Beginner',    sub: 'Learning the fundamentals',     badge: '🌱' },
  { key: 'intermediate', label: 'Club Player', sub: 'Competing at amateur level',     badge: '⚡' },
  { key: 'advanced',     label: 'Semi-Pro',    sub: 'Structured competitive play',    badge: '🏆' },
  { key: 'pro',          label: 'Professional',sub: 'Elite performance & coaching',   badge: '🥇' },
];
const PRIMARY_GOALS = [
  { key: 'technique',  label: 'Technique',  icon: 'analytics' as const, desc: 'Perfect form & mechanics' },
  { key: 'power',      label: 'Power',      icon: 'flash' as const,     desc: 'Maximize speed & strength' },
  { key: 'weight_loss',label: 'Weight Loss',icon: 'flame' as const,     desc: 'Lean out, stay athletic' },
];

// ─── Yoga overrides ─────────────────────────────────────────────────────────────
const YOGA_LEVELS = [
  { key: 'beginner',     label: 'New to Yoga',           sub: 'Building foundational poses',           badge: '🌱' },
  { key: 'intermediate', label: 'Consistent Practitioner',sub: 'Regular practice, exploring depth',     badge: '🧘' },
  { key: 'advanced',     label: 'Advanced / Instructor',  sub: 'Teaching or advanced sequences',        badge: '🏆' },
];
const YOGA_GOALS = [
  { key: 'flexibility',     label: 'Flexibility',        icon: 'body' as const,     desc: 'Expand range & mobility' },
  { key: 'core_balance',    label: 'Core & Balance',     icon: 'fitness' as const,  desc: 'Strength from center' },
  { key: 'stress_reduction',label: 'Stress Reduction',   icon: 'leaf' as const,     desc: 'Calm & mindfulness' },
  { key: 'injury_recovery', label: 'Injury Recovery',    icon: 'heart' as const,    desc: 'Heal & restore' },
];

// ─── Spin types ─────────────────────────────────────────────────────────────────
const SPIN_TYPES = [
  { key: 'off_break',          label: 'Off-Break',           desc: 'Right-arm, turns away from right-hander' },
  { key: 'leg_break',          label: 'Leg-Break',           desc: 'Right-arm, turns into right-hander' },
  { key: 'left_arm_orthodox',  label: 'Left-Arm Orthodox',   desc: 'Left-arm, turns away from left-hander' },
  { key: 'left_arm_chinaman',  label: 'Left-Arm Chinaman',   desc: 'Left-arm, turns into right-hander' },
];

// ─── Note validation ────────────────────────────────────────────────────────────
function validateNote(s: string): boolean {
  if (!s || s.trim().length < 3) return false;
  return /[a-zA-Z]/.test(s.trim());
}

// ─── Cricket helpers ────────────────────────────────────────────────────────────
function calcBatSize(h: number) { if (h<137) return 1; if (h<149) return 2; if (h<155) return 3; if (h<163) return 4; if (h<170) return 5; return 6; }

function buildSportData(
  sport: string, heightCm: number,
  cricketRole: string, bowlingArm: 'left'|'right', bowlingStyle: string, spinType: string,
): Record<string,any> {
  if (sport === 'cricket') {
    const isBowler = ['bowler','all_rounder'].includes(cricketRole);
    const isBatter = ['batter','all_rounder'].includes(cricketRole);
    const isSpin   = bowlingStyle === 'spin';
    return {
      cricket: {
        player_role: cricketRole || 'batter',
        ...(isBatter ? { bat_size: { value: calcBatSize(heightCm), confidence: 0.7, source: 'height_calc' },
                         bat_weight: { value: 1200, confidence: 0.6, source: 'default' },
                         batting_guard: { value: 'middle', confidence: 0.6, source: 'default' } } : {}),
        ...(isBowler ? { bowling_arm: bowlingArm,
                         bowling_style: bowlingStyle || 'pace',
                         ...(isSpin && spinType ? { spin_type: spinType } : {}) } : {}),
      },
    };
  }
  return { [sport]: {} };
}

// ─── Unit helpers ───────────────────────────────────────────────────────────────
function cmToFtIn(cm: number) { const t = cm/2.54; return { ft: String(Math.floor(t/12)), inch: String(Math.round(t%12)) }; }
function ftInToCm(ft: string, inch: string) { return Math.round((parseInt(ft||'0')*12+parseInt(inch||'0'))*2.54); }
function kgToLbs(kg: number) { return String(Math.round(kg*2.20462)); }
function lbsToKg(lbs: string) { return Math.round(parseFloat(lbs||'0')/2.20462*10)/10; }

// ─── Chapter Progress Bar ──────────────────────────────────────────────────────
function ChapterProgressBar({ step, sport, Colors }: { step: number; sport: string; Colors: any }) {
  const skipStance = sport === 'yoga';

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
        {CHAPTERS.map(ch => {
          const effectiveSteps = skipStance && ch.label === 'Athletics' ? [0, 1] : ch.steps;
          const chMin = effectiveSteps[0];
          const chMax = effectiveSteps[effectiveSteps.length - 1];
          const done = step > chMax;
          const active = step >= chMin && step <= chMax;
          const pct = done ? 1 : active ? (step - chMin + 1) / effectiveSteps.length : 0;
          return (
            <View key={ch.label} style={{ flex: 1 }}>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: Colors.surfaceLight, overflow: 'hidden', marginBottom: 4 }}>
                <View style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: done || active ? ch.color : Colors.surfaceLight, borderRadius: 2 }} />
              </View>
              <Text style={{ fontSize: 10, fontFamily: 'Outfit_600SemiBold', color: active ? ch.color : done ? ch.color + '80' : Colors.textMuted }}>
                {ch.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Unit Toggle ───────────────────────────────────────────────────────────────
function UnitToggle({ value, onChange, Colors }: { value: 'metric'|'imperial'; onChange: (v:'metric'|'imperial')=>void; Colors: any }) {
  return (
    <View style={{ flexDirection:'row', backgroundColor: Colors.surfaceLight, borderRadius: 20, padding: 3, alignSelf: 'center', marginBottom: 20 }}>
      {(['metric','imperial'] as const).map(u => (
        <Pressable key={u} onPress={() => onChange(u)}
          style={{ paddingHorizontal: 20, paddingVertical: 6, borderRadius: 16, backgroundColor: value===u ? Colors.primary : 'transparent' }}>
          <Text style={{ fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: value===u ? '#fff' : Colors.textSecondary }}>
            {u === 'metric' ? 'Metric' : 'Imperial'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Profile Strength Screen ───────────────────────────────────────────────────
function ProfileStrengthScreen({ Colors, styles, heightCm, weightKg, sport, leadHand, score, extraItems, onLaunch }: {
  Colors: any; styles: any; heightCm: number; weightKg: number;
  sport: string; leadHand: 'left'|'right'; score: number; extraItems: string[]; onLaunch: () => void;
}) {
  const strengthAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(strengthAnim, { toValue: score / 100, duration: 1400, useNativeDriver: false }).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);
  const barWidth = strengthAnim.interpolate({ inputRange:[0,1], outputRange:['0%','100%'] });
  const tier = score >= 85 ? 'Elite Calibration Active' : score >= 70 ? 'Advanced Calibration Active' : 'Basic Calibration Active';
  const baseDone = [
    `Height & weight calibrated (${heightCm} cm, ${weightKg} kg)`,
    `Primary sport: ${sport ? sport.charAt(0).toUpperCase()+sport.slice(1) : 'General'}`,
    `${leadHand === 'left' ? 'Left' : 'Right'}-hand stance locked in`,
    'Health & safety baseline complete',
    'Nutritional profile saved',
    ...extraItems,
  ];
  return (
    <ScrollView contentContainerStyle={[styles.stepContent, { paddingBottom: 40 }]} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.stepIcon}>
        <Ionicons name="shield-checkmark" size={32} color="#fff" />
      </LinearGradient>
      <Text style={styles.stepTitle}>Profile Strength</Text>
      <Text style={styles.stepSub}>Your biomechanical & medical baseline is ready</Text>
      <View style={styles.strengthCard}>
        <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom: 8 }}>
          <Text style={styles.strengthLabel}>Calibration Score</Text>
          <Text style={styles.strengthPercent}>{score}%</Text>
        </View>
        <View style={styles.strengthTrack}>
          <Animated.View style={[styles.strengthFill, { width: barWidth }]} />
        </View>
        <Text style={styles.strengthNote}>{tier}</Text>
      </View>
      <View style={styles.doneList}>
        {baseDone.map((item, i) => (
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
        <Text style={styles.upgradeText}>To unlock 100% Biomechanical Accuracy, upgrade your gear details in Pro Settings.</Text>
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

// ─── Main Wizard ───────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const Colors = useColors();
  const styles = createStyles(Colors);
  const { profile, updateProfile, isLoading } = useUser();
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(0)).current;
  const [step, setStep] = useState(0);

  // Chapter 1 – Athletics
  const [unitSystem, setUnitSystem] = useState<'metric'|'imperial'>('metric');
  const [name, setName] = useState('');
  const [age, setAge] = useState('25');
  const [heightCm, setHeightCm] = useState('170');
  const [heightFt, setHeightFt] = useState('5');
  const [heightIn, setHeightIn] = useState('7');
  const [weightKg, setWeightKg] = useState('70');
  const [weightLbs, setWeightLbs] = useState('154');
  const [sport, setSport] = useState('');
  const [leadHand, setLeadHand] = useState<'left'|'right'>('right');
  // Cricket role sub-state
  const [cricketRole, setCricketRole] = useState('');
  const [bowlingArm, setBowlingArm] = useState<'left'|'right'>('right');
  const [bowlingStyle, setBowlingStyle] = useState('');
  const [spinType, setSpinType] = useState('');

  // Chapter 2 – Health
  const [conditions, setConditions] = useState<string[]>([]);
  const [injuries, setInjuries] = useState<string[]>([]);
  const [injuryStatus, setInjuryStatus] = useState<Record<string,'active'|'past'>>({});
  const [otherHealthNotes, setOtherHealthNotes] = useState('');
  const [otherInjuryNotes, setOtherInjuryNotes] = useState('');
  // Chapter 2 – Nutrition
  const [dietaryPref, setDietaryPref] = useState('');
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [customAllergy, setCustomAllergy] = useState('');

  // Chapter 3 – Goals
  const [skillLevel, setSkillLevel] = useState('intermediate');
  const [fitnessGoal, setFitnessGoal] = useState('technique');

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  useEffect(() => { if (!isLoading && profile.onboarded) router.replace('/(tabs)'); }, [isLoading, profile.onboarded]);

  // Restore persisted progress
  useEffect(() => {
    AsyncStorage.getItem(PERSIST_KEY).then(raw => {
      if (!raw) return;
      try {
        const s = JSON.parse(raw);
        if (s.step)             setStep(s.step);
        if (s.name)             setName(s.name);
        if (s.age)              setAge(s.age);
        if (s.unitSystem)       setUnitSystem(s.unitSystem);
        if (s.heightCm)         setHeightCm(s.heightCm);
        if (s.heightFt)         setHeightFt(s.heightFt);
        if (s.heightIn)         setHeightIn(s.heightIn);
        if (s.weightKg)         setWeightKg(s.weightKg);
        if (s.weightLbs)        setWeightLbs(s.weightLbs);
        if (s.sport)            setSport(s.sport);
        if (s.leadHand)         setLeadHand(s.leadHand);
        if (s.cricketRole)      setCricketRole(s.cricketRole);
        if (s.bowlingArm)       setBowlingArm(s.bowlingArm);
        if (s.bowlingStyle)     setBowlingStyle(s.bowlingStyle);
        if (s.spinType)         setSpinType(s.spinType);
        if (s.conditions)       setConditions(s.conditions);
        if (s.injuries)         setInjuries(s.injuries);
        if (s.injuryStatus)     setInjuryStatus(s.injuryStatus);
        if (s.otherHealthNotes) setOtherHealthNotes(s.otherHealthNotes);
        if (s.otherInjuryNotes) setOtherInjuryNotes(s.otherInjuryNotes);
        if (s.dietaryPref)      setDietaryPref(s.dietaryPref);
        if (s.selectedAllergies)setSelectedAllergies(s.selectedAllergies);
        if (s.customAllergy)    setCustomAllergy(s.customAllergy);
        if (s.skillLevel)       setSkillLevel(s.skillLevel);
        if (s.fitnessGoal)      setFitnessGoal(s.fitnessGoal);
      } catch {}
    });
  }, []);

  const persist = useCallback(async (nextStep: number) => {
    await AsyncStorage.setItem(PERSIST_KEY, JSON.stringify({
      step: nextStep, name, age, unitSystem, heightCm, heightFt, heightIn, weightKg, weightLbs,
      sport, leadHand, cricketRole, bowlingArm, bowlingStyle, spinType,
      conditions, injuries, injuryStatus, otherHealthNotes, otherInjuryNotes,
      dietaryPref, selectedAllergies, customAllergy,
      skillLevel, fitnessGoal,
    }));
  }, [name, age, unitSystem, heightCm, heightFt, heightIn, weightKg, weightLbs,
      sport, leadHand, cricketRole, bowlingArm, bowlingStyle, spinType,
      conditions, injuries, injuryStatus, otherHealthNotes, otherInjuryNotes,
      dietaryPref, selectedAllergies, customAllergy,
      skillLevel, fitnessGoal]);

  // ── Routing ──────────────────────────────────────────────────────────────────
  const shouldSkipStance = (s: string) => s === 'yoga';

  const nextStep = (cur: number, s: string): number => {
    if (cur === 1 && shouldSkipStance(s)) return 3;
    return cur < TOTAL_STEPS - 1 ? cur + 1 : TOTAL_STEPS;
  };
  const prevStep = (cur: number, s: string): number => {
    if (cur === 3 && shouldSkipStance(s)) return 1;
    return cur - 1;
  };

  const goTo = useCallback((next: number, dir: 'forward'|'back' = 'forward') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    persist(next);
    const OUT = dir === 'forward' ? -width : width;
    Animated.timing(translateX, { toValue: OUT, duration: 240, useNativeDriver: true }).start(() => {
      setStep(next);
      translateX.setValue(-OUT);
      Animated.spring(translateX, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }).start();
    });
  }, [persist, translateX]);

  // ── Unit helpers ─────────────────────────────────────────────────────────────
  const toggleUnit = (u: 'metric'|'imperial') => {
    if (u === unitSystem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (u === 'imperial') { const { ft, inch } = cmToFtIn(parseFloat(heightCm)||170); setHeightFt(ft); setHeightIn(inch); setWeightLbs(kgToLbs(parseFloat(weightKg)||70)); }
    else { setHeightCm(String(ftInToCm(heightFt, heightIn))); setWeightKg(String(lbsToKg(weightLbs))); }
    setUnitSystem(u);
  };
  const getHCm = (): number => unitSystem==='metric' ? parseFloat(heightCm)||170 : ftInToCm(heightFt,heightIn);
  const getWKg = (): number => unitSystem==='metric' ? parseFloat(weightKg)||70  : lbsToKg(weightLbs);

  // ── Vitals validation ─────────────────────────────────────────────────────────
  const handleNameChange = (v: string) => { const s = v.replace(/[^a-zA-Z\s'-]/g,''); if (s.length<=30) setName(s); };
  const handleAgeChange  = (v: string) => { const d = v.replace(/[^0-9]/g,''); if (d==='') { setAge(''); return; } const n=parseInt(d); setAge(n>100?'100':d); };
  const handleHCmChange  = (v: string) => { const d = v.replace(/[^0-9]/g,''); if (d==='') { setHeightCm(''); return; } setHeightCm(parseInt(d)>250?'250':d); };
  const handleHFtChange  = (v: string) => { const d = v.replace(/[^0-9]/g,''); if (d==='') { setHeightFt(''); return; } setHeightFt(parseInt(d)>8?'8':d); };
  const handleHInChange  = (v: string) => { const d = v.replace(/[^0-9]/g,''); if (d==='') { setHeightIn(''); return; } setHeightIn(parseInt(d)>11?'11':d); };
  const handleWKgChange  = (v: string) => { const d = v.replace(/[^0-9.]/g,''); if (d==='') { setWeightKg(''); return; } setWeightKg(parseFloat(d)>180?'180':d); };
  const handleWLbsChange = (v: string) => { const d = v.replace(/[^0-9.]/g,''); if (d==='') { setWeightLbs(''); return; } setWeightLbs(parseFloat(d)>397?'397':d); };

  const vitalsValid = (): boolean => {
    if (!name.trim()) return false;
    const a = parseInt(age); if (isNaN(a)||a<5||a>100) return false;
    if (unitSystem==='metric') {
      const h=parseInt(heightCm), w=parseFloat(weightKg);
      if (isNaN(h)||h<50||h>250) return false;
      if (isNaN(w)||w<20||w>180) return false;
    } else {
      const ft=parseInt(heightFt), inc=parseInt(heightIn), lbs=parseFloat(weightLbs);
      if (isNaN(ft)||ft<1||ft>8) return false;
      if (isNaN(inc)||inc<0||inc>11) return false;
      if (isNaN(lbs)||lbs<44||lbs>397) return false;
    }
    return true;
  };

  // ── Chip helpers ──────────────────────────────────────────────────────────────
  const toggleChip = <T extends string>(arr: T[], val: T, set: (a: T[]) => void, exclusive?: T) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (exclusive && val === exclusive) { set([exclusive] as T[]); return; }
    const next = arr.includes(val)
      ? arr.filter(x => x !== val)
      : [...arr.filter(x => x !== exclusive), val];
    set(next.length === 0 ? [] : next);
  };

  const toggleInjuryStatus = (area: string) => {
    setInjuryStatus(prev => ({ ...prev, [area]: prev[area]==='active' ? 'past' : 'active' }));
  };

  // ── handleComplete ────────────────────────────────────────────────────────────
  const handleComplete = async () => {
    const hCm = getHCm();
    const wKg = getWKg();
    const allAllergies = [
      ...selectedAllergies,
      ...(customAllergy.trim() ? [customAllergy.trim()] : []),
    ];
    await updateProfile({
      name: name.trim() || 'Athlete',
      age: parseInt(age) || 25,
      weight: unitSystem==='metric' ? parseFloat(weightKg)||70 : parseFloat(weightLbs)||154,
      weightUnit: unitSystem==='metric' ? 'kg' : 'lbs',
      height: unitSystem==='metric' ? parseFloat(heightCm)||170 : parseInt(heightFt)||5,
      heightUnit: unitSystem==='metric' ? 'cm' : 'ft',
      heightCm: hCm,
      weightKg: wKg,
      primarySport: sport as any,
      sport,
      leadHand,
      cricketRole: cricketRole as any,
      bowlingArm,
      bowlingStyle: bowlingStyle as any,
      skillLevel: skillLevel as any,
      fitnessGoal: fitnessGoal as any,
      preferredUnitSystem: unitSystem,
      sportSpecificData: buildSportData(sport, hCm, cricketRole, bowlingArm, bowlingStyle as any, spinType),
      spinType,
      otherHealthNotes: validateNote(otherHealthNotes) ? otherHealthNotes.trim() : '',
      otherInjuryNotes: validateNote(otherInjuryNotes) ? otherInjuryNotes.trim() : '',
      unlockedSports: sport ? [sport] : [],
      isAthlete: !!sport,
      goal: fitnessGoal==='weight_loss' ? 'lose_weight' : 'stay_fit',
      fitnessLevel: skillLevel==='pro' ? 'advanced' : skillLevel as any,
      healthFlags: conditions,
      injuryHistory: injuryStatus,
      dietaryPrefs: dietaryPref,
      foodAllergies: allAllergies,
      onboarded: true,
    });
    await AsyncStorage.removeItem(PERSIST_KEY);
    router.replace('/(tabs)');
  };

  if (isLoading) return <View style={{ flex:1, backgroundColor: Colors.background }} />;
  if (profile.onboarded) return null;

  // ── Step Renderers ────────────────────────────────────────────────────────────

  const renderVitals = () => (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.stepIcon}>
        <Ionicons name="person" size={32} color="#fff" />
      </LinearGradient>
      <Text style={styles.stepTitle}>Your Athletic Profile</Text>
      <Text style={styles.stepSub}>The foundation of your personalized program</Text>
      <UnitToggle value={unitSystem} onChange={toggleUnit} Colors={Colors} />

      <View style={styles.field}>
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>Full Name</Text>
          <Text style={styles.fieldHint}>{name.length}/30</Text>
        </View>
        <TextInput style={styles.input} placeholder="Enter your name" placeholderTextColor={Colors.textMuted}
          value={name} onChangeText={handleNameChange} autoCapitalize="words" maxLength={30} />
      </View>

      <View style={styles.field}>
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>Age</Text>
          <Text style={styles.fieldHint}>5 – 100 years</Text>
        </View>
        <TextInput style={styles.input} placeholder="25" placeholderTextColor={Colors.textMuted}
          value={age} onChangeText={handleAgeChange} keyboardType="number-pad" maxLength={3} />
      </View>

      <View style={styles.field}>
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>Height</Text>
          <Text style={styles.fieldHint}>{unitSystem==='metric' ? 'max 250 cm' : 'max 8 ft 11 in'}</Text>
        </View>
        {unitSystem==='metric' ? (
          <View style={styles.inputWithUnit}>
            <TextInput style={[styles.input,{flex:1}]} placeholder="170" placeholderTextColor={Colors.textMuted}
              value={heightCm} onChangeText={handleHCmChange} keyboardType="number-pad" maxLength={3} />
            <View style={styles.unitBadge}><Text style={styles.unitBadgeText}>cm</Text></View>
          </View>
        ) : (
          <View style={styles.ftInRow}>
            <View style={styles.ftInField}>
              <TextInput style={styles.input} placeholder="5" placeholderTextColor={Colors.textMuted}
                value={heightFt} onChangeText={handleHFtChange} keyboardType="number-pad" maxLength={1} />
              <Text style={styles.ftInLabel}>ft</Text>
            </View>
            <View style={styles.ftInField}>
              <TextInput style={styles.input} placeholder="7" placeholderTextColor={Colors.textMuted}
                value={heightIn} onChangeText={handleHInChange} keyboardType="number-pad" maxLength={2} />
              <Text style={styles.ftInLabel}>in</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.field}>
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>Weight</Text>
          <Text style={styles.fieldHint}>{unitSystem==='metric' ? 'max 180 kg' : 'max 397 lbs'}</Text>
        </View>
        <View style={styles.inputWithUnit}>
          <TextInput style={[styles.input,{flex:1}]} placeholder={unitSystem==='metric'?'70':'154'} placeholderTextColor={Colors.textMuted}
            value={unitSystem==='metric'?weightKg:weightLbs} onChangeText={unitSystem==='metric'?handleWKgChange:handleWLbsChange}
            keyboardType="decimal-pad" maxLength={6} />
          <View style={styles.unitBadge}><Text style={styles.unitBadgeText}>{unitSystem==='metric'?'kg':'lbs'}</Text></View>
        </View>
      </View>
    </ScrollView>
  );

  const renderSportSelection = () => (
    <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.stepIcon}>
        <Ionicons name="trophy" size={32} color="#fff" />
      </LinearGradient>
      <Text style={styles.stepTitle}>Choose Your Sport</Text>
      <Text style={styles.stepSub}>AI analysis is calibrated for each sport's biomechanics</Text>
      <View style={styles.sportGrid}>
        {SPORTS_PRIMARY.map(s => {
          const active = sport===s.key;
          return (
            <Pressable key={s.key} onPress={() => {
              setSport(s.key);
              if (s.key==='yoga') setLeadHand('right');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }} style={[styles.sportCard, active && styles.sportCardActive]}>
              <LinearGradient colors={active ? s.colors : [Colors.surface,Colors.surface]} style={styles.sportCardGradient}>
                <Text style={styles.sportEmoji}>{s.emoji}</Text>
                <Text style={[styles.sportName, active && { color:'#fff' }]}>{s.label}</Text>
                <Text style={[styles.sportTagline, active && { color:'rgba(255,255,255,0.75)' }]}>{s.tagline}</Text>
                {active && <View style={styles.sportCheck}><Ionicons name="checkmark-circle" size={20} color="#fff" /></View>}
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );

  // ── Stance/Role screen (step 2) ──────────────────────────────────────────────
  const renderStance = () => {
    if (sport === 'cricket') return renderCricketRole();
    const isSkating = sport === 'skating';
    type Opt = { value: 'left'|'right'; emoji: string; label: string };
    const options: Opt[] = isSkating
      ? [{ value:'right', emoji:'🛼', label:'Goofy\n(Right Foot Forward)' }, { value:'left', emoji:'🛼', label:'Regular\n(Left Foot Forward)' }]
      : [{ value:'left', emoji:'🤚', label:'Left-Hand\nPlayer' }, { value:'right', emoji:'✋', label:'Right-Hand\nPlayer' }];

    return (
      <View style={styles.stepContent}>
        <LinearGradient colors={['#1B7FE3','#0D47A1']} style={styles.stepIcon}>
          <Ionicons name={isSkating ? 'footsteps' : 'hand-left'} size={32} color="#fff" />
        </LinearGradient>
        <Text style={styles.stepTitle}>{isSkating ? 'Lead Foot' : 'Stance Calibration'}</Text>
        <Text style={styles.stepSub}>{isSkating ? 'Your lead foot determines how biomechanical models are mirrored' : 'Your dominant hand calibrates swing and smash analysis'}</Text>
        <View style={styles.stanceContainer}>
          {options.map(opt => (
            <Pressable key={opt.value} onPress={() => { setLeadHand(opt.value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
              style={[styles.stanceCard, leadHand===opt.value && styles.stanceCardActive]}>
              <LinearGradient colors={leadHand===opt.value ? [Colors.primary,Colors.primaryDark] : [Colors.surface,Colors.surface]} style={styles.stanceGradient}>
                <Text style={styles.stanceEmoji}>{opt.emoji}</Text>
                <Text style={[styles.stanceLabel, leadHand===opt.value && { color:'#fff' }]}>{opt.label}</Text>
                {leadHand===opt.value && <View style={styles.stanceCheckmark}><Ionicons name="checkmark-circle" size={24} color="#fff" /></View>}
              </LinearGradient>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  const renderCricketRole = () => {
    const showBatHand  = ['batter','all_rounder'].includes(cricketRole);
    const showBowling  = ['bowler','all_rounder'].includes(cricketRole);
    return (
      <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#1B5E20','#2E7D32']} style={styles.stepIcon}>
          <Ionicons name="baseball" size={32} color="#fff" />
        </LinearGradient>
        <Text style={styles.stepTitle}>Cricket Role</Text>
        <Text style={styles.stepSub}>Calibrates your biomechanical model for specific movements</Text>

        <Text style={styles.sectionLabel}>What is your role?</Text>
        {CRICKET_ROLES.map(r => (
          <Pressable key={r.key} onPress={() => { setCricketRole(r.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={[styles.levelCard, cricketRole===r.key && styles.levelCardActive]}>
            <Text style={styles.levelBadge}>{r.emoji}</Text>
            <View style={{ flex:1 }}>
              <Text style={[styles.levelName, cricketRole===r.key && { color: Colors.primary }]}>{r.label}</Text>
              <Text style={styles.levelSub}>{r.desc}</Text>
            </View>
            {cricketRole===r.key && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
          </Pressable>
        ))}

        {showBatHand && (
          <>
            <Text style={[styles.sectionLabel,{marginTop:20}]}>Batting Hand</Text>
            <View style={styles.stanceContainer}>
              {([{ value:'left' as const, emoji:'🤚', label:'Left-Handed\nBatsman' },
                 { value:'right' as const, emoji:'✋', label:'Right-Handed\nBatsman' }]).map(opt => (
                <Pressable key={opt.value} onPress={() => { setLeadHand(opt.value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                  style={[styles.stanceCard, leadHand===opt.value && styles.stanceCardActive]}>
                  <LinearGradient colors={leadHand===opt.value ? [Colors.primary,Colors.primaryDark] : [Colors.surface,Colors.surface]} style={styles.stanceGradient}>
                    <Text style={styles.stanceEmoji}>{opt.emoji}</Text>
                    <Text style={[styles.stanceLabel, leadHand===opt.value && { color:'#fff' }]}>{opt.label}</Text>
                    {leadHand===opt.value && <View style={styles.stanceCheckmark}><Ionicons name="checkmark-circle" size={24} color="#fff" /></View>}
                  </LinearGradient>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {showBowling && (
          <>
            <Text style={[styles.sectionLabel,{marginTop:20}]}>Bowling Arm</Text>
            <View style={styles.stanceContainer}>
              {([{ value:'left' as const, emoji:'🤚', label:'Left-Arm\nBowler' },
                 { value:'right' as const, emoji:'✋', label:'Right-Arm\nBowler' }]).map(opt => (
                <Pressable key={opt.value} onPress={() => { setBowlingArm(opt.value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                  style={[styles.stanceCard, bowlingArm===opt.value && styles.stanceCardActive]}>
                  <LinearGradient colors={bowlingArm===opt.value ? [Colors.primary,Colors.primaryDark] : [Colors.surface,Colors.surface]} style={styles.stanceGradient}>
                    <Text style={styles.stanceEmoji}>{opt.emoji}</Text>
                    <Text style={[styles.stanceLabel, bowlingArm===opt.value && { color:'#fff' }]}>{opt.label}</Text>
                    {bowlingArm===opt.value && <View style={styles.stanceCheckmark}><Ionicons name="checkmark-circle" size={24} color="#fff" /></View>}
                  </LinearGradient>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.sectionLabel,{marginTop:20}]}>Bowling Style</Text>
            <View style={styles.goalRow}>
              {[{ key:'pace', label:'Pace', icon:'flash' as const, desc:'Speed & swing' },
                { key:'spin', label:'Spin', icon:'sync' as const, desc:'Turn & flight' }].map(bs => (
                <Pressable key={bs.key} onPress={() => { setBowlingStyle(bs.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={[styles.goalCard, bowlingStyle===bs.key && styles.goalCardActive]}>
                  <Ionicons name={bs.icon} size={24} color={bowlingStyle===bs.key ? Colors.primary : Colors.textMuted} />
                  <Text style={[styles.goalLabel, bowlingStyle===bs.key && { color: Colors.primary }]}>{bs.label}</Text>
                  <Text style={styles.goalDesc}>{bs.desc}</Text>
                </Pressable>
              ))}
            </View>

            {bowlingStyle === 'spin' && (
              <>
                <Text style={[styles.sectionLabel,{marginTop:20}]}>Spin Type</Text>
                <Text style={styles.sectionHint}>Used to calibrate wrist angle and release-point models</Text>
                {SPIN_TYPES.map(st => (
                  <Pressable key={st.key} onPress={() => { setSpinType(st.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    style={[styles.levelCard, spinType===st.key && styles.levelCardActive]}>
                    <Text style={styles.levelBadge}>🌀</Text>
                    <View style={{ flex:1 }}>
                      <Text style={[styles.levelName, spinType===st.key && { color: Colors.primary }]}>{st.label}</Text>
                      <Text style={styles.levelSub}>{st.desc}</Text>
                    </View>
                    {spinType===st.key && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                  </Pressable>
                ))}
              </>
            )}

            <View style={styles.proNote}>
              <Ionicons name="sparkles" size={14} color={Colors.primary} />
              <Text style={styles.proNoteText}>Pro Mode: Bat size auto-calculated. Bowling biomechanics model activated.</Text>
            </View>
          </>
        )}
      </ScrollView>
    );
  };

  // ── Health & Safety (step 3) ──────────────────────────────────────────────────
  const renderHealthSafety = () => (
    <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#2E7D32','#1B5E20']} style={styles.stepIcon}>
        <Ionicons name="medkit" size={32} color="#fff" />
      </LinearGradient>
      <Text style={styles.stepTitle}>Health & Safety</Text>
      <Text style={styles.stepSub}>Helps the AI avoid contraindicated exercises and adapt intensity safely</Text>

      <Text style={styles.sectionLabel}>Medical Conditions</Text>
      <Text style={styles.sectionHint}>Select all that apply</Text>
      <View style={styles.chipWrap}>
        {CONDITIONS.map(c => {
          const active = conditions.includes(c);
          return (
            <Pressable key={c} onPress={() => toggleChip(conditions, c, setConditions)}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={() => setConditions([])} style={[styles.chip, conditions.length===0 && styles.chipNone]}>
          <Text style={[styles.chipText, conditions.length===0 && styles.chipTextActive]}>None</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel,{marginTop:20}]}>Active Injuries</Text>
      <Text style={styles.sectionHint}>Select all that apply — specify if active or past</Text>
      <View style={styles.chipWrap}>
        {INJURY_AREAS.map(ia => {
          const active = injuries.includes(ia.key);
          return (
            <Pressable key={ia.key} onPress={() => {
              toggleChip(injuries, ia.key, setInjuries);
              if (!injuries.includes(ia.key)) setInjuryStatus(prev => ({ ...prev, [ia.key]: 'active' }));
            }} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{ia.label}</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={() => { setInjuries([]); setInjuryStatus({}); }}
          style={[styles.chip, injuries.length===0 && styles.chipNone]}>
          <Text style={[styles.chipText, injuries.length===0 && styles.chipTextActive]}>None</Text>
        </Pressable>
      </View>

      {injuries.length > 0 && (
        <View style={styles.injuryStatusList}>
          {INJURY_AREAS.filter(ia => injuries.includes(ia.key)).map(ia => (
            <View key={ia.key} style={styles.injuryStatusRow}>
              <Text style={styles.injuryArea}>{ia.label}</Text>
              <Pressable onPress={() => toggleInjuryStatus(ia.key)}
                style={[styles.statusPill, injuryStatus[ia.key]==='past' && styles.statusPillPast]}>
                <View style={[styles.statusDot, injuryStatus[ia.key]==='past' && styles.statusDotPast]} />
                <Text style={[styles.statusText, injuryStatus[ia.key]==='past' && styles.statusTextPast]}>
                  {injuryStatus[ia.key]==='past' ? 'Past' : 'Active'}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.field,{marginTop:20}]}>
        <Text style={styles.fieldLabel}>Other medical conditions</Text>
        <Text style={styles.sectionHint}>Min. 3 characters and must contain letters</Text>
        <TextInput style={[styles.input,{marginTop:6,height:72,textAlignVertical:'top',paddingTop:12}]}
          placeholder="e.g. Mild scoliosis, exercise-induced asthma…"
          placeholderTextColor={Colors.textMuted} multiline
          value={otherHealthNotes} onChangeText={setOtherHealthNotes} />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Other injury notes</Text>
        <Text style={styles.sectionHint}>Min. 3 characters and must contain letters</Text>
        <TextInput style={[styles.input,{marginTop:6,height:72,textAlignVertical:'top',paddingTop:12}]}
          placeholder="e.g. Old ACL tear — fully recovered, tennis elbow…"
          placeholderTextColor={Colors.textMuted} multiline
          value={otherInjuryNotes} onChangeText={setOtherInjuryNotes} />
      </View>
    </ScrollView>
  );

  // ── Nutritional Baseline (step 4) ─────────────────────────────────────────────
  const renderNutrition = () => (
    <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#2E7D32','#388E3C']} style={styles.stepIcon}>
        <Ionicons name="nutrition" size={32} color="#fff" />
      </LinearGradient>
      <Text style={styles.stepTitle}>Nutritional Baseline</Text>
      <Text style={styles.stepSub}>Powers AI meal planning and recovery recommendations</Text>

      <Text style={styles.sectionLabel}>Dietary Preference</Text>
      <View style={styles.dietGrid}>
        {DIETARY_OPTIONS.map(d => {
          const active = dietaryPref===d.key;
          return (
            <Pressable key={d.key} onPress={() => { setDietaryPref(d.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[styles.dietCard, active && styles.dietCardActive]}>
              <Text style={styles.dietEmoji}>{d.emoji}</Text>
              <Text style={[styles.dietLabel, active && { color: Colors.primary }]}>{d.label}</Text>
              {active && <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />}
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionLabel,{marginTop:20}]}>Allergies & Intolerances</Text>
      <Text style={styles.sectionHint}>Select all that apply</Text>
      <View style={styles.chipWrap}>
        {ALLERGY_CHIPS.map(a => {
          const active = selectedAllergies.includes(a);
          return (
            <Pressable key={a} onPress={() => toggleChip(selectedAllergies, a, setSelectedAllergies)}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{a}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.field,{marginTop:12}]}>
        <Text style={styles.fieldLabel}>Other allergies</Text>
        <TextInput style={[styles.input,{marginTop:6}]} placeholder="e.g. Shellfish, Soy, Sesame"
          placeholderTextColor={Colors.textMuted} value={customAllergy} onChangeText={setCustomAllergy} />
      </View>
    </ScrollView>
  );

  // ── Experience & Goal (step 5) ────────────────────────────────────────────────
  const renderExperience = () => {
    const isYoga = sport === 'yoga';
    const levels = isYoga ? YOGA_LEVELS : PLAY_LEVELS;
    const goals  = isYoga ? YOGA_GOALS  : PRIMARY_GOALS;
    const title  = isYoga ? 'Yoga Journey' : 'Experience & Goal';
    const sub    = isYoga
      ? 'Tailors pose sequencing, hold durations, and breathwork guidance'
      : 'Calibrates training intensity and AI feedback depth';

    return (
      <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={isYoga ? ['#6A1B9A','#7B1FA2'] : [Colors.accent, Colors.accentDark]} style={styles.stepIcon}>
          <Ionicons name={isYoga ? 'body' : 'medal'} size={32} color="#fff" />
        </LinearGradient>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepSub}>{sub}</Text>

        <Text style={styles.sectionLabel}>{isYoga ? 'Practice Level' : 'Play Level'}</Text>
        {levels.map(l => (
          <Pressable key={l.key} onPress={() => { setSkillLevel(l.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={[styles.levelCard, skillLevel===l.key && styles.levelCardActive]}>
            <Text style={styles.levelBadge}>{l.badge}</Text>
            <View style={{ flex:1 }}>
              <Text style={[styles.levelName, skillLevel===l.key && { color: Colors.primary }]}>{l.label}</Text>
              <Text style={styles.levelSub}>{l.sub}</Text>
            </View>
            {skillLevel===l.key && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
          </Pressable>
        ))}

        <Text style={[styles.sectionLabel,{marginTop:20}]}>Primary Goal</Text>
        <View style={[styles.goalRow, isYoga && { flexWrap:'wrap' }]}>
          {goals.map(g => (
            <Pressable key={g.key} onPress={() => { setFitnessGoal(g.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[styles.goalCard, fitnessGoal===g.key && styles.goalCardActive, isYoga && { width: (width-72)/2 }]}>
              <Ionicons name={g.icon} size={24} color={fitnessGoal===g.key ? Colors.primary : Colors.textMuted} />
              <Text style={[styles.goalLabel, fitnessGoal===g.key && { color: Colors.primary }]}>{g.label}</Text>
              <Text style={styles.goalDesc}>{g.desc}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    );
  };

  const calcProfileScore = (): number => {
    let score = 60; // base: all required steps complete
    // Cricket sub-branches
    if (sport === 'cricket') {
      if (cricketRole) score += 5;
      if (bowlingStyle === 'spin' && ['bowler','all_rounder'].includes(cricketRole) && spinType) score += 8;
    }
    // Yoga-specific goal selected
    if (sport === 'yoga' && YOGA_GOALS.some(g => g.key === fitnessGoal)) score += 8;
    // Health notes provided and valid
    if (validateNote(otherHealthNotes)) score += 5;
    if (validateNote(otherInjuryNotes)) score += 4;
    // Dietary preference filled
    if (dietaryPref) score += 5;
    // Custom allergy detail
    if (customAllergy.trim().length >= 3 || selectedAllergies.length > 0) score += 3;
    return Math.min(score, 95);
  };

  const buildExtraItems = (): string[] => {
    const items: string[] = [];
    if (sport === 'cricket' && cricketRole) {
      const roleLabel = CRICKET_ROLES.find(r => r.key === cricketRole)?.label ?? cricketRole;
      items.push(`Cricket role: ${roleLabel}`);
      if (bowlingStyle === 'spin' && spinType) {
        const stLabel = SPIN_TYPES.find(s => s.key === spinType)?.label ?? spinType;
        items.push(`Spin type: ${stLabel}`);
      }
    }
    if (sport === 'yoga' && YOGA_GOALS.some(g => g.key === fitnessGoal)) {
      const gLabel = YOGA_GOALS.find(g => g.key === fitnessGoal)?.label ?? fitnessGoal;
      items.push(`Yoga goal: ${gLabel}`);
    }
    if (validateNote(otherHealthNotes)) items.push('Custom health notes recorded');
    if (validateNote(otherInjuryNotes)) items.push('Custom injury notes recorded');
    return items;
  };

  const renderProfileStrength = () => (
    <ProfileStrengthScreen Colors={Colors} styles={styles}
      heightCm={Math.round(getHCm())} weightKg={Math.round(getWKg())}
      sport={sport} leadHand={leadHand}
      score={calcProfileScore()} extraItems={buildExtraItems()}
      onLaunch={handleComplete} />
  );

  // ── Navigation ────────────────────────────────────────────────────────────────
  const canGoNext = (): boolean => {
    switch (step) {
      case 0: return vitalsValid();
      case 2: return sport==='cricket' ? !!cricketRole : true;
      default: return true;
    }
  };

  const handleNext = () => goTo(nextStep(step, sport), 'forward');
  const handleBack = () => goTo(prevStep(step, sport), 'back');

  const renderCurrentStep = () => {
    switch (step) {
      case 0: return renderVitals();
      case 1: return renderSportSelection();
      case 2: return renderStance();
      case 3: return renderHealthSafety();
      case 4: return renderNutrition();
      case 5: return renderExperience();
      case 6: return renderProfileStrength();
      default: return null;
    }
  };

  const topPad = (insets.top || webTopInset) + 8;
  const bottomPad = insets.bottom || webBottomInset;
  const isLastDataStep = step === TOTAL_STEPS - 1;
  const isCompleteStep = step === TOTAL_STEPS;

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad }]}>
        {!isCompleteStep && (
          <>
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:20, paddingBottom:4 }}>
              {step > 0
                ? <Pressable onPress={handleBack} hitSlop={12}><Ionicons name="chevron-back" size={24} color={Colors.text} /></Pressable>
                : <View style={{ width:24 }} />}
              <View style={{ width:40 }} />
            </View>
            <ChapterProgressBar step={step} sport={sport} Colors={Colors} />
          </>
        )}
      </View>

      <Animated.View style={{ flex:1, transform:[{ translateX }] }}>
        {renderCurrentStep()}
      </Animated.View>

      {!isCompleteStep && (
        <View style={[styles.footer, { paddingBottom: bottomPad+16 }]}>
          <Pressable onPress={handleNext} disabled={!canGoNext()}
            style={[styles.nextBtn, !canGoNext() && { opacity:0.5 }]}>
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.nextBtnGradient}>
              <Text style={styles.nextBtnText}>{isLastDataStep ? 'See Results' : 'Continue'}</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
function createStyles(C: any) {
  return StyleSheet.create({
    container: { flex:1 },
    header: { zIndex:10 },
    headerBrand: { fontSize:18, fontFamily:'Outfit_700Bold', color:C.primary, letterSpacing:1 },
    stepContent: { padding:24, paddingTop:16 },
    stepIcon: { width:68, height:68, borderRadius:22, alignItems:'center', justifyContent:'center', alignSelf:'center', marginBottom:20 },
    stepTitle: { fontSize:26, fontFamily:'Outfit_700Bold', color:C.text, textAlign:'center', marginBottom:6 },
    stepSub: { fontSize:14, fontFamily:'Outfit_400Regular', color:C.textSecondary, textAlign:'center', marginBottom:24, lineHeight:20 },

    // Fields
    field: { marginBottom:16 },
    fieldLabelRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
    fieldLabel: { fontSize:13, fontFamily:'Outfit_600SemiBold', color:C.textSecondary },
    fieldHint: { fontSize:11, fontFamily:'Outfit_500Medium', color:C.textMuted },
    input: { height:50, borderRadius:14, paddingHorizontal:16, backgroundColor:C.surface, color:C.text, fontSize:15, fontFamily:'Outfit_500Medium', borderWidth:1, borderColor:C.border },
    inputWithUnit: { flexDirection:'row', alignItems:'center', gap:10 },
    unitBadge: { height:50, paddingHorizontal:16, borderRadius:14, backgroundColor:C.surfaceLight, borderWidth:1, borderColor:C.border, alignItems:'center', justifyContent:'center' },
    unitBadgeText: { fontSize:14, fontFamily:'Outfit_700Bold', color:C.textSecondary },
    ftInRow: { flexDirection:'row', gap:12 },
    ftInField: { flex:1, gap:6 },
    ftInLabel: { fontSize:12, fontFamily:'Outfit_600SemiBold', color:C.textMuted, textAlign:'center', marginTop:4 },

    // Section
    sectionLabel: { fontSize:14, fontFamily:'Outfit_700Bold', color:C.text, marginBottom:4 },
    sectionHint: { fontSize:12, fontFamily:'Outfit_400Regular', color:C.textMuted, marginBottom:12 },

    // Sport cards
    sportGrid: { flexDirection:'row', flexWrap:'wrap', gap:12, marginBottom:8 },
    sportCard: { width:(width-60)/2, borderRadius:18, overflow:'hidden', borderWidth:2, borderColor:'transparent' },
    sportCardActive: { borderColor:C.primary },
    sportCardGradient: { padding:18, minHeight:140, alignItems:'flex-start', justifyContent:'flex-end' },
    sportEmoji: { fontSize:36, marginBottom:8 },
    sportName: { fontSize:16, fontFamily:'Outfit_700Bold', color:C.text },
    sportTagline: { fontSize:11, fontFamily:'Outfit_400Regular', color:C.textMuted, marginTop:3, lineHeight:15 },
    sportCheck: { position:'absolute', top:10, right:10 },

    // Stance
    stanceContainer: { flexDirection:'row', gap:14, marginTop:8 },
    stanceCard: { flex:1, borderRadius:20, overflow:'hidden', borderWidth:2, borderColor:'transparent' },
    stanceCardActive: { borderColor:C.primary },
    stanceGradient: { padding:24, alignItems:'center', minHeight:170, justifyContent:'center' },
    stanceEmoji: { fontSize:48, marginBottom:14 },
    stanceLabel: { fontSize:15, fontFamily:'Outfit_700Bold', color:C.text, textAlign:'center', lineHeight:22 },
    stanceCheckmark: { position:'absolute', top:12, right:12 },

    // Chips
    chipWrap: { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:4 },
    chip: { paddingHorizontal:16, paddingVertical:10, borderRadius:20, backgroundColor:C.surface, borderWidth:1, borderColor:C.border },
    chipActive: { borderColor:C.primary, backgroundColor:C.primary+'14' },
    chipNone: { borderColor:C.success, backgroundColor:C.success+'14' },
    chipText: { fontSize:14, fontFamily:'Outfit_600SemiBold', color:C.textSecondary },
    chipTextActive: { color:C.primary },

    // Injury status
    injuryStatusList: { marginTop:16, gap:10 },
    injuryStatusRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:4 },
    injuryArea: { fontSize:14, fontFamily:'Outfit_600SemiBold', color:C.text },
    statusPill: { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:14, paddingVertical:7, borderRadius:20, backgroundColor:C.error+'18', borderWidth:1, borderColor:C.error+'50' },
    statusPillPast: { backgroundColor:C.textMuted+'18', borderColor:C.textMuted+'40' },
    statusDot: { width:8, height:8, borderRadius:4, backgroundColor:C.error },
    statusDotPast: { backgroundColor:C.textMuted },
    statusText: { fontSize:13, fontFamily:'Outfit_600SemiBold', color:C.error },
    statusTextPast: { color:C.textMuted },

    // Diet cards
    dietGrid: { flexDirection:'row', flexWrap:'wrap', gap:10 },
    dietCard: { width:(width-68)/2, padding:16, borderRadius:16, alignItems:'center', gap:6, backgroundColor:C.surface, borderWidth:1, borderColor:C.border },
    dietCardActive: { borderColor:C.primary, backgroundColor:C.primary+'0A' },
    dietEmoji: { fontSize:28 },
    dietLabel: { fontSize:14, fontFamily:'Outfit_700Bold', color:C.text },

    // Level cards
    levelCard: { flexDirection:'row', alignItems:'center', gap:12, padding:14, borderRadius:14, marginBottom:8, backgroundColor:C.surface, borderWidth:1, borderColor:C.border },
    levelCardActive: { borderColor:C.primary, backgroundColor:C.primary+'0A' },
    levelBadge: { fontSize:24 },
    levelName: { fontSize:15, fontFamily:'Outfit_700Bold', color:C.text },
    levelSub: { fontSize:12, fontFamily:'Outfit_400Regular', color:C.textMuted, marginTop:2 },

    // Goal cards
    goalRow: { flexDirection:'row', gap:10 },
    goalCard: { flex:1, padding:14, borderRadius:14, alignItems:'center', backgroundColor:C.surface, borderWidth:1, borderColor:C.border, gap:6 },
    goalCardActive: { borderColor:C.primary, backgroundColor:C.primary+'0A' },
    goalLabel: { fontSize:13, fontFamily:'Outfit_700Bold', color:C.text, textAlign:'center' },
    goalDesc: { fontSize:11, fontFamily:'Outfit_400Regular', color:C.textMuted, textAlign:'center', lineHeight:15 },

    // Pro note
    proNote: { flexDirection:'row', gap:8, alignItems:'flex-start', marginTop:20, padding:14, backgroundColor:C.primary+'12', borderRadius:14, borderLeftWidth:3, borderLeftColor:C.primary },
    proNoteText: { flex:1, fontSize:13, fontFamily:'Outfit_500Medium', color:C.textSecondary, lineHeight:19 },

    // Profile strength
    strengthCard: { padding:20, borderRadius:18, backgroundColor:C.surface, borderWidth:1, borderColor:C.border, marginBottom:20 },
    strengthLabel: { fontSize:14, fontFamily:'Outfit_600SemiBold', color:C.textSecondary },
    strengthPercent: { fontSize:22, fontFamily:'Outfit_700Bold', color:C.primary },
    strengthTrack: { height:10, backgroundColor:C.surfaceLight, borderRadius:5, overflow:'hidden', marginBottom:10 },
    strengthFill: { height:'100%', backgroundColor:C.primary, borderRadius:5 },
    strengthNote: { fontSize:13, fontFamily:'Outfit_600SemiBold', color:C.success },
    doneList: { gap:10, marginBottom:20 },
    doneItem: { flexDirection:'row', alignItems:'center', gap:10 },
    doneText: { fontSize:14, fontFamily:'Outfit_500Medium', color:C.text, flex:1 },
    upgradeCard: { flexDirection:'row', gap:10, alignItems:'flex-start', padding:16, borderRadius:16, backgroundColor:C.primary+'10', borderWidth:1, borderColor:C.primary+'30', marginBottom:24 },
    upgradeText: { flex:1, fontSize:13, fontFamily:'Outfit_500Medium', color:C.textSecondary, lineHeight:19 },
    launchBtn: { borderRadius:16, overflow:'hidden' },
    launchBtnGradient: { height:56, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10 },
    launchBtnText: { fontSize:17, fontFamily:'Outfit_700Bold', color:'#fff' },

    // Footer
    footer: { paddingHorizontal:24, paddingTop:12, backgroundColor:C.background, borderTopWidth:1, borderTopColor:C.border },
    nextBtn: { borderRadius:16, overflow:'hidden' },
    nextBtnGradient: { height:54, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10 },
    nextBtnText: { fontSize:16, fontFamily:'Outfit_700Bold', color:'#fff' },
  });
}

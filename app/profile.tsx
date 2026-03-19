import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  Platform, ScrollView, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors, useTheme } from '@/contexts/ThemeContext';
import { useUser } from '@/contexts/UserContext';

const { width } = Dimensions.get('window');

// ─── Shared constants ──────────────────────────────────────────────────────────
const SPORTS = [
  { key: 'cricket',   label: 'Cricket',   emoji: '🏏' },
  { key: 'badminton', label: 'Badminton', emoji: '🏸' },
  { key: 'skating',   label: 'Skating',   emoji: '⛸️' },
  { key: 'yoga',      label: 'Yoga',      emoji: '🧘' },
];

const CRICKET_ROLES = [
  { key: 'batter',      label: 'Batter',     emoji: '🏏' },
  { key: 'bowler',      label: 'Bowler',      emoji: '⚡' },
  { key: 'all_rounder', label: 'All-Rounder', emoji: '🌟' },
];

const SPIN_TYPES = [
  { key: 'off_break',         label: 'Off-Break' },
  { key: 'leg_break',         label: 'Leg-Break' },
  { key: 'left_arm_orthodox', label: 'Left-Arm Orthodox' },
  { key: 'left_arm_chinaman', label: 'Left-Arm Chinaman' },
];

const BATTING_GUARDS = [
  { key: 'middle', label: 'Middle' },
  { key: 'leg',    label: 'Leg' },
  { key: 'off',    label: 'Off' },
];

const YOGA_STYLES = [
  { key: 'hatha',        label: 'Hatha' },
  { key: 'vinyasa',      label: 'Vinyasa' },
  { key: 'ashtanga',     label: 'Ashtanga' },
  { key: 'yin',          label: 'Yin' },
  { key: 'restorative',  label: 'Restorative' },
];

const PLAY_LEVELS = [
  { key: 'beginner',     label: 'Beginner',     yogaLabel: 'New to Yoga' },
  { key: 'intermediate', label: 'Club Player',   yogaLabel: 'Consistent Practitioner' },
  { key: 'advanced',     label: 'Semi-Pro',      yogaLabel: 'Advanced / Instructor' },
  { key: 'pro',          label: 'Professional',  yogaLabel: 'Professional' },
];

const GOALS = [
  { key: 'technique',       label: 'Technique',        yogaLabel: 'Flexibility',      icon: 'analytics' as const },
  { key: 'power',           label: 'Power',            yogaLabel: 'Core & Balance',   icon: 'flash' as const },
  { key: 'weight_loss',     label: 'Weight Loss',      yogaLabel: 'Stress Reduction', icon: 'flame' as const },
  { key: 'flexibility',     label: 'Flexibility',      yogaLabel: 'Flexibility',      icon: 'body' as const },
  { key: 'core_balance',    label: 'Core & Balance',   yogaLabel: 'Core & Balance',   icon: 'fitness' as const },
  { key: 'stress_reduction',label: 'Stress Reduction', yogaLabel: 'Stress Reduction', icon: 'leaf' as const },
  { key: 'injury_recovery', label: 'Injury Recovery',  yogaLabel: 'Injury Recovery',  icon: 'heart' as const },
];

const YOGA_GOALS_KEYS = ['flexibility','core_balance','stress_reduction','injury_recovery'];
const SPORT_GOALS_KEYS = ['technique','power','weight_loss'];

function buildRoleSubtitle(sport: string, cricketRole: string, bowlingArm: string, bowlingStyle: string, spinType: string, leadHand: string): string {
  if (sport === 'cricket') {
    if (!cricketRole) return 'Cricket';
    const roleLabel = CRICKET_ROLES.find(r => r.key === cricketRole)?.label ?? cricketRole;
    if (cricketRole === 'batter') {
      return `Cricket · ${leadHand === 'left' ? 'Left' : 'Right'}-Handed ${roleLabel}`;
    }
    if (cricketRole === 'bowler') {
      const arm = bowlingArm === 'left' ? 'Left-Arm' : 'Right-Arm';
      const style = bowlingStyle === 'spin' ? 'Spin' : 'Pace';
      const spin = spinType ? ` (${SPIN_TYPES.find(s => s.key === spinType)?.label ?? spinType})` : '';
      return `Cricket · ${arm} ${style}${spin}`;
    }
    if (cricketRole === 'all_rounder') {
      const arm = bowlingArm === 'left' ? 'Left-Arm' : 'Right-Arm';
      const style = bowlingStyle === 'spin' ? 'Spin' : 'Pace';
      const spin = spinType && bowlingStyle === 'spin' ? ` (${SPIN_TYPES.find(s => s.key === spinType)?.label ?? spinType})` : '';
      return `Cricket · All-Rounder · ${arm} ${style}${spin}`;
    }
  }
  return SPORTS.find(s => s.key === sport)?.label ?? 'Athlete';
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useColors();
  const { isDark, toggleTheme } = useTheme();
  const styles = createStyles(Colors);
  const { profile, updateProfile, updateSportData } = useUser();

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  // ── Personal info ─────────────────────────────────────────────────────────────
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(String(profile.age));
  const [heightCm, setHeightCm] = useState(String(Math.round(profile.heightCm || 170)));
  const [weightKg, setWeightKg] = useState(String(profile.weightKg || 70));

  // ── Athletics ─────────────────────────────────────────────────────────────────
  const [sport, setSport] = useState(profile.primarySport || profile.sport || '');
  const [leadHand, setLeadHand] = useState<'left'|'right'>(profile.leadHand || 'right');
  const [cricketRole, setCricketRole] = useState(profile.cricketRole || '');
  const [bowlingArm, setBowlingArm] = useState<'left'|'right'>(profile.bowlingArm || 'right');
  const [bowlingStyle, setBowlingStyle] = useState(profile.bowlingStyle || '');
  const [spinType, setSpinType] = useState(profile.spinType || '');
  const [skillLevel, setSkillLevel] = useState(profile.skillLevel || 'intermediate');
  const [fitnessGoal, setFitnessGoal] = useState(profile.fitnessGoal || 'technique');

  // ── Pro Mode ──────────────────────────────────────────────────────────────────
  const [proExpanded, setProExpanded] = useState(false);
  const cricketSD = profile.sportSpecificData?.cricket ?? {};
  const badmintonSD = profile.sportSpecificData?.badminton ?? {};
  const skatingSD = profile.sportSpecificData?.skating ?? {};
  const yogaSD = profile.sportSpecificData?.yoga ?? {};
  const [batWeight, setBatWeight]       = useState(String(cricketSD.bat_weight?.value ?? 1200));
  const [battingGuard, setBattingGuard] = useState(cricketSD.batting_guard?.value ?? 'middle');
  const [bowlingSpeed, setBowlingSpeed] = useState(String(cricketSD.bowling_speed ?? ''));
  const [racketWeight, setRacketWeight] = useState(String(badmintonSD.racket_weight ?? 85));
  const [stringTension, setStringTension] = useState(String(badmintonSD.string_tension ?? 24));
  const [bladeLength, setBladeLength]   = useState(String(skatingSD.blade_length ?? ''));
  const [yogaStyle, setYogaStyle]       = useState(yogaSD.practice_style ?? '');

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const isCricket  = sport === 'cricket';
  const isSkating  = sport === 'skating';
  const isYoga     = sport === 'yoga';
  const showBatHand  = isCricket && ['batter','all_rounder'].includes(cricketRole);
  const showBowling  = isCricket && ['bowler','all_rounder'].includes(cricketRole);

  const activeGoals = isYoga ? YOGA_GOALS_KEYS : SPORT_GOALS_KEYS;
  const displayGoals = GOALS.filter(g => activeGoals.includes(g.key));

  // Normalise: when switching sport, reset goal to a valid one
  const handleSportChange = (s: string) => {
    setSport(s);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const yogaGoals = YOGA_GOALS_KEYS;
    const sportGoals = SPORT_GOALS_KEYS;
    if (s === 'yoga' && !yogaGoals.includes(fitnessGoal)) setFitnessGoal('flexibility');
    if (s !== 'yoga' && !sportGoals.includes(fitnessGoal)) setFitnessGoal('technique');
  };

  const handleSave = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Build updated sport-specific data
    const existingSD = profile.sportSpecificData ?? {};
    let updatedSD = { ...existingSD };

    if (isCricket) {
      const isBatter = ['batter','all_rounder'].includes(cricketRole);
      const isBowler = ['bowler','all_rounder'].includes(cricketRole);
      const isSpin = bowlingStyle === 'spin';
      updatedSD.cricket = {
        ...(existingSD.cricket ?? {}),
        player_role: cricketRole,
        ...(isBatter ? {
          bat_weight: { value: parseInt(batWeight) || 1200, confidence: 0.9, source: 'user_input' },
          batting_guard: { value: battingGuard, confidence: 0.9, source: 'user_input' },
        } : {}),
        ...(isBowler ? {
          bowling_arm: bowlingArm,
          bowling_style: bowlingStyle,
          ...(isSpin && spinType ? { spin_type: spinType } : {}),
          ...(bowlingSpeed ? { bowling_speed: parseInt(bowlingSpeed) } : {}),
        } : {}),
      };
    }
    if (sport === 'badminton') {
      updatedSD.badminton = { ...(existingSD.badminton ?? {}), racket_weight: parseInt(racketWeight) || 85, string_tension: parseInt(stringTension) || 24 };
    }
    if (sport === 'skating') {
      updatedSD.skating = { ...(existingSD.skating ?? {}), ...(bladeLength ? { blade_length: parseFloat(bladeLength) } : {}) };
    }
    if (sport === 'yoga') {
      updatedSD.yoga = { ...(existingSD.yoga ?? {}), ...(yogaStyle ? { practice_style: yogaStyle } : {}) };
    }

    await updateProfile({
      name: name.trim() || 'Athlete',
      age: parseInt(age) || 25,
      heightCm: parseFloat(heightCm) || 170,
      weightKg: parseFloat(weightKg) || 70,
      height: parseFloat(heightCm) || 170,
      weight: parseFloat(weightKg) || 70,
      primarySport: sport as any,
      sport,
      leadHand,
      cricketRole: cricketRole as any,
      bowlingArm,
      bowlingStyle: bowlingStyle as any,
      spinType,
      skillLevel: skillLevel as any,
      fitnessGoal: fitnessGoal as any,
      sportSpecificData: updatedSD,
    });
    router.back();
  };

  const handleReset = async () => {
    if (!showResetConfirm) { setShowResetConfirm(true); return; }
    await AsyncStorage.clear();
    await updateProfile({ onboarded: false });
    router.replace('/');
  };

  const sportEmoji = SPORTS.find(s => s.key === sport)?.emoji ?? '🏅';
  const roleSubtitle = buildRoleSubtitle(sport, cricketRole, bowlingArm, bowlingStyle, spinType, leadHand);
  const levelLabel = isYoga
    ? (PLAY_LEVELS.find(l => l.key === skillLevel)?.yogaLabel ?? skillLevel)
    : (PLAY_LEVELS.find(l => l.key === skillLevel)?.label ?? skillLevel);

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: (insets.top || webTopInset) + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Profile</Text>
        <Pressable onPress={handleSave} hitSlop={12}>
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: (insets.bottom || 34) + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
            <Text style={styles.avatarEmoji}>{sportEmoji}</Text>
          </LinearGradient>
          <Text style={styles.profileName}>{name || 'Athlete'}</Text>
          <Text style={styles.profileSport}>{roleSubtitle}</Text>
          <Text style={styles.profileLevel}>{levelLabel}</Text>
        </View>

        {/* ── Personal Info ─────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Personal Info</Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput style={styles.fieldInput} value={name}
              onChangeText={t => setName(t.replace(/[^a-zA-Z\s'-]/g,'').slice(0,30))}
              placeholderTextColor={Colors.textMuted} autoCapitalize="words" />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Age</Text>
            <TextInput style={styles.fieldInput} value={age} keyboardType="number-pad"
              onChangeText={t => { const d=t.replace(/[^0-9]/g,''); setAge(parseInt(d)>100?'100':d); }}
              placeholderTextColor={Colors.textMuted} maxLength={3} />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Height</Text>
            <View style={styles.fieldInputRow}>
              <TextInput style={styles.fieldInput} value={heightCm} keyboardType="number-pad"
                onChangeText={t => { const d=t.replace(/[^0-9]/g,''); setHeightCm(parseInt(d)>250?'250':d); }}
                placeholderTextColor={Colors.textMuted} maxLength={3} />
              <Text style={styles.fieldUnit}>cm</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Weight</Text>
            <View style={styles.fieldInputRow}>
              <TextInput style={styles.fieldInput} value={String(weightKg)} keyboardType="decimal-pad"
                onChangeText={t => { const d=t.replace(/[^0-9.]/g,''); setWeightKg(parseFloat(d)>180?'180':d); }}
                placeholderTextColor={Colors.textMuted} maxLength={6} />
              <Text style={styles.fieldUnit}>kg</Text>
            </View>
          </View>
        </View>

        {/* ── Primary Sport ─────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Primary Sport</Text>
        <View style={styles.chipRow}>
          {SPORTS.map(s => (
            <Pressable key={s.key} onPress={() => handleSportChange(s.key)}
              style={[styles.chip, sport===s.key && styles.chipActive]}>
              <Text style={styles.chipEmoji}>{s.emoji}</Text>
              <Text style={[styles.chipLabel, sport===s.key && styles.chipLabelActive]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Cricket Role ──────────────────────────────────────────────────── */}
        {isCricket && (
          <>
            <Text style={styles.sectionLabel}>Cricket Role</Text>
            <View style={styles.card}>
              {CRICKET_ROLES.map((r, i) => (
                <View key={r.key}>
                  <Pressable onPress={() => { setCricketRole(r.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    style={styles.fieldRow}>
                    <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
                      <Text style={{ fontSize:20 }}>{r.emoji}</Text>
                      <Text style={[styles.fieldLabel, cricketRole===r.key && { color: Colors.primary }]}>{r.label}</Text>
                    </View>
                    {cricketRole===r.key
                      ? <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                      : <View style={styles.radioEmpty} />}
                  </Pressable>
                  {i < CRICKET_ROLES.length-1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>

            {/* Batting hand */}
            {showBatHand && (
              <>
                <Text style={styles.sectionLabel}>Batting Hand</Text>
                <View style={styles.handRow}>
                  {([{ v:'left' as const, emoji:'🤚', label:'Left-Handed\nBatsman' },
                     { v:'right' as const, emoji:'✋', label:'Right-Handed\nBatsman' }]).map(opt => (
                    <Pressable key={opt.v} onPress={() => { setLeadHand(opt.v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                      style={[styles.handCard, leadHand===opt.v && styles.handCardActive]}>
                      <Text style={styles.handEmoji}>{opt.emoji}</Text>
                      <Text style={[styles.handLabel, leadHand===opt.v && { color: Colors.primary }]}>{opt.label}</Text>
                      {leadHand===opt.v && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginTop:6 }} />}
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* Bowling arm + style + spin type */}
            {showBowling && (
              <>
                <Text style={styles.sectionLabel}>Bowling Arm</Text>
                <View style={styles.handRow}>
                  {([{ v:'left' as const, emoji:'🤚', label:'Left-Arm\nBowler' },
                     { v:'right' as const, emoji:'✋', label:'Right-Arm\nBowler' }]).map(opt => (
                    <Pressable key={opt.v} onPress={() => { setBowlingArm(opt.v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                      style={[styles.handCard, bowlingArm===opt.v && styles.handCardActive]}>
                      <Text style={styles.handEmoji}>{opt.emoji}</Text>
                      <Text style={[styles.handLabel, bowlingArm===opt.v && { color: Colors.primary }]}>{opt.label}</Text>
                      {bowlingArm===opt.v && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginTop:6 }} />}
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.sectionLabel}>Bowling Style</Text>
                <View style={styles.chipRow}>
                  {[{ key:'pace', label:'Pace', icon:'flash' as const },
                    { key:'spin', label:'Spin', icon:'sync' as const }].map(bs => (
                    <Pressable key={bs.key} onPress={() => { setBowlingStyle(bs.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      style={[styles.chip, bowlingStyle===bs.key && styles.chipActive]}>
                      <Ionicons name={bs.icon} size={16} color={bowlingStyle===bs.key ? Colors.primary : Colors.textMuted} />
                      <Text style={[styles.chipLabel, bowlingStyle===bs.key && styles.chipLabelActive]}>{bs.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {bowlingStyle === 'spin' && (
                  <>
                    <Text style={styles.sectionLabel}>Spin Type</Text>
                    <View style={styles.card}>
                      {SPIN_TYPES.map((st, i) => (
                        <View key={st.key}>
                          <Pressable onPress={() => { setSpinType(st.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                            style={styles.fieldRow}>
                            <Text style={[styles.fieldLabel, spinType===st.key && { color: Colors.primary }]}>{st.label}</Text>
                            {spinType===st.key
                              ? <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                              : <View style={styles.radioEmpty} />}
                          </Pressable>
                          {i < SPIN_TYPES.length-1 && <View style={styles.divider} />}
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── Dominant Hand / Lead Foot (non-cricket) ───────────────────────── */}
        {!isCricket && (
          <>
            <Text style={styles.sectionLabel}>
              {isSkating ? 'Lead Foot' : 'Dominant Hand'}
            </Text>
            <View style={styles.handRow}>
              {(isSkating
                ? [{ v:'right' as const, emoji:'🛼', label:'Goofy\n(Right Foot)' },
                   { v:'left'  as const, emoji:'🛼', label:'Regular\n(Left Foot)' }]
                : [{ v:'left'  as const, emoji:'🤚', label:'Left\nDominant' },
                   { v:'right' as const, emoji:'✋', label:'Right\nDominant' }]
              ).map(opt => (
                <Pressable key={opt.v} onPress={() => { setLeadHand(opt.v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                  style={[styles.handCard, leadHand===opt.v && styles.handCardActive]}>
                  <Text style={styles.handEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.handLabel, leadHand===opt.v && { color: Colors.primary }]}>{opt.label}</Text>
                  {leadHand===opt.v && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginTop:6 }} />}
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* ── Play Level ────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>{isYoga ? 'Practice Level' : 'Play Level'}</Text>
        <View style={styles.card}>
          {PLAY_LEVELS.filter(l => !isYoga || l.key !== 'pro').map((l, i, arr) => (
            <View key={l.key}>
              <Pressable onPress={() => { setSkillLevel(l.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, skillLevel===l.key && { color: Colors.primary }]}>
                  {isYoga ? l.yogaLabel : l.label}
                </Text>
                {skillLevel===l.key
                  ? <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                  : <View style={styles.radioEmpty} />}
              </Pressable>
              {i < arr.length-1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        {/* ── Primary Goal ──────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Primary Goal</Text>
        <View style={[styles.goalGrid, { flexWrap: displayGoals.length > 3 ? 'wrap' : 'nowrap' }]}>
          {displayGoals.map(g => (
            <Pressable key={g.key}
              onPress={() => { setFitnessGoal(g.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[styles.goalCard,
                fitnessGoal===g.key && styles.goalCardActive,
                displayGoals.length > 3 && { width: (width - 60) / 2 }]}>
              <Ionicons name={g.icon} size={22} color={fitnessGoal===g.key ? Colors.primary : Colors.textMuted} />
              <Text style={[styles.goalLabel, fitnessGoal===g.key && { color: Colors.primary }]}>
                {isYoga ? g.yogaLabel : g.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Pro Mode ──────────────────────────────────────────────────────── */}
        <Pressable onPress={() => { setProExpanded(p => !p); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={styles.proHeader}>
          <LinearGradient colors={[Colors.primary+'22', Colors.primary+'08']} style={styles.proHeaderInner}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
              <Ionicons name="settings" size={18} color={Colors.primary} />
              <Text style={styles.proHeaderTitle}>Pro Mode</Text>
              <View style={styles.proBadge}><Text style={styles.proBadgeText}>GEAR</Text></View>
            </View>
            <Ionicons name={proExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.primary} />
          </LinearGradient>
        </Pressable>

        {proExpanded && (
          <View style={[styles.card, { marginBottom: 0 }]}>
            {isCricket && (
              <>
                {showBatHand && (
                  <>
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Bat Weight</Text>
                      <View style={styles.fieldInputRow}>
                        <TextInput style={styles.fieldInput} value={batWeight} keyboardType="number-pad"
                          onChangeText={setBatWeight} placeholderTextColor={Colors.textMuted} maxLength={4} />
                        <Text style={styles.fieldUnit}>g</Text>
                      </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={[styles.fieldRow, { alignItems:'flex-start', paddingVertical:12 }]}>
                      <Text style={[styles.fieldLabel, { paddingTop:4 }]}>Batting Guard</Text>
                      <View style={{ flexDirection:'row', gap:8 }}>
                        {BATTING_GUARDS.map(bg => (
                          <Pressable key={bg.key} onPress={() => { setBattingGuard(bg.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                            style={[styles.miniChip, battingGuard===bg.key && styles.miniChipActive]}>
                            <Text style={[styles.miniChipText, battingGuard===bg.key && { color: Colors.primary }]}>{bg.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    {showBowling && <View style={styles.divider} />}
                  </>
                )}
                {showBowling && bowlingStyle === 'pace' && (
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>Bowling Speed</Text>
                    <View style={styles.fieldInputRow}>
                      <TextInput style={styles.fieldInput} value={bowlingSpeed} keyboardType="number-pad"
                        onChangeText={setBowlingSpeed} placeholder="—"
                        placeholderTextColor={Colors.textMuted} maxLength={3} />
                      <Text style={styles.fieldUnit}>km/h</Text>
                    </View>
                  </View>
                )}
                {!showBatHand && !showBowling && (
                  <View style={[styles.fieldRow, { justifyContent:'center' }]}>
                    <Text style={[styles.fieldLabel, { color: Colors.textMuted }]}>Select a role above to unlock gear fields</Text>
                  </View>
                )}
              </>
            )}

            {sport === 'badminton' && (
              <>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Racket Weight</Text>
                  <View style={styles.fieldInputRow}>
                    <TextInput style={styles.fieldInput} value={racketWeight} keyboardType="number-pad"
                      onChangeText={setRacketWeight} placeholderTextColor={Colors.textMuted} maxLength={3} />
                    <Text style={styles.fieldUnit}>g</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>String Tension</Text>
                  <View style={styles.fieldInputRow}>
                    <TextInput style={styles.fieldInput} value={stringTension} keyboardType="number-pad"
                      onChangeText={setStringTension} placeholderTextColor={Colors.textMuted} maxLength={2} />
                    <Text style={styles.fieldUnit}>lbs</Text>
                  </View>
                </View>
              </>
            )}

            {sport === 'skating' && (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Blade Length</Text>
                <View style={styles.fieldInputRow}>
                  <TextInput style={styles.fieldInput} value={bladeLength} keyboardType="decimal-pad"
                    onChangeText={setBladeLength} placeholder="—"
                    placeholderTextColor={Colors.textMuted} maxLength={5} />
                  <Text style={styles.fieldUnit}>mm</Text>
                </View>
              </View>
            )}

            {sport === 'yoga' && (
              <View style={[styles.fieldRow, { alignItems:'flex-start', paddingVertical:12 }]}>
                <Text style={[styles.fieldLabel, { paddingTop:4 }]}>Practice Style</Text>
                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, flex:1, justifyContent:'flex-end' }}>
                  {YOGA_STYLES.map(ys => (
                    <Pressable key={ys.key} onPress={() => { setYogaStyle(ys.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      style={[styles.miniChip, yogaStyle===ys.key && styles.miniChipActive]}>
                      <Text style={[styles.miniChipText, yogaStyle===ys.key && { color: Colors.primary }]}>{ys.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {!sport && (
              <View style={[styles.fieldRow, { justifyContent:'center' }]}>
                <Text style={[styles.fieldLabel, { color: Colors.textMuted }]}>Select a sport to see gear options</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Appearance ────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.card}>
          <Pressable style={styles.fieldRow} onPress={toggleTheme}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
              <Ionicons name={isDark ? 'moon-outline' : 'sunny-outline'} size={20} color={Colors.primary} />
              <Text style={styles.fieldLabel}>Dark Mode</Text>
            </View>
            <View style={[styles.toggleTrack, isDark && styles.toggleTrackActive]}>
              <View style={[styles.toggleThumb, isDark && styles.toggleThumbActive]} />
            </View>
          </Pressable>
        </View>

        {/* ── Reset ─────────────────────────────────────────────────────────── */}
        <Pressable style={[styles.resetBtn, showResetConfirm && styles.resetBtnConfirm]} onPress={handleReset}>
          <Ionicons name="refresh" size={16} color={Colors.error} />
          <Text style={styles.resetBtnText}>{showResetConfirm ? 'Tap again to confirm reset' : 'Reset All Data'}</Text>
        </Pressable>
        {showResetConfirm && (
          <Pressable onPress={() => setShowResetConfirm(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const createStyles = (C: any) => StyleSheet.create({
  container: { flex:1 },
  header: {
    flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    paddingHorizontal:20, paddingBottom:12,
    borderBottomWidth:1, borderBottomColor:C.border,
  },
  headerTitle: { fontSize:17, fontFamily:'Outfit_700Bold', color:C.text },
  saveText: { fontSize:15, fontFamily:'Outfit_600SemiBold', color:C.primary },

  avatarSection: { alignItems:'center', marginBottom:24 },
  avatar: { width:80, height:80, borderRadius:40, alignItems:'center', justifyContent:'center', marginBottom:12 },
  avatarEmoji: { fontSize:36 },
  profileName: { fontSize:22, fontFamily:'Outfit_700Bold', color:C.text, marginBottom:2 },
  profileSport: { fontSize:13, fontFamily:'Outfit_500Medium', color:C.textSecondary, textAlign:'center', marginBottom:2 },
  profileLevel: { fontSize:12, fontFamily:'Outfit_600SemiBold', color:C.primary+'CC', textAlign:'center' },

  sectionLabel: {
    fontSize:13, fontFamily:'Outfit_600SemiBold',
    color:C.textSecondary, marginBottom:8, marginTop:20,
    textTransform:'uppercase', letterSpacing:0.5,
  },
  card: { backgroundColor:C.surface, borderRadius:16, borderWidth:1, borderColor:C.border, overflow:'hidden' },
  divider: { height:1, backgroundColor:C.border, marginLeft:16 },
  fieldRow: {
    flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    paddingHorizontal:16, paddingVertical:14,
  },
  fieldLabel: { fontSize:15, fontFamily:'Outfit_500Medium', color:C.text },
  fieldInputRow: { flexDirection:'row', alignItems:'center', gap:6 },
  fieldInput: { fontSize:15, fontFamily:'Outfit_500Medium', color:C.primary, textAlign:'right', minWidth:60 },
  fieldUnit: { fontSize:13, fontFamily:'Outfit_600SemiBold', color:C.textMuted },
  radioEmpty: { width:20, height:20, borderRadius:10, borderWidth:2, borderColor:C.border },

  chipRow: { flexDirection:'row', gap:8, flexWrap:'wrap' },
  chip: {
    flexDirection:'row', alignItems:'center', gap:6,
    paddingHorizontal:14, paddingVertical:10, borderRadius:20,
    backgroundColor:C.surface, borderWidth:1, borderColor:C.border,
  },
  chipActive: { borderColor:C.primary, backgroundColor:C.primary+'14' },
  chipEmoji: { fontSize:16 },
  chipLabel: { fontSize:14, fontFamily:'Outfit_600SemiBold', color:C.textSecondary },
  chipLabelActive: { color:C.primary },

  handRow: { flexDirection:'row', gap:10 },
  handCard: {
    flex:1, alignItems:'center', paddingVertical:20,
    backgroundColor:C.surface, borderRadius:16, borderWidth:1, borderColor:C.border,
  },
  handCardActive: { borderColor:C.primary, backgroundColor:C.primary+'0A' },
  handEmoji: { fontSize:32, marginBottom:8 },
  handLabel: { fontSize:13, fontFamily:'Outfit_600SemiBold', color:C.textSecondary, textAlign:'center', lineHeight:19 },

  goalGrid: { flexDirection:'row', gap:10 },
  goalCard: {
    flex:1, alignItems:'center', gap:6, paddingVertical:16,
    backgroundColor:C.surface, borderRadius:14, borderWidth:1, borderColor:C.border,
    minWidth: 80,
  },
  goalCardActive: { borderColor:C.primary, backgroundColor:C.primary+'0A' },
  goalLabel: { fontSize:12, fontFamily:'Outfit_600SemiBold', color:C.textSecondary, textAlign:'center' },

  // Pro Mode
  proHeader: { marginTop:20, borderRadius:16, overflow:'hidden' },
  proHeaderInner: {
    flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    paddingHorizontal:16, paddingVertical:14,
    borderRadius:16, borderWidth:1, borderColor:C.primary+'30',
  },
  proHeaderTitle: { fontSize:15, fontFamily:'Outfit_700Bold', color:C.primary },
  proBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:8, backgroundColor:C.primary+'22' },
  proBadgeText: { fontSize:10, fontFamily:'Outfit_700Bold', color:C.primary, letterSpacing:0.8 },
  miniChip: {
    paddingHorizontal:12, paddingVertical:7, borderRadius:12,
    backgroundColor:C.surfaceLight, borderWidth:1, borderColor:C.border,
  },
  miniChipActive: { borderColor:C.primary, backgroundColor:C.primary+'14' },
  miniChipText: { fontSize:13, fontFamily:'Outfit_600SemiBold', color:C.textSecondary },

  // Appearance / Reset
  toggleTrack: { width:48, height:28, borderRadius:14, backgroundColor:C.border, justifyContent:'center', paddingHorizontal:3 },
  toggleTrackActive: { backgroundColor:C.primary },
  toggleThumb: { width:22, height:22, borderRadius:11, backgroundColor:'#fff', alignSelf:'flex-start' },
  toggleThumbActive: { alignSelf:'flex-end' },
  resetBtn: {
    flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8,
    marginTop:36, paddingVertical:14, borderRadius:12, borderWidth:1, borderColor:C.error,
  },
  resetBtnConfirm: { backgroundColor:'rgba(239,83,80,0.1)' },
  resetBtnText: { fontSize:15, fontFamily:'Outfit_600SemiBold', color:C.error },
  cancelText: { fontSize:14, fontFamily:'Outfit_500Medium', color:C.textSecondary, textAlign:'center', marginTop:12 },
});

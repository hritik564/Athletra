import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors, useTheme } from '@/contexts/ThemeContext';
import { useUser } from '@/contexts/UserContext';

const SPORTS = [
  { key: 'cricket',  label: 'Cricket',  emoji: '🏏' },
  { key: 'badminton',label: 'Badminton',emoji: '🏸' },
  { key: 'skating',  label: 'Skating',  emoji: '⛸️' },
  { key: 'yoga',     label: 'Yoga',     emoji: '🧘' },
];

const SKILL_LEVELS = [
  { key: 'beginner',     label: 'Beginner' },
  { key: 'intermediate', label: 'Club Player' },
  { key: 'advanced',     label: 'Semi-Pro' },
  { key: 'pro',          label: 'Professional' },
];

const GOALS = [
  { key: 'technique',  label: 'Technique',  icon: 'analytics' as const },
  { key: 'power',      label: 'Power',       icon: 'flash' as const },
  { key: 'weight_loss',label: 'Weight Loss', icon: 'flame' as const },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useColors();
  const { isDark, toggleTheme } = useTheme();
  const styles = createStyles(Colors);
  const { profile, updateProfile } = useUser();

  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(String(profile.age));
  const [heightCm, setHeightCm] = useState(String(Math.round(profile.heightCm || profile.height || 170)));
  const [weightKg, setWeightKg] = useState(String(profile.weightKg || profile.weight || 70));
  const [sport, setSport] = useState(profile.primarySport || profile.sport || '');
  const [leadHand, setLeadHand] = useState<'left' | 'right'>(profile.leadHand || 'right');
  const [skillLevel, setSkillLevel] = useState(profile.skillLevel || 'intermediate');
  const [fitnessGoal, setFitnessGoal] = useState(profile.fitnessGoal || 'technique');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const handleSave = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      skillLevel: skillLevel as any,
      fitnessGoal: fitnessGoal as any,
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
  const sportLabel = SPORTS.find(s => s.key === sport)?.label ?? 'Not set';

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
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
            <Text style={styles.avatarEmoji}>{sportEmoji}</Text>
          </LinearGradient>
          <Text style={styles.profileName}>{name || 'Athlete'}</Text>
          <Text style={styles.profileSport}>{sportLabel} · {SKILL_LEVELS.find(l => l.key === skillLevel)?.label ?? 'Intermediate'}</Text>
        </View>

        {/* Personal Info */}
        <Text style={styles.sectionLabel}>Personal Info</Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={name}
              onChangeText={t => setName(t.replace(/[^a-zA-Z\s'-]/g, '').slice(0, 30))}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Age</Text>
            <TextInput
              style={styles.fieldInput}
              value={age}
              onChangeText={t => {
                const d = t.replace(/[^0-9]/g, '');
                if (parseInt(d) > 100) setAge('100'); else setAge(d);
              }}
              keyboardType="number-pad"
              placeholderTextColor={Colors.textMuted}
              maxLength={3}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Height</Text>
            <View style={styles.fieldInputRow}>
              <TextInput
                style={styles.fieldInput}
                value={heightCm}
                onChangeText={t => {
                  const d = t.replace(/[^0-9]/g, '');
                  if (parseInt(d) > 250) setHeightCm('250'); else setHeightCm(d);
                }}
                keyboardType="number-pad"
                placeholderTextColor={Colors.textMuted}
                maxLength={3}
              />
              <Text style={styles.fieldUnit}>cm</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Weight</Text>
            <View style={styles.fieldInputRow}>
              <TextInput
                style={styles.fieldInput}
                value={String(weightKg)}
                onChangeText={t => {
                  const d = t.replace(/[^0-9.]/g, '');
                  if (parseFloat(d) > 180) setWeightKg('180'); else setWeightKg(d);
                }}
                keyboardType="decimal-pad"
                placeholderTextColor={Colors.textMuted}
                maxLength={6}
              />
              <Text style={styles.fieldUnit}>kg</Text>
            </View>
          </View>
        </View>

        {/* Sport */}
        <Text style={styles.sectionLabel}>Primary Sport</Text>
        <View style={styles.chipRow}>
          {SPORTS.map(s => (
            <Pressable
              key={s.key}
              onPress={() => { setSport(s.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[styles.chip, sport === s.key && styles.chipActive]}
            >
              <Text style={styles.chipEmoji}>{s.emoji}</Text>
              <Text style={[styles.chipLabel, sport === s.key && styles.chipLabelActive]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Lead Hand */}
        <Text style={styles.sectionLabel}>Dominant Hand</Text>
        <View style={styles.card}>
          <View style={styles.handRow}>
            {(['left', 'right'] as const).map(h => (
              <Pressable
                key={h}
                onPress={() => { setLeadHand(h); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[styles.handCard, leadHand === h && styles.handCardActive]}
              >
                <Text style={styles.handEmoji}>{h === 'left' ? '🤚' : '✋'}</Text>
                <Text style={[styles.handLabel, leadHand === h && { color: Colors.primary }]}>
                  {sport === 'cricket'
                    ? (h === 'left' ? 'Left-Handed\nBatsman' : 'Right-Handed\nBatsman')
                    : (h === 'left' ? 'Left\nDominant' : 'Right\nDominant')}
                </Text>
                {leadHand === h && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginTop: 6 }} />}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Skill Level */}
        <Text style={styles.sectionLabel}>Play Level</Text>
        <View style={styles.card}>
          {SKILL_LEVELS.map((l, i) => (
            <View key={l.key}>
              <Pressable
                onPress={() => { setSkillLevel(l.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={styles.fieldRow}
              >
                <Text style={[styles.fieldLabel, skillLevel === l.key && { color: Colors.primary }]}>{l.label}</Text>
                {skillLevel === l.key
                  ? <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                  : <View style={styles.radioEmpty} />}
              </Pressable>
              {i < SKILL_LEVELS.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        {/* Fitness Goal */}
        <Text style={styles.sectionLabel}>Primary Goal</Text>
        <View style={styles.goalRow}>
          {GOALS.map(g => (
            <Pressable
              key={g.key}
              onPress={() => { setFitnessGoal(g.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[styles.goalCard, fitnessGoal === g.key && styles.goalCardActive]}
            >
              <Ionicons name={g.icon} size={22} color={fitnessGoal === g.key ? Colors.primary : Colors.textMuted} />
              <Text style={[styles.goalLabel, fitnessGoal === g.key && { color: Colors.primary }]}>{g.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Appearance */}
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.card}>
          <Pressable style={styles.fieldRow} onPress={toggleTheme}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name={isDark ? 'moon-outline' : 'sunny-outline'} size={20} color={Colors.primary} />
              <Text style={styles.fieldLabel}>Dark Mode</Text>
            </View>
            <View style={[styles.toggleTrack, isDark && styles.toggleTrackActive]}>
              <View style={[styles.toggleThumb, isDark && styles.toggleThumbActive]} />
            </View>
          </Pressable>
        </View>

        {/* Reset */}
        <Pressable
          style={[styles.resetBtn, showResetConfirm && styles.resetBtnConfirm]}
          onPress={handleReset}
        >
          <Ionicons name="refresh" size={16} color={Colors.error} />
          <Text style={styles.resetBtnText}>
            {showResetConfirm ? 'Tap again to confirm reset' : 'Reset All Data'}
          </Text>
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

const createStyles = (C: any) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 17, fontFamily: 'Outfit_700Bold', color: C.text },
  saveText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: C.primary },
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarEmoji: { fontSize: 36 },
  profileName: { fontSize: 22, fontFamily: 'Outfit_700Bold', color: C.text, marginBottom: 4 },
  profileSport: { fontSize: 13, fontFamily: 'Outfit_500Medium', color: C.textSecondary },
  sectionLabel: {
    fontSize: 13, fontFamily: 'Outfit_600SemiBold',
    color: C.textSecondary, marginBottom: 8, marginTop: 20,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  card: {
    backgroundColor: C.surface, borderRadius: 16,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: C.border, marginLeft: 16 },
  fieldRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  fieldLabel: { fontSize: 15, fontFamily: 'Outfit_500Medium', color: C.text },
  fieldInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldInput: {
    fontSize: 15, fontFamily: 'Outfit_500Medium',
    color: C.primary, textAlign: 'right', minWidth: 60,
  },
  fieldUnit: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: C.textMuted },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  chipActive: { borderColor: C.primary, backgroundColor: C.primary + '14' },
  chipEmoji: { fontSize: 16 },
  chipLabel: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: C.textSecondary },
  chipLabelActive: { color: C.primary },
  handRow: { flexDirection: 'row' },
  handCard: {
    flex: 1, alignItems: 'center', paddingVertical: 20,
    borderWidth: 0,
  },
  handCardActive: { backgroundColor: C.primary + '0A' },
  handEmoji: { fontSize: 32, marginBottom: 8 },
  handLabel: {
    fontSize: 13, fontFamily: 'Outfit_600SemiBold',
    color: C.textSecondary, textAlign: 'center', lineHeight: 19,
  },
  radioEmpty: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: C.border,
  },
  goalRow: { flexDirection: 'row', gap: 10 },
  goalCard: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: 16,
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
  },
  goalCardActive: { borderColor: C.primary, backgroundColor: C.primary + '0A' },
  goalLabel: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', color: C.textSecondary, textAlign: 'center' },
  toggleTrack: { width: 48, height: 28, borderRadius: 14, backgroundColor: C.border, justifyContent: 'center', paddingHorizontal: 3 },
  toggleTrackActive: { backgroundColor: C.primary },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: 'flex-start' },
  toggleThumbActive: { alignSelf: 'flex-end' },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 36, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: C.error,
  },
  resetBtnConfirm: { backgroundColor: 'rgba(239,83,80,0.1)' },
  resetBtnText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: C.error },
  cancelText: { fontSize: 14, fontFamily: 'Outfit_500Medium', color: C.textSecondary, textAlign: 'center', marginTop: 12 },
});

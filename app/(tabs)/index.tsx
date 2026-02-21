import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useUser } from '@/contexts/UserContext';
import { useFitness } from '@/contexts/FitnessContext';
import Svg, { Circle } from 'react-native-svg';

function CalorieRing({ consumed, target, size = 160 }: { consumed: number; target: number; size?: number }) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(consumed / target, 1);
  const strokeDashoffset = circumference * (1 - progress);
  const remaining = Math.max(target - consumed, 0);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={Colors.surfaceLight} strokeWidth={strokeWidth} fill="none"
        />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={Colors.calorieRing} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.ringNumber}>{remaining}</Text>
      <Text style={styles.ringLabel}>remaining</Text>
    </View>
  );
}

function MacroBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const progress = Math.min(value / max, 1);
  return (
    <View style={styles.macroItem}>
      <View style={styles.macroHeader}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>{Math.round(value)}g</Text>
      </View>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { width: `${progress * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function QuickAction({ icon, label, onPress, gradient }: { icon: string; label: string; onPress: () => void; gradient: string[] }) {
  return (
    <Pressable style={styles.quickAction} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}>
      <LinearGradient colors={gradient as [string, string]} style={styles.quickActionIcon}>
        <Ionicons name={icon as any} size={22} color="#fff" />
      </LinearGradient>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useUser();
  const { todayData, totalCaloriesConsumed, totalCaloriesBurned, macros, streak, addWater, removeWater } = useFitness();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const waterTarget = 8;
  const waterProgress = Math.min(todayData.waterGlasses / waterTarget, 1);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: Colors.background }]}
      contentContainerStyle={{ paddingTop: (insets.top || webTopInset) + 16, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting},</Text>
          <Text style={styles.userName}>{profile.name || 'Friend'}</Text>
        </View>
        <Pressable onPress={() => router.push('/profile')} style={styles.avatarButton}>
          <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
            <Ionicons name="person" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>

      {streak.currentStreak > 0 && (
        <View style={styles.streakBanner}>
          <Ionicons name="flame" size={20} color={Colors.warning} />
          <Text style={styles.streakText}>{streak.currentStreak} day streak</Text>
          <Ionicons name="flame" size={20} color={Colors.warning} />
        </View>
      )}

      <View style={styles.calorieCard}>
        <LinearGradient colors={[Colors.surface, Colors.surfaceLight]} style={styles.calorieCardInner}>
          <CalorieRing consumed={totalCaloriesConsumed} target={profile.calorieTarget} />
          <View style={styles.calorieStats}>
            <View style={styles.calorieStat}>
              <Ionicons name="add-circle" size={18} color={Colors.primary} />
              <Text style={styles.calorieStatValue}>{totalCaloriesConsumed}</Text>
              <Text style={styles.calorieStatLabel}>eaten</Text>
            </View>
            <View style={styles.calorieStat}>
              <Ionicons name="flame" size={18} color={Colors.error} />
              <Text style={styles.calorieStatValue}>{totalCaloriesBurned}</Text>
              <Text style={styles.calorieStatLabel}>burned</Text>
            </View>
            <View style={styles.calorieStat}>
              <Ionicons name="flag" size={18} color={Colors.accent} />
              <Text style={styles.calorieStatValue}>{profile.calorieTarget}</Text>
              <Text style={styles.calorieStatLabel}>target</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.macroSection}>
        <Text style={styles.sectionTitle}>Macros</Text>
        <View style={styles.macroContainer}>
          <MacroBar label="Protein" value={macros.protein} max={Math.round(profile.calorieTarget * 0.3 / 4)} color={Colors.proteinRing} />
          <MacroBar label="Carbs" value={macros.carbs} max={Math.round(profile.calorieTarget * 0.45 / 4)} color={Colors.carbsRing} />
          <MacroBar label="Fat" value={macros.fat} max={Math.round(profile.calorieTarget * 0.25 / 9)} color={Colors.fatRing} />
        </View>
      </View>

      <View style={styles.waterSection}>
        <View style={styles.waterHeader}>
          <Text style={styles.sectionTitle}>Water</Text>
          <Text style={styles.waterCount}>{todayData.waterGlasses}/{waterTarget} glasses</Text>
        </View>
        <View style={styles.waterRow}>
          <View style={styles.waterTrackOuter}>
            <View style={[styles.waterTrackFill, { width: `${waterProgress * 100}%` }]} />
          </View>
          <View style={styles.waterButtons}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); removeWater(); }}
              style={styles.waterBtn}
            >
              <Ionicons name="remove" size={20} color={Colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); addWater(); }}
              style={styles.waterBtnAdd}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickActionsRow}>
        <QuickAction icon="restaurant" label="Log Meal" onPress={() => router.push('/(tabs)/meals')} gradient={[Colors.primary, Colors.primaryDark]} />
        <QuickAction icon="barbell" label="Workout" onPress={() => router.push('/(tabs)/coach')} gradient={[Colors.accent, Colors.accentDark]} />
        <QuickAction icon="chatbubble" label="Ask Coach" onPress={() => router.push('/(tabs)/coach')} gradient={['#7C4DFF', '#651FFF']} />
        <QuickAction icon="analytics" label="Progress" onPress={() => router.push('/(tabs)/progress')} gradient={[Colors.warning, '#F57C00']} />
      </View>

      {todayData.workouts.length > 0 && (
        <View style={styles.workoutSection}>
          <Text style={styles.sectionTitle}>Today's Workouts</Text>
          {todayData.workouts.map((w) => (
            <View key={w.id} style={[styles.workoutCard, w.completed && styles.workoutCardDone]}>
              <View style={styles.workoutInfo}>
                <Text style={styles.workoutName}>{w.name}</Text>
                <Text style={styles.workoutMeta}>{w.duration} min  |  {w.calories_burned} kcal</Text>
              </View>
              {w.completed ? (
                <Ionicons name="checkmark-circle" size={28} color={Colors.success} />
              ) : (
                <Ionicons name="ellipse-outline" size={28} color={Colors.textMuted} />
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
  greeting: { fontSize: 14, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary },
  userName: { fontSize: 24, fontFamily: 'Outfit_700Bold', color: Colors.text },
  avatarButton: {},
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  streakBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, marginHorizontal: 20, marginBottom: 16, backgroundColor: 'rgba(255,183,77,0.1)', borderRadius: 12 },
  streakText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: Colors.warning },
  calorieCard: { marginHorizontal: 20, marginBottom: 20 },
  calorieCardInner: { borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  ringNumber: { fontSize: 32, fontFamily: 'Outfit_700Bold', color: Colors.text },
  ringLabel: { fontSize: 12, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary, marginTop: -2 },
  calorieStats: { flexDirection: 'row', gap: 24, marginTop: 16 },
  calorieStat: { alignItems: 'center', gap: 2 },
  calorieStatValue: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: Colors.text },
  calorieStatLabel: { fontSize: 11, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary },
  sectionTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: Colors.text, paddingHorizontal: 20, marginBottom: 12 },
  macroSection: { marginBottom: 20 },
  macroContainer: { paddingHorizontal: 20, gap: 12 },
  macroItem: {},
  macroHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  macroLabel: { fontSize: 13, fontFamily: 'Outfit_500Medium', color: Colors.textSecondary },
  macroValue: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: Colors.text },
  macroTrack: { height: 6, backgroundColor: Colors.surfaceLight, borderRadius: 3, overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: 3 },
  waterSection: { paddingHorizontal: 20, marginBottom: 24 },
  waterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  waterCount: { fontSize: 14, fontFamily: 'Outfit_500Medium', color: Colors.waterRing },
  waterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  waterTrackOuter: { flex: 1, height: 10, backgroundColor: Colors.surfaceLight, borderRadius: 5, overflow: 'hidden' },
  waterTrackFill: { height: '100%', backgroundColor: Colors.waterRing, borderRadius: 5 },
  waterButtons: { flexDirection: 'row', gap: 6 },
  waterBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
  waterBtnAdd: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.waterRing, alignItems: 'center', justifyContent: 'center' },
  quickActionsRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginBottom: 24 },
  quickAction: { flex: 1, alignItems: 'center', gap: 6 },
  quickActionIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel: { fontSize: 11, fontFamily: 'Outfit_500Medium', color: Colors.textSecondary },
  workoutSection: { marginBottom: 20 },
  workoutCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, padding: 16, backgroundColor: Colors.surface, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  workoutCardDone: { borderColor: Colors.success, backgroundColor: 'rgba(76,175,80,0.06)' },
  workoutInfo: { flex: 1 },
  workoutName: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: Colors.text },
  workoutMeta: { fontSize: 13, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary, marginTop: 2 },
});

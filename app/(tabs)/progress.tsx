import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useFitness } from '@/contexts/FitnessContext';
import { useUser } from '@/contexts/UserContext';
import Svg, { Polyline, Line, Circle as SvgCircle, Text as SvgText } from 'react-native-svg';

function WeightChart({ data }: { data: { date: string; weight: number }[] }) {
  if (data.length < 2) {
    return (
      <View style={styles.chartEmpty}>
        <Ionicons name="analytics-outline" size={40} color={Colors.textMuted} />
        <Text style={styles.chartEmptyText}>Log your weight daily to see trends</Text>
      </View>
    );
  }

  const chartW = 320;
  const chartH = 160;
  const padding = 30;
  const innerW = chartW - padding * 2;
  const innerH = chartH - padding * 2;

  const weights = data.map(d => d.weight);
  const minW = Math.min(...weights) - 2;
  const maxW = Math.max(...weights) + 2;
  const range = maxW - minW || 1;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * innerW;
    const y = padding + (1 - (d.weight - minW) / range) * innerH;
    return { x, y, weight: d.weight, date: d.date };
  });

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <View style={styles.chartContainer}>
      <Svg width={chartW} height={chartH}>
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = padding + pct * innerH;
          const val = Math.round(maxW - pct * range);
          return (
            <View key={i}>
              <Line x1={padding} y1={y} x2={chartW - padding} y2={y} stroke={Colors.surfaceLight} strokeWidth={1} />
              <SvgText x={padding - 4} y={y + 4} fill={Colors.textMuted} fontSize={10} textAnchor="end">
                {val}
              </SvgText>
            </View>
          );
        })}
        <Polyline points={polylinePoints} fill="none" stroke={Colors.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <SvgCircle key={i} cx={p.x} cy={p.y} r={4} fill={Colors.accent} stroke={Colors.background} strokeWidth={2} />
        ))}
      </Svg>
    </View>
  );
}

function StatCard({ icon, label, value, color, subtitle }: { icon: string; label: string; value: string; color: string; subtitle?: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconBg, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {subtitle && <Text style={styles.statSub}>{subtitle}</Text>}
    </View>
  );
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { weightHistory, logWeight, streak, totalCaloriesConsumed, totalCaloriesBurned } = useFitness();
  const { profile } = useUser();
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightInput, setWeightInput] = useState(String(profile.weight));

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const handleLogWeight = async () => {
    const w = parseFloat(weightInput);
    if (w > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await logWeight(w);
      setShowWeightModal(false);
    }
  };

  const latestWeight = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1].weight : profile.weight;
  const startWeight = weightHistory.length > 0 ? weightHistory[0].weight : profile.weight;
  const weightChange = latestWeight - startWeight;

  const goalLabels: Record<string, string> = {
    lose_weight: 'Weight Loss',
    build_muscle: 'Muscle Building',
    stay_fit: 'Staying Fit',
    gain_energy: 'Energy Boost',
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: Colors.background }]}
      contentContainerStyle={{ paddingTop: (insets.top || webTopInset) + 16, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>Progress</Text>
        <Pressable
          style={styles.logWeightBtn}
          onPress={() => { setShowWeightModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Ionicons name="add" size={18} color={Colors.primary} />
          <Text style={styles.logWeightText}>Log Weight</Text>
        </Pressable>
      </View>

      <View style={styles.statsGrid}>
        <StatCard
          icon="flame"
          label="Streak"
          value={`${streak.currentStreak}`}
          color={Colors.warning}
          subtitle={`Best: ${streak.longestStreak} days`}
        />
        <StatCard
          icon="scale"
          label="Current"
          value={`${latestWeight} kg`}
          color={Colors.accent}
          subtitle={weightChange !== 0 ? `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg` : undefined}
        />
        <StatCard
          icon="restaurant"
          label="Today"
          value={`${totalCaloriesConsumed}`}
          color={Colors.primary}
          subtitle="kcal eaten"
        />
        <StatCard
          icon="barbell"
          label="Burned"
          value={`${totalCaloriesBurned}`}
          color={Colors.error}
          subtitle="kcal today"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Weight Trend</Text>
        <View style={styles.chartCard}>
          <WeightChart data={weightHistory.slice(-14)} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Journey</Text>
        <View style={styles.journeyCard}>
          <LinearGradient colors={[Colors.surface, Colors.surfaceLight]} style={styles.journeyContent}>
            <View style={styles.journeyRow}>
              <View style={[styles.journeyDot, { backgroundColor: Colors.accent }]} />
              <View style={styles.journeyInfo}>
                <Text style={styles.journeyLabel}>Goal</Text>
                <Text style={styles.journeyValue}>{goalLabels[profile.goal] || profile.goal}</Text>
              </View>
            </View>
            <View style={styles.journeyRow}>
              <View style={[styles.journeyDot, { backgroundColor: Colors.primary }]} />
              <View style={styles.journeyInfo}>
                <Text style={styles.journeyLabel}>Daily Target</Text>
                <Text style={styles.journeyValue}>{profile.calorieTarget} kcal</Text>
              </View>
            </View>
            <View style={styles.journeyRow}>
              <View style={[styles.journeyDot, { backgroundColor: Colors.warning }]} />
              <View style={styles.journeyInfo}>
                <Text style={styles.journeyLabel}>Activity</Text>
                <Text style={styles.journeyValue}>{profile.activityLevel.replace('_', ' ')}</Text>
              </View>
            </View>
          </LinearGradient>
        </View>
      </View>

      {streak.currentStreak >= 3 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Achievements</Text>
          <View style={styles.achievementRow}>
            {streak.currentStreak >= 3 && (
              <View style={styles.achievementBadge}>
                <LinearGradient colors={[Colors.warning, '#F57C00']} style={styles.achievementIcon}>
                  <Ionicons name="flame" size={24} color="#fff" />
                </LinearGradient>
                <Text style={styles.achievementLabel}>3-Day Streak</Text>
              </View>
            )}
            {streak.currentStreak >= 7 && (
              <View style={styles.achievementBadge}>
                <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.achievementIcon}>
                  <Ionicons name="star" size={24} color="#fff" />
                </LinearGradient>
                <Text style={styles.achievementLabel}>Week Warrior</Text>
              </View>
            )}
            {streak.longestStreak >= 14 && (
              <View style={styles.achievementBadge}>
                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.achievementIcon}>
                  <Ionicons name="trophy" size={24} color="#fff" />
                </LinearGradient>
                <Text style={styles.achievementLabel}>2-Week Pro</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <Modal visible={showWeightModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Weight</Text>
              <Pressable onPress={() => setShowWeightModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            <TextInput
              style={styles.weightInput}
              placeholder="Weight in kg"
              placeholderTextColor={Colors.textMuted}
              value={weightInput}
              onChangeText={setWeightInput}
              keyboardType="decimal-pad"
              autoFocus
            />
            <Pressable style={styles.saveBtn} onPress={handleLogWeight}>
              <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.saveBtnGradient}>
                <Text style={styles.saveBtnText}>Save</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  screenTitle: { fontSize: 28, fontFamily: 'Outfit_700Bold', color: Colors.text },
  logWeightBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  logWeightText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: Colors.primary },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 12, marginBottom: 24 },
  statCard: {
    width: '47%', backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  statIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 22, fontFamily: 'Outfit_700Bold', color: Colors.text },
  statLabel: { fontSize: 13, fontFamily: 'Outfit_500Medium', color: Colors.textSecondary, marginTop: 2 },
  statSub: { fontSize: 11, fontFamily: 'Outfit_400Regular', color: Colors.textMuted, marginTop: 2 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: Colors.text, paddingHorizontal: 20, marginBottom: 12 },
  chartCard: { marginHorizontal: 20, backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  chartContainer: { alignItems: 'center' },
  chartEmpty: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  chartEmptyText: { fontSize: 14, fontFamily: 'Outfit_400Regular', color: Colors.textMuted },
  journeyCard: { marginHorizontal: 20 },
  journeyContent: { borderRadius: 16, padding: 16, gap: 16, borderWidth: 1, borderColor: Colors.border },
  journeyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  journeyDot: { width: 10, height: 10, borderRadius: 5 },
  journeyInfo: {},
  journeyLabel: { fontSize: 12, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary },
  journeyValue: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: Colors.text, textTransform: 'capitalize' },
  achievementRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 12 },
  achievementBadge: { alignItems: 'center', gap: 6 },
  achievementIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  achievementLabel: { fontSize: 11, fontFamily: 'Outfit_500Medium', color: Colors.textSecondary },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: Colors.text },
  weightInput: {
    height: 56, backgroundColor: Colors.surfaceLight, borderRadius: 14, paddingHorizontal: 16,
    color: Colors.text, fontSize: 24, fontFamily: 'Outfit_700Bold', textAlign: 'center',
    marginBottom: 16, borderWidth: 1, borderColor: Colors.border,
  },
  saveBtn: {},
  saveBtnGradient: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#fff' },
});

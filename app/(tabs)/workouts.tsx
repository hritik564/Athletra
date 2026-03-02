import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/contexts/ThemeContext';
import { useFitness, Workout, WorkoutExercise } from '@/contexts/FitnessContext';

function ExerciseRow({ exercise, onToggle }: { exercise: WorkoutExercise; onToggle: () => void }) {
  const Colors = useColors();
  const styles = createStyles(Colors);
  return (
    <Pressable style={styles.exerciseRow} onPress={onToggle}>
      <View style={[styles.exerciseCheck, exercise.completed && styles.exerciseCheckDone]}>
        {exercise.completed && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <View style={styles.exerciseInfo}>
        <Text style={[styles.exerciseName, exercise.completed && styles.exerciseNameDone]}>
          {exercise.name}
        </Text>
        <Text style={styles.exerciseDetail}>
          {exercise.sets} sets x {exercise.reps} reps
          {exercise.rest_seconds > 0 ? ` · ${exercise.rest_seconds}s rest` : ''}
        </Text>
        {exercise.description ? (
          <Text style={styles.exerciseDesc}>{exercise.description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function WorkoutCard({
  workout,
  onComplete,
  onToggleExercise,
  onRemove,
}: {
  workout: Workout;
  onComplete: () => void;
  onToggleExercise: (exerciseIndex: number) => void;
  onRemove: () => void;
}) {
  const Colors = useColors();
  const styles = createStyles(Colors);
  const [expanded, setExpanded] = useState(false);
  const completedCount = workout.exercises.filter(e => e.completed).length;
  const totalCount = workout.exercises.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  return (
    <View style={[styles.workoutCard, workout.completed && styles.workoutCardCompleted]}>
      <Pressable
        style={styles.workoutHeader}
        onPress={() => {
          setExpanded(!expanded);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
      >
        <View style={styles.workoutHeaderLeft}>
          <View style={[styles.workoutIcon, workout.completed && styles.workoutIconDone]}>
            <Ionicons
              name={workout.completed ? 'checkmark-circle' : 'barbell-outline'}
              size={20}
              color={workout.completed ? Colors.success : Colors.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.workoutName}>{workout.name}</Text>
            <Text style={styles.workoutMeta}>
              {workout.duration} min · ~{workout.calories_burned} kcal · {totalCount} exercises
            </Text>
          </View>
        </View>
        <View style={styles.workoutHeaderRight}>
          {workout.completed ? (
            <View style={styles.completedBadge}>
              <Text style={styles.completedBadgeText}>Done</Text>
            </View>
          ) : (
            <Text style={styles.progressText}>{completedCount}/{totalCount}</Text>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.textMuted}
          />
        </View>
      </Pressable>

      {!workout.completed && totalCount > 0 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      )}

      {expanded && (
        <View style={styles.exerciseList}>
          {workout.exercises.map((exercise, i) => (
            <ExerciseRow
              key={`${workout.id}-ex-${i}`}
              exercise={exercise}
              onToggle={() => {
                if (!workout.completed) {
                  onToggleExercise(i);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
              }}
            />
          ))}
          <View style={styles.cardActions}>
            {!workout.completed && (
              <Pressable style={styles.completeBtn} onPress={onComplete}>
                <LinearGradient colors={[Colors.success, '#388E3C']} style={styles.completeBtnGradient}>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.completeBtnText}>Complete Workout</Text>
                </LinearGradient>
              </Pressable>
            )}
            <Pressable
              style={styles.removeBtn}
              onPress={() => {
                Alert.alert('Remove Workout', 'Are you sure you want to remove this workout?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: onRemove },
                ]);
              }}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
              <Text style={styles.removeBtnText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

export default function WorkoutsScreen() {
  const Colors = useColors();
  const styles = createStyles(Colors);
  const insets = useSafeAreaInsets();
  const { todayData, completeWorkout, removeWorkout, toggleExercise } = useFitness();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const workouts = todayData.workouts;
  const completedCount = workouts.filter(w => w.completed).length;
  const totalBurned = workouts.filter(w => w.completed).reduce((s, w) => s + w.calories_burned, 0);

  const handleCompleteWorkout = useCallback(async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await completeWorkout(id);
  }, [completeWorkout]);

  const handleRemoveWorkout = useCallback(async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await removeWorkout(id);
  }, [removeWorkout]);

  const renderWorkout = useCallback(({ item }: { item: Workout }) => (
    <WorkoutCard
      workout={item}
      onComplete={() => handleCompleteWorkout(item.id)}
      onToggleExercise={(i) => toggleExercise(item.id, i)}
      onRemove={() => handleRemoveWorkout(item.id)}
    />
  ), [handleCompleteWorkout, toggleExercise, handleRemoveWorkout]);

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={[styles.headerArea, { paddingTop: (insets.top || webTopInset) + 12 }]}>
        <Text style={styles.screenTitle}>Workouts</Text>
        <View style={styles.statsBadge}>
          <Text style={styles.statsValue}>{totalBurned}</Text>
          <Text style={styles.statsLabel}>kcal burned</Text>
        </View>
      </View>

      {workouts.length > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{workouts.length}</Text>
            <Text style={styles.summaryLabel}>Plans</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNumber, { color: Colors.success }]}>{completedCount}</Text>
            <Text style={styles.summaryLabel}>Done</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNumber, { color: Colors.primary }]}>{workouts.length - completedCount}</Text>
            <Text style={styles.summaryLabel}>Remaining</Text>
          </View>
        </View>
      )}

      {workouts.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="barbell-outline" size={48} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No Workout Plans</Text>
          <Text style={styles.emptySubtitle}>
            Ask your AI Coach to create a workout plan, then tap "Save to Workouts" to see it here and track your progress.
          </Text>
          <Pressable style={styles.goToCoachBtn} onPress={() => router.push('/(tabs)/coach')}>
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.goToCoachGradient}>
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.goToCoachText}>Ask Coach for a Plan</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={(item) => item.id}
          renderItem={renderWorkout}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!workouts.length}
        />
      )}
    </View>
  );
}

const createStyles = (C: any) => StyleSheet.create({
  container: { flex: 1 },
  headerArea: {
    paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  screenTitle: { fontSize: 28, fontFamily: 'Outfit_700Bold', color: C.text },
  statsBadge: {
    alignItems: 'center', backgroundColor: C.surface,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12,
  },
  statsValue: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: C.accent },
  statsLabel: { fontSize: 10, fontFamily: 'Outfit_400Regular', color: C.textSecondary },
  summaryBar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 16, paddingVertical: 12,
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
  },
  summaryItem: { alignItems: 'center' },
  summaryNumber: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: C.text },
  summaryLabel: { fontSize: 11, fontFamily: 'Outfit_400Regular', color: C.textSecondary },
  summaryDivider: { width: 1, height: 28, backgroundColor: C.border },
  workoutCard: {
    backgroundColor: C.surface, borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  workoutCardCompleted: { borderColor: C.success + '4D' },
  workoutHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16,
  },
  workoutHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  workoutIcon: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: C.primary + '1F',
    alignItems: 'center', justifyContent: 'center',
  },
  workoutIconDone: { backgroundColor: C.success + '1F' },
  workoutName: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: C.text },
  workoutMeta: { fontSize: 12, fontFamily: 'Outfit_400Regular', color: C.textSecondary, marginTop: 2 },
  workoutHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: C.textSecondary },
  completedBadge: {
    backgroundColor: C.success + '26', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 8,
  },
  completedBadgeText: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', color: C.success },
  progressBar: {
    height: 3, backgroundColor: C.surfaceLight, marginHorizontal: 16,
  },
  progressFill: {
    height: 3, backgroundColor: C.primary, borderRadius: 2,
  },
  exerciseList: { paddingHorizontal: 16, paddingBottom: 16 },
  exerciseRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  exerciseCheck: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: C.textMuted, alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  exerciseCheckDone: { backgroundColor: C.success, borderColor: C.success },
  exerciseInfo: { flex: 1 },
  exerciseName: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: C.text },
  exerciseNameDone: { textDecorationLine: 'line-through', color: C.textMuted },
  exerciseDetail: { fontSize: 12, fontFamily: 'Outfit_400Regular', color: C.textSecondary, marginTop: 2 },
  exerciseDesc: { fontSize: 11, fontFamily: 'Outfit_400Regular', color: C.textMuted, marginTop: 2, fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  completeBtn: { flex: 1 },
  completeBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 42, borderRadius: 12,
  },
  completeBtnText: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: '#fff' },
  removeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, height: 42, borderRadius: 12,
    borderWidth: 1, borderColor: C.error + '4D',
  },
  removeBtnText: { fontSize: 13, fontFamily: 'Outfit_500Medium', color: C.error },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: C.text, marginBottom: 8 },
  emptySubtitle: {
    fontSize: 14, fontFamily: 'Outfit_400Regular', color: C.textSecondary,
    textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },
  goToCoachBtn: { width: '100%' },
  goToCoachGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 50, borderRadius: 14,
  },
  goToCoachText: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#fff' },
});

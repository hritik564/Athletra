import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Animated, Dimensions, Platform,
  Switch, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@/contexts/UserContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const TOTAL_STEPS = 7;

const GOALS = [
  { key: 'lose_weight', label: 'Lose Weight', icon: 'flame' as const },
  { key: 'build_muscle', label: 'Build Muscle', icon: 'barbell' as const },
  { key: 'stay_fit', label: 'Stay Fit', icon: 'heart' as const },
  { key: 'gain_energy', label: 'Boost Energy', icon: 'flash' as const },
];

const HEALTH_CONDITIONS = [
  { key: 'diabetes', label: 'Diabetes', icon: 'water' as const },
  { key: 'hypertension', label: 'Hypertension', icon: 'pulse' as const },
  { key: 'high_cholesterol', label: 'High Cholesterol', icon: 'analytics' as const },
  { key: 'food_allergies', label: 'Food Allergies', icon: 'alert-circle' as const },
];

const FITNESS_LEVELS = [
  { key: 'beginner', label: 'Beginner', desc: 'New to fitness or returning' },
  { key: 'intermediate', label: 'Intermediate', desc: 'Regular exercise 3-5x/week' },
  { key: 'advanced', label: 'Advanced', desc: 'Intense training 5-7x/week' },
];

const ENVIRONMENTS = [
  { key: 'gym', label: 'Gym', icon: 'barbell' as const },
  { key: 'home', label: 'Home', icon: 'home' as const },
  { key: 'outdoors', label: 'Outdoors', icon: 'leaf' as const },
  { key: 'mixed', label: 'Mixed', icon: 'shuffle' as const },
];

const DIETARY_PREFS = [
  { key: 'none', label: 'No Preference' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'keto', label: 'Keto' },
  { key: 'paleo', label: 'Paleo' },
  { key: 'gluten_free', label: 'Gluten Free' },
];

const SPORTS = [
  'Running', 'Swimming', 'Cycling', 'Football', 'Basketball', 'Tennis',
  'MMA / Boxing', 'CrossFit', 'Weightlifting', 'Yoga', 'Cricket', 'Other',
];

const ATHLETE_LEVELS = [
  { key: 'recreational', label: 'Recreational' },
  { key: 'amateur', label: 'Amateur / Club' },
  { key: 'semi_pro', label: 'Semi-Pro' },
  { key: 'professional', label: 'Professional' },
];

function calculateCalories(weight: number, height: number, age: number, activityLevel: string, goal: string): number {
  const bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  const multipliers: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  const tdee = bmr * (multipliers[activityLevel] || 1.55);
  if (goal === 'lose_weight') return Math.round(tdee - 500);
  if (goal === 'build_muscle') return Math.round(tdee + 300);
  return Math.round(tdee);
}

export default function OnboardingScreen() {
  const { profile, updateProfile, isLoading } = useUser();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [age, setAge] = useState('25');
  const [weight, setWeight] = useState('70');
  const [height, setHeight] = useState('170');

  const [goal, setGoal] = useState('stay_fit');
  const [calorieTarget, setCalorieTarget] = useState('');

  const [isAthlete, setIsAthlete] = useState(false);
  const [sport, setSport] = useState('');
  const [athleteLevel, setAthleteLevel] = useState('recreational');

  const [healthConditions, setHealthConditions] = useState<string[]>([]);
  const [healthDetails, setHealthDetails] = useState('');
  const [allergies, setAllergies] = useState('');

  const [fitnessLevel, setFitnessLevel] = useState('intermediate');
  const [dailyPattern, setDailyPattern] = useState('');

  const [workoutEnvironment, setWorkoutEnvironment] = useState('home');
  const [dietaryPreference, setDietaryPreference] = useState('none');

  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isLoading && profile.onboarded) {
      router.replace('/(tabs)');
    }
  }, [isLoading, profile.onboarded]);

  if (isLoading) return <View style={[styles.container, { backgroundColor: Colors.background }]} />;
  if (profile.onboarded) return null;

  const animateStep = (next: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(next);
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  };

  const toggleCondition = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHealthConditions(prev =>
      prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
    );
  };

  const handleComplete = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const computedCalories = calculateCalories(
      parseFloat(weight) || 70,
      parseFloat(height) || 170,
      parseInt(age) || 25,
      fitnessLevel === 'beginner' ? 'light' : fitnessLevel === 'advanced' ? 'active' : 'moderate',
      goal,
    );
    const finalCalories = calorieTarget ? parseInt(calorieTarget) : computedCalories;

    await updateProfile({
      name: name || 'Friend',
      age: parseInt(age) || 25,
      weight: parseFloat(weight) || 70,
      height: parseFloat(height) || 170,
      goal: goal as any,
      activityLevel: fitnessLevel === 'beginner' ? 'light' : fitnessLevel === 'advanced' ? 'active' : 'moderate' as any,
      fitnessLevel: fitnessLevel as any,
      calorieTarget: finalCalories,
      isAthlete,
      sport: isAthlete ? sport : '',
      athleteLevel: isAthlete ? athleteLevel : '',
      healthConditions,
      healthDetails,
      allergies,
      dailyPattern,
      workoutEnvironment: workoutEnvironment as any,
      dietaryPreference: dietaryPreference as any,
      onboarded: true,
    });
    router.replace('/(tabs)');
  };

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconContainer}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.iconBg}>
                <Ionicons name="person" size={40} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Let's get to know you</Text>
            <Text style={styles.stepSubtitle}>Your coach wants to know who they're working with</Text>
            <View style={styles.fieldContainer}>
              <Text style={styles.inputLabel}>Your Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoFocus
              />
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Age</Text>
                <TextInput
                  style={styles.input}
                  placeholder="25"
                  placeholderTextColor={Colors.textMuted}
                  value={age}
                  onChangeText={setAge}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Weight (kg)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="70"
                  placeholderTextColor={Colors.textMuted}
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Height (cm)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="170"
                  placeholderTextColor={Colors.textMuted}
                  value={height}
                  onChangeText={setHeight}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>
        );

      case 1:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconContainer}>
              <LinearGradient colors={[Colors.primary, Colors.accent]} style={styles.iconBg}>
                <Ionicons name="trophy" size={40} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>What's your goal?</Text>
            <Text style={styles.stepSubtitle}>This shapes your entire plan</Text>
            <View style={styles.optionsGrid}>
              {GOALS.map((g) => (
                <Pressable
                  key={g.key}
                  style={[styles.optionCard, goal === g.key && styles.optionCardActive]}
                  onPress={() => { setGoal(g.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Ionicons
                    name={g.icon}
                    size={28}
                    color={goal === g.key ? Colors.primary : Colors.textSecondary}
                  />
                  <Text style={[styles.optionLabel, goal === g.key && styles.optionLabelActive]}>
                    {g.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.fieldContainer, { marginTop: 20 }]}>
              <Text style={styles.inputLabel}>Daily Calorie Target (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Auto-calculated if left blank"
                placeholderTextColor={Colors.textMuted}
                value={calorieTarget}
                onChangeText={setCalorieTarget}
                keyboardType="number-pad"
              />
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconContainer}>
              <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.iconBg}>
                <Ionicons name="medal" size={40} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Are you an athlete?</Text>
            <Text style={styles.stepSubtitle}>We'll tailor training for your sport</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>I train for a sport</Text>
              <Switch
                value={isAthlete}
                onValueChange={(v) => { setIsAthlete(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                trackColor={{ false: Colors.surfaceLight, true: Colors.accent }}
                thumbColor="#fff"
              />
            </View>
            {isAthlete && (
              <>
                <Text style={[styles.inputLabel, { alignSelf: 'flex-start', marginBottom: 8, marginTop: 12 }]}>Your Sport</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
                  {SPORTS.map((s) => (
                    <Pressable
                      key={s}
                      style={[styles.chip, sport === s && styles.chipActive]}
                      onPress={() => { setSport(s); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      <Text style={[styles.chipText, sport === s && styles.chipTextActive]}>{s}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={[styles.inputLabel, { alignSelf: 'flex-start', marginBottom: 8, marginTop: 16 }]}>Level</Text>
                {ATHLETE_LEVELS.map((l) => (
                  <Pressable
                    key={l.key}
                    style={[styles.listOption, athleteLevel === l.key && styles.listOptionActive]}
                    onPress={() => { setAthleteLevel(l.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Text style={[styles.listOptionLabel, athleteLevel === l.key && styles.listOptionLabelActive]}>{l.label}</Text>
                    {athleteLevel === l.key && <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />}
                  </Pressable>
                ))}
              </>
            )}
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconContainer}>
              <LinearGradient colors={['#EF5350', '#E53935']} style={styles.iconBg}>
                <Ionicons name="medkit" size={40} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Health conditions</Text>
            <Text style={styles.stepSubtitle}>So we can keep you safe and supported</Text>
            <View style={styles.optionsGrid}>
              {HEALTH_CONDITIONS.map((c) => (
                <Pressable
                  key={c.key}
                  style={[styles.optionCard, healthConditions.includes(c.key) && styles.optionCardActiveAccent]}
                  onPress={() => toggleCondition(c.key)}
                >
                  <Ionicons
                    name={c.icon}
                    size={26}
                    color={healthConditions.includes(c.key) ? Colors.accent : Colors.textSecondary}
                  />
                  <Text style={[styles.optionLabel, healthConditions.includes(c.key) && styles.optionLabelActiveAccent]}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {healthConditions.length > 0 && (
              <View style={[styles.fieldContainer, { marginTop: 16 }]}>
                <Text style={styles.inputLabel}>Details (medications, severity, etc.)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="e.g. Type 2 diabetes, on metformin"
                  placeholderTextColor={Colors.textMuted}
                  value={healthDetails}
                  onChangeText={setHealthDetails}
                  multiline
                />
              </View>
            )}
            <View style={[styles.fieldContainer, { marginTop: 12 }]}>
              <Text style={styles.inputLabel}>Food Allergies</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. nuts, shellfish, lactose"
                placeholderTextColor={Colors.textMuted}
                value={allergies}
                onChangeText={setAllergies}
              />
            </View>
          </View>
        );

      case 4:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconContainer}>
              <LinearGradient colors={[Colors.accentLight, Colors.accent]} style={styles.iconBg}>
                <Ionicons name="fitness" size={40} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Fitness level</Text>
            <Text style={styles.stepSubtitle}>Be honest — we'll grow together</Text>
            {FITNESS_LEVELS.map((l) => (
              <Pressable
                key={l.key}
                style={[styles.activityOption, fitnessLevel === l.key && styles.activityOptionActive]}
                onPress={() => { setFitnessLevel(l.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <View style={styles.activityTextContainer}>
                  <Text style={[styles.activityLabel, fitnessLevel === l.key && styles.activityLabelActive]}>
                    {l.label}
                  </Text>
                  <Text style={styles.activityDesc}>{l.desc}</Text>
                </View>
                {fitnessLevel === l.key && (
                  <Ionicons name="checkmark-circle" size={24} color={Colors.accent} />
                )}
              </Pressable>
            ))}
            <View style={[styles.fieldContainer, { marginTop: 16 }]}>
              <Text style={styles.inputLabel}>Describe your typical day</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g. Desk job 9-5, walk 20 min after lunch"
                placeholderTextColor={Colors.textMuted}
                value={dailyPattern}
                onChangeText={setDailyPattern}
                multiline
              />
            </View>
          </View>
        );

      case 5:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconContainer}>
              <LinearGradient colors={['#42A5F5', '#1976D2']} style={styles.iconBg}>
                <Ionicons name="location" size={40} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Where do you work out?</Text>
            <Text style={styles.stepSubtitle}>We'll pick the right exercises for your space</Text>
            <View style={styles.optionsGrid}>
              {ENVIRONMENTS.map((e) => (
                <Pressable
                  key={e.key}
                  style={[styles.optionCard, workoutEnvironment === e.key && styles.optionCardActive]}
                  onPress={() => { setWorkoutEnvironment(e.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Ionicons
                    name={e.icon}
                    size={28}
                    color={workoutEnvironment === e.key ? Colors.primary : Colors.textSecondary}
                  />
                  <Text style={[styles.optionLabel, workoutEnvironment === e.key && styles.optionLabelActive]}>
                    {e.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        );

      case 6:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconContainer}>
              <LinearGradient colors={['#66BB6A', '#43A047']} style={styles.iconBg}>
                <Ionicons name="nutrition" size={40} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Dietary preference</Text>
            <Text style={styles.stepSubtitle}>Meal plans that match your lifestyle</Text>
            {DIETARY_PREFS.map((d) => (
              <Pressable
                key={d.key}
                style={[styles.listOption, dietaryPreference === d.key && styles.listOptionActive]}
                onPress={() => { setDietaryPreference(d.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={[styles.listOptionLabel, dietaryPreference === d.key && styles.listOptionLabelActive]}>{d.label}</Text>
                {dietaryPreference === d.key && <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />}
              </Pressable>
            ))}
          </View>
        );

      default:
        return null;
    }
  };

  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: (insets.top || webTopInset) + 20,
          paddingBottom: (insets.bottom || webBottomInset) + 120,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.progressContainer}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[styles.progressDot, i <= step && styles.progressDotActive]} />
          ))}
        </View>

        <Text style={styles.stepCounter}>{step + 1} of {TOTAL_STEPS}</Text>

        <Animated.View style={{ opacity: fadeAnim }}>
          {renderStep()}
        </Animated.View>
      </ScrollView>

      <View style={[styles.buttonContainer, { paddingBottom: (insets.bottom || webBottomInset) + 16 }]}>
        <View style={styles.buttonRow}>
          {step > 0 && (
            <Pressable style={styles.backButton} onPress={() => animateStep(step - 1)}>
              <Ionicons name="chevron-back" size={24} color={Colors.textSecondary} />
            </Pressable>
          )}
          <Pressable
            style={[styles.nextButton, step === 0 && { flex: 1 }]}
            onPress={() => isLastStep ? handleComplete() : animateStep(step + 1)}
          >
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              style={styles.nextButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.nextButtonText}>
                {isLastStep ? "Let's Go" : 'Continue'}
              </Text>
              <Ionicons name={isLastStep ? "rocket" : "chevron-forward"} size={20} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressContainer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 8 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.surfaceLight },
  progressDotActive: { backgroundColor: Colors.primary, width: 20 },
  stepCounter: { fontSize: 13, fontFamily: 'Outfit_500Medium', color: Colors.textMuted, textAlign: 'center', marginBottom: 24 },
  stepContent: { alignItems: 'center' },
  iconContainer: { marginBottom: 24 },
  iconBg: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 26, fontFamily: 'Outfit_700Bold', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  stepSubtitle: { fontSize: 15, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary, textAlign: 'center', marginBottom: 28 },
  fieldContainer: { width: '100%' },
  input: {
    width: '100%', height: 52, backgroundColor: Colors.surface, borderRadius: 14,
    paddingHorizontal: 16, color: Colors.text, fontSize: 16, fontFamily: 'Outfit_500Medium',
    borderWidth: 1, borderColor: Colors.border,
  },
  textArea: { height: 80, textAlignVertical: 'top', paddingTop: 14 },
  inputRow: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 12 },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 13, fontFamily: 'Outfit_500Medium', color: Colors.textSecondary, marginBottom: 6 },
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%' },
  optionCard: {
    width: (width - 60) / 2, paddingVertical: 20, paddingHorizontal: 16,
    backgroundColor: Colors.surface, borderRadius: 16, alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  optionCardActive: { borderColor: Colors.primary, backgroundColor: 'rgba(255,107,61,0.08)' },
  optionCardActiveAccent: { borderColor: Colors.accent, backgroundColor: 'rgba(0,191,165,0.08)' },
  optionLabel: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: Colors.textSecondary },
  optionLabelActive: { color: Colors.primary },
  optionLabelActiveAccent: { color: Colors.accent },
  activityOption: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, paddingHorizontal: 16, backgroundColor: Colors.surface,
    borderRadius: 14, marginBottom: 10, borderWidth: 1.5, borderColor: Colors.border,
  },
  activityOptionActive: { borderColor: Colors.accent, backgroundColor: 'rgba(0,191,165,0.08)' },
  activityTextContainer: { flex: 1 },
  activityLabel: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: Colors.text },
  activityLabelActive: { color: Colors.accent },
  activityDesc: { fontSize: 13, fontFamily: 'Outfit_400Regular', color: Colors.textMuted, marginTop: 2 },
  switchRow: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, paddingHorizontal: 16, backgroundColor: Colors.surface,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
  },
  switchLabel: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: Colors.text },
  chipScroll: { width: '100%', maxHeight: 50 },
  chipRow: { gap: 8, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.surface,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { borderColor: Colors.accent, backgroundColor: 'rgba(0,191,165,0.12)' },
  chipText: { fontSize: 14, fontFamily: 'Outfit_500Medium', color: Colors.textSecondary },
  chipTextActive: { color: Colors.accent },
  listOption: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16, backgroundColor: Colors.surface,
    borderRadius: 14, marginBottom: 8, borderWidth: 1.5, borderColor: Colors.border,
  },
  listOptionActive: { borderColor: Colors.accent, backgroundColor: 'rgba(0,191,165,0.08)' },
  listOptionLabel: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: Colors.text },
  listOptionLabelActive: { color: Colors.accent },
  buttonContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, backgroundColor: Colors.background },
  buttonRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  backButton: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  nextButton: { flex: 1 },
  nextButtonGradient: {
    height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 4,
  },
  nextButtonText: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#fff' },
});

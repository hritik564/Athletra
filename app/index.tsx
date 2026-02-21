import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Animated, Dimensions, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@/contexts/UserContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

const { width } = Dimensions.get('window');

const GOALS = [
  { key: 'lose_weight', label: 'Lose Weight', icon: 'flame' as const },
  { key: 'build_muscle', label: 'Build Muscle', icon: 'barbell' as const },
  { key: 'stay_fit', label: 'Stay Fit', icon: 'heart' as const },
  { key: 'gain_energy', label: 'More Energy', icon: 'flash' as const },
];

const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: 'Sedentary', desc: 'Little or no exercise' },
  { key: 'light', label: 'Lightly Active', desc: '1-3 days/week' },
  { key: 'moderate', label: 'Moderately Active', desc: '3-5 days/week' },
  { key: 'active', label: 'Very Active', desc: '6-7 days/week' },
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
  const [activityLevel, setActivityLevel] = useState('moderate');
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

  const handleComplete = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const calorieTarget = calculateCalories(
      parseFloat(weight) || 70,
      parseFloat(height) || 170,
      parseInt(age) || 25,
      activityLevel,
      goal,
    );
    await updateProfile({
      name: name || 'Friend',
      age: parseInt(age) || 25,
      weight: parseFloat(weight) || 70,
      height: parseFloat(height) || 170,
      goal: goal as any,
      activityLevel: activityLevel as any,
      calorieTarget,
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
            <Text style={styles.stepTitle}>What should we call you?</Text>
            <Text style={styles.stepSubtitle}>Your coach wants to know who they're working with</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoFocus
            />
          </View>
        );
      case 1:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconContainer}>
              <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.iconBg}>
                <Ionicons name="body" size={40} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Your stats</Text>
            <Text style={styles.stepSubtitle}>Help us personalize your experience</Text>
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
      case 2:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconContainer}>
              <LinearGradient colors={[Colors.primary, '#FF9800']} style={styles.iconBg}>
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
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconContainer}>
              <LinearGradient colors={[Colors.accentLight, Colors.accent]} style={styles.iconBg}>
                <Ionicons name="walk" size={40} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>How active are you?</Text>
            <Text style={styles.stepSubtitle}>Be honest - we'll adjust as we go</Text>
            {ACTIVITY_LEVELS.map((a) => (
              <Pressable
                key={a.key}
                style={[styles.activityOption, activityLevel === a.key && styles.activityOptionActive]}
                onPress={() => { setActivityLevel(a.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <View style={styles.activityTextContainer}>
                  <Text style={[styles.activityLabel, activityLevel === a.key && styles.activityLabelActive]}>
                    {a.label}
                  </Text>
                  <Text style={styles.activityDesc}>{a.desc}</Text>
                </View>
                {activityLevel === a.key && (
                  <Ionicons name="checkmark-circle" size={24} color={Colors.accent} />
                )}
              </Pressable>
            ))}
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: (insets.top || webTopInset) + 20,
          paddingBottom: (insets.bottom || webBottomInset) + 100,
          paddingHorizontal: 24,
        }}
        bottomOffset={80}
      >
        <View style={styles.progressContainer}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.progressDot, i <= step && styles.progressDotActive]} />
          ))}
        </View>

        <Animated.View style={{ opacity: fadeAnim }}>
          {renderStep()}
        </Animated.View>
      </KeyboardAwareScrollViewCompat>

      <View style={[styles.buttonContainer, { paddingBottom: (insets.bottom || webBottomInset) + 16 }]}>
        <View style={styles.buttonRow}>
          {step > 0 && (
            <Pressable style={styles.backButton} onPress={() => animateStep(step - 1)}>
              <Ionicons name="chevron-back" size={24} color={Colors.textSecondary} />
            </Pressable>
          )}
          <Pressable
            style={[styles.nextButton, step === 0 && { flex: 1 }]}
            onPress={() => step < 3 ? animateStep(step + 1) : handleComplete()}
          >
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              style={styles.nextButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.nextButtonText}>
                {step === 3 ? "Let's Go" : 'Continue'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressContainer: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 32 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.surfaceLight },
  progressDotActive: { backgroundColor: Colors.primary, width: 24 },
  stepContent: { alignItems: 'center' },
  iconContainer: { marginBottom: 24 },
  iconBg: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 26, fontFamily: 'Outfit_700Bold', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  stepSubtitle: { fontSize: 15, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary, textAlign: 'center', marginBottom: 32 },
  input: {
    width: '100%', height: 52, backgroundColor: Colors.surface, borderRadius: 14,
    paddingHorizontal: 16, color: Colors.text, fontSize: 16, fontFamily: 'Outfit_500Medium',
    borderWidth: 1, borderColor: Colors.border,
  },
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
  optionLabel: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: Colors.textSecondary },
  optionLabelActive: { color: Colors.primary },
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

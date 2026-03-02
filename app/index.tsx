import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Animated, Dimensions, Platform,
  Switch, ScrollView, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@/contexts/UserContext';
import { useColors } from '@/contexts/ThemeContext';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const TOTAL_STEPS = 7;

const GOALS = [
  { key: 'lose_weight', label: 'Cut & Lean', icon: 'flame' as const, desc: 'Shed fat, reveal muscle' },
  { key: 'build_muscle', label: 'Build Power', icon: 'barbell' as const, desc: 'Gain size and strength' },
  { key: 'stay_fit', label: 'Peak Form', icon: 'heart' as const, desc: 'Maintain elite conditioning' },
  { key: 'gain_energy', label: 'Unlock Energy', icon: 'flash' as const, desc: 'Boost daily performance' },
];

const HEALTH_CONDITIONS = [
  { key: 'diabetes', label: 'Diabetes', icon: 'water' as const },
  { key: 'hypertension', label: 'Hypertension', icon: 'pulse' as const },
  { key: 'high_cholesterol', label: 'High Cholesterol', icon: 'analytics' as const },
  { key: 'food_allergies', label: 'Food Allergies', icon: 'alert-circle' as const },
];

const FITNESS_LEVELS = [
  { key: 'beginner', label: 'Foundation', desc: 'Building base fitness from the ground up' },
  { key: 'intermediate', label: 'Competitor', desc: 'Consistent training, ready to push harder' },
  { key: 'advanced', label: 'Elite', desc: 'High-intensity training, chasing new limits' },
];

const ENVIRONMENTS = [
  { key: 'gym', label: 'Gym', icon: 'barbell' as const },
  { key: 'home', label: 'Home', icon: 'home' as const },
  { key: 'outdoors', label: 'Outdoors', icon: 'leaf' as const },
  { key: 'mixed', label: 'Mixed', icon: 'shuffle' as const },
];

const DIETARY_PREFS = [
  { key: 'none', label: 'No Restrictions' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'keto', label: 'Keto' },
  { key: 'paleo', label: 'Paleo' },
  { key: 'gluten_free', label: 'Gluten Free' },
];

const SPORTS = [
  { key: 'football', label: 'Football', icon: 'football' as const },
  { key: 'basketball', label: 'Basketball', icon: 'basketball' as const },
  { key: 'cricket', label: 'Cricket', icon: 'baseball' as const },
  { key: 'tennis', label: 'Tennis', icon: 'tennisball' as const },
  { key: 'badminton', label: 'Badminton', icon: 'tennisball-outline' as const },
  { key: 'running', label: 'Running', icon: 'walk' as const },
  { key: 'swimming', label: 'Swimming', icon: 'water' as const },
  { key: 'cycling', label: 'Cycling', icon: 'bicycle' as const },
  { key: 'mma', label: 'MMA / Boxing', icon: 'hand-left' as const },
  { key: 'weightlifting', label: 'Weightlifting', icon: 'barbell' as const },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' as const },
];

const ATHLETE_LEVELS = [
  { key: 'recreational', label: 'Recreational', desc: 'Training for fun and fitness' },
  { key: 'amateur', label: 'Amateur / Club', desc: 'Competing at local level' },
  { key: 'semi_pro', label: 'Semi-Pro', desc: 'Serious competition, structured training' },
  { key: 'professional', label: 'Professional', desc: 'Full-time dedication to the sport' },
];

const SPORT_INSIGHTS: Record<string, string> = {
  football: "We'll build explosive sprints, agility drills, and match-day endurance into your plan.",
  basketball: "Focus on vertical power, court speed, and sustained energy through all four quarters.",
  cricket: "We'll target rotational power, fast-twitch reflexes, and stamina for long sessions.",
  tennis: "Your plan will emphasize lateral quickness, shoulder stability, and rally endurance.",
  badminton: "We'll sharpen your reaction time, footwork speed, and overhead power.",
  running: "We'll structure periodized runs, pace work, and recovery cycles for your distance.",
  swimming: "Focus on stroke efficiency, core stability, and aerobic capacity in and out of the pool.",
  cycling: "We'll build sustained power output, cadence control, and hill-climbing strength.",
  mma: "Your program will balance striking power, grappling endurance, and fight conditioning.",
  weightlifting: "We'll program progressive overload, accessory work, and peaking cycles for max lifts.",
};

const GOAL_INSIGHTS: Record<string, string> = {
  lose_weight: "Your plan will combine strategic calorie deficit with muscle-preserving training.",
  build_muscle: "We'll prioritize progressive overload and optimize your protein timing.",
  stay_fit: "A balanced mix of strength, cardio, and mobility to keep you performing at your best.",
  gain_energy: "We'll focus on sustainable habits, sleep optimization, and energizing nutrition.",
};

function calculateCalories(weight: number, height: number, age: number, activityLevel: string, goal: string): number {
  const bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  const multipliers: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  const tdee = bmr * (multipliers[activityLevel] || 1.55);
  if (goal === 'lose_weight') return Math.round(tdee - 500);
  if (goal === 'build_muscle') return Math.round(tdee + 300);
  return Math.round(tdee);
}

function AIInsight({ text, Colors }: { text: string; Colors: any }) {
  const pulseAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={{
      width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      marginTop: 16, padding: 14, backgroundColor: Colors.primary + '12',
      borderRadius: 14, borderLeftWidth: 3, borderLeftColor: Colors.primary,
    }}>
      <Animated.View style={{ opacity: pulseAnim }}>
        <Ionicons name="sparkles" size={16} color={Colors.primary} />
      </Animated.View>
      <Text style={{
        flex: 1, fontSize: 13, fontFamily: 'Outfit_500Medium',
        color: Colors.textSecondary, lineHeight: 19,
      }}>{text}</Text>
    </View>
  );
}

function BlueprintScreen({ Colors, onComplete }: { Colors: any; onComplete: () => void }) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeTexts = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  const steps = [
    'Analyzing your profile...',
    'Mapping training zones...',
    'Calibrating nutrition targets...',
    'Finalizing your blueprint...',
  ];

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: 1, duration: 3500, useNativeDriver: false,
    }).start();

    const delays = [0, 800, 1600, 2400];
    delays.forEach((delay, i) => {
      setTimeout(() => {
        Animated.timing(fadeTexts[i], { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }, delay);
    });

    setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete();
    }, 3800);
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      <LinearGradient colors={[Colors.primary, Colors.accent]} style={{
        width: 90, height: 90, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 32,
      }}>
        <ActivityIndicator size="large" color="#fff" />
      </LinearGradient>

      <Text style={{
        fontSize: 24, fontFamily: 'Outfit_700Bold', color: Colors.text,
        textAlign: 'center', marginBottom: 8,
      }}>Building Your Performance Blueprint</Text>

      <Text style={{
        fontSize: 14, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary,
        textAlign: 'center', marginBottom: 32,
      }}>Personalizing every detail for your goals</Text>

      <View style={{ width: '100%', height: 6, backgroundColor: Colors.surfaceLight, borderRadius: 3, marginBottom: 28, overflow: 'hidden' }}>
        <Animated.View style={{
          height: '100%', backgroundColor: Colors.primary, borderRadius: 3,
          width: progressWidth,
        }} />
      </View>

      <View style={{ width: '100%', gap: 12 }}>
        {steps.map((stepText, i) => (
          <Animated.View key={i} style={{
            opacity: fadeTexts[i], flexDirection: 'row', alignItems: 'center', gap: 10,
          }}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
            <Text style={{
              fontSize: 14, fontFamily: 'Outfit_500Medium', color: Colors.textSecondary,
            }}>{stepText}</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const Colors = useColors();
  const styles = createStyles(Colors);
  const { profile, updateProfile, isLoading } = useUser();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [showBlueprint, setShowBlueprint] = useState(false);

  const [name, setName] = useState('');
  const [age, setAge] = useState('25');
  const [weight, setWeight] = useState('70');
  const [height, setHeight] = useState('170');

  const [goal, setGoal] = useState('stay_fit');
  const [calorieTarget, setCalorieTarget] = useState('');

  const [isAthlete, setIsAthlete] = useState(false);
  const [sport, setSport] = useState('');
  const [customSport, setCustomSport] = useState('');
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

  const finalSport = sport === 'other' ? customSport : sport;

  const handleComplete = async () => {
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
      sport: isAthlete ? finalSport : '',
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

  const startBlueprint = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowBlueprint(true);
  };

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  if (showBlueprint) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.background }]}>
        <BlueprintScreen Colors={Colors} onComplete={handleComplete} />
      </View>
    );
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconContainer}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.iconBg}>
                <Ionicons name="person" size={36} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Your Athletic Profile</Text>
            <Text style={styles.stepSubtitle}>The foundation of your personalized program</Text>
            <View style={styles.fieldContainer}>
              <Text style={styles.inputLabel}>Full Name</Text>
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
                <Ionicons name="trophy" size={36} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Define Your Edge</Text>
            <Text style={styles.stepSubtitle}>What does peak performance look like for you?</Text>
            <View style={styles.optionsGrid}>
              {GOALS.map((g) => (
                <Pressable
                  key={g.key}
                  style={[styles.optionCard, goal === g.key && styles.optionCardActive]}
                  onPress={() => { setGoal(g.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Ionicons
                    name={g.icon}
                    size={26}
                    color={goal === g.key ? Colors.primary : Colors.textSecondary}
                  />
                  <Text style={[styles.optionLabel, goal === g.key && styles.optionLabelActive]}>
                    {g.label}
                  </Text>
                  <Text style={[styles.optionDesc, goal === g.key && { color: Colors.primary + 'CC' }]}>
                    {g.desc}
                  </Text>
                </Pressable>
              ))}
            </View>
            {GOAL_INSIGHTS[goal] && (
              <AIInsight text={GOAL_INSIGHTS[goal]} Colors={Colors} />
            )}
            <View style={[styles.fieldContainer, { marginTop: 16 }]}>
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
                <Ionicons name="medal" size={36} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Your Competitive Arena</Text>
            <Text style={styles.stepSubtitle}>Sport-specific training unlocks faster results</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>I compete in a sport</Text>
              <Switch
                value={isAthlete}
                onValueChange={(v) => { setIsAthlete(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                trackColor={{ false: Colors.surfaceLight, true: Colors.accent }}
                thumbColor="#fff"
              />
            </View>
            {isAthlete && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Select Your Sport</Text>
                <View style={styles.sportGrid}>
                  {SPORTS.map((s) => (
                    <Pressable
                      key={s.key}
                      style={[styles.sportCard, sport === s.key && styles.sportCardActive]}
                      onPress={() => { setSport(s.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      <Ionicons
                        name={s.icon}
                        size={22}
                        color={sport === s.key ? Colors.accent : Colors.textMuted}
                      />
                      <Text style={[styles.sportLabel, sport === s.key && styles.sportLabelActive]}>
                        {s.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {sport === 'other' && (
                  <View style={[styles.fieldContainer, { marginTop: 12 }]}>
                    <Text style={styles.inputLabel}>Your Sport</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Rugby, Volleyball, Table Tennis"
                      placeholderTextColor={Colors.textMuted}
                      value={customSport}
                      onChangeText={setCustomSport}
                      autoFocus
                    />
                  </View>
                )}
                {sport && sport !== 'other' && SPORT_INSIGHTS[sport] && (
                  <AIInsight text={SPORT_INSIGHTS[sport]} Colors={Colors} />
                )}
                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Competition Level</Text>
                {ATHLETE_LEVELS.map((l) => (
                  <Pressable
                    key={l.key}
                    style={[styles.levelOption, athleteLevel === l.key && styles.levelOptionActive]}
                    onPress={() => { setAthleteLevel(l.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.levelLabel, athleteLevel === l.key && styles.levelLabelActive]}>{l.label}</Text>
                      <Text style={styles.levelDesc}>{l.desc}</Text>
                    </View>
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
              <LinearGradient colors={[Colors.error, '#C62828']} style={styles.iconBg}>
                <Ionicons name="shield-checkmark" size={36} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Safety First</Text>
            <Text style={styles.stepSubtitle}>We adapt every plan around your health needs</Text>
            <View style={styles.optionsGrid}>
              {HEALTH_CONDITIONS.map((c) => (
                <Pressable
                  key={c.key}
                  style={[styles.optionCard, healthConditions.includes(c.key) && styles.optionCardActiveAccent]}
                  onPress={() => toggleCondition(c.key)}
                >
                  <Ionicons
                    name={c.icon}
                    size={24}
                    color={healthConditions.includes(c.key) ? Colors.accent : Colors.textSecondary}
                  />
                  <Text style={[styles.optionLabel, healthConditions.includes(c.key) && styles.optionLabelActiveAccent]}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {healthConditions.length > 0 && (
              <>
                <AIInsight
                  text="Your coach will adjust intensity, exercises, and nutrition to work safely with your conditions."
                  Colors={Colors}
                />
                <View style={[styles.fieldContainer, { marginTop: 12 }]}>
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
              </>
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
                <Ionicons name="fitness" size={36} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Your Training Level</Text>
            <Text style={styles.stepSubtitle}>Honest input drives better results</Text>
            {FITNESS_LEVELS.map((l) => (
              <Pressable
                key={l.key}
                style={[styles.levelOption, fitnessLevel === l.key && styles.levelOptionActive]}
                onPress={() => { setFitnessLevel(l.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.levelLabel, fitnessLevel === l.key && styles.levelLabelActive]}>
                    {l.label}
                  </Text>
                  <Text style={styles.levelDesc}>{l.desc}</Text>
                </View>
                {fitnessLevel === l.key && (
                  <Ionicons name="checkmark-circle" size={24} color={Colors.accent} />
                )}
              </Pressable>
            ))}
            <View style={[styles.fieldContainer, { marginTop: 16 }]}>
              <Text style={styles.inputLabel}>Your daily rhythm</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g. Desk job 9-5, gym at 6pm"
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
              <LinearGradient colors={[Colors.primaryLight, Colors.primary]} style={styles.iconBg}>
                <Ionicons name="location" size={36} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Training Ground</Text>
            <Text style={styles.stepSubtitle}>We'll select equipment and exercises that fit your space</Text>
            <View style={styles.optionsGrid}>
              {ENVIRONMENTS.map((e) => (
                <Pressable
                  key={e.key}
                  style={[styles.optionCard, workoutEnvironment === e.key && styles.optionCardActive]}
                  onPress={() => { setWorkoutEnvironment(e.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Ionicons
                    name={e.icon}
                    size={26}
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
                <Ionicons name="nutrition" size={36} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>Fuel Strategy</Text>
            <Text style={styles.stepSubtitle}>Meal plans that match how you eat</Text>
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
            onPress={() => isLastStep ? startBlueprint() : animateStep(step + 1)}
          >
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              style={styles.nextButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.nextButtonText}>
                {isLastStep ? 'Build My Blueprint' : 'Continue'}
              </Text>
              <Ionicons name={isLastStep ? "rocket" : "chevron-forward"} size={20} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const createStyles = (C: any) => StyleSheet.create({
  container: { flex: 1 },
  progressContainer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 8 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.surfaceLight },
  progressDotActive: { backgroundColor: C.primary, width: 20 },
  stepCounter: { fontSize: 13, fontFamily: 'Outfit_500Medium', color: C.textMuted, textAlign: 'center', marginBottom: 24 },
  stepContent: { alignItems: 'center' },
  iconContainer: { marginBottom: 20 },
  iconBg: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 24, fontFamily: 'Outfit_700Bold', color: C.text, textAlign: 'center', marginBottom: 6 },
  stepSubtitle: { fontSize: 14, fontFamily: 'Outfit_400Regular', color: C.textSecondary, textAlign: 'center', marginBottom: 24 },
  fieldContainer: { width: '100%' },
  input: {
    width: '100%', height: 50, backgroundColor: C.surface, borderRadius: 14,
    paddingHorizontal: 16, color: C.text, fontSize: 15, fontFamily: 'Outfit_500Medium',
    borderWidth: 1, borderColor: C.border,
  },
  textArea: { height: 76, textAlignVertical: 'top', paddingTop: 14 },
  inputRow: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 10 },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', color: C.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionLabel: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', color: C.textSecondary, alignSelf: 'flex-start', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%' },
  optionCard: {
    width: (width - 58) / 2, paddingVertical: 16, paddingHorizontal: 14,
    backgroundColor: C.surface, borderRadius: 14, alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: C.border,
  },
  optionCardActive: { borderColor: C.primary, backgroundColor: C.primary + '14' },
  optionCardActiveAccent: { borderColor: C.accent, backgroundColor: C.accent + '14' },
  optionLabel: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: C.textSecondary },
  optionLabelActive: { color: C.primary },
  optionLabelActiveAccent: { color: C.accent },
  optionDesc: { fontSize: 11, fontFamily: 'Outfit_400Regular', color: C.textMuted, textAlign: 'center' },
  switchRow: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.surface,
    borderRadius: 14, borderWidth: 1, borderColor: C.border,
  },
  switchLabel: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: C.text },
  sportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  sportCard: {
    width: (width - 72) / 3, paddingVertical: 12, paddingHorizontal: 8,
    backgroundColor: C.surface, borderRadius: 12, alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: C.border,
  },
  sportCardActive: { borderColor: C.accent, backgroundColor: C.accent + '14' },
  sportLabel: { fontSize: 11, fontFamily: 'Outfit_500Medium', color: C.textMuted, textAlign: 'center' },
  sportLabelActive: { color: C.accent },
  levelOption: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.surface,
    borderRadius: 14, marginBottom: 8, borderWidth: 1.5, borderColor: C.border,
  },
  levelOptionActive: { borderColor: C.accent, backgroundColor: C.accent + '14' },
  levelLabel: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: C.text },
  levelLabelActive: { color: C.accent },
  levelDesc: { fontSize: 12, fontFamily: 'Outfit_400Regular', color: C.textMuted, marginTop: 2 },
  listOption: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.surface,
    borderRadius: 14, marginBottom: 8, borderWidth: 1.5, borderColor: C.border,
  },
  listOptionActive: { borderColor: C.accent, backgroundColor: C.accent + '14' },
  listOptionLabel: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: C.text },
  listOptionLabelActive: { color: C.accent },
  buttonContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, backgroundColor: C.background },
  buttonRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  backButton: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  nextButton: { flex: 1 },
  nextButtonGradient: {
    height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
  },
  nextButtonText: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#fff' },
});

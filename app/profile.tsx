import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Colors from '@/constants/colors';
import { useUser } from '@/contexts/UserContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

const GOALS = [
  { key: 'lose_weight', label: 'Lose Weight' },
  { key: 'build_muscle', label: 'Build Muscle' },
  { key: 'stay_fit', label: 'Stay Fit' },
  { key: 'gain_energy', label: 'More Energy' },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { profile, updateProfile } = useUser();
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(String(profile.age));
  const [weight, setWeight] = useState(String(profile.weight));
  const [height, setHeight] = useState(String(profile.height));
  const [calorieTarget, setCalorieTarget] = useState(String(profile.calorieTarget));
  const [goal, setGoal] = useState(profile.goal);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const handleSave = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await updateProfile({
      name: name.trim() || 'Friend',
      age: parseInt(age) || 25,
      weight: parseFloat(weight) || 70,
      height: parseFloat(height) || 170,
      calorieTarget: parseInt(calorieTarget) || 2000,
      goal: goal as any,
    });
    router.back();
  };

  const handleReset = () => {
    Alert.alert(
      'Reset All Data',
      'This will delete all your tracked data and return to onboarding. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            await updateProfile({ onboarded: false });
            router.replace('/');
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={[styles.header, { paddingTop: (insets.top || webTopInset) + 12 }]}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <Pressable onPress={handleSave}>
          <Ionicons name="checkmark" size={24} color={Colors.primary} />
        </Pressable>
      </View>

      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        bottomOffset={20}
      >
        <View style={styles.avatarSection}>
          <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatarLarge}>
            <Ionicons name="person" size={36} color="#fff" />
          </LinearGradient>
          <Text style={styles.profileName}>{name || 'Friend'}</Text>
        </View>

        <Text style={styles.sectionLabel}>Personal Info</Text>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput style={styles.fieldInput} value={name} onChangeText={setName} placeholderTextColor={Colors.textMuted} />
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Age</Text>
          <TextInput style={styles.fieldInput} value={age} onChangeText={setAge} keyboardType="number-pad" placeholderTextColor={Colors.textMuted} />
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Weight (kg)</Text>
          <TextInput style={styles.fieldInput} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Height (cm)</Text>
          <TextInput style={styles.fieldInput} value={height} onChangeText={setHeight} keyboardType="number-pad" placeholderTextColor={Colors.textMuted} />
        </View>

        <Text style={styles.sectionLabel}>Calorie Target</Text>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Daily kcal</Text>
          <TextInput style={styles.fieldInput} value={calorieTarget} onChangeText={setCalorieTarget} keyboardType="number-pad" placeholderTextColor={Colors.textMuted} />
        </View>

        <Text style={styles.sectionLabel}>Goal</Text>
        <View style={styles.goalOptions}>
          {GOALS.map((g) => (
            <Pressable
              key={g.key}
              style={[styles.goalOption, goal === g.key && styles.goalOptionActive]}
              onPress={() => { setGoal(g.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={[styles.goalOptionText, goal === g.key && styles.goalOptionTextActive]}>{g.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.resetBtn} onPress={handleReset}>
          <Text style={styles.resetBtnText}>Reset All Data</Text>
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 17, fontFamily: 'Outfit_700Bold', color: Colors.text },
  avatarSection: { alignItems: 'center', marginBottom: 32 },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  profileName: { fontSize: 22, fontFamily: 'Outfit_700Bold', color: Colors.text },
  sectionLabel: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: Colors.textSecondary, marginBottom: 8, marginTop: 16 },
  fieldRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  fieldLabel: { fontSize: 15, fontFamily: 'Outfit_500Medium', color: Colors.text },
  fieldInput: { fontSize: 15, fontFamily: 'Outfit_500Medium', color: Colors.primary, textAlign: 'right', minWidth: 80 },
  goalOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  goalOption: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  goalOptionActive: { borderColor: Colors.primary, backgroundColor: 'rgba(255,107,61,0.1)' },
  goalOptionText: { fontSize: 14, fontFamily: 'Outfit_500Medium', color: Colors.textSecondary },
  goalOptionTextActive: { color: Colors.primary },
  resetBtn: {
    marginTop: 40, paddingVertical: 14, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.error, alignItems: 'center',
  },
  resetBtnText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: Colors.error },
});

import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/contexts/ThemeContext';
import { useFitness, Meal } from '@/contexts/FitnessContext';
import { useUser } from '@/contexts/UserContext';
import { apiRequest, getApiUrl } from '@/lib/query-client';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const MEAL_ICONS: Record<string, string> = {
  breakfast: 'sunny-outline',
  lunch: 'restaurant-outline',
  dinner: 'moon-outline',
  snack: 'cafe-outline',
};

function MealCard({ meal, onRemove }: { meal: Meal; onRemove: () => void }) {
  const Colors = useColors();
  const styles = createStyles(Colors);
  return (
    <View style={styles.mealCard}>
      <View style={styles.mealCardLeft}>
        <View style={styles.mealTypeIcon}>
          <Ionicons name={MEAL_ICONS[meal.mealType] as any} size={18} color={Colors.primary} />
        </View>
        <View style={styles.mealInfo}>
          <Text style={styles.mealName}>{meal.name}</Text>
          <Text style={styles.mealMacros}>
            P: {meal.protein}g  |  C: {meal.carbs}g  |  F: {meal.fat}g
          </Text>
        </View>
      </View>
      <View style={styles.mealCardRight}>
        <Text style={styles.mealCalories}>{meal.calories}</Text>
        <Text style={styles.mealCalLabel}>kcal</Text>
        <Pressable onPress={onRemove} hitSlop={8}>
          <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

export default function MealsScreen() {
  const Colors = useColors();
  const styles = createStyles(Colors);
  const insets = useSafeAreaInsets();
  const { todayData, addMeal, removeMeal, totalCaloriesConsumed } = useFitness();
  const { profile } = useUser();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedType, setSelectedType] = useState<typeof MEAL_TYPES[number]>('lunch');
  const [mealName, setMealName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [suggesting, setSuggesting] = useState(false);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const handleAddMeal = async () => {
    if (!mealName.trim() || !calories.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addMeal({
      name: mealName.trim(),
      calories: parseInt(calories) || 0,
      protein: parseInt(protein) || 0,
      carbs: parseInt(carbs) || 0,
      fat: parseInt(fat) || 0,
      mealType: selectedType,
    });
    resetForm();
    setShowAddModal(false);
  };

  const handleAISuggest = async () => {
    setSuggesting(true);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/coach/suggest-meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentCalories: totalCaloriesConsumed,
          targetCalories: profile.calorieTarget,
          mealType: selectedType,
          preferences: profile.goal === 'build_muscle' ? 'high protein' : 'balanced',
        }),
      });
      const meal = await res.json();
      if (meal.name) {
        setMealName(meal.name);
        setCalories(String(meal.calories || 0));
        setProtein(String(meal.protein || 0));
        setCarbs(String(meal.carbs || 0));
        setFat(String(meal.fat || 0));
      }
    } catch (e) {
      Alert.alert('Error', 'Could not get suggestion. Try again.');
    }
    setSuggesting(false);
  };

  const resetForm = () => {
    setMealName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
  };

  const mealsByType = MEAL_TYPES.map(type => ({
    type,
    meals: todayData.meals.filter(m => m.mealType === type),
    totalCal: todayData.meals.filter(m => m.mealType === type).reduce((s, m) => s + m.calories, 0),
  }));

  const remaining = Math.max(profile.calorieTarget - totalCaloriesConsumed, 0);

  const renderMealSection = useCallback(({ item }: { item: typeof mealsByType[0] }) => (
    <View style={styles.mealSection}>
      <View style={styles.mealSectionHeader}>
        <View style={styles.mealSectionLeft}>
          <Ionicons name={MEAL_ICONS[item.type] as any} size={18} color={Colors.textSecondary} />
          <Text style={styles.mealSectionTitle}>
            {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
          </Text>
        </View>
        <Text style={styles.mealSectionCal}>{item.totalCal} kcal</Text>
      </View>
      {item.meals.map(meal => (
        <MealCard
          key={meal.id}
          meal={meal}
          onRemove={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            removeMeal(meal.id);
          }}
        />
      ))}
      <Pressable
        style={styles.addMealBtn}
        onPress={() => {
          setSelectedType(item.type);
          setShowAddModal(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
      >
        <Ionicons name="add" size={18} color={Colors.primary} />
        <Text style={styles.addMealBtnText}>Add {item.type}</Text>
      </Pressable>
    </View>
  ), [todayData, Colors, styles]);

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={[styles.headerArea, { paddingTop: (insets.top || webTopInset) + 12 }]}>
        <Text style={styles.screenTitle}>Meals</Text>
        <View style={styles.remainingBadge}>
          <Text style={styles.remainingValue}>{remaining}</Text>
          <Text style={styles.remainingLabel}>kcal left</Text>
        </View>
      </View>

      <FlatList
        data={mealsByType}
        keyExtractor={(item) => item.type}
        renderItem={renderMealSection}
        contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!mealsByType.length}
      />

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Add {selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}
              </Text>
              <Pressable onPress={() => { setShowAddModal(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <Pressable
              style={[styles.aiSuggestBtn, suggesting && { opacity: 0.6 }]}
              onPress={handleAISuggest}
              disabled={suggesting}
            >
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.aiSuggestGradient}>
                <Ionicons name="sparkles" size={16} color="#fff" />
                <Text style={styles.aiSuggestText}>
                  {suggesting ? 'Thinking...' : 'AI Suggest'}
                </Text>
              </LinearGradient>
            </Pressable>

            <TextInput
              style={styles.modalInput}
              placeholder="Meal name"
              placeholderTextColor={Colors.textMuted}
              value={mealName}
              onChangeText={setMealName}
            />
            <View style={styles.modalInputRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                placeholder="Calories"
                placeholderTextColor={Colors.textMuted}
                value={calories}
                onChangeText={setCalories}
                keyboardType="number-pad"
              />
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                placeholder="Protein (g)"
                placeholderTextColor={Colors.textMuted}
                value={protein}
                onChangeText={setProtein}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.modalInputRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                placeholder="Carbs (g)"
                placeholderTextColor={Colors.textMuted}
                value={carbs}
                onChangeText={setCarbs}
                keyboardType="number-pad"
              />
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                placeholder="Fat (g)"
                placeholderTextColor={Colors.textMuted}
                value={fat}
                onChangeText={setFat}
                keyboardType="number-pad"
              />
            </View>

            <Pressable style={styles.saveBtn} onPress={handleAddMeal}>
              <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.saveBtnGradient}>
                <Text style={styles.saveBtnText}>Add Meal</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (C: any) => StyleSheet.create({
  container: { flex: 1 },
  headerArea: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  screenTitle: { fontSize: 28, fontFamily: 'Outfit_700Bold', color: C.text },
  remainingBadge: { alignItems: 'center', backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12 },
  remainingValue: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: C.primary },
  remainingLabel: { fontSize: 10, fontFamily: 'Outfit_400Regular', color: C.textSecondary },
  mealSection: { marginBottom: 20 },
  mealSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mealSectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mealSectionTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: C.text },
  mealSectionCal: { fontSize: 13, fontFamily: 'Outfit_500Medium', color: C.textSecondary },
  mealCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
  },
  mealCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  mealTypeIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primaryLight + '1F', alignItems: 'center', justifyContent: 'center' },
  mealInfo: { flex: 1 },
  mealName: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: C.text },
  mealMacros: { fontSize: 12, fontFamily: 'Outfit_400Regular', color: C.textSecondary, marginTop: 2 },
  mealCardRight: { alignItems: 'flex-end', gap: 2 },
  mealCalories: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: C.accent },
  mealCalLabel: { fontSize: 10, fontFamily: 'Outfit_400Regular', color: C.textSecondary },
  addMealBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, borderWidth: 1, borderColor: C.primary, borderRadius: 12,
    borderStyle: 'dashed',
  },
  addMealBtnText: { fontSize: 14, fontFamily: 'Outfit_500Medium', color: C.primary },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContent: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: C.text },
  aiSuggestBtn: { marginBottom: 16 },
  aiSuggestGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  aiSuggestText: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: '#fff' },
  modalInput: {
    height: 48, backgroundColor: C.surfaceLight, borderRadius: 12, paddingHorizontal: 14,
    color: C.text, fontSize: 15, fontFamily: 'Outfit_500Medium', marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  modalInputRow: { flexDirection: 'row', gap: 10 },
  saveBtn: { marginTop: 8 },
  saveBtnGradient: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#fff' },
});

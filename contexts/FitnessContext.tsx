import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Meal {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  time: string;
}

export interface WorkoutExercise {
  name: string;
  sets: number;
  reps: number | string;
  rest_seconds: number;
  description: string;
  completed?: boolean;
}

export interface Workout {
  id: string;
  name: string;
  duration: number;
  calories_burned: number;
  exercises: WorkoutExercise[];
  completed: boolean;
  date: string;
}

export interface DayData {
  date: string;
  meals: Meal[];
  workouts: Workout[];
  waterGlasses: number;
  weight?: number;
}

export interface WeightEntry {
  date: string;
  weight: number;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
}

interface FitnessContextValue {
  todayData: DayData;
  addMeal: (meal: Omit<Meal, 'id' | 'time'>) => Promise<void>;
  removeMeal: (id: string) => Promise<void>;
  addWorkout: (workout: Omit<Workout, 'id' | 'date' | 'completed'>) => Promise<void>;
  completeWorkout: (id: string) => Promise<void>;
  addWater: () => Promise<void>;
  removeWater: () => Promise<void>;
  weightHistory: WeightEntry[];
  logWeight: (weight: number) => Promise<void>;
  streak: StreakData;
  totalCaloriesConsumed: number;
  totalCaloriesBurned: number;
  macros: { protein: number; carbs: number; fat: number };
}

const FitnessContext = createContext<FitnessContextValue | null>(null);

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

let idCounter = 0;
function generateId(): string {
  idCounter++;
  return `${Date.now()}-${idCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

const emptyDay = (date: string): DayData => ({
  date,
  meals: [],
  workouts: [],
  waterGlasses: 0,
});

export function FitnessProvider({ children }: { children: ReactNode }) {
  const [todayData, setTodayData] = useState<DayData>(emptyDay(getToday()));
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [streak, setStreak] = useState<StreakData>({ currentStreak: 0, longestStreak: 0, lastActiveDate: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const today = getToday();
    const [dayStr, weightsStr, streakStr] = await Promise.all([
      AsyncStorage.getItem(`day_${today}`),
      AsyncStorage.getItem('weight_history'),
      AsyncStorage.getItem('streak_data'),
    ]);
    if (dayStr) setTodayData(JSON.parse(dayStr));
    if (weightsStr) setWeightHistory(JSON.parse(weightsStr));
    if (streakStr) setStreak(JSON.parse(streakStr));
  };

  const saveTodayData = useCallback(async (data: DayData) => {
    setTodayData(data);
    await AsyncStorage.setItem(`day_${data.date}`, JSON.stringify(data));
    await updateStreak();
  }, []);

  const updateStreak = async () => {
    const today = getToday();
    const streakStr = await AsyncStorage.getItem('streak_data');
    let s: StreakData = streakStr ? JSON.parse(streakStr) : { currentStreak: 0, longestStreak: 0, lastActiveDate: '' };

    if (s.lastActiveDate === today) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (s.lastActiveDate === yesterdayStr) {
      s.currentStreak += 1;
    } else if (s.lastActiveDate !== today) {
      s.currentStreak = 1;
    }
    s.lastActiveDate = today;
    s.longestStreak = Math.max(s.longestStreak, s.currentStreak);

    setStreak(s);
    await AsyncStorage.setItem('streak_data', JSON.stringify(s));
  };

  const addMeal = useCallback(async (meal: Omit<Meal, 'id' | 'time'>) => {
    const newMeal: Meal = { ...meal, id: generateId(), time: new Date().toISOString() };
    const updated = { ...todayData, meals: [...todayData.meals, newMeal] };
    await saveTodayData(updated);
  }, [todayData, saveTodayData]);

  const removeMeal = useCallback(async (id: string) => {
    const updated = { ...todayData, meals: todayData.meals.filter(m => m.id !== id) };
    await saveTodayData(updated);
  }, [todayData, saveTodayData]);

  const addWorkout = useCallback(async (workout: Omit<Workout, 'id' | 'date' | 'completed'>) => {
    const newWorkout: Workout = { ...workout, id: generateId(), date: getToday(), completed: false };
    const updated = { ...todayData, workouts: [...todayData.workouts, newWorkout] };
    await saveTodayData(updated);
  }, [todayData, saveTodayData]);

  const completeWorkout = useCallback(async (id: string) => {
    const updated = {
      ...todayData,
      workouts: todayData.workouts.map(w => w.id === id ? { ...w, completed: true } : w),
    };
    await saveTodayData(updated);
  }, [todayData, saveTodayData]);

  const addWater = useCallback(async () => {
    const updated = { ...todayData, waterGlasses: todayData.waterGlasses + 1 };
    await saveTodayData(updated);
  }, [todayData, saveTodayData]);

  const removeWater = useCallback(async () => {
    if (todayData.waterGlasses <= 0) return;
    const updated = { ...todayData, waterGlasses: todayData.waterGlasses - 1 };
    await saveTodayData(updated);
  }, [todayData, saveTodayData]);

  const logWeight = useCallback(async (weight: number) => {
    const entry: WeightEntry = { date: getToday(), weight };
    const existing = weightHistory.filter(w => w.date !== getToday());
    const updated = [...existing, entry];
    setWeightHistory(updated);
    await AsyncStorage.setItem('weight_history', JSON.stringify(updated));
  }, [weightHistory]);

  const totalCaloriesConsumed = useMemo(() =>
    todayData.meals.reduce((sum, m) => sum + m.calories, 0), [todayData.meals]);

  const totalCaloriesBurned = useMemo(() =>
    todayData.workouts.filter(w => w.completed).reduce((sum, w) => sum + w.calories_burned, 0), [todayData.workouts]);

  const macros = useMemo(() => ({
    protein: todayData.meals.reduce((sum, m) => sum + m.protein, 0),
    carbs: todayData.meals.reduce((sum, m) => sum + m.carbs, 0),
    fat: todayData.meals.reduce((sum, m) => sum + m.fat, 0),
  }), [todayData.meals]);

  const value = useMemo(() => ({
    todayData, addMeal, removeMeal, addWorkout, completeWorkout, addWater, removeWater,
    weightHistory, logWeight, streak, totalCaloriesConsumed, totalCaloriesBurned, macros,
  }), [todayData, weightHistory, streak, totalCaloriesConsumed, totalCaloriesBurned, macros]);

  return <FitnessContext.Provider value={value}>{children}</FitnessContext.Provider>;
}

export function useFitness() {
  const context = useContext(FitnessContext);
  if (!context) throw new Error('useFitness must be used within FitnessProvider');
  return context;
}

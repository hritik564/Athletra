import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';

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
  steps: number;
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
  addSteps: (count: number) => Promise<void>;
  setSteps: (count: number) => Promise<void>;
  stepsGoal: number;
  updateStepsGoal: (goal: number) => Promise<void>;
  pedometerAvailable: boolean;
  sensorSteps: number;
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

function getMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

let idCounter = 0;
function generateId(): string {
  idCounter++;
  return `${Date.now()}-${idCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

const DEFAULT_STEPS_GOAL = 10000;

const emptyDay = (date: string): DayData => ({
  date,
  meals: [],
  workouts: [],
  waterGlasses: 0,
  steps: 0,
});

export function FitnessProvider({ children }: { children: ReactNode }) {
  const [todayData, setTodayData] = useState<DayData>(emptyDay(getToday()));
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [streak, setStreak] = useState<StreakData>({ currentStreak: 0, longestStreak: 0, lastActiveDate: '' });
  const [stepsGoal, setStepsGoal] = useState(DEFAULT_STEPS_GOAL);

  const [sensorSteps, setSensorSteps] = useState(0);
  const [manualSteps, setManualSteps] = useState(0);
  const [pedometerAvailable, setPedometerAvailable] = useState(false);
  const sensorStepsRef = useRef(0);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let subscription: { remove: () => void } | null = null;

    const setupPedometer = async () => {
      try {
        const available = await Pedometer.isAvailableAsync();
        setPedometerAvailable(available);
        if (!available) return;

        const fetchSensorSteps = async () => {
          try {
            const result = await Pedometer.getStepCountAsync(getMidnight(), new Date());
            setSensorSteps(result.steps);
            sensorStepsRef.current = result.steps;
          } catch {}
        };

        await fetchSensorSteps();

        subscription = Pedometer.watchStepCount((result) => {
          fetchSensorSteps();
        });

        const appStateListener = AppState.addEventListener('change', (state) => {
          if (state === 'active') {
            fetchSensorSteps();
          }
        });

        return () => {
          appStateListener.remove();
        };
      } catch {
        setPedometerAvailable(false);
      }
    };

    let appStateCleanup: (() => void) | undefined;
    setupPedometer().then((cleanup) => {
      appStateCleanup = cleanup;
    });

    return () => {
      if (subscription) subscription.remove();
      if (appStateCleanup) appStateCleanup();
    };
  }, []);

  useEffect(() => {
    const totalSteps = sensorSteps + manualSteps;
    if (totalSteps !== todayData.steps) {
      const updated = { ...todayData, steps: Math.max(0, totalSteps) };
      setTodayData(updated);
      AsyncStorage.setItem(`day_${updated.date}`, JSON.stringify(updated));
    }
  }, [sensorSteps, manualSteps]);

  const loadData = async () => {
    const today = getToday();
    const [dayStr, weightsStr, streakStr, stepsGoalStr, manualStepsStr] = await Promise.all([
      AsyncStorage.getItem(`day_${today}`),
      AsyncStorage.getItem('weight_history'),
      AsyncStorage.getItem('streak_data'),
      AsyncStorage.getItem('steps_goal'),
      AsyncStorage.getItem(`manual_steps_${today}`),
    ]);
    if (dayStr) {
      const parsed = JSON.parse(dayStr);
      setTodayData({ steps: 0, ...parsed });
    }
    if (weightsStr) setWeightHistory(JSON.parse(weightsStr));
    if (streakStr) setStreak(JSON.parse(streakStr));
    if (stepsGoalStr) setStepsGoal(JSON.parse(stepsGoalStr));
    if (manualStepsStr) setManualSteps(JSON.parse(manualStepsStr));
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

  const saveManualSteps = useCallback(async (val: number) => {
    setManualSteps(val);
    await AsyncStorage.setItem(`manual_steps_${getToday()}`, JSON.stringify(val));
  }, []);

  const addSteps = useCallback(async (count: number) => {
    const newManual = manualSteps + count;
    await saveManualSteps(newManual);
  }, [manualSteps, saveManualSteps]);

  const setStepsValue = useCallback(async (count: number) => {
    const desired = Math.max(0, count);
    const newManual = desired - sensorStepsRef.current;
    await saveManualSteps(newManual);
  }, [saveManualSteps]);

  const updateStepsGoal = useCallback(async (goal: number) => {
    const newGoal = Math.max(100, goal);
    setStepsGoal(newGoal);
    await AsyncStorage.setItem('steps_goal', JSON.stringify(newGoal));
  }, []);

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
    addSteps, setSteps: setStepsValue, stepsGoal, updateStepsGoal,
    pedometerAvailable, sensorSteps,
    weightHistory, logWeight, streak, totalCaloriesConsumed, totalCaloriesBurned, macros,
  }), [todayData, weightHistory, streak, stepsGoal, pedometerAvailable, sensorSteps, totalCaloriesConsumed, totalCaloriesBurned, macros]);

  return <FitnessContext.Provider value={value}>{children}</FitnessContext.Provider>;
}

export function useFitness() {
  const context = useContext(FitnessContext);
  if (!context) throw new Error('useFitness must be used within FitnessProvider');
  return context;
}

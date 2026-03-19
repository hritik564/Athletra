import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PrimarySport =
  | 'cricket' | 'yoga' | 'skating' | 'badminton'
  | 'tennis' | 'football' | 'basketball' | '';

export type LeadHand = 'left' | 'right';

export type FitnessGoal =
  | 'lose_weight' | 'build_muscle' | 'stay_fit'
  | 'gain_energy' | 'pro_athlete' | 'recovery'
  | 'technique' | 'power' | 'weight_loss' | '';

export type UnitSystem = 'metric' | 'imperial';

export interface UserProfile {
  name: string;
  age: number;
  weight: number;
  weightUnit: 'kg' | 'lbs';
  height: number;
  heightUnit: 'cm' | 'ft';
  goal: 'lose_weight' | 'build_muscle' | 'stay_fit' | 'gain_energy';
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced';
  calorieTarget: number;
  isAthlete: boolean;
  sport: string;
  athleteLevel: string;
  healthConditions: string[];
  healthDetails: string;
  allergies: string;
  dailyPattern: string;
  workoutEnvironment: 'gym' | 'home' | 'outdoors' | 'mixed';
  dietaryPreference: 'none' | 'vegetarian' | 'vegan' | 'keto' | 'paleo' | 'gluten_free';
  onboarded: boolean;

  // Biometric fields
  heightCm: number;
  weightKg: number;
  primarySport: PrimarySport;
  leadHand: LeadHand;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  healthFlags: string[];
  fitnessGoal: FitnessGoal;

  // Locker system
  preferredUnitSystem: UnitSystem;
  unlockedSports: string[];
  sportSpecificData: Record<string, any>;
}

export const defaultProfile: UserProfile = {
  name: '',
  age: 25,
  weight: 70,
  weightUnit: 'kg',
  height: 170,
  heightUnit: 'cm',
  goal: 'stay_fit',
  activityLevel: 'moderate',
  fitnessLevel: 'intermediate',
  calorieTarget: 2000,
  isAthlete: false,
  sport: '',
  athleteLevel: '',
  healthConditions: [],
  healthDetails: '',
  allergies: '',
  dailyPattern: '',
  workoutEnvironment: 'home',
  dietaryPreference: 'none',
  onboarded: false,

  heightCm: 170,
  weightKg: 70,
  primarySport: '',
  leadHand: 'right',
  skillLevel: 'intermediate',
  healthFlags: [],
  fitnessGoal: '',

  preferredUnitSystem: 'metric',
  unlockedSports: [],
  sportSpecificData: {},
};

interface UserContextValue {
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  updateSportData: (sport: string, data: Record<string, any>) => Promise<void>;
  addUnlockedSport: (sport: string) => Promise<void>;
  isLoading: boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

function deriveMetricValues(profile: UserProfile): Partial<UserProfile> {
  const heightCm =
    profile.heightUnit === 'cm'
      ? profile.height
      : Math.round(profile.height * 30.48);
  const weightKg =
    profile.weightUnit === 'kg'
      ? profile.weight
      : Math.round(profile.weight * 0.453592 * 100) / 100;
  return { heightCm, weightKg };
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('user_profile').then((data) => {
      if (data) {
        const loaded: UserProfile = { ...defaultProfile, ...JSON.parse(data) };
        setProfile({ ...loaded, ...deriveMetricValues(loaded) });
      }
      setIsLoading(false);
    });
  }, []);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    const merged = { ...profile, ...updates };
    const derived = deriveMetricValues(merged);
    const newProfile = { ...merged, ...derived };
    setProfile(newProfile);
    await AsyncStorage.setItem('user_profile', JSON.stringify(newProfile));
  };

  const updateSportData = async (sport: string, data: Record<string, any>) => {
    const current = profile.sportSpecificData || {};
    const updated = {
      ...current,
      [sport]: { ...(current[sport] || {}), ...data },
    };
    await updateProfile({ sportSpecificData: updated });
  };

  const addUnlockedSport = async (sport: string) => {
    if (profile.unlockedSports.includes(sport)) return;
    await updateProfile({ unlockedSports: [...profile.unlockedSports, sport] });
  };

  const value = useMemo(
    () => ({ profile, updateProfile, updateSportData, addUnlockedSport, isLoading }),
    [profile, isLoading],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within UserProvider');
  return context;
}

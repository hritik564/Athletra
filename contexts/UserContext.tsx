import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
};

interface UserContextValue {
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  isLoading: boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('user_profile').then((data) => {
      if (data) {
        setProfile({ ...defaultProfile, ...JSON.parse(data) });
      }
      setIsLoading(false);
    });
  }, []);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    const newProfile = { ...profile, ...updates };
    setProfile(newProfile);
    await AsyncStorage.setItem('user_profile', JSON.stringify(newProfile));
  };

  const value = useMemo(() => ({ profile, updateProfile, isLoading }), [profile, isLoading]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within UserProvider');
  return context;
}

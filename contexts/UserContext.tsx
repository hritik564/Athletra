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
  calorieTarget: number;
  onboarded: boolean;
}

const defaultProfile: UserProfile = {
  name: '',
  age: 25,
  weight: 70,
  weightUnit: 'kg',
  height: 170,
  heightUnit: 'cm',
  goal: 'stay_fit',
  activityLevel: 'moderate',
  calorieTarget: 2000,
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

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable, Platform,
  ActivityIndicator, Animated, Alert,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fetch } from 'expo/fetch';
import { useAudioRecorder, useAudioPlayer, AudioModule, RecordingPresets } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useUser } from '@/contexts/UserContext';
import { useFitness } from '@/contexts/FitnessContext';
import { getApiUrl } from '@/lib/query-client';

interface ParsedMealPlan {
  meals: Array<{
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  }>;
}

interface ParsedWorkoutPlan {
  name: string;
  duration: number;
  calories_burned: number;
  exercises: Array<{
    name: string;
    sets: number;
    reps: number | string;
    rest_seconds: number;
    description: string;
  }>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isVoice?: boolean;
  audioUri?: string;
  savedMealPlan?: boolean;
  savedWorkoutPlan?: boolean;
}

let messageCounter = 0;
function generateUniqueId(): string {
  messageCounter++;
  return `msg-${Date.now()}-${messageCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

function FormattedText({ text, isUser }: { text: string; isUser: boolean }) {
  const textColor = isUser ? '#fff' : Colors.text;
  const mutedColor = isUser ? 'rgba(255,255,255,0.7)' : Colors.textSecondary;
  const accentColor = isUser ? '#fff' : Colors.primary;

  const paragraphs = text.split(/\n\n+/);
  const elements: React.ReactNode[] = [];

  paragraphs.forEach((paragraph, pIdx) => {
    const lines = paragraph.split('\n');
    lines.forEach((line, lIdx) => {
      const key = `${pIdx}-${lIdx}`;
      const trimmed = line.trim();
      if (!trimmed) return;

      const isHeader = /^#{1,3}\s+/.test(trimmed);
      const isBullet = /^[-•]\s+/.test(trimmed);
      const isNumbered = /^\d+[\.\)]\s+/.test(trimmed);

      if (isHeader) {
        const headerText = trimmed.replace(/^#{1,3}\s+/, '');
        elements.push(
          <Text key={key} style={[fmtStyles.header, { color: accentColor }]}>
            {renderInlineFormatting(headerText, textColor, accentColor)}
          </Text>
        );
      } else if (isBullet) {
        const bulletText = trimmed.replace(/^[-•]\s+/, '');
        elements.push(
          <View key={key} style={fmtStyles.bulletRow}>
            <Text style={[fmtStyles.bulletDot, { color: accentColor }]}>•</Text>
            <Text style={[fmtStyles.bulletText, { color: textColor }]}>
              {renderInlineFormatting(bulletText, textColor, accentColor)}
            </Text>
          </View>
        );
      } else if (isNumbered) {
        const match = trimmed.match(/^(\d+)[\.\)]\s+(.*)/);
        if (match) {
          elements.push(
            <View key={key} style={fmtStyles.bulletRow}>
              <Text style={[fmtStyles.numberLabel, { color: accentColor }]}>{match[1]}.</Text>
              <Text style={[fmtStyles.bulletText, { color: textColor }]}>
                {renderInlineFormatting(match[2], textColor, accentColor)}
              </Text>
            </View>
          );
        }
      } else {
        elements.push(
          <Text key={key} style={[fmtStyles.paragraph, { color: textColor }]}>
            {renderInlineFormatting(trimmed, textColor, accentColor)}
          </Text>
        );
      }
    });

    if (pIdx < paragraphs.length - 1) {
      elements.push(<View key={`spacer-${pIdx}`} style={{ height: 8 }} />);
    }
  });

  return <View style={fmtStyles.container}>{elements}</View>;
}

function renderInlineFormatting(text: string, textColor: string, accentColor: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <Text key={`t-${lastIndex}`} style={{ color: textColor }}>
          {text.slice(lastIndex, match.index)}
        </Text>
      );
    }
    parts.push(
      <Text key={`b-${match.index}`} style={{ fontFamily: 'Outfit_700Bold', color: accentColor }}>
        {match[1]}
      </Text>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(
      <Text key={`t-${lastIndex}`} style={{ color: textColor }}>
        {text.slice(lastIndex)}
      </Text>
    );
  }

  return parts.length > 0 ? parts : [<Text key="plain" style={{ color: textColor }}>{text}</Text>];
}

const fmtStyles = StyleSheet.create({
  container: { gap: 3 },
  header: {
    fontSize: 15, fontFamily: 'Outfit_700Bold', marginTop: 4, marginBottom: 2,
  },
  paragraph: {
    fontSize: 14, fontFamily: 'Outfit_400Regular', lineHeight: 20,
  },
  bulletRow: {
    flexDirection: 'row', paddingLeft: 4, gap: 6, marginVertical: 1,
  },
  bulletDot: {
    fontSize: 14, fontFamily: 'Outfit_700Bold', lineHeight: 20, width: 10,
  },
  numberLabel: {
    fontSize: 14, fontFamily: 'Outfit_700Bold', lineHeight: 20, width: 18,
  },
  bulletText: {
    fontSize: 14, fontFamily: 'Outfit_400Regular', lineHeight: 20, flex: 1,
  },
});

function parsePlans(content: string) {
  let displayText = content;
  let mealPlan: ParsedMealPlan | null = null;
  let workoutPlan: ParsedWorkoutPlan | null = null;

  const mealMatch = content.match(/<<<MEAL_PLAN>>>\s*([\s\S]*?)\s*<<<END_MEAL_PLAN>>>/);
  if (mealMatch) {
    try {
      mealPlan = JSON.parse(mealMatch[1]);
    } catch {}
    displayText = displayText.replace(/<<<MEAL_PLAN>>>[\s\S]*?<<<END_MEAL_PLAN>>>/, '').trim();
  }

  const workoutMatch = content.match(/<<<WORKOUT_PLAN>>>\s*([\s\S]*?)\s*<<<END_WORKOUT_PLAN>>>/);
  if (workoutMatch) {
    try {
      workoutPlan = JSON.parse(workoutMatch[1]);
    } catch {}
    displayText = displayText.replace(/<<<WORKOUT_PLAN>>>[\s\S]*?<<<END_WORKOUT_PLAN>>>/, '').trim();
  }

  return { displayText, mealPlan, workoutPlan };
}

function MessageBubble({
  message,
  onPlayAudio,
  onSaveMealPlan,
  onSaveWorkoutPlan,
}: {
  message: Message;
  onPlayAudio?: (uri: string) => void;
  onSaveMealPlan?: (plan: ParsedMealPlan) => void;
  onSaveWorkoutPlan?: (plan: ParsedWorkoutPlan) => void;
}) {
  const isUser = message.role === 'user';
  const { displayText, mealPlan, workoutPlan } = isUser
    ? { displayText: message.content, mealPlan: null, workoutPlan: null }
    : parsePlans(message.content);

  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser && (
        <View style={styles.coachAvatar}>
          <Ionicons name="sparkles" size={14} color="#fff" />
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {message.isVoice && isUser && (
          <View style={styles.voiceLabel}>
            <Ionicons name="mic" size={12} color={Colors.primary} />
            <Text style={styles.voiceLabelText}>Voice</Text>
          </View>
        )}
        <FormattedText text={displayText} isUser={isUser} />
        {message.audioUri && !isUser && (
          <Pressable style={styles.playBtn} onPress={() => onPlayAudio?.(message.audioUri!)}>
            <Ionicons name="volume-high" size={16} color={Colors.primary} />
            <Text style={styles.playBtnText}>Play</Text>
          </Pressable>
        )}
        {mealPlan && !message.savedMealPlan && (
          <Pressable
            style={styles.savePlanBtn}
            onPress={() => onSaveMealPlan?.(mealPlan)}
          >
            <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.savePlanGradient}>
              <Ionicons name="restaurant" size={16} color="#fff" />
              <Text style={styles.savePlanText}>Save to Meals</Text>
            </LinearGradient>
          </Pressable>
        )}
        {mealPlan && message.savedMealPlan && (
          <View style={styles.savedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={styles.savedBadgeText}>Saved to Meals</Text>
          </View>
        )}
        {workoutPlan && !message.savedWorkoutPlan && (
          <Pressable
            style={styles.savePlanBtn}
            onPress={() => onSaveWorkoutPlan?.(workoutPlan)}
          >
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.savePlanGradient}>
              <Ionicons name="barbell" size={16} color="#fff" />
              <Text style={styles.savePlanText}>Save to Workouts</Text>
            </LinearGradient>
          </Pressable>
        )}
        {workoutPlan && message.savedWorkoutPlan && (
          <View style={styles.savedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={styles.savedBadgeText}>Saved to Workouts</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function TypingIndicator() {
  return (
    <View style={[styles.bubbleRow]}>
      <View style={styles.coachAvatar}>
        <Ionicons name="sparkles" size={14} color="#fff" />
      </View>
      <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    </View>
  );
}

function RecordingIndicator({ duration }: { duration: number }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const secs = Math.floor(duration);
  const mins = Math.floor(secs / 60);
  const displaySecs = secs % 60;

  return (
    <View style={styles.recordingBar}>
      <Animated.View style={[styles.recordingDot, { transform: [{ scale: pulseAnim }] }]} />
      <Text style={styles.recordingTime}>{mins}:{displaySecs.toString().padStart(2, '0')}</Text>
      <Text style={styles.recordingLabel}>Recording...</Text>
    </View>
  );
}

const QUICK_PROMPTS = [
  "Create a meal plan for today",
  "Design a workout for me",
  "How am I doing today?",
  "Help me stay motivated",
];

export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useUser();
  const { totalCaloriesConsumed, totalCaloriesBurned, macros, todayData, streak, addMeal, addWorkout } = useFitness();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlaybackUri, setCurrentPlaybackUri] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  let tabBarHeight = 0;
  try { tabBarHeight = useBottomTabBarHeight(); } catch {}

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer(currentPlaybackUri);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const buildContextMessage = useCallback(() => {
    return `[Context: Today I've eaten ${totalCaloriesConsumed}/${profile.calorieTarget} kcal. Burned: ${totalCaloriesBurned} kcal. Macros: P${macros.protein}g, C${macros.carbs}g, F${macros.fat}g. Water: ${todayData.waterGlasses}/8. Workouts today: ${todayData.workouts.length} (${todayData.workouts.filter(w => w.completed).length} completed). Streak: ${streak.currentStreak} days.]`;
  }, [totalCaloriesConsumed, profile, totalCaloriesBurned, macros, todayData, streak]);

  const startRecording = async () => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) return;

      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const stopRecording = async () => {
    if (!recorder.isRecording) return;

    try {
      await recorder.stop();
      setIsRecording(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const uri = recorder.uri;
      if (!uri) return;

      setIsProcessingVoice(true);
      setShowTyping(true);

      const response = await globalThis.fetch(uri);
      const blob = await response.blob();
      const reader = new FileReader();

      const base64Audio = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const baseUrl = getApiUrl();
      const transcribeRes = await globalThis.fetch(`${baseUrl}api/coach/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64Audio }),
      });

      if (!transcribeRes.ok) throw new Error('Transcription failed');
      const { text: transcribedText } = await transcribeRes.json();

      if (!transcribedText || transcribedText.trim().length === 0) {
        setShowTyping(false);
        setIsProcessingVoice(false);
        return;
      }

      const userMessage: Message = {
        id: generateUniqueId(),
        role: 'user',
        content: transcribedText,
        isVoice: true,
      };
      setMessages(prev => [...prev, userMessage]);

      const currentMessages = messages.map(m => ({ role: m.role, content: m.content }));
      const contextPrefix = messages.length === 0 ? buildContextMessage() + '\n\n' : '';

      const voiceRes = await globalThis.fetch(`${baseUrl}api/coach/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: currentMessages,
          userProfile: profile,
          userText: contextPrefix + transcribedText,
        }),
      });

      if (!voiceRes.ok) throw new Error('Voice response failed');
      const voiceData = await voiceRes.json();

      let audioUri = '';
      if (voiceData.audio) {
        audioUri = `data:audio/wav;base64,${voiceData.audio}`;
      }

      const assistantMessage: Message = {
        id: generateUniqueId(),
        role: 'assistant',
        content: voiceData.text,
        audioUri: audioUri || undefined,
      };
      setMessages(prev => [...prev, assistantMessage]);

      if (audioUri) {
        setCurrentPlaybackUri(audioUri);
        setIsPlaying(true);
      }

    } catch (error) {
      console.error('Voice processing error:', error);
      setMessages(prev => [...prev, {
        id: generateUniqueId(),
        role: 'assistant',
        content: "Sorry, I had trouble processing your voice. Please try again or type your message.",
      }]);
    } finally {
      setShowTyping(false);
      setIsProcessingVoice(false);
    }
  };

  useEffect(() => {
    if (isPlaying && currentPlaybackUri && player) {
      try {
        player.play();
      } catch (e) {
        console.error('Playback error:', e);
      }
    }
  }, [currentPlaybackUri, isPlaying]);

  const handleSaveMealPlan = async (plan: ParsedMealPlan, messageId: string) => {
    try {
      for (const meal of plan.meals) {
        await addMeal({
          name: meal.name,
          calories: meal.calories || 0,
          protein: meal.protein || 0,
          carbs: meal.carbs || 0,
          fat: meal.fat || 0,
          mealType: meal.mealType || 'lunch',
        });
      }
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, savedMealPlan: true } : m));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Meal Plan Saved!',
        `${plan.meals.length} meal${plan.meals.length > 1 ? 's' : ''} added to your Meals tab.`,
        [
          { text: 'View Meals', onPress: () => router.push('/(tabs)/meals') },
          { text: 'OK' },
        ]
      );
    } catch (e) {
      Alert.alert('Error', 'Failed to save meal plan. Please try again.');
    }
  };

  const handleSaveWorkoutPlan = async (plan: ParsedWorkoutPlan, messageId: string) => {
    try {
      await addWorkout({
        name: plan.name || 'AI Workout',
        duration: plan.duration || 30,
        calories_burned: plan.calories_burned || 200,
        exercises: (plan.exercises || []).map(e => ({
          name: e.name,
          sets: e.sets || 3,
          reps: e.reps || 10,
          rest_seconds: e.rest_seconds || 30,
          description: e.description || '',
        })),
      });
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, savedWorkoutPlan: true } : m));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Workout Saved!',
        `"${plan.name}" added to your Workouts tab.`,
        [
          { text: 'View Workouts', onPress: () => router.push('/(tabs)/workouts') },
          { text: 'OK' },
        ]
      );
    } catch (e) {
      Alert.alert('Error', 'Failed to save workout. Please try again.');
    }
  };

  const handlePlayAudio = (uri: string) => {
    setCurrentPlaybackUri(uri);
    setIsPlaying(true);
  };

  const handleStopPlayback = () => {
    if (player) {
      player.pause();
    }
    setIsPlaying(false);
  };

  const handleSend = async (text?: string) => {
    const messageText = text || inputText.trim();
    if (!messageText || isStreaming) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInputText('');

    const currentMessages = [...messages];
    const userMessage: Message = { id: generateUniqueId(), role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);
    setShowTyping(true);

    const contextPrefix = messages.length === 0 ? buildContextMessage() + '\n\n' : '';

    try {
      const baseUrl = getApiUrl();
      const chatHistory = [
        ...currentMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: contextPrefix + messageText },
      ];

      const response = await fetch(`${baseUrl}api/coach/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ messages: chatHistory, userProfile: profile }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';
      let assistantAdded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullContent += parsed.content;
              if (!assistantAdded) {
                setShowTyping(false);
                setMessages(prev => [...prev, { id: generateUniqueId(), role: 'assistant', content: fullContent }]);
                assistantAdded = true;
              } else {
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullContent };
                  return updated;
                });
              }
            }
          } catch {}
        }
      }
    } catch (error) {
      setShowTyping(false);
      setMessages(prev => [...prev, { id: generateUniqueId(), role: 'assistant', content: 'Sorry, I had trouble connecting. Please try again.' }]);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
    }
  };

  const reversedMessages = [...messages].reverse();
  const hasMessages = messages.length > 0;
  const isBusy = isStreaming || isProcessingVoice;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: Colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={tabBarHeight}>
      <View style={[styles.headerBar, { paddingTop: (insets.top || webTopInset) + 8 }]}>
        <View style={styles.headerLeft}>
          <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.headerAvatar}>
            <Ionicons name="sparkles" size={18} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={styles.headerTitle}>VitalCoach</Text>
            <Text style={styles.headerSubtitle}>
              {isRecording ? 'Listening...' : isProcessingVoice ? 'Processing...' : 'AI Fitness Coach'}
            </Text>
          </View>
        </View>
        {isPlaying && (
          <Pressable onPress={handleStopPlayback}>
            <Ionicons name="stop-circle" size={28} color={Colors.primary} />
          </Pressable>
        )}
      </View>

      {!hasMessages ? (
        <View style={styles.emptyState}>
          <LinearGradient colors={[Colors.primary, Colors.accent]} style={styles.emptyIcon}>
            <Ionicons name="sparkles" size={36} color="#fff" />
          </LinearGradient>
          <Text style={styles.emptyTitle}>Your AI Coach</Text>
          <Text style={styles.emptySubtitle}>
            Type or tap the mic to speak. I know your stats and adapt to you.
          </Text>
          <View style={styles.quickPrompts}>
            {QUICK_PROMPTS.map((prompt, i) => (
              <Pressable
                key={i}
                style={styles.quickPrompt}
                onPress={() => handleSend(prompt)}
              >
                <Text style={styles.quickPromptText}>{prompt}</Text>
                <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          data={reversedMessages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              onPlayAudio={handlePlayAudio}
              onSaveMealPlan={(plan) => handleSaveMealPlan(plan, item.id)}
              onSaveWorkoutPlan={(plan) => handleSaveWorkoutPlan(plan, item.id)}
            />
          )}
          inverted={!!hasMessages}
          ListHeaderComponent={showTyping ? <TypingIndicator /> : null}
          contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 4 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!!hasMessages}
        />
      )}

      {isRecording && <RecordingIndicator duration={recorder.currentTime} />}

      <View style={[styles.inputArea, { marginBottom: Platform.OS === 'web' ? 84 : tabBarHeight || 80, paddingBottom: 8 }]}>
        <View style={styles.inputContainer}>
          {!isRecording ? (
            <>
              <Pressable
                onPress={startRecording}
                disabled={isBusy}
                style={[styles.micBtn, isBusy && styles.micBtnDisabled]}
              >
                <Ionicons name="mic" size={22} color={isBusy ? Colors.textMuted : Colors.primary} />
              </Pressable>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Ask your coach..."
                placeholderTextColor={Colors.textMuted}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={1000}
                blurOnSubmit={false}
                onSubmitEditing={() => handleSend()}
                editable={!isBusy}
              />
              <Pressable
                onPress={() => { handleSend(); inputRef.current?.focus(); }}
                disabled={isBusy || !inputText.trim()}
                style={[styles.sendBtn, (!inputText.trim() || isBusy) && styles.sendBtnDisabled]}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </>
          ) : (
            <Pressable onPress={stopRecording} style={styles.stopRecordingBtn}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.stopRecordingGradient}>
                <Ionicons name="stop" size={24} color="#fff" />
                <Text style={styles.stopRecordingText}>Stop & Send</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Outfit_700Bold', color: Colors.text },
  headerSubtitle: { fontSize: 12, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 24, fontFamily: 'Outfit_700Bold', color: Colors.text, marginBottom: 8 },
  emptySubtitle: { fontSize: 15, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  quickPrompts: { width: '100%', gap: 8 },
  quickPrompt: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, backgroundColor: Colors.surface,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
  },
  quickPromptText: { fontSize: 14, fontFamily: 'Outfit_500Medium', color: Colors.text },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  bubbleRowUser: { flexDirection: 'row-reverse' },
  coachAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleUser: { backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: Colors.surface, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, fontFamily: 'Outfit_400Regular', color: Colors.text, lineHeight: 21 },
  bubbleTextUser: { color: '#fff' },
  typingBubble: { paddingHorizontal: 20, paddingVertical: 14 },
  voiceLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4,
    opacity: 0.7,
  },
  voiceLabelText: { fontSize: 11, fontFamily: 'Outfit_500Medium', color: '#fff' },
  playBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8,
    paddingVertical: 6, paddingHorizontal: 10, backgroundColor: 'rgba(27,127,227,0.12)',
    borderRadius: 12, alignSelf: 'flex-start',
  },
  playBtnText: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', color: Colors.primary },
  savePlanBtn: { marginTop: 10, borderRadius: 10, overflow: 'hidden' },
  savePlanGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
  },
  savePlanText: { fontSize: 13, fontFamily: 'Outfit_700Bold', color: '#fff' },
  savedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: 'rgba(76,175,80,0.1)', borderRadius: 10,
  },
  savedBadgeText: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', color: Colors.success },
  recordingBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 10, backgroundColor: 'rgba(27,127,227,0.08)',
    borderTopWidth: 1, borderTopColor: 'rgba(27,127,227,0.2)',
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.error },
  recordingTime: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: Colors.primary },
  recordingLabel: { fontSize: 14, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary },
  inputArea: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  micBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(27,127,227,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  micBtnDisabled: { opacity: 0.4 },
  input: {
    flex: 1, minHeight: 42, maxHeight: 100, backgroundColor: Colors.surface,
    borderRadius: 21, paddingHorizontal: 16, paddingVertical: 10, color: Colors.text,
    fontSize: 15, fontFamily: 'Outfit_400Regular', borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  stopRecordingBtn: { flex: 1 },
  stopRecordingGradient: {
    height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  stopRecordingText: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#fff' },
});

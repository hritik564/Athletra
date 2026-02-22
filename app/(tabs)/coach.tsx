import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable, Platform,
  ActivityIndicator, Animated,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fetch } from 'expo/fetch';
import { useAudioRecorder, useAudioPlayer, AudioModule, RecordingPresets } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useUser } from '@/contexts/UserContext';
import { useFitness } from '@/contexts/FitnessContext';
import { getApiUrl } from '@/lib/query-client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isVoice?: boolean;
  audioUri?: string;
}

let messageCounter = 0;
function generateUniqueId(): string {
  messageCounter++;
  return `msg-${Date.now()}-${messageCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

function MessageBubble({ message, onPlayAudio }: { message: Message; onPlayAudio?: (uri: string) => void }) {
  const isUser = message.role === 'user';
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
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{message.content}</Text>
        {message.audioUri && !isUser && (
          <Pressable style={styles.playBtn} onPress={() => onPlayAudio?.(message.audioUri!)}>
            <Ionicons name="volume-high" size={16} color={Colors.primary} />
            <Text style={styles.playBtnText}>Play</Text>
          </Pressable>
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
  "What should I eat next?",
  "Give me a quick workout",
  "How am I doing today?",
  "Help me stay motivated",
];

export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useUser();
  const { totalCaloriesConsumed, totalCaloriesBurned, macros, todayData, streak } = useFitness();
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
          <LinearGradient colors={[Colors.primary, '#FF9800']} style={styles.emptyIcon}>
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
  bubbleUser: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
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
    paddingVertical: 6, paddingHorizontal: 10, backgroundColor: 'rgba(255,107,61,0.12)',
    borderRadius: 12, alignSelf: 'flex-start',
  },
  playBtnText: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', color: Colors.primary },
  recordingBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 10, backgroundColor: 'rgba(255,107,61,0.08)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,107,61,0.2)',
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.error },
  recordingTime: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: Colors.primary },
  recordingLabel: { fontSize: 14, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary },
  inputArea: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  micBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,107,61,0.12)',
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

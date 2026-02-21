import { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable, Platform,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fetch } from 'expo/fetch';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useUser } from '@/contexts/UserContext';
import { useFitness } from '@/contexts/FitnessContext';
import { getApiUrl } from '@/lib/query-client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

let messageCounter = 0;
function generateUniqueId(): string {
  messageCounter++;
  return `msg-${Date.now()}-${messageCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser && (
        <View style={styles.coachAvatar}>
          <Ionicons name="sparkles" size={14} color="#fff" />
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{message.content}</Text>
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
  const inputRef = useRef<TextInput>(null);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const buildContextMessage = useCallback(() => {
    return `[Context: Today I've eaten ${totalCaloriesConsumed}/${profile.calorieTarget} kcal. Burned: ${totalCaloriesBurned} kcal. Macros: P${macros.protein}g, C${macros.carbs}g, F${macros.fat}g. Water: ${todayData.waterGlasses}/8. Workouts today: ${todayData.workouts.length} (${todayData.workouts.filter(w => w.completed).length} completed). Streak: ${streak.currentStreak} days.]`;
  }, [totalCaloriesConsumed, profile, totalCaloriesBurned, macros, todayData, streak]);

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

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: Colors.background }]} behavior="padding" keyboardVerticalOffset={0}>
      <View style={[styles.headerBar, { paddingTop: (insets.top || webTopInset) + 8 }]}>
        <View style={styles.headerLeft}>
          <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.headerAvatar}>
            <Ionicons name="sparkles" size={18} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={styles.headerTitle}>VitalCoach</Text>
            <Text style={styles.headerSubtitle}>AI Fitness Coach</Text>
          </View>
        </View>
      </View>

      {!hasMessages ? (
        <View style={styles.emptyState}>
          <LinearGradient colors={[Colors.primary, '#FF9800']} style={styles.emptyIcon}>
            <Ionicons name="sparkles" size={36} color="#fff" />
          </LinearGradient>
          <Text style={styles.emptyTitle}>Your AI Coach</Text>
          <Text style={styles.emptySubtitle}>
            Ask me about nutrition, workouts, motivation, or anything wellness-related. I know your stats and adapt to you.
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
          renderItem={({ item }) => <MessageBubble message={item} />}
          inverted={!!hasMessages}
          ListHeaderComponent={showTyping ? <TypingIndicator /> : null}
          contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 4 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!!hasMessages}
        />
      )}

      <View style={[styles.inputArea, { paddingBottom: insets.bottom || (Platform.OS === 'web' ? 34 : 8) }]}>
        <View style={styles.inputContainer}>
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
          />
          <Pressable
            onPress={() => { handleSend(); inputRef.current?.focus(); }}
            disabled={isStreaming || !inputText.trim()}
            style={[styles.sendBtn, (!inputText.trim() || isStreaming) && styles.sendBtnDisabled]}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
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
  inputArea: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1, minHeight: 42, maxHeight: 100, backgroundColor: Colors.surface,
    borderRadius: 21, paddingHorizontal: 16, paddingVertical: 10, color: Colors.text,
    fontSize: 15, fontFamily: 'Outfit_400Regular', borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
});

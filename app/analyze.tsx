import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform, ScrollView,
  Image, TextInput, Dimensions, ActivityIndicator, Modal,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { fetch } from 'expo/fetch';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import Svg, { Rect, Line, Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/contexts/ThemeContext';
import { useUser } from '@/contexts/UserContext';
import { getApiUrl } from '@/lib/query-client';

const SESSION_HISTORY_KEY = 'technique_analysis_history';

interface SessionRecord {
  id: string;
  date: string;
  sport: string;
  scores: Record<string, number>;
  angles: Record<string, number>;
  result: string;
}

async function loadPreviousSession(sport: string): Promise<SessionRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_HISTORY_KEY);
    if (!raw) return null;
    const sessions: SessionRecord[] = JSON.parse(raw);
    const match = sessions
      .filter(s => s.sport.toLowerCase() === sport.toLowerCase())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    return match || null;
  } catch { return null; }
}

async function saveSession(record: SessionRecord): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_HISTORY_KEY);
    const sessions: SessionRecord[] = raw ? JSON.parse(raw) : [];
    sessions.unshift(record);
    const trimmed = sessions.slice(0, 20);
    await AsyncStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {}
}

function parseScoresFromResult(text: string): Record<string, number> {
  const scores: Record<string, number> = {};
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/^[-•]?\s*\**([^:*]+)\**:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
    if (match) {
      scores[match[1].trim()] = parseFloat(match[2]);
    }
  }
  return scores;
}

function parseFirstFrameAngles(poseAngles: Record<string, number>[]): Record<string, number> {
  if (!poseAngles.length) return {};
  const first = poseAngles[0];
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(first)) {
    if (typeof v === 'number') result[k] = v;
  }
  return result;
}

const { width } = Dimensions.get('window');

type AnalyzeMode = 'select' | 'camera' | 'review' | 'analyzing' | 'result';

function ScoreBadge({ label, score, Colors }: { label: string; score: number; Colors: any }) {
  const color = score >= 8 ? Colors.success : score >= 6 ? Colors.warning : Colors.error;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 8, paddingHorizontal: 12, backgroundColor: color + '14',
      borderRadius: 10, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: color,
    }}>
      <Text style={{ fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: Colors.text }}>{label}</Text>
      <Text style={{ fontSize: 16, fontFamily: 'Outfit_700Bold', color }}>{score}/10</Text>
    </View>
  );
}

function parseScoreLine(line: string): { label: string; score: number } | null {
  const match = line.match(/^[-•]?\s*\**([^:*]+)\**:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  if (match) return { label: match[1].trim(), score: Math.round(parseFloat(match[2])) };
  return null;
}

function FormattedText({ text, Colors }: { text: string; Colors: any }) {
  const paragraphs = text.split(/\n\n+/);
  const elements: React.ReactNode[] = [];
  let currentSection = '';

  const sectionIcons: Record<string, string> = {
    'quick take': 'flash',
    'movement breakdown': 'pulse',
    'what you\'re nailing': 'checkmark-circle',
    'top improvements': 'trending-up',
    'progress update': 'analytics',
    'technique score': 'stats-chart',
    'your ideal form': 'body',
    'your drill': 'fitness',
  };

  const getSectionIcon = (header: string): string => {
    const lower = header.toLowerCase();
    for (const [key, icon] of Object.entries(sectionIcons)) {
      if (lower.includes(key)) return icon;
    }
    return 'document-text';
  };

  paragraphs.forEach((paragraph, pIdx) => {
    const lines = paragraph.split('\n');
    lines.forEach((line, lIdx) => {
      const key = `${pIdx}-${lIdx}`;
      const trimmed = line.trim();
      if (!trimmed) return;

      const isHeader = /^\*\*[^*]+\*\*$/.test(trimmed) || /^#{1,3}\s+/.test(trimmed);
      const isBullet = /^[-•]\s+/.test(trimmed);
      const isScoreLine = /\d+\s*\/\s*10/.test(trimmed);

      if (isHeader) {
        const headerText = trimmed.replace(/^\*\*|\*\*$/g, '').replace(/^#{1,3}\s+/, '');
        currentSection = headerText.toLowerCase();
        const iconName = getSectionIcon(headerText);
        elements.push(
          <View key={key} style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            marginTop: pIdx > 0 ? 16 : 0, marginBottom: 6,
          }}>
            <Ionicons name={iconName as any} size={18} color={Colors.primary} />
            <Text style={{
              fontSize: 16, fontFamily: 'Outfit_700Bold', color: Colors.text,
            }}>{headerText}</Text>
          </View>
        );
      } else if (isScoreLine && currentSection.includes('score')) {
        const parsed = parseScoreLine(trimmed);
        if (parsed) {
          elements.push(<ScoreBadge key={key} label={parsed.label} score={parsed.score} Colors={Colors} />);
        } else {
          elements.push(
            <Text key={key} style={{
              fontSize: 14, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary,
              lineHeight: 20, marginBottom: 4,
            }}>{renderBold(trimmed, Colors)}</Text>
          );
        }
      } else if (isBullet) {
        const bulletText = trimmed.replace(/^[-•]\s+/, '');
        elements.push(
          <View key={key} style={{ flexDirection: 'row', marginBottom: 6, paddingLeft: 4 }}>
            <Text style={{ color: Colors.primary, marginRight: 8, fontSize: 14 }}>{'\u2022'}</Text>
            <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Outfit_400Regular', color: Colors.text, lineHeight: 20 }}>
              {renderBold(bulletText, Colors)}
            </Text>
          </View>
        );
      } else if (currentSection.includes('quick take')) {
        elements.push(
          <Text key={key} style={{
            fontSize: 15, fontFamily: 'Outfit_500Medium', color: Colors.text,
            lineHeight: 22, marginBottom: 4,
          }}>{renderBold(trimmed, Colors)}</Text>
        );
      } else if (currentSection.includes('drill')) {
        elements.push(
          <Text key={key} style={{
            fontSize: 14, fontFamily: 'Outfit_500Medium', color: Colors.accent,
            lineHeight: 20, marginBottom: 4,
          }}>{renderBold(trimmed, Colors)}</Text>
        );
      } else if (currentSection.includes('ideal form')) {
        elements.push(
          <Text key={key} style={{
            fontSize: 14, fontFamily: 'Outfit_400Regular', color: Colors.textSecondary,
            lineHeight: 20, marginBottom: 4, fontStyle: 'italic',
          }}>{renderBold(trimmed, Colors)}</Text>
        );
      } else {
        elements.push(
          <Text key={key} style={{
            fontSize: 14, fontFamily: 'Outfit_400Regular', color: Colors.text,
            lineHeight: 20, marginBottom: 4,
          }}>{renderBold(trimmed, Colors)}</Text>
        );
      }
    });
  });

  return <View>{elements}</View>;
}

function renderBold(text: string, Colors: any): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={{ fontFamily: 'Outfit_700Bold', color: Colors.text }}>{part.slice(2, -2)}</Text>;
    }
    return <Text key={i}>{part}</Text>;
  });
}

function CameraSetupDiagram({ Colors, diagramWidth }: { Colors: any; diagramWidth: number }) {
  const h = diagramWidth * 0.75;
  const cx = diagramWidth / 2;
  const personX = cx + 40;
  const phoneX = cx - 60;

  return (
    <Svg width={diagramWidth} height={h} viewBox={`0 0 ${diagramWidth} ${h}`}>
      <Defs>
        <RadialGradient id="floorGrad" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={Colors.primary} stopOpacity="0.12" />
          <Stop offset="1" stopColor={Colors.primary} stopOpacity="0.02" />
        </RadialGradient>
      </Defs>

      <Rect x={cx - 90} y={h - 30} width={180} height={20} rx={10} fill="url(#floorGrad)" />
      <Line x1={cx - 90} y1={h - 22} x2={cx + 90} y2={h - 22} stroke={Colors.border} strokeWidth={1} strokeDasharray="4,4" />

      <Circle cx={personX} cy={h * 0.2} r={12} fill={Colors.primary + '30'} stroke={Colors.primary} strokeWidth={1.5} />
      <Line x1={personX} y1={h * 0.2 + 12} x2={personX} y2={h * 0.55} stroke={Colors.primary} strokeWidth={2} strokeLinecap="round" />
      <Line x1={personX} y1={h * 0.32} x2={personX - 14} y2={h * 0.44} stroke={Colors.primary} strokeWidth={2} strokeLinecap="round" />
      <Line x1={personX} y1={h * 0.32} x2={personX + 14} y2={h * 0.44} stroke={Colors.primary} strokeWidth={2} strokeLinecap="round" />
      <Line x1={personX} y1={h * 0.55} x2={personX - 10} y2={h * 0.72} stroke={Colors.primary} strokeWidth={2} strokeLinecap="round" />
      <Line x1={personX} y1={h * 0.55} x2={personX + 10} y2={h * 0.72} stroke={Colors.primary} strokeWidth={2} strokeLinecap="round" />

      <Rect x={personX - 22} y={h * 0.12} width={44} height={h * 0.65} rx={6} stroke={Colors.success + '50'} strokeWidth={1} fill={Colors.success + '06'} strokeDasharray="3,3" />

      <Rect x={phoneX - 8} y={h * 0.35} width={16} height={26} rx={3} fill={Colors.accent + '25'} stroke={Colors.accent} strokeWidth={1.5} />
      <Circle cx={phoneX} cy={h * 0.35 + 6} r={2.5} fill={Colors.accent} />
      <Rect x={phoneX - 1} y={h * 0.35 + 26} width={2} height={h * 0.72 - h * 0.35 - 26} fill={Colors.textMuted + '60'} />
      <Line x1={phoneX - 8} y1={h * 0.72} x2={phoneX + 8} y2={h * 0.72} stroke={Colors.textMuted + '60'} strokeWidth={2} />

      <Line x1={phoneX + 8} y1={h * 0.35 + 13} x2={personX - 22} y2={h * 0.16} stroke={Colors.accent + '35'} strokeWidth={1} strokeDasharray="4,3" />
      <Line x1={phoneX + 8} y1={h * 0.35 + 13} x2={personX - 22} y2={h * 0.72} stroke={Colors.accent + '35'} strokeWidth={1} strokeDasharray="4,3" />

      <Line x1={phoneX - 20} y1={h * 0.35 + 13} x2={phoneX - 20} y2={h * 0.72} stroke={Colors.textMuted + '40'} strokeWidth={1} />
      <Line x1={phoneX - 24} y1={h * 0.35 + 13} x2={phoneX - 16} y2={h * 0.35 + 13} stroke={Colors.textMuted + '40'} strokeWidth={1} />
      <Line x1={phoneX - 24} y1={h * 0.72} x2={phoneX - 16} y2={h * 0.72} stroke={Colors.textMuted + '40'} strokeWidth={1} />

      <Line x1={phoneX + 8} y1={h * 0.84} x2={personX - 22} y2={h * 0.84} stroke={Colors.primary + '40'} strokeWidth={1} />
      <Line x1={phoneX + 8} y1={h * 0.81} x2={phoneX + 8} y2={h * 0.87} stroke={Colors.primary + '40'} strokeWidth={1} />
      <Line x1={personX - 22} y1={h * 0.81} x2={personX - 22} y2={h * 0.87} stroke={Colors.primary + '40'} strokeWidth={1} />

      <Rect x={phoneX + 14} y={h * 0.8} width={40} height={14} rx={3} fill={Colors.surface} />
      <Path d={`M${phoneX + 12},${h * 0.84} l-4,-3 l0,6 z`} fill={Colors.primary + '60'} />
      <Path d={`M${personX - 20},${h * 0.84} l4,-3 l0,6 z`} fill={Colors.primary + '60'} />
    </Svg>
  );
}

export default function AnalyzeScreen() {
  const Colors = useColors();
  const styles = createStyles(Colors);
  const insets = useSafeAreaInsets();
  const { profile } = useUser();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<AnalyzeMode>('select');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const [description, setDescription] = useState('');
  const [analysisResult, setAnalysisResult] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [annotatedImages, setAnnotatedImages] = useState<string[]>([]);
  const [annotatedFrameMap, setAnnotatedFrameMap] = useState<number[]>([]);
  const [poseAngles, setPoseAngles] = useState<Record<string, number>[]>([]);
  const [motionData, setMotionData] = useState<any>(null);
  const [correctionGuide, setCorrectionGuide] = useState<{
    image: string; joint: string; joint_label: string;
    current_angle: number; target_angle: number; frame_index: number; deviation: number;
  } | null>(null);
  const [activePhaseFrame, setActivePhaseFrame] = useState<number | null>(null);
  const [previousSessionData, setPreviousSessionData] = useState<SessionRecord | null>(null);
  const [poseDetected, setPoseDetected] = useState(false);
  const [poseMessage, setPoseMessage] = useState('');
  const [isDetectingPose, setIsDetectingPose] = useState(false);
  const [showAnnotated, setShowAnnotated] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const player = useAudioPlayer(audioUri);

  useEffect(() => {
    if (player && audioUri) {
      try {
        player.play();
        setIsPlayingAudio(true);
      } catch (e) {
        console.error('Audio play error:', e);
        setIsPlayingAudio(false);
      }
    }
  }, [audioUri]);

  useEffect(() => {
    if (!player) return;
    const playSub = player.addListener('playingChange', (event: { isPlaying: boolean }) => {
      setIsPlayingAudio(event.isPlaying);
    });
    const statusSub = player.addListener('playbackStatusUpdate', (status: any) => {
      if (status?.didJustFinish) {
        setIsPlayingAudio(false);
      }
    });
    return () => {
      playSub.remove();
      statusSub.remove();
    };
  }, [player]);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const bottomInset = insets.bottom || (Platform.OS === 'web' ? 34 : 0);

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      if (photo?.base64) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectedImages(prev => [...prev, `data:image/jpeg;base64,${photo.base64}`]);
        setMode('review');
      }
    } catch (e) {
      console.error('Failed to take photo:', e);
    }
  };

  const startVideoRecording = async () => {
    if (Platform.OS === 'web') return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setMode('select');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 15,
        quality: 0.7,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        setVideoUri(asset.uri);
        await extractFramesFromVideo(asset.uri);
      }
    } catch (e) {
      console.error('Failed to record video:', e);
    }
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.7,
        base64: true,
        selectionLimit: 60,
      });

      if (!result.canceled && result.assets.length > 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const newImages = result.assets
          .filter(a => a.base64)
          .map(a => `data:image/jpeg;base64,${a.base64}`);
        setSelectedImages(prev => [...prev, ...newImages].slice(0, 60));
        setMode('review');
      }
    } catch (e) {
      console.error('Failed to pick image:', e);
    }
  };

  const pickVideoFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 0.5,
        videoMaxDuration: 30,
      });

      if (!result.canceled && result.assets.length > 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const asset = result.assets[0];
        setVideoUri(asset.uri);
        await extractFramesFromVideo(asset.uri);
      }
    } catch (e) {
      console.error('Failed to pick video:', e);
    }
  };

  const readFileAsBase64 = async (uri: string): Promise<string> => {
    const response = await globalThis.fetch(uri);
    const blob = await response.blob();
    const reader = new FileReader();
    return new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const extractFramesFromVideo = async (uri: string) => {
    setIsExtractingFrames(true);
    setMode('review');

    try {
      const base64Video = await readFileAsBase64(uri);

      const baseUrl = getApiUrl();
      const extractRes = await globalThis.fetch(`${baseUrl}api/coach/extract-frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video: base64Video }),
      });

      if (!extractRes.ok) {
        const errorData = await extractRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'Frame extraction failed');
      }

      const { frames } = await extractRes.json();
      if (frames && frames.length > 0) {
        const frameImages = frames.map((f: string) => `data:image/jpeg;base64,${f}`);
        setSelectedImages(prev => [...prev, ...frameImages].slice(0, 60));
      }
    } catch (e) {
      console.error('Frame extraction error:', e);
    } finally {
      setIsExtractingFrames(false);
    }
  };

  const removeImage = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newImages = selectedImages.filter((_, i) => i !== index);
    setSelectedImages(newImages);
    if (newImages.length === 0) {
      setVideoUri(null);
      setMode('select');
    }
  };

  const detectPose = async () => {
    if (selectedImages.length === 0) return;

    setIsDetectingPose(true);
    setPoseMessage('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const baseUrl = getApiUrl();
      const response = await globalThis.fetch(`${baseUrl}api/coach/pose-detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: selectedImages }),
      });

      if (!response.ok) throw new Error('Pose detection failed');

      const data = await response.json();
      if (data.results) {
        const imgs = data.results
          .filter((r: any) => r.detected && r.annotated_image)
          .map((r: any) => `data:image/jpeg;base64,${r.annotated_image}`);
        const angles = data.results
          .filter((r: any) => r.detected && r.angles)
          .map((r: any) => r.angles);

        setAnnotatedImages(imgs);
        setPoseAngles(angles);
        setPoseDetected(true);
        setShowAnnotated(imgs.length > 0);

        if (imgs.length > 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setPoseMessage(`Pose detected in ${imgs.length} of ${selectedImages.length} image${selectedImages.length !== 1 ? 's' : ''}`);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setPoseMessage('No body pose detected. Try photos with a clearer full-body view. AI will still analyze your technique visually.');
        }
      }
    } catch (e) {
      console.error('Pose detection error:', e);
      setPoseDetected(true);
      setPoseMessage('Pose detection unavailable. AI will analyze your technique visually.');
    } finally {
      setIsDetectingPose(false);
    }
  };

  const startAnalysis = async () => {
    if (selectedImages.length === 0) return;

    if (player) {
      try { player.pause(); } catch {}
    }
    if (audioUri && Platform.OS === 'web' && audioUri.startsWith('blob:')) {
      URL.revokeObjectURL(audioUri);
    }
    setAudioUri(null);
    setIsPlayingAudio(false);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMode('analyzing');
    setAnalysisResult('');
    setAnalysisStatus('Detecting body pose...');
    setAnnotatedImages([]);
    setPoseAngles([]);
    setActivePhaseFrame(null);
    setIsStreaming(true);

    const sportName = profile.sport || 'general';
    const prevSession = await loadPreviousSession(sportName);
    setPreviousSessionData(prevSession);

    try {
      const baseUrl = getApiUrl();
      const response = await fetch(`${baseUrl}api/coach/analyze-technique`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({
          images: selectedImages,
          userProfile: profile,
          sport: sportName,
          description: videoUri
            ? `${description ? description + '. ' : ''}These frames were extracted from a video recording of my technique.`
            : description,
          previousSession: prevSession ? {
            date: prevSession.date,
            scores: prevSession.scores,
            angles: prevSession.angles,
          } : undefined,
        }),
      });

      if (!response.ok) throw new Error('Analysis failed');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

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
            if (parsed.error) {
              fullContent += '\n\n' + parsed.error;
              setAnalysisResult(fullContent || parsed.error);
              break;
            }
            if (parsed.status) {
              setAnalysisStatus(parsed.status);
            }
            if (parsed.pose_results) {
              const imgs: string[] = [];
              const frameMap: number[] = [];
              parsed.pose_results.forEach((r: any, idx: number) => {
                if (r.annotated_image) {
                  imgs.push(`data:image/jpeg;base64,${r.annotated_image}`);
                  frameMap.push(idx + 1);
                }
              });
              setAnnotatedImages(imgs);
              setAnnotatedFrameMap(frameMap);
              const angles = parsed.pose_results
                .filter((r: any) => r.angles)
                .map((r: any) => r.angles);
              setPoseAngles(angles);
              if (parsed.motion_analysis) {
                setMotionData(parsed.motion_analysis);
              }
              if (parsed.correction_guide) {
                setCorrectionGuide({
                  ...parsed.correction_guide,
                  image: `data:image/jpeg;base64,${parsed.correction_guide.image}`,
                });
              }
            }
            if (parsed.content) {
              fullContent += parsed.content;
              setAnalysisResult(fullContent);
              setAnalysisStatus('');
            }
          } catch {}
        }
      }

      setMode('result');
      generateSpeech(fullContent);

      const sessionScores = parseScoresFromResult(fullContent);
      if (Object.keys(sessionScores).length > 0) {
        const sessionAngles = parseFirstFrameAngles(poseAngles);
        saveSession({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          date: new Date().toISOString(),
          sport: profile.sport || 'general',
          scores: sessionScores,
          angles: sessionAngles,
          result: fullContent.slice(0, 500),
        });
      }
    } catch (error) {
      console.error('Analysis error:', error);
      setAnalysisResult('Failed to analyze. Please check your connection and try again.');
      setMode('result');
    } finally {
      setIsStreaming(false);
      setAnalysisStatus('');
    }
  };

  const base64ToBlobUri = (base64: string, mimeType: string): string => {
    const byteChars = atob(base64);
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNums[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNums);
    const blob = new Blob([byteArray], { type: mimeType });
    return URL.createObjectURL(blob);
  };

  const generateSpeech = async (text: string) => {
    if (!text || text.length < 20) return;
    setIsGeneratingAudio(true);
    try {
      const baseUrl = getApiUrl();
      const response = await globalThis.fetch(`${baseUrl}api/coach/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`TTS failed: ${response.status} ${errBody}`);
      }
      const data = await response.json();
      const mime = data.format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
      if (data.audio) {
        if (Platform.OS === 'web') {
          const blobUri = base64ToBlobUri(data.audio, mime);
          setAudioUri(blobUri);
        } else {
          setAudioUri(`data:${mime};base64,${data.audio}`);
        }
      }
    } catch (e: any) {
      console.error('TTS error:', e?.message || e);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const toggleAudioPlayback = () => {
    if (!player) return;
    if (isPlayingAudio) {
      player.pause();
    } else {
      player.play();
    }
  };

  const resetAll = () => {
    if (player) {
      try { player.pause(); } catch {}
    }
    if (audioUri && Platform.OS === 'web' && audioUri.startsWith('blob:')) {
      URL.revokeObjectURL(audioUri);
    }
    setSelectedImages([]);
    setVideoUri(null);
    setDescription('');
    setAnalysisResult('');
    setAnnotatedImages([]);
    setPoseAngles([]);
    setMotionData(null);
    setCorrectionGuide(null);
    setActivePhaseFrame(null);
    setPreviousSessionData(null);
    setPoseDetected(false);
    setPoseMessage('');
    setShowAnnotated(false);
    setPreviewImage(null);
    setAudioUri(null);
    setIsPlayingAudio(false);
    setIsGeneratingAudio(false);
    setMode('select');
  };

  const renderCamera = () => {
    if (!permission) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={[styles.centered, { backgroundColor: Colors.background }]}>
          <Ionicons name="camera-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.permTitle}>Camera Access Needed</Text>
          <Text style={styles.permSubtitle}>To capture your form and technique for AI analysis</Text>
          {permission.canAskAgain ? (
            <Pressable style={styles.permButton} onPress={requestPermission}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.permButtonGradient}>
                <Text style={styles.permButtonText}>Allow Camera</Text>
              </LinearGradient>
            </Pressable>
          ) : Platform.OS !== 'web' ? (
            <Pressable style={styles.permButton} onPress={() => {
              try {
                const { Linking } = require('react-native');
                Linking.openSettings();
              } catch {}
            }}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.permButtonGradient}>
                <Text style={styles.permButtonText}>Open Settings</Text>
              </LinearGradient>
            </Pressable>
          ) : null}
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing={facing}
          mode="video"
        />

        <View style={[styles.cameraOverlay, { paddingTop: (insets.top || webTopInset) + 8 }]}>
          <View style={styles.cameraTopBar}>
            <Pressable style={styles.cameraBtn} onPress={() => setMode('select')}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
            <Pressable style={styles.cameraBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
              <Ionicons name="camera-reverse" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>

        <View style={[styles.cameraBottomBar, { paddingBottom: bottomInset + 16 }]}>
          {selectedImages.length > 0 && (
            <View style={styles.capturedCount}>
              <Text style={styles.capturedCountText}>{selectedImages.length} captured</Text>
            </View>
          )}

          <View style={styles.cameraControls}>
            {Platform.OS !== 'web' && (
              <Pressable style={styles.cameraSecondaryBtn} onPress={startVideoRecording}>
                <Ionicons name="videocam" size={22} color="#fff" />
              </Pressable>
            )}

            <Pressable style={styles.shutterBtn} onPress={takePhoto}>
              <View style={styles.shutterInner} />
            </Pressable>

            {selectedImages.length > 0 && (
              <Pressable style={styles.cameraSecondaryBtn} onPress={() => setMode('review')}>
                <Ionicons name="arrow-forward" size={22} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (mode === 'camera') {
    return renderCamera();
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={[styles.header, { paddingTop: (insets.top || webTopInset) + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBackBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {mode === 'select' ? 'Technique Analysis' : mode === 'review' ? 'Review Media' : 'AI Analysis'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {mode === 'select' && (
          <>
            <View style={styles.setupGuide}>
              <View style={styles.setupHeader}>
                <View style={styles.setupIconRow}>
                  <LinearGradient colors={[Colors.primary, Colors.accent]} style={styles.setupBadge}>
                    <Ionicons name="scan" size={18} color="#fff" />
                  </LinearGradient>
                  <Text style={styles.setupLabel}>Setup Guide</Text>
                </View>
                <Text style={styles.setupTitle}>Set Up Your Camera</Text>
                <Text style={styles.setupSubtitle}>
                  Proper camera placement is essential for accurate AI analysis and pose detection.
                </Text>
              </View>

              <View style={styles.diagramCard}>
                <CameraSetupDiagram Colors={Colors} diagramWidth={width - 80} />
                <View style={styles.diagramLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.accent }]} />
                    <Text style={styles.legendText}>Camera at waist height</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
                    <Text style={styles.legendText}>Full body visible</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
                    <Text style={styles.legendText}>5-8 ft distance</Text>
                  </View>
                </View>
              </View>

              <View style={styles.setupSteps}>
                <View style={styles.stepItem}>
                  <View style={[styles.stepNumber, { backgroundColor: Colors.accent + '18' }]}>
                    <Text style={[styles.stepNumberText, { color: Colors.accent }]}>1</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Place camera at waist height</Text>
                    <Text style={styles.stepDesc}>Prop your phone on a table, shelf, or tripod so the lens is roughly at your waist level. This angle captures the most joint data.</Text>
                  </View>
                </View>

                <View style={styles.stepItem}>
                  <View style={[styles.stepNumber, { backgroundColor: Colors.primary + '18' }]}>
                    <Text style={[styles.stepNumberText, { color: Colors.primary }]}>2</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Stand perpendicular to the camera</Text>
                    <Text style={styles.stepDesc}>Position yourself sideways to the lens so your movement path runs left-to-right (or right-to-left). Don't face the camera directly.</Text>
                  </View>
                </View>

                <View style={styles.stepItem}>
                  <View style={[styles.stepNumber, { backgroundColor: Colors.success + '18' }]}>
                    <Text style={[styles.stepNumberText, { color: Colors.success }]}>3</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Keep your full body in frame</Text>
                    <Text style={styles.stepDesc}>Step back 5-8 feet. Make sure your head, arms, hips, and feet are visible through the entire movement — including at the lowest point.</Text>
                  </View>
                </View>

                <View style={styles.stepItem}>
                  <View style={[styles.stepNumber, { backgroundColor: Colors.warning + '18' }]}>
                    <Text style={[styles.stepNumberText, { color: Colors.warning }]}>4</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Stable phone, good lighting</Text>
                    <Text style={styles.stepDesc}>Use a tripod or lean the phone against something sturdy. Avoid backlit scenes — face a window or light source for clear visibility.</Text>
                  </View>
                </View>
              </View>

              <View style={styles.setupWarning}>
                <Ionicons name="information-circle" size={18} color={Colors.warning} />
                <Text style={styles.setupWarningText}>
                  Without proper setup, our AI can't accurately detect your joints and movement phases. Partial-body or unstable footage leads to incomplete analysis.
                </Text>
              </View>
            </View>

            <Text style={styles.captureHeading}>Choose Capture Method</Text>

            <View style={styles.optionCards}>
              <Pressable style={styles.mediaOption} onPress={() => setMode('camera')}>
                <LinearGradient colors={[Colors.primary + '14', Colors.primary + '08']} style={styles.mediaOptionGradient}>
                  <View style={styles.mediaOptionIcon}>
                    <Ionicons name="camera" size={28} color={Colors.primary} />
                  </View>
                  <Text style={styles.mediaOptionTitle}>Take Photo or Record Video</Text>
                  <Text style={styles.mediaOptionDesc}>Capture your form in real-time</Text>
                </LinearGradient>
              </Pressable>

              <Pressable style={styles.mediaOption} onPress={pickFromGallery}>
                <LinearGradient colors={[Colors.accent + '14', Colors.accent + '08']} style={styles.mediaOptionGradient}>
                  <View style={[styles.mediaOptionIcon, { backgroundColor: Colors.accent + '1F' }]}>
                    <Ionicons name="images" size={28} color={Colors.accent} />
                  </View>
                  <Text style={styles.mediaOptionTitle}>Upload Photos</Text>
                  <Text style={styles.mediaOptionDesc}>Select up to 6 images from gallery</Text>
                </LinearGradient>
              </Pressable>

              <Pressable style={styles.mediaOption} onPress={pickVideoFromGallery}>
                <LinearGradient colors={[Colors.success + '14', Colors.success + '08']} style={styles.mediaOptionGradient}>
                  <View style={[styles.mediaOptionIcon, { backgroundColor: Colors.success + '1F' }]}>
                    <Ionicons name="film" size={28} color={Colors.success} />
                  </View>
                  <Text style={styles.mediaOptionTitle}>Upload Video</Text>
                  <Text style={styles.mediaOptionDesc}>We'll extract key frames for analysis</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </>
        )}

        {mode === 'review' && (
          <>
            {isExtractingFrames && (
              <View style={styles.extractingBar}>
                <ActivityIndicator size="small" color={Colors.accent} />
                <Text style={styles.extractingText}>Extracting key frames from video...</Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>
              {videoUri ? 'Extracted Frames' : 'Selected Images'} ({selectedImages.length}/6)
            </Text>
            <View style={styles.imageGrid}>
              {selectedImages.map((img, i) => (
                <Pressable key={i} style={styles.imageThumb} onPress={() => setPreviewImage(img)}>
                  <Image source={{ uri: img }} style={styles.thumbImage} />
                  <Pressable style={styles.removeImageBtn} onPress={() => removeImage(i)}>
                    <Ionicons name="close-circle" size={22} color={Colors.error} />
                  </Pressable>
                  {videoUri && (
                    <View style={styles.frameBadge}>
                      <Text style={styles.frameBadgeText}>F{i + 1}</Text>
                    </View>
                  )}
                  <View style={styles.expandBadge}>
                    <Ionicons name="expand" size={10} color="#fff" />
                  </View>
                </Pressable>
              ))}
              {!videoUri && selectedImages.length < 6 && (
                <Pressable style={styles.addMoreBtn} onPress={() => setMode('camera')}>
                  <Ionicons name="camera-outline" size={24} color={Colors.textMuted} />
                  <Text style={styles.addMoreText}>Add</Text>
                </Pressable>
              )}
              {!videoUri && selectedImages.length < 6 && (
                <Pressable style={styles.addMoreBtn} onPress={pickFromGallery}>
                  <Ionicons name="images-outline" size={24} color={Colors.textMuted} />
                  <Text style={styles.addMoreText}>Upload</Text>
                </Pressable>
              )}
            </View>

            {selectedImages.length > 0 && !isExtractingFrames && (
              <View style={styles.poseSection}>
                {isDetectingPose ? (
                  <View style={styles.poseDetectingBar}>
                    <ActivityIndicator size="small" color={Colors.accent} />
                    <Text style={styles.poseDetectingText}>Detecting body pose...</Text>
                  </View>
                ) : poseDetected ? (
                  <View>
                    {annotatedImages.length > 0 ? (
                      <>
                        <Pressable
                          style={styles.poseResultBar}
                          onPress={() => setShowAnnotated(!showAnnotated)}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="body" size={18} color={Colors.success} />
                            <Text style={styles.poseResultText}>{poseMessage}</Text>
                          </View>
                          <Ionicons
                            name={showAnnotated ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color={Colors.textSecondary}
                          />
                        </Pressable>

                        {showAnnotated && (
                          <View style={styles.annotatedSection}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                              {annotatedImages.map((img, i) => (
                                <Pressable key={`annotated-${i}`} onPress={() => setPreviewImage(img)}>
                                  <Image source={{ uri: img }} style={styles.annotatedThumb} />
                                  <View style={styles.poseBadge}>
                                    <Ionicons name="body" size={10} color="#fff" />
                                  </View>
                                </Pressable>
                              ))}
                            </ScrollView>
                            {poseAngles.length > 0 && poseAngles[0] && Object.keys(poseAngles[0]).length > 0 && (
                              <View style={styles.anglesRow}>
                                {Object.entries(poseAngles[0]).slice(0, 6).map(([joint, angle]) => (
                                  <View key={joint} style={styles.anglePill}>
                                    <Text style={styles.anglePillLabel}>{joint.replace(/_/g, ' ')}</Text>
                                    <Text style={styles.anglePillValue}>{String(angle)}°</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        )}
                      </>
                    ) : (
                      <View style={styles.poseNoDetectBar}>
                        <Ionicons name="information-circle" size={18} color={Colors.warning} />
                        <Text style={styles.poseNoDetectText}>{poseMessage}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <Pressable style={styles.detectPoseBtn} onPress={detectPose}>
                    <Ionicons name="body-outline" size={18} color={Colors.accent} />
                    <Text style={styles.detectPoseBtnText}>Detect Body Pose</Text>
                  </Pressable>
                )}
              </View>
            )}

            <View style={styles.descriptionSection}>
              <Text style={styles.inputLabel}>Context (optional)</Text>
              <TextInput
                style={styles.descInput}
                placeholder="e.g. Working on my backhand, trying to improve follow-through"
                placeholderTextColor={Colors.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={300}
              />
            </View>

            {profile.sport ? (
              <View style={styles.sportBadge}>
                <Ionicons name="medal" size={16} color={Colors.accent} />
                <Text style={styles.sportBadgeText}>Analyzing for: {profile.sport}</Text>
              </View>
            ) : null}
          </>
        )}

        {(mode === 'analyzing' || mode === 'result') && (
          <View>
            {annotatedImages.length > 0 ? (
              <View>
                <View style={styles.poseHeader}>
                  <Ionicons name="body" size={16} color={Colors.accent} />
                  <Text style={styles.poseHeaderText}>Pose Detection</Text>
                </View>
                <View style={styles.selectedPreview}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {annotatedImages.map((img, i) => (
                      <View key={`annotated-${i}`}>
                        <Image source={{ uri: img }} style={styles.previewThumb} />
                        <View style={styles.poseBadge}>
                          <Ionicons name="body" size={10} color="#fff" />
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>
                {poseAngles.length > 0 && poseAngles[0] && Object.keys(poseAngles[0]).length > 0 && (
                  <View style={styles.anglesRow}>
                    {Object.entries(poseAngles[0]).slice(0, 6).map(([joint, angle]) => (
                      <View key={joint} style={styles.anglePill}>
                        <Text style={styles.anglePillLabel}>{joint.replace(/_/g, ' ')}</Text>
                        <Text style={styles.anglePillValue}>{String(angle)}°</Text>
                      </View>
                    ))}
                  </View>
                )}

                {motionData && !motionData.error && (
                  <View style={styles.motionSummary}>
                    {motionData.phases && motionData.phases.length > 0 && (
                      <View style={styles.motionSection}>
                        <View style={styles.motionSectionHeader}>
                          <Ionicons name="pulse" size={14} color={Colors.primary} />
                          <Text style={styles.motionSectionTitle}>Movement Phases</Text>
                          <Text style={{ fontSize: 10, fontFamily: 'Outfit_400Regular', color: Colors.textMuted, marginLeft: 4 }}>Tap to inspect</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                          {motionData.phases.map((phase: any, i: number) => {
                            const isActive = activePhaseFrame === phase.frame;
                            const phaseColor = phase.phase_type === 'drive' ? Colors.success
                              : phase.phase_type === 'loading' ? Colors.warning
                              : phase.phase_type === 'setup' ? Colors.primary
                              : Colors.textMuted;
                            return (
                              <Pressable
                                key={i}
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  setActivePhaseFrame(isActive ? null : phase.frame);
                                  if (!isActive) {
                                    const mapIdx = annotatedFrameMap.indexOf(phase.frame);
                                    const img = mapIdx >= 0 ? annotatedImages[mapIdx] : annotatedImages[Math.min(i, annotatedImages.length - 1)];
                                    if (img) setPreviewImage(img);
                                  }
                                }}
                                style={[styles.phasePill, {
                                  backgroundColor: isActive ? phaseColor + '30' : phaseColor + '18',
                                  borderColor: isActive ? phaseColor : phaseColor + '40',
                                  borderWidth: isActive ? 2 : 1,
                                }]}
                              >
                                <Text style={[styles.phaseFrame, { color: isActive ? phaseColor : Colors.textSecondary }]}>F{phase.frame}</Text>
                                <Text style={[styles.phaseLabel, { color: phaseColor }]}>{phase.phase_label.split(' / ')[0]}</Text>
                                {isActive && <Ionicons name="eye" size={10} color={phaseColor} />}
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                        {activePhaseFrame !== null && (() => {
                          const phase = motionData.phases.find((p: any) => p.frame === activePhaseFrame);
                          if (!phase) return null;
                          const mapIdx = annotatedFrameMap.indexOf(phase.frame);
                          const frameAngles = mapIdx >= 0 ? poseAngles[mapIdx] : poseAngles[0];
                          return (
                            <View style={[styles.phaseDetail, { borderColor: (phase.phase_type === 'drive' ? Colors.success : phase.phase_type === 'loading' ? Colors.warning : Colors.primary) + '30' }]}>
                              <Text style={[styles.phaseDetailTitle, { color: Colors.text }]}>
                                {phase.phase_label} — Frame {phase.frame}
                              </Text>
                              <Text style={{ fontSize: 11, fontFamily: 'Outfit_400Regular', color: Colors.textMuted, marginBottom: 4 }}>
                                Motion score: {phase.motion_score}
                              </Text>
                              {phase.dominant_joints && Object.keys(phase.dominant_joints).length > 0 && (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                                  {Object.entries(phase.dominant_joints).map(([joint, dir]: any) => (
                                    <View key={joint} style={[styles.anglePill, { borderColor: dir === 'flexing' ? Colors.warning + '40' : Colors.success + '40' }]}>
                                      <Text style={[styles.anglePillLabel, { color: dir === 'flexing' ? Colors.warning : Colors.success }]}>{joint.replace(/_/g, ' ')} {dir}</Text>
                                      {frameAngles && frameAngles[joint] !== undefined && (
                                        <Text style={[styles.anglePillValue, { color: dir === 'flexing' ? Colors.warning : Colors.success }]}>{frameAngles[joint]}°</Text>
                                      )}
                                    </View>
                                  ))}
                                </View>
                              )}
                            </View>
                          );
                        })()}
                      </View>
                    )}

                    {motionData.asymmetries && motionData.asymmetries.filter((a: any) => a.flagged).length > 0 && (
                      <View style={styles.motionSection}>
                        <View style={styles.motionSectionHeader}>
                          <Ionicons name="warning" size={14} color={Colors.warning} />
                          <Text style={[styles.motionSectionTitle, { color: Colors.warning }]}>Asymmetries Detected</Text>
                        </View>
                        {motionData.asymmetries.filter((a: any) => a.flagged).map((a: any, i: number) => (
                          <View key={i} style={styles.asymmetryRow}>
                            <Text style={styles.asymmetryJoint}>{a.joint}</Text>
                            <Text style={[styles.asymmetryValue, {
                              color: a.severity === 'significant' ? Colors.error : Colors.warning,
                            }]}>{a.avg_difference}° avg diff</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {motionData.range_of_motion && Object.values(motionData.range_of_motion).some((r: any) => r.flag && r.flag !== 'normal') && (
                      <View style={styles.motionSection}>
                        <View style={styles.motionSectionHeader}>
                          <Ionicons name="resize" size={14} color={Colors.accent} />
                          <Text style={[styles.motionSectionTitle, { color: Colors.accent }]}>ROM Flags</Text>
                        </View>
                        {Object.entries(motionData.range_of_motion)
                          .filter(([, r]: any) => r.flag && r.flag !== 'normal')
                          .map(([joint, r]: any, i: number) => (
                            <View key={i} style={styles.romFlagRow}>
                              <Text style={styles.romFlagJoint}>{joint.replace(/_/g, ' ')}</Text>
                              <Text style={styles.romFlagDetail}>{r.range}° ROM</Text>
                            </View>
                          ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.selectedPreview}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {selectedImages.map((img, i) => (
                    <Image key={i} source={{ uri: img }} style={styles.previewThumb} />
                  ))}
                </ScrollView>
              </View>
            )}

            {isStreaming && (
              <View style={styles.analyzingBar}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.analyzingText}>
                  {analysisStatus || 'Analyzing your technique...'}
                </Text>
              </View>
            )}

            {previousSessionData && analysisResult && (
              <View style={styles.trendCard}>
                <View style={styles.trendHeader}>
                  <Ionicons name="trending-up" size={16} color={Colors.primary} />
                  <Text style={styles.trendTitle}>Session Comparison</Text>
                </View>
                <Text style={styles.trendDate}>
                  Last session: {new Date(previousSessionData.date).toLocaleDateString()}
                </Text>
                {Object.entries(previousSessionData.scores).slice(0, 4).map(([label, prevScore]) => {
                  const currentScores = parseScoresFromResult(analysisResult);
                  const currScore = currentScores[label];
                  if (currScore === undefined) return null;
                  const delta = currScore - prevScore;
                  return (
                    <View key={label} style={styles.trendRow}>
                      <Text style={styles.trendLabel}>{label}</Text>
                      <View style={styles.trendScores}>
                        <Text style={[styles.trendPrev, { color: Colors.textMuted }]}>{prevScore}/10</Text>
                        <Ionicons name="arrow-forward" size={12} color={Colors.textMuted} />
                        <Text style={[styles.trendCurr, { color: Colors.text }]}>{currScore}/10</Text>
                        {delta !== 0 && (
                          <View style={[styles.trendDelta, { backgroundColor: delta > 0 ? Colors.success + '18' : Colors.error + '18' }]}>
                            <Ionicons name={delta > 0 ? 'caret-up' : 'caret-down'} size={10} color={delta > 0 ? Colors.success : Colors.error} />
                            <Text style={{ fontSize: 11, fontFamily: 'Outfit_600SemiBold', color: delta > 0 ? Colors.success : Colors.error }}>
                              {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
                {previousSessionData.angles && Object.keys(previousSessionData.angles).length > 0 && poseAngles.length > 0 && (
                  <View style={styles.trendAnglesSection}>
                    <Text style={{ fontSize: 11, fontFamily: 'Outfit_600SemiBold', color: Colors.textMuted, marginBottom: 4 }}>Key Angles vs Last Session</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      {Object.entries(previousSessionData.angles).slice(0, 6).map(([joint, prevAngle]) => {
                        const currAngle = poseAngles[0]?.[joint];
                        if (currAngle === undefined) return null;
                        const angleDelta = currAngle - prevAngle;
                        if (Math.abs(angleDelta) < 2) return null;
                        return (
                          <View key={joint} style={[styles.anglePill, { borderColor: Math.abs(angleDelta) > 5 ? (angleDelta > 0 ? Colors.success + '40' : Colors.warning + '40') : Colors.border }]}>
                            <Text style={styles.anglePillLabel}>{joint.replace(/_/g, ' ')}</Text>
                            <Text style={[styles.anglePillValue, { color: Math.abs(angleDelta) > 5 ? (angleDelta > 0 ? Colors.success : Colors.warning) : Colors.primary }]}>
                              {angleDelta > 0 ? '+' : ''}{angleDelta.toFixed(0)}°
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            )}

            {analysisResult ? (
              <View style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  {isGeneratingAudio ? (
                    <View style={styles.audioGeneratingBar}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                      <Text style={styles.audioGeneratingText}>Generating voice...</Text>
                    </View>
                  ) : audioUri ? (
                    <Pressable style={styles.audioPlayBar} onPress={toggleAudioPlayback}>
                      <Ionicons
                        name={isPlayingAudio ? 'pause-circle' : 'play-circle'}
                        size={28}
                        color={Colors.primary}
                      />
                      <Text style={styles.audioPlayText}>
                        {isPlayingAudio ? 'Playing feedback...' : 'Listen to feedback'}
                      </Text>
                      <View style={styles.audioWaves}>
                        {isPlayingAudio && [0, 1, 2, 3].map(i => (
                          <View key={i} style={[styles.audioWaveBar, {
                            height: 8 + (i % 3) * 4,
                            backgroundColor: Colors.primary,
                            opacity: 0.4 + (i % 3) * 0.2,
                          }]} />
                        ))}
                      </View>
                    </Pressable>
                  ) : null}
                </View>
                <FormattedText text={analysisResult} Colors={Colors} />
              </View>
            ) : null}

            {correctionGuide && (
              <View style={[styles.correctionCard, { borderColor: Colors.success + '40' }]}>
                <View style={styles.correctionHeader}>
                  <View style={[styles.correctionIconBg, { backgroundColor: Colors.success + '20' }]}>
                    <Ionicons name="fitness" size={18} color={Colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.correctionTitle, { color: Colors.success }]}>Correction Guide</Text>
                    <Text style={[styles.correctionSubtitle, { color: Colors.textSecondary }]}>
                      {correctionGuide.joint_label} — Frame {correctionGuide.frame_index}
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={() => setPreviewImage(correctionGuide.image)}
                  style={styles.correctionImageWrap}
                >
                  <Image
                    source={{ uri: correctionGuide.image }}
                    style={styles.correctionImage}
                    resizeMode="contain"
                  />
                  <View style={[styles.correctionImageBadge, { backgroundColor: Colors.surface + 'E0' }]}>
                    <Ionicons name="expand" size={14} color={Colors.textSecondary} />
                    <Text style={[styles.correctionImageBadgeText, { color: Colors.textSecondary }]}>Tap to enlarge</Text>
                  </View>
                </Pressable>

                <View style={styles.correctionAngles}>
                  <View style={[styles.correctionAngleBox, { backgroundColor: Colors.error + '15', borderColor: Colors.error + '30' }]}>
                    <View style={[styles.correctionDot, { backgroundColor: Colors.error }]} />
                    <Text style={[styles.correctionAngleLabel, { color: Colors.textSecondary }]}>Current</Text>
                    <Text style={[styles.correctionAngleValue, { color: Colors.error }]}>
                      {correctionGuide.current_angle.toFixed(0)}°
                    </Text>
                  </View>
                  <View style={styles.correctionArrow}>
                    <Ionicons name="arrow-forward" size={20} color={Colors.textMuted} />
                  </View>
                  <View style={[styles.correctionAngleBox, { backgroundColor: Colors.success + '15', borderColor: Colors.success + '30' }]}>
                    <View style={[styles.correctionDot, { backgroundColor: Colors.success }]} />
                    <Text style={[styles.correctionAngleLabel, { color: Colors.textSecondary }]}>Target</Text>
                    <Text style={[styles.correctionAngleValue, { color: Colors.success }]}>
                      {correctionGuide.target_angle.toFixed(0)}°
                    </Text>
                  </View>
                </View>

                <View style={[styles.correctionDeltaBar, { backgroundColor: Colors.warning + '15' }]}>
                  <Ionicons name="swap-horizontal" size={16} color={Colors.warning} />
                  <Text style={[styles.correctionDeltaText, { color: Colors.warning }]}>
                    Adjust by {correctionGuide.deviation.toFixed(0)}° — follow the green guide line
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {mode === 'review' && selectedImages.length > 0 && !isExtractingFrames && (
        <View style={[styles.bottomBar, { paddingBottom: bottomInset + 16 }]}>
          <Pressable style={styles.resetBtn} onPress={resetAll}>
            <Ionicons name="refresh" size={20} color={Colors.textSecondary} />
          </Pressable>
          <Pressable style={styles.analyzeBtn} onPress={startAnalysis}>
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.analyzeBtnGradient}>
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.analyzeBtnText}>Analyze Technique</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}

      {mode === 'result' && !isStreaming && (
        <View style={[styles.bottomBar, { paddingBottom: bottomInset + 16 }]}>
          <Pressable style={styles.analyzeBtn} onPress={resetAll}>
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.analyzeBtnGradient}>
              <Ionicons name="camera" size={18} color="#fff" />
              <Text style={styles.analyzeBtnText}>New Analysis</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}

      <Modal
        visible={!!previewImage}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewImage(null)}>
          <View style={[styles.previewContainer, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
            <Pressable style={styles.previewCloseBtn} onPress={() => setPreviewImage(null)}>
              <Ionicons name="close-circle" size={32} color="#fff" />
            </Pressable>
            {previewImage && (
              <Image
                source={{ uri: previewImage }}
                style={styles.previewFullImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (C: any) => StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerBackBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Outfit_700Bold', color: C.text },
  setupGuide: {
    backgroundColor: C.surface, borderRadius: 20, padding: 20, marginBottom: 24,
    borderWidth: 1, borderColor: C.border,
  },
  setupHeader: { marginBottom: 16 },
  setupIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  setupBadge: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  setupLabel: { fontSize: 11, fontFamily: 'Outfit_600SemiBold', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  setupTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: C.text, marginBottom: 6 },
  setupSubtitle: { fontSize: 13, fontFamily: 'Outfit_400Regular', color: C.textSecondary, lineHeight: 18 },
  diagramCard: {
    backgroundColor: C.background, borderRadius: 14, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: C.border, marginBottom: 16,
  },
  diagramLegend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, fontFamily: 'Outfit_500Medium', color: C.textMuted },
  setupSteps: { gap: 14 },
  stepItem: { flexDirection: 'row', gap: 12 },
  stepNumber: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  stepNumberText: { fontSize: 13, fontFamily: 'Outfit_700Bold' },
  stepContent: { flex: 1, gap: 2 },
  stepTitle: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: C.text },
  stepDesc: { fontSize: 12, fontFamily: 'Outfit_400Regular', color: C.textSecondary, lineHeight: 17 },
  setupWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16,
    backgroundColor: C.warning + '0C', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: C.warning + '20',
  },
  setupWarningText: { flex: 1, fontSize: 12, fontFamily: 'Outfit_400Regular', color: C.warning, lineHeight: 17 },
  captureHeading: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: C.text, marginBottom: 12 },
  optionCards: { gap: 12, marginBottom: 24 },
  mediaOption: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  mediaOptionGradient: { padding: 20, alignItems: 'center', gap: 8 },
  mediaOptionIcon: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: C.primary + '1F',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  mediaOptionTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: C.text },
  mediaOptionDesc: { fontSize: 13, fontFamily: 'Outfit_400Regular', color: C.textSecondary },
  sectionTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: C.text, marginBottom: 12 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  imageThumb: {
    width: (width - 70) / 3, height: (width - 70) / 3, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: C.border,
  },
  thumbImage: { width: '100%', height: '100%' },
  removeImageBtn: { position: 'absolute', top: 4, right: 4 },
  frameBadge: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  frameBadgeText: { fontSize: 10, fontFamily: 'Outfit_600SemiBold', color: '#fff' },
  addMoreBtn: {
    width: (width - 70) / 3, height: (width - 70) / 3, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addMoreText: { fontSize: 11, fontFamily: 'Outfit_500Medium', color: C.textMuted },
  descriptionSection: { marginBottom: 16 },
  inputLabel: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', color: C.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  descInput: {
    backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    color: C.text, fontSize: 14, fontFamily: 'Outfit_400Regular',
    borderWidth: 1, borderColor: C.border, minHeight: 80, textAlignVertical: 'top',
  },
  sportBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: C.accent + '14', borderRadius: 10,
  },
  sportBadgeText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: C.accent },
  extractingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: C.accent + '12', borderRadius: 12, marginBottom: 16,
  },
  extractingText: { fontSize: 14, fontFamily: 'Outfit_500Medium', color: C.accent },
  expandBadge: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  poseSection: { marginBottom: 16 },
  poseDetectingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: C.accent + '12', borderRadius: 12,
  },
  poseDetectingText: { fontSize: 14, fontFamily: 'Outfit_500Medium', color: C.accent },
  poseResultBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: C.success + '14', borderRadius: 12,
  },
  poseResultText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: C.success, flex: 1 },
  poseNoDetectBar: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: C.warning + '14', borderRadius: 12,
  },
  poseNoDetectText: { fontSize: 13, fontFamily: 'Outfit_500Medium', color: C.warning, flex: 1, lineHeight: 18 },
  detectPoseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: C.accent + '14', borderRadius: 12,
    borderWidth: 1, borderColor: C.accent + '30',
  },
  detectPoseBtnText: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: C.accent },
  previewOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center',
  },
  previewContainer: {
    flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16,
  },
  previewCloseBtn: {
    position: 'absolute', top: 50, right: 16, zIndex: 10,
  },
  previewFullImage: {
    width: '100%', height: '80%', borderRadius: 12,
  },
  annotatedSection: { marginTop: 10, gap: 10 },
  annotatedThumb: { width: 120, height: 120, borderRadius: 12, borderWidth: 1, borderColor: C.accent + '40' },
  poseHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
  },
  poseHeaderText: { fontSize: 14, fontFamily: 'Outfit_700Bold', color: C.accent },
  poseBadge: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: C.accent, width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  anglesRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16,
  },
  anglePill: {
    backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: C.border, alignItems: 'center',
  },
  anglePillLabel: { fontSize: 9, fontFamily: 'Outfit_500Medium', color: C.textMuted, textTransform: 'capitalize' },
  anglePillValue: { fontSize: 12, fontFamily: 'Outfit_700Bold', color: C.primary },
  motionSummary: { marginTop: 10, gap: 10 },
  motionSection: { gap: 6 },
  motionSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  motionSectionTitle: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', color: C.primary },
  phasePill: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, alignItems: 'center', minWidth: 60,
  },
  phaseFrame: { fontSize: 10, fontFamily: 'Outfit_500Medium' },
  phaseLabel: { fontSize: 11, fontFamily: 'Outfit_600SemiBold' },
  phaseDetail: {
    marginTop: 8, backgroundColor: C.surface, borderRadius: 10, padding: 10,
    borderWidth: 1, gap: 4,
  },
  phaseDetailTitle: { fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  asymmetryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 4, paddingHorizontal: 8,
  },
  asymmetryJoint: { fontSize: 12, fontFamily: 'Outfit_500Medium', color: C.text },
  asymmetryValue: { fontSize: 12, fontFamily: 'Outfit_600SemiBold' },
  romFlagRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 4, paddingHorizontal: 8,
  },
  romFlagJoint: { fontSize: 12, fontFamily: 'Outfit_500Medium', color: C.text, textTransform: 'capitalize' },
  romFlagDetail: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', color: C.accent },
  selectedPreview: { marginBottom: 16 },
  trendCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: C.primary + '30',
  },
  trendHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  trendTitle: { fontSize: 14, fontFamily: 'Outfit_700Bold', color: C.primary },
  trendDate: { fontSize: 11, fontFamily: 'Outfit_400Regular', color: C.textMuted, marginBottom: 8 },
  trendRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 5,
  },
  trendLabel: { fontSize: 12, fontFamily: 'Outfit_500Medium', color: C.text, flex: 1 },
  trendScores: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trendPrev: { fontSize: 12, fontFamily: 'Outfit_400Regular' },
  trendCurr: { fontSize: 12, fontFamily: 'Outfit_700Bold' },
  trendDelta: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  trendAnglesSection: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border },
  correctionCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginTop: 16,
    borderWidth: 1,
  },
  correctionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  correctionIconBg: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  correctionTitle: { fontSize: 15, fontFamily: 'Outfit_700Bold' },
  correctionSubtitle: { fontSize: 12, fontFamily: 'Outfit_400Regular', marginTop: 1 },
  correctionImageWrap: {
    borderRadius: 12, overflow: 'hidden', marginBottom: 12, position: 'relative' as const,
  },
  correctionImage: {
    width: '100%' as any, aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#000',
  },
  correctionImageBadge: {
    position: 'absolute' as const, bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  correctionImageBadgeText: { fontSize: 11, fontFamily: 'Outfit_400Regular' },
  correctionAngles: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
  },
  correctionAngleBox: {
    flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' as const,
    borderWidth: 1,
  },
  correctionDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  correctionAngleLabel: { fontSize: 11, fontFamily: 'Outfit_500Medium', marginBottom: 2 },
  correctionAngleValue: { fontSize: 22, fontFamily: 'Outfit_700Bold' },
  correctionArrow: { paddingHorizontal: 2 },
  correctionDeltaBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
  },
  correctionDeltaText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', flex: 1 },
  previewThumb: { width: 80, height: 80, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  analyzingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: C.primary + '12', borderRadius: 12, marginBottom: 16,
  },
  analyzingText: { fontSize: 14, fontFamily: 'Outfit_500Medium', color: C.primary },
  resultCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: C.border,
  },
  resultHeader: { marginBottom: 4 },
  audioGeneratingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: C.primary + '10', borderRadius: 12, marginBottom: 12,
  },
  audioGeneratingText: { fontSize: 13, fontFamily: 'Outfit_500Medium', color: C.primary },
  audioPlayBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: C.primary + '10', borderRadius: 12, marginBottom: 12,
  },
  audioPlayText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: C.primary, flex: 1 },
  audioWaves: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  audioWaveBar: { width: 3, borderRadius: 2 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: C.background, borderTopWidth: 1, borderTopColor: C.border,
    flexDirection: 'row', gap: 12,
  },
  resetBtn: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border,
  },
  analyzeBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  analyzeBtnGradient: {
    height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  analyzeBtnText: { fontSize: 15, fontFamily: 'Outfit_700Bold', color: '#fff' },
  permTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: C.text, marginTop: 8 },
  permSubtitle: { fontSize: 14, fontFamily: 'Outfit_400Regular', color: C.textSecondary, textAlign: 'center' },
  permButton: { borderRadius: 14, overflow: 'hidden', marginTop: 12 },
  permButtonGradient: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  permButtonText: { fontSize: 15, fontFamily: 'Outfit_700Bold', color: '#fff' },
  cameraOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
  },
  cameraTopBar: {
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20,
  },
  cameraBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  cameraBottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', gap: 12,
  },
  cameraControls: {
    flexDirection: 'row', alignItems: 'center', gap: 24,
  },
  cameraSecondaryBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  capturedCount: {
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
  },
  capturedCountText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: '#fff' },
  shutterBtn: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  reviewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
  },
  reviewBtnText: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: '#fff' },
});

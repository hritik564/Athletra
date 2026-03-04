import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform, ScrollView,
  Image, TextInput, Dimensions, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { fetch } from 'expo/fetch';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/contexts/ThemeContext';
import { useUser } from '@/contexts/UserContext';
import { getApiUrl } from '@/lib/query-client';

const { width } = Dimensions.get('window');

type AnalyzeMode = 'select' | 'camera' | 'review' | 'analyzing' | 'result';

function FormattedText({ text, Colors }: { text: string; Colors: any }) {
  const paragraphs = text.split(/\n\n+/);
  const elements: React.ReactNode[] = [];

  paragraphs.forEach((paragraph, pIdx) => {
    const lines = paragraph.split('\n');
    lines.forEach((line, lIdx) => {
      const key = `${pIdx}-${lIdx}`;
      const trimmed = line.trim();
      if (!trimmed) return;

      const isHeader = /^\*\*[^*]+\*\*$/.test(trimmed) || /^#{1,3}\s+/.test(trimmed);
      const isBullet = /^[-•]\s+/.test(trimmed);

      if (isHeader) {
        const headerText = trimmed.replace(/^\*\*|\*\*$/g, '').replace(/^#{1,3}\s+/, '');
        elements.push(
          <Text key={key} style={{
            fontSize: 16, fontFamily: 'Outfit_700Bold', color: Colors.text,
            marginTop: pIdx > 0 ? 14 : 0, marginBottom: 4,
          }}>{headerText}</Text>
        );
      } else if (isBullet) {
        const bulletText = trimmed.replace(/^[-•]\s+/, '');
        elements.push(
          <View key={key} style={{ flexDirection: 'row', marginBottom: 4, paddingLeft: 4 }}>
            <Text style={{ color: Colors.primary, marginRight: 8, fontSize: 14 }}>{'\u2022'}</Text>
            <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Outfit_400Regular', color: Colors.text, lineHeight: 20 }}>
              {renderBold(bulletText, Colors)}
            </Text>
          </View>
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
  const [poseAngles, setPoseAngles] = useState<Record<string, number>[]>([]);
  const [poseDetected, setPoseDetected] = useState(false);
  const [isDetectingPose, setIsDetectingPose] = useState(false);
  const [showAnnotated, setShowAnnotated] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const cameraRef = useRef<CameraView>(null);

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
    if (!cameraRef.current || Platform.OS === 'web') return;
    try {
      setIsRecordingVideo(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const video = await cameraRef.current.recordAsync({ maxDuration: 15 });
      if (video?.uri) {
        setVideoUri(video.uri);
        await extractFramesFromVideo(video.uri);
      }
    } catch (e) {
      console.error('Failed to record video:', e);
      setIsRecordingVideo(false);
    }
  };

  const stopVideoRecording = () => {
    if (cameraRef.current) {
      cameraRef.current.stopRecording();
    }
    setIsRecordingVideo(false);
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.7,
        base64: true,
        selectionLimit: 6,
      });

      if (!result.canceled && result.assets.length > 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const newImages = result.assets
          .filter(a => a.base64)
          .map(a => `data:image/jpeg;base64,${a.base64}`);
        setSelectedImages(prev => [...prev, ...newImages].slice(0, 6));
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

  const extractFramesFromVideo = async (uri: string) => {
    setIsExtractingFrames(true);
    setMode('review');

    try {
      let base64Video: string;

      if (Platform.OS === 'web') {
        const response = await globalThis.fetch(uri);
        const blob = await response.blob();
        const reader = new FileReader();
        base64Video = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        base64Video = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

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
        setSelectedImages(prev => [...prev, ...frameImages].slice(0, 6));
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
        setPoseDetected(imgs.length > 0);
        setShowAnnotated(imgs.length > 0);

        if (imgs.length > 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (e) {
      console.error('Pose detection error:', e);
    } finally {
      setIsDetectingPose(false);
    }
  };

  const startAnalysis = async () => {
    if (selectedImages.length === 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMode('analyzing');
    setAnalysisResult('');
    setAnalysisStatus('Detecting body pose...');
    setAnnotatedImages([]);
    setPoseAngles([]);
    setIsStreaming(true);

    try {
      const baseUrl = getApiUrl();
      const response = await fetch(`${baseUrl}api/coach/analyze-technique`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({
          images: selectedImages,
          userProfile: profile,
          sport: profile.sport || '',
          description: videoUri
            ? `${description ? description + '. ' : ''}These frames were extracted from a video recording of my technique.`
            : description,
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
              const imgs = parsed.pose_results
                .filter((r: any) => r.annotated_image)
                .map((r: any) => `data:image/jpeg;base64,${r.annotated_image}`);
              setAnnotatedImages(imgs);
              const angles = parsed.pose_results
                .filter((r: any) => r.angles)
                .map((r: any) => r.angles);
              setPoseAngles(angles);
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
    } catch (error) {
      console.error('Analysis error:', error);
      setAnalysisResult('Failed to analyze. Please check your connection and try again.');
      setMode('result');
    } finally {
      setIsStreaming(false);
      setAnalysisStatus('');
    }
  };

  const resetAll = () => {
    setSelectedImages([]);
    setVideoUri(null);
    setDescription('');
    setAnalysisResult('');
    setAnnotatedImages([]);
    setPoseAngles([]);
    setPoseDetected(false);
    setShowAnnotated(false);
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
          mode={isRecordingVideo ? 'video' : 'picture'}
        >
          <View style={[styles.cameraOverlay, { paddingTop: (insets.top || webTopInset) + 8 }]}>
            <View style={styles.cameraTopBar}>
              <Pressable style={styles.cameraBtn} onPress={() => { if (isRecordingVideo) stopVideoRecording(); setMode('select'); }}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
              <Pressable style={styles.cameraBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
                <Ionicons name="camera-reverse" size={24} color="#fff" />
              </Pressable>
            </View>
          </View>

          <View style={[styles.cameraBottomBar, { paddingBottom: bottomInset + 16 }]}>
            {isRecordingVideo && (
              <View style={styles.recordingBadge}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingBadgeText}>Recording...</Text>
              </View>
            )}
            {selectedImages.length > 0 && !isRecordingVideo && (
              <View style={styles.capturedCount}>
                <Text style={styles.capturedCountText}>{selectedImages.length} captured</Text>
              </View>
            )}

            <View style={styles.cameraControls}>
              {Platform.OS !== 'web' && !isRecordingVideo && (
                <Pressable style={styles.cameraSecondaryBtn} onPress={startVideoRecording}>
                  <Ionicons name="videocam" size={22} color="#fff" />
                </Pressable>
              )}

              {isRecordingVideo ? (
                <Pressable style={styles.stopRecBtn} onPress={stopVideoRecording}>
                  <View style={styles.stopRecInner} />
                </Pressable>
              ) : (
                <Pressable style={styles.shutterBtn} onPress={takePhoto}>
                  <View style={styles.shutterInner} />
                </Pressable>
              )}

              {selectedImages.length > 0 && !isRecordingVideo && (
                <Pressable style={styles.cameraSecondaryBtn} onPress={() => setMode('review')}>
                  <Ionicons name="arrow-forward" size={22} color="#fff" />
                </Pressable>
              )}
            </View>
          </View>
        </CameraView>
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
            <View style={styles.heroSection}>
              <LinearGradient colors={[Colors.primary, Colors.accent]} style={styles.heroIcon}>
                <Ionicons name="videocam" size={36} color="#fff" />
              </LinearGradient>
              <Text style={styles.heroTitle}>Capture Your Form</Text>
              <Text style={styles.heroSubtitle}>
                Take photos, record video, or upload from your gallery. Our AI will analyze your form and provide sport-specific feedback.
              </Text>
            </View>

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

            <View style={styles.tipsSection}>
              <Text style={styles.tipsTitle}>Tips for Best Results</Text>
              <View style={styles.tipRow}>
                <Ionicons name="sunny" size={16} color={Colors.warning} />
                <Text style={styles.tipText}>Good lighting shows form details</Text>
              </View>
              <View style={styles.tipRow}>
                <Ionicons name="body" size={16} color={Colors.primary} />
                <Text style={styles.tipText}>Full body shots work best</Text>
              </View>
              <View style={styles.tipRow}>
                <Ionicons name="layers" size={16} color={Colors.accent} />
                <Text style={styles.tipText}>Multiple angles give richer feedback</Text>
              </View>
              <View style={styles.tipRow}>
                <Ionicons name="videocam" size={16} color={Colors.success} />
                <Text style={styles.tipText}>Videos up to 30s — we extract 6 key frames</Text>
              </View>
              <View style={styles.tipRow}>
                <Ionicons name="fitness" size={16} color={Colors.accent} />
                <Text style={styles.tipText}>AI pose detection measures your joint angles</Text>
              </View>
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
                <View key={i} style={styles.imageThumb}>
                  <Image source={{ uri: img }} style={styles.thumbImage} />
                  <Pressable style={styles.removeImageBtn} onPress={() => removeImage(i)}>
                    <Ionicons name="close-circle" size={22} color={Colors.error} />
                  </Pressable>
                  {videoUri && (
                    <View style={styles.frameBadge}>
                      <Text style={styles.frameBadgeText}>F{i + 1}</Text>
                    </View>
                  )}
                </View>
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
                ) : poseDetected && annotatedImages.length > 0 ? (
                  <View>
                    <Pressable
                      style={styles.poseResultBar}
                      onPress={() => setShowAnnotated(!showAnnotated)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="body" size={18} color={Colors.success} />
                        <Text style={styles.poseResultText}>
                          Pose detected in {annotatedImages.length} image{annotatedImages.length !== 1 ? 's' : ''}
                        </Text>
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
                            <View key={`annotated-${i}`}>
                              <Image source={{ uri: img }} style={styles.annotatedThumb} />
                              <View style={styles.poseBadge}>
                                <Ionicons name="body" size={10} color="#fff" />
                              </View>
                            </View>
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

            {analysisResult ? (
              <View style={styles.resultCard}>
                <FormattedText text={analysisResult} Colors={Colors} />
              </View>
            ) : null}
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
  heroSection: { alignItems: 'center', marginBottom: 28 },
  heroIcon: {
    width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  heroTitle: { fontSize: 22, fontFamily: 'Outfit_700Bold', color: C.text, marginBottom: 8 },
  heroSubtitle: { fontSize: 14, fontFamily: 'Outfit_400Regular', color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
  optionCards: { gap: 12, marginBottom: 24 },
  mediaOption: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  mediaOptionGradient: { padding: 20, alignItems: 'center', gap: 8 },
  mediaOptionIcon: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: C.primary + '1F',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  mediaOptionTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: C.text },
  mediaOptionDesc: { fontSize: 13, fontFamily: 'Outfit_400Regular', color: C.textSecondary },
  tipsSection: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, gap: 10,
    borderWidth: 1, borderColor: C.border,
  },
  tipsTitle: { fontSize: 14, fontFamily: 'Outfit_700Bold', color: C.text, marginBottom: 4 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipText: { fontSize: 13, fontFamily: 'Outfit_400Regular', color: C.textSecondary },
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
  poseResultText: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: C.success },
  detectPoseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: C.accent + '14', borderRadius: 12,
    borderWidth: 1, borderColor: C.accent + '30',
  },
  detectPoseBtnText: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: C.accent },
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
  selectedPreview: { marginBottom: 16 },
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
  recordingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(231,76,60,0.8)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  recordingBadgeText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: '#fff' },
  shutterBtn: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  stopRecBtn: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#E74C3C',
    alignItems: 'center', justifyContent: 'center',
  },
  stopRecInner: { width: 30, height: 30, borderRadius: 4, backgroundColor: '#E74C3C' },
  reviewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
  },
  reviewBtnText: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: '#fff' },
});

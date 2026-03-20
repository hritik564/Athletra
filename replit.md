# Athletra

## Overview

Athletra is a mobile-first AI fitness and wellness coaching app built with Expo (React Native) and an Express backend. It provides personalized workout plans, meal tracking, weight/progress monitoring, and an AI coach powered by OpenAI. The app features a multi-step onboarding flow that collects user health data, goals, and preferences, then uses that context to deliver tailored coaching through a chat interface with voice support.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK 54 with React Native 0.81, using the new architecture (`newArchEnabled: true`)
- **Routing**: Expo Router with file-based routing (`app/` directory). Uses typed routes and a tab-based layout for the main experience (`(tabs)/` group with Home, Meals, Coach, Workouts, Progress tabs)
- **State Management**: React Context for user profile (`UserContext`) and fitness data (`FitnessContext`). TanStack React Query for server-state and API calls
- **Local Persistence**: AsyncStorage for offline-first data (user profile, meals, workouts, weight history, streaks). The app works without being connected to the backend for most tracking features
- **Styling**: Dual light/dark theme system. Colors defined in `constants/colors.ts` (DarkColors + LightColors), managed via `ThemeContext` (`contexts/ThemeContext.tsx`). Theme preference persists in AsyncStorage. Hooks: `useColors()` returns current palette, `useTheme()` returns `{ theme, isDark, toggleTheme }`, `useThemedStyles(createStyles)` for memoized style creation. Blue primary (#1B7FE3), orange accent (#FF6B35). Dark mode: deep navy background (#0B1120). Light mode: clean white/grey (#F5F7FA). Toggle in Profile screen. All screens use `createStyles(Colors)` pattern for dynamic theming. Uses `expo-linear-gradient` for gradient backgrounds, `react-native-svg` for charts and rings
- **Fonts**: Outfit font family (Regular, Medium, SemiBold, Bold) via `@expo-google-fonts/outfit`
- **Audio**: expo-audio for voice recording and playback (replaced deprecated expo-av)
- **Key UI Libraries**: react-native-gesture-handler, react-native-reanimated, react-native-keyboard-controller, expo-haptics for tactile feedback

### Onboarding Flow (7 steps)

1. Personal details: name, age, weight, height
2. Goal + optional calorie target (lose weight / build muscle / stay fit / boost energy)
3. Athlete status: toggle + sport selection + level (recreational/amateur/semi-pro/pro)
4. Health conditions: multi-select (diabetes, hypertension, cholesterol, allergies) + details text
5. Fitness level (beginner/intermediate/advanced) + daily activity pattern
6. Workout environment (gym/home/outdoors/mixed)
7. Dietary preference (none/vegetarian/vegan/keto/paleo/gluten-free)

All data stored in UserProfile via AsyncStorage and passed to AI coach for personalization.

### Backend (Express)

- **Server**: Express 5 running on Node.js with TypeScript (transpiled via `tsx` in dev, `esbuild` for production)
- **API Pattern**: RESTful JSON APIs under `/api/` prefix. The server handles CORS dynamically based on Replit environment variables
- **AI Integration**: OpenAI API (via Replit AI Integrations with custom base URL) for:
  - Chat coaching (`/api/coach/chat` - streaming SSE responses)
  - Voice coaching (`/api/coach/voice` - transcribe + AI response + TTS audio)
  - Audio transcription (`/api/coach/transcribe` - speech-to-text)
  - Technique analysis (`/api/coach/analyze-technique` - runs MediaPipe pose detection first, then GPT-4o vision with skeleton-annotated images + joint angle data, streaming SSE)
  - Pose detection (`/api/coach/pose-detect` - standalone MediaPipe pose landmarker, returns 33 body landmarks, joint angles, symmetry data, and annotated images)
  - Video frame extraction (`/api/coach/extract-frames` - dynamic gate-based frame capture: extracts up to 60 candidate frames at 6fps density, runs pose detection to compute shoulder-normalised wrist velocity per frame, opens a motion gate when velocity > 0.15 shoulder-widths/s and closes when < 0.05 (hysteresis), captures every frame within the gate-open window up to a hard cap of 60 frames. Shoulder width is EMA-smoothed for stable normalisation. Falls back to all frames if gate never opens or pose detection fails)
  - Text-to-speech (`/api/coach/tts` - converts analysis text to spoken audio via gpt-audio model with nova voice, returns base64 WAV)
  - Meal analysis from photos/descriptions
  - Workout plan generation
- **Static Serving**: In production, serves Expo web build from `dist/` directory. In dev, proxies to Expo's Metro bundler

### Data Storage

- **Client-side**: AsyncStorage is the primary data store for user fitness data (meals, workouts, weight entries, streaks). This is by design — the app is offline-first for tracking
- **Server-side**: PostgreSQL via Drizzle ORM for server-managed data:
  - `users` table (id, username, password) in `shared/schema.ts`
  - `conversations` and `messages` tables in `shared/models/chat.ts` for persisting AI coach chat history
- **Drizzle Config**: PostgreSQL dialect, migrations output to `./migrations/`, schema in `./shared/schema.ts`. Use `npm run db:push` to sync schema
- **Note**: The chat storage module (`server/replit_integrations/chat/storage.ts`) imports from `../../db` — there should be a `server/db.ts` file that sets up the Drizzle database connection using `DATABASE_URL`

### AI Coach Architecture

- The coach system prompt is a detailed persona ("Athletra") defined in `server/routes.ts` that includes exercise science expertise, nutrition knowledge, and behavioral psychology
- User profile context (name, age, weight, height, goals, health conditions, dietary preferences, athlete status) is injected into every AI request for personalized responses
- Today's fitness data (meals eaten, workouts completed, water intake) is also sent as context
- Voice support: Audio recording on client → base64 encoding → server speech-to-text → AI response → optional text-to-speech back
- **Saveable Plans**: When the AI generates meal or workout plans, it includes structured JSON blocks wrapped in `<<<MEAL_PLAN>>>...<<<END_MEAL_PLAN>>>` and `<<<WORKOUT_PLAN>>>...<<<END_WORKOUT_PLAN>>>` markers. The coach screen (`app/(tabs)/coach.tsx`) parses these markers and renders "Save to Meals" / "Save to Workouts" action buttons. Users can save plans with one tap, which adds them to their Meals or Workouts tabs for tracking. After saving, the button changes to a green "Saved" badge.
- **Workouts Tab** (`app/(tabs)/workouts.tsx`): Dedicated tab for viewing saved workout plans with expandable exercise lists, per-exercise completion checkboxes, progress tracking, and complete/remove actions. FitnessContext provides `removeWorkout` and `toggleExercise` methods for this.

### Replit Integration Modules

Located in `server/replit_integrations/`, these are pre-built modules:
- **audio/**: Voice chat with speech-to-text, text-to-speech, audio format detection and conversion (ffmpeg)
- **chat/**: Conversation CRUD with PostgreSQL persistence
- **image/**: Image generation via `gpt-image-1`
- **batch/**: Rate-limited batch processing with retries (`p-limit`, `p-retry`)

### Build & Deployment

- **Dev**: Two processes — `expo:dev` for Metro bundler and `server:dev` for Express
- **Production**: `expo:static:build` creates a static web bundle, `server:build` bundles Express with esbuild, `server:prod` serves both
- **Scripts**: `scripts/build.js` handles the Expo static build process with Metro bundler orchestration

## External Dependencies

- **PostgreSQL**: Required for server-side data (conversations, messages, users). Connection via `DATABASE_URL` environment variable
- **OpenAI API** (via Replit AI Integrations): Powers the AI coach, meal analysis, workout generation, and voice features. Environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
- **ffmpeg**: Required on the server for audio format conversion and video frame extraction
- **AthletraSignalProcessor** (`server/athletra_signal_processor.py`): Standalone real-time biomechanical signal processing class. Pipeline: (1) Normalization — shoulder_width scale reference with EMA smoothing; (2) Smoothing — One-Euro Filter or EMA per landmark axis with visibility gating and missing-frame hold; (3) Heuristic Gate — shoulder-normalised wrist velocity drives open/close with hysteresis thresholds; (4) Upsampling — CubicSpline 10× interpolation on buffered scalar joint-angle signal; (5) Confidence — frame-count ramp × velocity-consistency score. All init params (thresholds, target joint, smoothing method) configurable at construction. Early exit when critical landmarks are invalid.
- **MediaPipe** (Python): Google's pose detection library runs server-side via `server/pose_detection.py`. Uses the PoseLandmarker heavy model (`server/models/pose_landmarker_heavy.task`) to detect 33 body landmarks, calculate joint angles, measure body symmetry, and generate skeleton-annotated images. Two-pass annotation: first pass detects poses and computes motion analysis, second pass re-annotates with red circles/warning triangles on error joints (asymmetries, ROM flags). Third pass generates a **correction guide** for the worst error frame — draws the current limb in red/orange, a green dashed guide line showing the target angle position, angle arcs, and labeled "Current: X° / Target: Y°" overlay panel. Called from Node.js via `child_process.spawn`. Requires Python 3.11 + mediapipe + opencv-python-headless + numpy pip packages + xorg.libxcb, xorg.libX11, libGL system dependencies
- **Active Coaching Layer**: Real-time pre-recording alignment coach that activates when the user enters camera mode. Architecture: `lib/coachingScript.ts` (7 states: NOT_VISIBLE/TOO_CLOSE/TOO_FAR/NOT_SIDEWAYS/MISALIGNED_HEAD/UNSTABLE/ALIGNED with priority ordering, messages, icons, colors); `lib/coachingLogic.ts` (landmark-based state computation using shoulder separation for sideways detection, body height fraction for distance, ankle-midpoint vs nose-x for head alignment, inter-frame velocity for stability); `hooks/useCoachingState.ts` (900ms polling loop, 380ms anti-flicker stability window, 1.2s ALIGNED lock before isReadyToRecord fires); `components/CoachingOverlay.tsx` (animated message box with fade transitions, AlignedPulse breathing ring, 3-2-1 countdown that auto-triggers capture, alignment progress dots, distance bar). Backend: `/api/coach/live-pose` endpoint in `routes.ts` + `--quick` mode in `pose_detection.py` (single-image, landmarks only, no annotation, ~3× faster than full detection). Integration in `app/analyze.tsx`: `getCameraFrame()` callback (native: `takePictureAsync({quality:0.25})`, web: canvas capture from videoRef at 35% scale), overlay shown only during alignment phase (!isCapturing), auto-starts live capture on ALIGNED with haptic success feedback
- **Correction Guide**: Visual correction overlay generated by `generate_correction_guide()` in `pose_detection.py`. `find_worst_error_frame()` identifies the frame with the largest ROM deviation. The correction guide image is sent via SSE as `correction_guide: { image, joint, joint_label, current_angle, target_angle, frame_index, deviation }`. Frontend renders a "Correction Guide" card below AI feedback with the annotated image, current vs target angle boxes, and a delta bar
- **Session History**: Technique analysis results (scores, angles, sport) are stored in AsyncStorage under `technique_analysis_history` key. Up to 20 sessions retained. Previous session data is sent to the AI for trend comparison and progress tracking. The UI shows a "Session Comparison" card with score deltas and angle changes when previous data exists
- **AI Coaching Format**: Condensed "Problem/Impact/Fix" format for improvements. Sport-specific movement phase names (e.g., skating: Setup→Load→Push→Extension→Recovery). Interactive clickable phase pills that open the relevant annotated frame and show joint angle details
- **Replit Environment**: Uses `REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS`, `REPLIT_INTERNAL_APP_DOMAIN` for CORS and URL configuration
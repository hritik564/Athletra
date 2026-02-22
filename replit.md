# VitalCoach

## Overview

VitalCoach is a mobile-first AI fitness and wellness coaching app built with Expo (React Native) and an Express backend. It provides personalized workout plans, meal tracking, weight/progress monitoring, and an AI coach powered by OpenAI. The app features a multi-step onboarding flow that collects user health data, goals, and preferences, then uses that context to deliver tailored coaching through a chat interface with voice support.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK 54 with React Native 0.81, using the new architecture (`newArchEnabled: true`)
- **Routing**: Expo Router with file-based routing (`app/` directory). Uses typed routes and a tab-based layout for the main experience (`(tabs)/` group with Home, Meals, Coach, Progress tabs)
- **State Management**: React Context for user profile (`UserContext`) and fitness data (`FitnessContext`). TanStack React Query for server-state and API calls
- **Local Persistence**: AsyncStorage for offline-first data (user profile, meals, workouts, weight history, streaks). The app works without being connected to the backend for most tracking features
- **Styling**: Custom dark theme defined in `constants/colors.ts` with an orange/teal accent palette. Uses `expo-linear-gradient` for gradient backgrounds, `react-native-svg` for charts and rings
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

- The coach system prompt is a detailed persona ("VitalCoach") defined in `server/routes.ts` that includes exercise science expertise, nutrition knowledge, and behavioral psychology
- User profile context (name, age, weight, height, goals, health conditions, dietary preferences, athlete status) is injected into every AI request for personalized responses
- Today's fitness data (meals eaten, workouts completed, water intake) is also sent as context
- Voice support: Audio recording on client → base64 encoding → server speech-to-text → AI response → optional text-to-speech back

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
- **ffmpeg**: Required on the server for audio format conversion (used by the audio integration module to convert various formats to WAV for speech-to-text)
- **Replit Environment**: Uses `REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS`, `REPLIT_INTERNAL_APP_DOMAIN` for CORS and URL configuration
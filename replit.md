# Athletra

## Overview

Athletra is a mobile-first AI fitness and wellness coaching app built with Expo (React Native) and an Express backend. It offers personalized workout plans, meal tracking, progress monitoring, and an AI coach powered by OpenAI. The app features a multi-step onboarding flow to collect user data, goals, and preferences, providing tailored coaching via a chat interface with voice support. The vision is to make AI-powered fitness coaching accessible, helping users achieve their health and fitness goals through highly personalized guidance and advanced technique analysis.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK 54 with React Native 0.81 (new architecture enabled)
- **Routing**: Expo Router with file-based routing and a tab-based layout.
- **State Management**: React Context for user and fitness data; TanStack React Query for server state.
- **Local Persistence**: AsyncStorage for offline-first data, including user profiles, meals, workouts, and weight history.
- **Styling**: Dual light/dark theme system with `ThemeContext` and `useThemedStyles`. Uses `expo-linear-gradient` and `react-native-svg` for UI elements.
- **Fonts**: Outfit font family.
- **Audio**: `expo-audio` for voice features.
- **Onboarding Flow**: A 7-step process collects personal details, goals, health conditions, fitness level, workout environment, and dietary preferences to personalize AI coaching.

### Backend (Express)

- **Server**: Express 5 on Node.js with TypeScript.
- **API Pattern**: RESTful JSON APIs.
- **AI Integration**: Leverages OpenAI API for:
    - Chat coaching (streaming SSE).
    - Voice coaching (transcription, AI response, TTS).
    - Audio transcription.
    - Technique analysis (MediaPipe pose detection + GPT-4o vision, streaming SSE).
    - Pose detection (MediaPipe PoseLandmarker).
    - Video frame extraction (gate-based, velocity-driven).
    - Text-to-speech.
    - Meal analysis from photos/descriptions.
    - Workout plan generation.
- **AI Coach Architecture**: Utilizes a detailed "Athletra" persona system prompt combined with comprehensive user profile and daily fitness data for personalized responses. Supports saving AI-generated meal and workout plans directly within the app.

### Data Storage

- **Client-side**: AsyncStorage for user-specific fitness data (offline-first approach).
- **Server-side**: PostgreSQL with Drizzle ORM for `users`, `conversations`, and `messages` tables.

### Replit Integration Modules

- **audio/**: Handles voice chat features (STT, TTS, format conversion).
- **chat/**: Manages conversation CRUD operations with PostgreSQL.
- **image/**: Integrates image generation.
- **batch/**: Provides rate-limited batch processing with retries.

### Build & Deployment

- **Development**: Separate processes for Expo Metro bundler and Express server.
- **Production**: Static web build for Expo and bundled Express server.

## External Dependencies

- **PostgreSQL**: Database for server-side data persistence.
- **OpenAI API**: Powers all AI functionalities.
- **ffmpeg**: Server-side tool for audio format conversion and video frame extraction.
- **AthletraSignalProcessor** (Python): Biomechanical signal processing for real-time and batch technique analysis, providing scores and identifying issues.
- **MediaPipe** (Python): Google's pose detection library for 33 body landmarks, joint angles, symmetry, and skeleton-annotated images, including a correction guide generation.
- **Active Coaching Layer**: Real-time pre-recording alignment coach using camera input, providing visual and haptic feedback.
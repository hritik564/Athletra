import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { execSync, spawn } from "node:child_process";
import path from "node:path";
import OpenAI from "openai";
import express from "express";

interface PoseResult {
  detected: boolean;
  landmarks?: Record<string, { x: number; y: number; z: number; visibility: number }>;
  angles?: Record<string, number>;
  symmetry?: {
    shoulder_level_diff: number;
    hip_level_diff: number;
    shoulders_aligned: boolean;
    hips_aligned: boolean;
  };
  annotated_image?: string;
  error_joints?: string[];
}

interface MotionDelta {
  from_frame: number;
  to_frame: number;
  from_angle: number;
  to_angle: number;
  delta: number;
  direction: string;
}

interface ROMEntry {
  min_angle: number;
  max_angle: number;
  range: number;
  min_frame: number;
  max_frame: number;
  reference_label?: string;
  reference_min?: number;
  reference_max?: number;
  flag?: string;
  flag_detail?: string;
}

interface Asymmetry {
  joint: string;
  left_joint: string;
  right_joint: string;
  avg_difference: number;
  max_difference: number;
  max_diff_frame: number;
  severity: string;
  flagged: boolean;
}

interface MovementPhase {
  frame: number;
  phase_type: string;
  phase_label: string;
  motion_score: number;
  dominant_joints: Record<string, string>;
}

interface MotionAnalysis {
  frame_count: number;
  total_frames: number;
  tracked_joints: string[];
  deltas: Record<string, MotionDelta[]>;
  range_of_motion: Record<string, ROMEntry>;
  asymmetries: Asymmetry[];
  phases: MovementPhase[];
  error?: string;
}

interface CorrectionGuide {
  image: string;
  joint: string;
  joint_label: string;
  current_angle: number;
  target_angle: number;
  frame_index: number;
  deviation: number;
}

interface PoseDetectionOutput {
  results: PoseResult[];
  motion_analysis: MotionAnalysis | null;
  correction_guide: CorrectionGuide | null;
}

async function runPoseDetection(images: string[]): Promise<PoseDetectionOutput> {
  const scriptPath = path.join(import.meta.dirname || __dirname, "pose_detection.py");
  const input = JSON.stringify({ images });

  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error("Pose detection stderr:", stderr);
        reject(new Error(`Pose detection failed with code ${code}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        resolve({
          results: result.results || [],
          motion_analysis: result.motion_analysis || null,
          correction_guide: result.correction_guide || null,
        });
      } catch (e) {
        reject(new Error("Failed to parse pose detection output"));
      }
    });

    proc.on("error", reject);

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Pose detection timed out"));
    }, 60000);

    proc.on("close", () => clearTimeout(timeout));

    proc.stdin.write(input);
    proc.stdin.end();
  });
}

function formatLabel(joint: string): string {
  return joint.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatPoseDataForAI(poseResults: PoseResult[], motionAnalysis: MotionAnalysis | null): string {
  const framesWithPose = poseResults.filter(r => r.detected);
  if (framesWithPose.length === 0) return "";

  let report = "\n\n=== MEDIAPIPE POSE DETECTION DATA ===\n";
  report += `Pose detected in ${framesWithPose.length}/${poseResults.length} images.\n`;

  report += "\n--- PER-FRAME JOINT ANGLES ---\n";
  framesWithPose.forEach((r, i) => {
    report += `\n[Frame ${i + 1}]\n`;
    if (r.angles && Object.keys(r.angles).length > 0) {
      for (const [joint, angle] of Object.entries(r.angles)) {
        report += `  ${formatLabel(joint)}: ${angle}°\n`;
      }
    }
    if (r.symmetry) {
      report += `  Shoulders: ${r.symmetry.shoulders_aligned ? "aligned" : `misaligned (${(r.symmetry.shoulder_level_diff * 100).toFixed(1)}% off)`}\n`;
      report += `  Hips: ${r.symmetry.hips_aligned ? "aligned" : `misaligned (${(r.symmetry.hip_level_diff * 100).toFixed(1)}% off)`}\n`;
    }
  });

  if (motionAnalysis && !motionAnalysis.error) {
    if (motionAnalysis.phases && motionAnalysis.phases.length > 0) {
      report += "\n--- MOVEMENT PHASES ---\n";
      for (const phase of motionAnalysis.phases) {
        const joints = Object.entries(phase.dominant_joints)
          .map(([j, dir]) => `${formatLabel(j)} ${dir}`)
          .join(", ");
        report += `Frame ${phase.frame}: ${phase.phase_label} (motion score: ${phase.motion_score})`;
        if (joints) report += ` — ${joints}`;
        report += "\n";
      }
    }

    if (motionAnalysis.deltas && Object.keys(motionAnalysis.deltas).length > 0) {
      report += "\n--- FRAME-TO-FRAME ANGLE DELTAS ---\n";
      for (const [joint, jointDeltas] of Object.entries(motionAnalysis.deltas)) {
        report += `${formatLabel(joint)}:\n`;
        for (const d of jointDeltas) {
          const sign = d.delta > 0 ? "+" : "";
          report += `  F${d.from_frame}→F${d.to_frame}: ${d.from_angle}° → ${d.to_angle}° (${sign}${d.delta}° ${d.direction})\n`;
        }
      }
    }

    if (motionAnalysis.range_of_motion && Object.keys(motionAnalysis.range_of_motion).length > 0) {
      report += "\n--- RANGE OF MOTION ---\n";
      for (const [joint, rom] of Object.entries(motionAnalysis.range_of_motion)) {
        const label = rom.reference_label || formatLabel(joint);
        report += `${label} (${formatLabel(joint)}): ${rom.min_angle}° to ${rom.max_angle}° = ${rom.range}° ROM`;
        if (rom.reference_min !== undefined) {
          report += ` [reference: ${rom.reference_min}°-${rom.reference_max}°]`;
        }
        if (rom.flag && rom.flag !== "normal") {
          report += ` ⚠ ${rom.flag_detail}`;
        }
        report += "\n";
      }
    }

    if (motionAnalysis.asymmetries && motionAnalysis.asymmetries.length > 0) {
      const flagged = motionAnalysis.asymmetries.filter(a => a.flagged);
      if (flagged.length > 0) {
        report += "\n--- ASYMMETRY FLAGS ---\n";
        for (const a of flagged) {
          report += `⚠ ${a.joint}: avg ${a.avg_difference}° L/R difference (${a.severity}), worst at Frame ${a.max_diff_frame} (${a.max_difference}° diff)\n`;
        }
      }
      const minor = motionAnalysis.asymmetries.filter(a => !a.flagged);
      if (minor.length > 0) {
        report += "Symmetric joints (< 8° difference): ";
        report += minor.map(a => `${a.joint} (${a.avg_difference}°)`).join(", ") + "\n";
      }
    }
  }

  report += "\n=== END MOTION DATA ===";
  return report;
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const COACH_SYSTEM_PROMPT = `You are Athletra, an elite AI fitness and wellness coach. You combine deep expertise in exercise science, nutrition, and behavioral psychology to help users transform their lives.

Your personality:
- Warm, encouraging, but direct - like a supportive friend who happens to be an expert
- You celebrate wins (even small ones) and reframe setbacks as learning opportunities
- You use habit-building psychology: identity-based habits, implementation intentions, temptation bundling
- You're conversational and natural - never clinical or robotic
- Keep responses concise and actionable (2-4 sentences for quick questions, more for plans)

Your capabilities:
- Create and adjust meal plans with calorie/macro breakdowns
- Design workout routines adapted to the user's level and goals
- Provide emotional coaching and accountability
- Help users build identity change ("You're becoming someone who...")
- Negotiate and protect workout schedules
- Suggest alternatives when users miss goals (missed a workout? Here's a 10-min option)
- Track patterns and provide insights

CRITICAL DIETARY AND HEALTH RULES — THESE ARE ABSOLUTE AND NON-NEGOTIABLE:
1. If the user's dietary preference is listed in their profile, you MUST follow it 100% of the time in every meal suggestion, plan, or food mention. Never suggest foods that violate it.
   - vegetarian → NEVER suggest chicken, beef, pork, lamb, fish, seafood, or any meat/flesh. Eggs and dairy ARE allowed.
   - vegan → NEVER suggest any animal products: no meat, fish, eggs, dairy, honey, or gelatin.
   - keto → Keep net carbs below 25g/day. NEVER suggest bread, rice, pasta, sugar, fruit juice, or starchy vegetables.
   - paleo → NEVER suggest grains, legumes, dairy, refined sugar, or processed foods.
   - gluten_free → NEVER suggest wheat, barley, rye, spelt, or anything containing gluten.
2. If the user has listed food allergies, NEVER include those foods under any circumstance.
3. If the user has active injuries, DO NOT prescribe exercises that stress those areas.
4. Always tailor workout plans to the user's cricket role, yoga level, or sport-specific context if provided.

When responding:
- Always consider the user's full profile data (goals, stats, sport, dietary restrictions, injuries)
- Be specific with numbers (calories, sets, reps, timing)
- End coaching responses with a motivating insight or micro-challenge
- If the user seems discouraged, focus on what they DID accomplish
- Use the user's name when provided

Format guidelines:
- Use short paragraphs for readability
- Bold key numbers or actionable items with **bold**
- Use bullet points for lists of exercises or meals

IMPORTANT - Saveable Plans:
When the user asks you to create, generate, or suggest a meal plan or diet plan, ALWAYS include a structured JSON block so they can save it directly. Wrap it in <<<MEAL_PLAN>>> and <<<END_MEAL_PLAN>>> markers. The JSON should be an object with a "meals" array. Each meal object has: name (string), calories (number), protein (number in grams), carbs (number in grams), fat (number in grams), mealType (one of: breakfast, lunch, dinner, snack).

Example:
<<<MEAL_PLAN>>>
{"meals":[{"name":"Greek Yogurt Bowl","calories":350,"protein":25,"carbs":40,"fat":10,"mealType":"breakfast"}]}
<<<END_MEAL_PLAN>>>

Similarly, when the user asks for a workout plan or exercise routine, include a structured JSON block wrapped in <<<WORKOUT_PLAN>>> and <<<END_WORKOUT_PLAN>>> markers. The JSON should be an object with: name (string), duration (number in minutes), calories_burned (number estimate), exercises (array of objects with: name, sets, reps (number or string like "30 sec"), rest_seconds, description).

Example:
<<<WORKOUT_PLAN>>>
{"name":"Morning HIIT","duration":25,"calories_burned":280,"exercises":[{"name":"Jumping Jacks","sets":3,"reps":20,"rest_seconds":30,"description":"Full body warm-up"}]}
<<<END_WORKOUT_PLAN>>>

Always present the plan in a readable text format FIRST (with bullets, bold numbers, etc.), then include the JSON block at the end. This way the user sees a nice readable version AND can save the structured data. Only include these markers when generating actual plans the user requested. Do not include them in casual conversation.`;

function buildProfileContext(userProfile: any): string {
  if (!userProfile) return '';

  let ctx = `\n\n===== ATHLETE PROFILE — READ BEFORE EVERY RESPONSE =====`;

  // ── Vitals ──────────────────────────────────────────────────────────────────
  ctx += `\n- Name: ${userProfile.name || 'Friend'}`;
  ctx += `\n- Age: ${userProfile.age || 'Unknown'}`;

  const weight = userProfile.weightKg || userProfile.weight;
  const weightUnit = userProfile.weightUnit || 'kg';
  const height = userProfile.heightCm || userProfile.height;
  const heightUnit = userProfile.heightUnit || 'cm';
  if (weight) ctx += `\n- Weight: ${weight} ${weightUnit}`;
  if (height) ctx += `\n- Height: ${height} ${heightUnit}`;

  // ── Sport & role ─────────────────────────────────────────────────────────────
  const sport = userProfile.primarySport || userProfile.sport;
  if (sport) ctx += `\n- Primary Sport: ${sport}`;

  const skillLevel = userProfile.skillLevel || userProfile.fitnessLevel || userProfile.athleteLevel;
  if (skillLevel) ctx += `\n- Skill Level: ${skillLevel}`;

  if (sport === 'cricket') {
    if (userProfile.cricketRole)  ctx += `\n- Cricket Role: ${userProfile.cricketRole.replace(/_/g, ' ')}`;
    if (userProfile.bowlingArm)   ctx += `\n- Bowling Arm: ${userProfile.bowlingArm}`;
    if (userProfile.bowlingStyle) ctx += `\n- Bowling Style: ${userProfile.bowlingStyle}`;
    if (userProfile.spinType)     ctx += `\n- Spin Type: ${userProfile.spinType.replace(/_/g, ' ')}`;
  }
  if (userProfile.leadHand) ctx += `\n- Dominant Hand/Foot: ${userProfile.leadHand}`;

  // ── Goal & calories ──────────────────────────────────────────────────────────
  const goal = userProfile.fitnessGoal || userProfile.goal;
  if (goal) ctx += `\n- Primary Goal: ${goal.replace(/_/g, ' ')}`;
  ctx += `\n- Daily Calorie Target: ${userProfile.calorieTarget || 2000} kcal`;
  if (userProfile.dailyPattern || userProfile.activityLevel) {
    ctx += `\n- Activity Pattern: ${userProfile.dailyPattern || userProfile.activityLevel}`;
  }
  if (userProfile.workoutEnvironment) {
    ctx += `\n- Workout Environment: ${userProfile.workoutEnvironment}`;
  }

  // ── DIETARY — hard constraints the model must obey ───────────────────────────
  const dietaryPref = userProfile.dietaryPrefs || userProfile.dietaryPreference;
  if (dietaryPref && dietaryPref !== 'none') {
    ctx += `\n\n⚠️  DIETARY RESTRICTION — ABSOLUTE RULE: ${dietaryPref.toUpperCase()}`;
    if (dietaryPref === 'vegetarian') {
      ctx += `\n   → User is VEGETARIAN. NEVER suggest chicken, beef, pork, lamb, mutton, fish, seafood, or any meat. Eggs and dairy ARE permitted.`;
    } else if (dietaryPref === 'vegan') {
      ctx += `\n   → User is VEGAN. NEVER suggest any animal product: no meat, fish, eggs, dairy, honey, gelatin, or whey.`;
    } else if (dietaryPref === 'keto') {
      ctx += `\n   → User is on KETO. Keep net carbs below 25 g/day. NEVER suggest bread, rice, pasta, sugar, fruit juice, or high-carb foods.`;
    } else if (dietaryPref === 'paleo') {
      ctx += `\n   → User follows PALEO. NEVER suggest grains, legumes, dairy, refined sugar, or processed foods.`;
    } else if (dietaryPref === 'gluten_free') {
      ctx += `\n   → User is GLUTEN-FREE. NEVER suggest wheat, barley, rye, spelt, or anything containing gluten.`;
    }
  }

  const foodAllergies: string[] = userProfile.foodAllergies
    || (userProfile.allergies ? [userProfile.allergies] : []);
  if (foodAllergies.length > 0) {
    ctx += `\n⚠️  FOOD ALLERGIES — NEVER include: ${foodAllergies.join(', ')}`;
  }

  // ── Health conditions ────────────────────────────────────────────────────────
  const healthConditions: string[] = userProfile.healthFlags || userProfile.healthConditions || [];
  if (healthConditions.length > 0) {
    ctx += `\n- Medical Conditions: ${healthConditions.join(', ')}`;
  }
  const healthNotes = userProfile.otherHealthNotes || userProfile.healthDetails;
  if (healthNotes) ctx += `\n- Additional Health Notes: ${healthNotes}`;

  // ── Injury history ────────────────────────────────────────────────────────────
  const injuryHistory: Record<string, string> = userProfile.injuryHistory || {};
  const activeInjuries = Object.entries(injuryHistory).filter(([, v]) => v === 'active').map(([k]) => k);
  const pastInjuries   = Object.entries(injuryHistory).filter(([, v]) => v === 'past').map(([k]) => k);
  if (activeInjuries.length > 0) {
    ctx += `\n⚠️  ACTIVE INJURIES (avoid loading these): ${activeInjuries.join(', ')}`;
  }
  if (pastInjuries.length > 0) {
    ctx += `\n- Past Injuries (approach with caution): ${pastInjuries.join(', ')}`;
  }
  if (userProfile.otherInjuryNotes) {
    ctx += `\n- Injury Notes: ${userProfile.otherInjuryNotes}`;
  }

  // ── Sport-specific pro-mode data ─────────────────────────────────────────────
  const sd = userProfile.sportSpecificData;
  if (sd && sport) {
    const sportSD = sd[sport];
    if (sportSD && Object.keys(sportSD).length > 0) {
      ctx += `\n- Sport-Specific Data: ${JSON.stringify(sportSD)}`;
    }
  }

  ctx += `\n===== END PROFILE =====`;
  return ctx;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/coach/chat", async (req: Request, res: Response) => {
    try {
      const { messages, userProfile } = req.body;

      let systemContent = COACH_SYSTEM_PROMPT + buildProfileContext(userProfile);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const chatMessages = [
        { role: "system" as const, content: systemContent },
        ...messages.map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const stream = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: chatMessages,
        stream: true,
        max_completion_tokens: 8192,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("Coach chat error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to get response" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process chat" });
      }
    }
  });

  app.post("/api/coach/voice", express.json({ limit: "50mb" }), async (req: Request, res: Response) => {
    try {
      const { messages, userProfile, userText } = req.body;

      let systemContent = COACH_SYSTEM_PROMPT + buildProfileContext(userProfile);
      systemContent += `\n\nIMPORTANT: The user is speaking to you via voice. Keep your response conversational and concise (2-3 sentences max). Do not use markdown formatting, bold, or bullet points since this will be spoken aloud.`;

      const chatMessages = [
        { role: "system" as const, content: systemContent },
        ...messages.map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: userText },
      ];

      const textResponse = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: chatMessages,
        max_completion_tokens: 512,
      });

      const assistantText = textResponse.choices[0]?.message?.content || "I'm here to help!";

      const audioResponse = await openai.chat.completions.create({
        model: "gpt-audio",
        modalities: ["text", "audio"],
        audio: { voice: "nova", format: "mp3" },
        messages: [
          { role: "system", content: "You are a text-to-speech assistant. Repeat the following text verbatim with natural, warm, encouraging intonation." },
          { role: "user", content: `Repeat this verbatim: ${assistantText}` },
        ],
      });

      const audioData = (audioResponse.choices[0]?.message as any)?.audio?.data ?? "";

      res.json({
        text: assistantText,
        audio: audioData,
        format: "mp3",
      });
    } catch (error) {
      console.error("Voice chat error:", error);
      res.status(500).json({ error: "Failed to process voice chat" });
    }
  });

  app.post("/api/coach/transcribe", express.json({ limit: "50mb" }), async (req: Request, res: Response) => {
    try {
      const { audio } = req.body;
      if (!audio) {
        return res.status(400).json({ error: "Audio data required" });
      }

      const audioBuffer = Buffer.from(audio, "base64");

      const { ensureCompatibleFormat } = await import("./replit_integrations/audio/client");
      const { buffer: compatBuffer, format: inputFormat } = await ensureCompatibleFormat(audioBuffer);

      const { toFile } = await import("openai");
      const file = await toFile(compatBuffer, `audio.${inputFormat}`);
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
      });

      res.json({ text: transcription.text });
    } catch (error) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });

  app.post("/api/coach/tts", express.json({ limit: "2mb" }), async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text required" });
      }

      const cleanText = text
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/#{1,3}\s+/g, "")
        .replace(/[-•]\s+/g, "")
        .replace(/<<<[A-Z_]+>>>/g, "")
        .replace(/```[\s\S]*?```/g, "")
        .trim();

      const truncated = cleanText.length > 4096 ? cleanText.slice(0, 4096) + "..." : cleanText;

      const audioResponse = await openai.chat.completions.create({
        model: "gpt-audio",
        modalities: ["text", "audio"],
        audio: { voice: "nova", format: "mp3" },
        messages: [
          { role: "system", content: "You are a text-to-speech assistant. Read the following coaching feedback aloud with natural, warm, encouraging intonation. Read it naturally as spoken language — skip formatting artifacts." },
          { role: "user", content: `Read this aloud naturally: ${truncated}` },
        ],
      });

      const audioData = (audioResponse.choices[0]?.message as any)?.audio?.data ?? "";

      res.json({ audio: audioData, format: "mp3" });
    } catch (error) {
      console.error("TTS error:", error);
      res.status(500).json({ error: "Failed to generate speech" });
    }
  });

  app.post("/api/coach/suggest-meal", async (req: Request, res: Response) => {
    try {
      const { currentCalories, targetCalories, mealType, preferences } = req.body;

      const remaining = targetCalories - currentCalories;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: "You are a nutrition expert. Return a JSON object with: name (string), calories (number), protein (number in grams), carbs (number in grams), fat (number in grams), description (string, 1 sentence). Be realistic with portions.",
          },
          {
            role: "user",
            content: `Suggest a ${mealType} meal. Remaining calorie budget: ${remaining} kcal. Preferences: ${preferences || 'balanced diet'}. Keep it under ${Math.min(remaining, mealType === 'snack' ? 300 : 700)} calories.`,
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 512,
      });

      const meal = JSON.parse(response.choices[0]?.message?.content || "{}");
      res.json(meal);
    } catch (error) {
      console.error("Meal suggestion error:", error);
      res.status(500).json({ error: "Failed to suggest meal" });
    }
  });

  app.post("/api/coach/generate-workout", async (req: Request, res: Response) => {
    try {
      const { goal, fitnessLevel, duration, equipment, focusArea } = req.body;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: "You are a fitness expert. Return a JSON object with: name (string), duration (number in minutes), calories_burned (number estimate), exercises (array of objects with: name, sets, reps, rest_seconds, description). Keep it practical.",
          },
          {
            role: "user",
            content: `Create a ${duration || 30}-minute ${focusArea || 'full body'} workout. Goal: ${goal || 'general fitness'}. Level: ${fitnessLevel || 'intermediate'}. Equipment: ${equipment || 'bodyweight only'}.`,
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1024,
      });

      const workout = JSON.parse(response.choices[0]?.message?.content || "{}");
      res.json(workout);
    } catch (error) {
      console.error("Workout generation error:", error);
      res.status(500).json({ error: "Failed to generate workout" });
    }
  });

  app.post("/api/coach/extract-frames", express.json({ limit: "50mb" }), async (req: Request, res: Response) => {
    try {
      const { video } = req.body;
      if (!video) {
        return res.status(400).json({ error: "Video data required" });
      }

      const fs = await import("fs");
      const os = await import("os");

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitalcoach-'));
      const videoPath = path.join(tmpDir, 'input.mp4');

      const videoBuffer = Buffer.from(video, "base64");
      fs.writeFileSync(videoPath, videoBuffer);

      const MAX_FRAMES = 60;
      const sampleDensity = 60;
      const GATE_OPEN_THRESHOLD = 0.15;
      const GATE_CLOSE_THRESHOLD = 0.05;
      const SW_EMA_ALPHA = 0.15;

      try {
        const durationOutput = execSync(
          `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
          { encoding: 'utf8', timeout: 10000 }
        ).trim();
        const duration = parseFloat(durationOutput) || 10;

        const sampleCount = Math.min(sampleDensity, Math.max(6, Math.floor(duration * 6)));
        const sampleInterval = Math.max(duration / (sampleCount + 1), 0.05);

        for (let i = 1; i <= sampleCount; i++) {
          const timestamp = sampleInterval * i;
          const outputPath = path.join(tmpDir, `sample_${i}.jpg`);
          try {
            execSync(
              `ffmpeg -ss ${timestamp.toFixed(2)} -i "${videoPath}" -vframes 1 -q:v 3 -vf "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease" "${outputPath}" -y`,
              { timeout: 15000, stdio: 'pipe' }
            );
          } catch {}
        }

        const sampleFrames: { index: number; b64: string; timestamp: number }[] = [];
        for (let i = 1; i <= sampleCount; i++) {
          const framePath = path.join(tmpDir, `sample_${i}.jpg`);
          if (fs.existsSync(framePath)) {
            const frameBuffer = fs.readFileSync(framePath);
            sampleFrames.push({
              index: i,
              b64: frameBuffer.toString('base64'),
              timestamp: sampleInterval * i,
            });
          }
        }

        let selectedFrames: typeof sampleFrames;
        let method = 'gate';

        if (sampleFrames.length <= 2) {
          selectedFrames = sampleFrames;
          method = 'all';
        } else {
          try {
            const sampleImages = sampleFrames.map(f => f.b64);
            const poseOutput = await runPoseDetection(sampleImages);
            const poseResults = poseOutput.results;

            // ── Gate-based dynamic selection ─────────────────────────────────
            // Compute shoulder-normalised wrist velocity per frame (scalar),
            // then apply a hysteresis gate to find active movement windows.
            // Capture every frame while the gate is open; cap at MAX_FRAMES.

            let smoothedSW = 0;
            let prevWrist: { x: number; y: number; z: number } | null = null;
            let gateOpen = false;
            const gateFrameIndices: number[] = [];

            for (let i = 0; i < poseResults.length; i++) {
              const r = poseResults[i];
              const dt = i === 0 ? sampleInterval : sampleInterval;

              if (!r?.detected || !r.landmarks) {
                prevWrist = null;
                continue;
              }

              // 1. Smooth shoulder_width via EMA (stable scale reference)
              const ls = r.landmarks['left_shoulder'];
              const rs = r.landmarks['right_shoulder'];
              if (ls && rs) {
                const rawSW = Math.sqrt(
                  (ls.x - rs.x) ** 2 + (ls.y - rs.y) ** 2 + (ls.z - rs.z) ** 2
                );
                smoothedSW = smoothedSW === 0
                  ? rawSW
                  : SW_EMA_ALPHA * rawSW + (1 - SW_EMA_ALPHA) * smoothedSW;
              }

              if (smoothedSW < 1e-6) { prevWrist = null; continue; }

              // 2. Compute scalar normalised velocity of left_wrist
              const wrist = r.landmarks['left_wrist'] ?? r.landmarks['right_wrist'];
              let velocity = 0;
              if (wrist && prevWrist) {
                const dist = Math.sqrt(
                  (wrist.x - prevWrist.x) ** 2 +
                  (wrist.y - prevWrist.y) ** 2 +
                  (wrist.z - prevWrist.z) ** 2
                );
                velocity = (dist / dt) / smoothedSW;
              }
              if (wrist) prevWrist = { x: wrist.x, y: wrist.y, z: wrist.z };

              // 3. Gate open/close with hysteresis
              if (!gateOpen && velocity > GATE_OPEN_THRESHOLD) gateOpen = true;
              if (gateOpen && velocity < GATE_CLOSE_THRESHOLD) gateOpen = false;

              if (gateOpen) gateFrameIndices.push(i);
            }

            // Cap at MAX_FRAMES: if gate captured more than the limit,
            // subsample evenly across the gate window to preserve coverage.
            let keptIndices: number[];
            if (gateFrameIndices.length === 0) {
              // Gate never opened (low-motion clip) — return all frames up to cap
              keptIndices = sampleFrames.map((_, i) => i).slice(0, MAX_FRAMES);
              method = 'all';
            } else if (gateFrameIndices.length <= MAX_FRAMES) {
              keptIndices = gateFrameIndices;
            } else {
              // Evenly subsample within the gate window
              const step = (gateFrameIndices.length - 1) / (MAX_FRAMES - 1);
              keptIndices = [];
              for (let i = 0; i < MAX_FRAMES; i++) {
                keptIndices.push(gateFrameIndices[Math.round(step * i)]);
              }
            }

            selectedFrames = keptIndices.map(i => sampleFrames[i]);
          } catch (poseErr) {
            console.error("Gate selection failed, returning all frames:", poseErr);
            selectedFrames = sampleFrames.slice(0, MAX_FRAMES);
            method = 'all';
          }
        }

        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}

        const frames = selectedFrames.map(f => f.b64);

        if (frames.length === 0) {
          return res.status(400).json({ error: "Could not extract frames from video" });
        }

        res.json({ frames, count: frames.length, method });
      } catch (ffmpegError) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
        console.error("FFmpeg error:", ffmpegError);
        return res.status(500).json({ error: "Failed to process video" });
      }
    } catch (error) {
      console.error("Frame extraction error:", error);
      res.status(500).json({ error: "Failed to extract frames" });
    }
  });

  app.post("/api/coach/pose-detect", express.json({ limit: "50mb" }), async (req: Request, res: Response) => {
    try {
      const { images } = req.body;
      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: "At least one image is required" });
      }

      const { results: poseResults, motion_analysis } = await runPoseDetection(images.slice(0, 60));
      const detected = poseResults.filter(r => r.detected).length;

      res.json({
        results: poseResults,
        motion_analysis,
        summary: {
          total: poseResults.length,
          detected,
        }
      });
    } catch (error) {
      console.error("Pose detection error:", error);
      res.status(500).json({ error: "Pose detection failed" });
    }
  });

  app.post("/api/coach/analyze-technique", express.json({ limit: "50mb" }), async (req: Request, res: Response) => {
    try {
      const { images, userProfile, sport, description, previousSession } = req.body;

      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: "At least one image is required" });
      }

      const profileContext = buildProfileContext(userProfile);
      const sportContext = sport || userProfile?.sport || 'general athletics';

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      res.write(`data: ${JSON.stringify({ status: "Detecting body pose..." })}\n\n`);

      let poseResults: PoseResult[] = [];
      let motionAnalysis: MotionAnalysis | null = null;
      let poseDataText = "";
      let annotatedImages = [...images];

      let correctionGuide: CorrectionGuide | null = null;

      try {
        const poseOutput = await runPoseDetection(images);
        poseResults = poseOutput.results;
        motionAnalysis = poseOutput.motion_analysis;
        correctionGuide = poseOutput.correction_guide;
        poseDataText = formatPoseDataForAI(poseResults, motionAnalysis);

        annotatedImages = images.map((original: string, i: number) => {
          const poseResult = poseResults[i];
          if (poseResult?.detected && poseResult.annotated_image) {
            return poseResult.annotated_image;
          }
          return original.startsWith('data:') ? original.split(',')[1] : original;
        });

        const detectedCount = poseResults.filter(r => r.detected).length;
        const hasMotion = motionAnalysis && !motionAnalysis.error && motionAnalysis.phases && motionAnalysis.phases.length > 0;
        const statusMsg = hasMotion
          ? `Pose detected in ${detectedCount}/${poseResults.length} images. Motion analysis complete — ${motionAnalysis!.phases!.length} phases identified. Analyzing technique...`
          : `Pose detected in ${detectedCount}/${poseResults.length} images. Analyzing technique...`;
        res.write(`data: ${JSON.stringify({ status: statusMsg })}\n\n`);

        if (poseResults.some(r => r.detected)) {
          const posePreview = poseResults
            .filter(r => r.detected)
            .map(r => ({
              annotated_image: r.annotated_image,
              angles: r.angles,
              symmetry: r.symmetry,
            }));
          const sseData: any = { pose_results: posePreview, motion_analysis: motionAnalysis };
          if (correctionGuide) {
            sseData.correction_guide = correctionGuide;
          }
          res.write(`data: ${JSON.stringify(sseData)}\n\n`);
        }
      } catch (poseError) {
        console.error("Pose detection failed, continuing without:", poseError);
        res.write(`data: ${JSON.stringify({ status: "Analyzing technique with visual inspection..." })}\n\n`);
        annotatedImages = images.map((img: string) =>
          img.startsWith('data:') ? img.split(',')[1] : img
        );
      }

      const hasPoseData = poseDataText.length > 0;
      const hasMotionData = motionAnalysis && !motionAnalysis.error && motionAnalysis.phases && motionAnalysis.phases.length > 0;
      const hasPreviousSession = previousSession && previousSession.scores;

      const previousSessionText = hasPreviousSession ? `
PREVIOUS SESSION DATA (for trend comparison):
${previousSession.date ? `Date: ${previousSession.date}` : ''}
${previousSession.scores ? `Previous scores: ${JSON.stringify(previousSession.scores)}` : ''}
${previousSession.angles ? `Previous key angles: ${JSON.stringify(previousSession.angles)}` : ''}
Compare the current analysis against these previous values. Note improvements and regressions with specific deltas.` : '';

      const systemPrompt = `You are Athletra — a world-class personal ${sportContext} coach standing right next to the athlete. Be CONCISE. No filler, no paragraphs. Every sentence must earn its place.

VOICE: Direct, warm, punchy. Use sport-specific ${sportContext} terminology. Talk in short lines — never more than 2 sentences per point.

FORMAT RULES:
- For problems, use this exact format: "Problem: [issue] (Measured: X°, Ideal: Y°). Impact: [consequence]. Fix: [one-line correction]."
- For positives, keep to one line with the data point.
- Never write paragraphs. Use bullets and short statements only.
${hasPoseData ? `
BIOMECHANICAL DATA:
You have MediaPipe pose detection data with joint angles and symmetry measurements. Annotated images show skeleton overlays. Joints marked with red circles and warning triangles have detected issues — reference these visual markers in your feedback.${hasMotionData ? `

MOTION ANALYSIS:
You have phase-based motion data. Use STANDARDIZED PHASE NAMES for ${sportContext}:
- For skating: Setup → Load → Push → Extension → Recovery
- For cricket: Stance → Backswing → Drive → Follow-through
- For basketball: Set → Load → Release → Follow-through
- For weightlifting: Setup → Pull → Catch → Recovery
- For running: Stance → Push-off → Flight → Landing
- For general: Setup → Load → Drive → Follow-through → Recovery
Map the detected phases to these sport-specific names in your output.

Data available: frame-to-frame angle deltas, ROM with reference ranges, L/R asymmetries.
USE CONCISE FORMAT for each issue:
- "Problem: Hip imbalance (L: 50°, R: 70°). Impact: Reduced power transfer. Fix: Keep hips level during drive."
- "Problem: Limited knee ROM (35° measured, 60°+ needed). Impact: Shallow squat. Fix: Wall-sit holds, 30s x 3."
` : `
USE this data — cite specific angles vs ideal ranges for ${sportContext}.`}
` : ''}${previousSessionText}
RESPONSE STRUCTURE (follow exactly):

**Quick Take**
[1-2 sentences. What impressed you + the #1 fix. Energetic, like a coach's first reaction.]
${hasMotionData ? `
**Movement Breakdown**
[One line per phase. Use sport-specific phase names. Format: "Phase Name (Frame X): [what's happening]. [angle data]." Keep it to 3-5 lines max.]
` : ''}
**What You're Nailing**
- [2-3 bullet points, one line each, with specific ${hasPoseData ? 'angle data' : 'observations'}]

**Top Improvements**
- [2-3 bullets using: "Problem: [X]. Impact: [Y]. Fix: [Z]." format]
- [Each must reference ${hasPoseData ? 'measured angles vs ideal' : 'visible positioning'}]
${hasMotionData ? '- [Reference asymmetries and ROM flags where detected]' : ''}
${hasPreviousSession ? `
**Progress Update**
- [Compare current scores to previous: "Today: X/10 (Last: Y/10, ${'+' || '-'}Z)"]
- [Note specific angle improvements/regressions with deltas: "Knee flexion: 85° → 92° (+7° improvement)"]
- [1 line summary: improving, regressing, or plateauing]
` : ''}
**Technique Score**
- Overall: X/10
- [Sport-specific dimension 1 for ${sportContext}]: X/10
- [Sport-specific dimension 2 for ${sportContext}]: X/10
- [Sport-specific dimension 3 for ${sportContext}]: X/10

**Your Ideal Form**
[2-3 lines max. Paint the target form for this specific ${sportContext} movement with specific angles. Sport-specific visualization the athlete can picture.]

**Your Drill**
[ONE drill that DIRECTLY addresses the biggest detected problem. Format: "Drill: [Name]. Why: [ties to detected issue]. How: [brief instructions]. Reps: [specific prescription]."]
${correctionGuide ? `
**Visual Correction**
A visual correction guide has been generated showing the ${correctionGuide.joint_label} adjustment needed. The guide shows the current angle (${correctionGuide.current_angle}°) and the target angle (${correctionGuide.target_angle}°) with a green guide line on frame ${correctionGuide.frame_index}. Reference this visual in your Quick Take — tell the athlete to "look at the green guide line on the correction image" to see exactly where their limb should be positioned.` : ''}

${profileContext}`;


      const imageContent = annotatedImages.map((img: string) => ({
        type: "image_url" as const,
        image_url: {
          url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`,
          detail: "high" as const,
        },
      }));

      const descriptionText = description
        ? `Analyze my ${sportContext} technique. Additional context: ${description}`
        : `Analyze my ${sportContext} technique in these images. Provide detailed, actionable feedback.`;

      const userContent: any[] = [
        ...imageContent,
        {
          type: "text" as const,
          text: descriptionText + poseDataText,
        },
      ];

      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        stream: true,
        max_completion_tokens: 2048,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("Technique analysis error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to analyze technique" })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        res.status(500).json({ error: "Failed to analyze technique" });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

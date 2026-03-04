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
}

async function runPoseDetection(images: string[]): Promise<PoseResult[]> {
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
        resolve(result.results || []);
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

function formatPoseDataForAI(poseResults: PoseResult[]): string {
  const framesWithPose = poseResults.filter(r => r.detected);
  if (framesWithPose.length === 0) return "";

  let report = "\n\n--- MEDIAPIPE POSE DETECTION DATA ---\n";
  report += `Pose detected in ${framesWithPose.length}/${poseResults.length} images.\n`;

  framesWithPose.forEach((r, i) => {
    report += `\n[Image ${i + 1}]\n`;
    if (r.angles && Object.keys(r.angles).length > 0) {
      report += "Joint Angles:\n";
      for (const [joint, angle] of Object.entries(r.angles)) {
        const label = joint.replace(/_/g, " ");
        report += `  - ${label}: ${angle}°\n`;
      }
    }
    if (r.symmetry) {
      report += "Body Symmetry:\n";
      report += `  - Shoulders aligned: ${r.symmetry.shoulders_aligned ? "Yes" : `No (${(r.symmetry.shoulder_level_diff * 100).toFixed(1)}% off)`}\n`;
      report += `  - Hips aligned: ${r.symmetry.hips_aligned ? "Yes" : `No (${(r.symmetry.hip_level_diff * 100).toFixed(1)}% off)`}\n`;
    }
  });

  report += "\nThe annotated images show the skeleton overlay with joint angles marked. Use this precise data to give biomechanically accurate feedback.\n";
  report += "--- END POSE DATA ---";
  return report;
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const COACH_SYSTEM_PROMPT = `You are VitalCoach, an elite AI fitness and wellness coach. You combine deep expertise in exercise science, nutrition, and behavioral psychology to help users transform their lives.

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

When responding:
- Always consider the user's profile data if provided (goals, stats, preferences)
- Be specific with numbers (calories, sets, reps, timing)
- End coaching responses with a motivating insight or micro-challenge
- If the user seems discouraged, focus on what they DID accomplish
- Use the user's name when provided
- Consider health conditions, dietary preferences, and athlete status in all recommendations

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
  let ctx = `\n\nUser Profile:`;
  ctx += `\n- Name: ${userProfile.name || 'Friend'}`;
  ctx += `\n- Age: ${userProfile.age || 'Unknown'}`;
  ctx += `\n- Weight: ${userProfile.weight || 'Unknown'} ${userProfile.weightUnit || 'kg'}`;
  ctx += `\n- Height: ${userProfile.height || 'Unknown'} ${userProfile.heightUnit || 'cm'}`;
  ctx += `\n- Goal: ${userProfile.goal || 'General fitness'}`;
  ctx += `\n- Activity Level: ${userProfile.activityLevel || 'Moderate'}`;
  ctx += `\n- Fitness Level: ${userProfile.fitnessLevel || 'intermediate'}`;
  ctx += `\n- Daily Calorie Target: ${userProfile.calorieTarget || 2000} kcal`;
  if (userProfile.isAthlete) {
    ctx += `\n- Athlete: Yes, ${userProfile.sport || 'general'} (${userProfile.athleteLevel || 'amateur'})`;
  }
  if (userProfile.healthConditions && userProfile.healthConditions.length > 0) {
    ctx += `\n- Health Conditions: ${userProfile.healthConditions.join(', ')}`;
  }
  if (userProfile.healthDetails) {
    ctx += `\n- Health Details: ${userProfile.healthDetails}`;
  }
  if (userProfile.allergies) {
    ctx += `\n- Allergies: ${userProfile.allergies}`;
  }
  if (userProfile.workoutEnvironment) {
    ctx += `\n- Workout Environment: ${userProfile.workoutEnvironment}`;
  }
  if (userProfile.dietaryPreference) {
    ctx += `\n- Dietary Preference: ${userProfile.dietaryPreference}`;
  }
  if (userProfile.dailyPattern) {
    ctx += `\n- Daily Activity Pattern: ${userProfile.dailyPattern}`;
  }
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
        audio: { voice: "nova", format: "wav" },
        messages: [
          { role: "system", content: "You are a text-to-speech assistant. Repeat the following text verbatim with natural, warm, encouraging intonation." },
          { role: "user", content: `Repeat this verbatim: ${assistantText}` },
        ],
      });

      const audioData = (audioResponse.choices[0]?.message as any)?.audio?.data ?? "";

      res.json({
        text: assistantText,
        audio: audioData,
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

      const truncated = cleanText.length > 3000 ? cleanText.slice(0, 3000) + "..." : cleanText;

      const audioResponse = await openai.chat.completions.create({
        model: "gpt-audio",
        modalities: ["text", "audio"],
        audio: { voice: "nova", format: "wav" },
        messages: [
          { role: "system", content: "You are a text-to-speech assistant. Read the following coaching feedback aloud with natural, warm, encouraging intonation. Read it naturally as spoken language — skip formatting artifacts." },
          { role: "user", content: `Read this aloud naturally: ${truncated}` },
        ],
      });

      const audioData = (audioResponse.choices[0]?.message as any)?.audio?.data ?? "";

      res.json({ audio: audioData });
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

      const frameCount = 6;
      try {
        const durationOutput = execSync(
          `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
          { encoding: 'utf8', timeout: 10000 }
        ).trim();
        const duration = parseFloat(durationOutput) || 10;

        const interval = Math.max(duration / (frameCount + 1), 0.5);

        for (let i = 1; i <= frameCount; i++) {
          const timestamp = interval * i;
          const outputPath = path.join(tmpDir, `frame_${i}.jpg`);
          try {
            execSync(
              `ffmpeg -ss ${timestamp.toFixed(2)} -i "${videoPath}" -vframes 1 -q:v 3 -vf "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease" "${outputPath}" -y`,
              { timeout: 15000, stdio: 'pipe' }
            );
          } catch {}
        }

        const frames: string[] = [];
        for (let i = 1; i <= frameCount; i++) {
          const framePath = path.join(tmpDir, `frame_${i}.jpg`);
          if (fs.existsSync(framePath)) {
            const frameBuffer = fs.readFileSync(framePath);
            frames.push(frameBuffer.toString('base64'));
          }
        }

        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}

        if (frames.length === 0) {
          return res.status(400).json({ error: "Could not extract frames from video" });
        }

        res.json({ frames, count: frames.length });
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

      const poseResults = await runPoseDetection(images.slice(0, 6));
      const detected = poseResults.filter(r => r.detected).length;

      res.json({
        results: poseResults,
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
      const { images, userProfile, sport, description } = req.body;

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
      let poseDataText = "";
      let annotatedImages = images.slice(0, 6);

      try {
        poseResults = await runPoseDetection(images.slice(0, 6));
        poseDataText = formatPoseDataForAI(poseResults);

        const inputImages = images.slice(0, 6);
        annotatedImages = inputImages.map((original: string, i: number) => {
          const poseResult = poseResults[i];
          if (poseResult?.detected && poseResult.annotated_image) {
            return poseResult.annotated_image;
          }
          return original.startsWith('data:') ? original.split(',')[1] : original;
        });

        const detectedCount = poseResults.filter(r => r.detected).length;
        res.write(`data: ${JSON.stringify({ status: `Pose detected in ${detectedCount}/${poseResults.length} images. Analyzing technique...` })}\n\n`);

        if (poseResults.some(r => r.detected)) {
          const posePreview = poseResults
            .filter(r => r.detected)
            .map(r => ({
              annotated_image: r.annotated_image,
              angles: r.angles,
              symmetry: r.symmetry,
            }));
          res.write(`data: ${JSON.stringify({ pose_results: posePreview })}\n\n`);
        }
      } catch (poseError) {
        console.error("Pose detection failed, continuing without:", poseError);
        res.write(`data: ${JSON.stringify({ status: "Analyzing technique with visual inspection..." })}\n\n`);
        annotatedImages = images.slice(0, 6).map((img: string) =>
          img.startsWith('data:') ? img.split(',')[1] : img
        );
      }

      const hasPoseData = poseDataText.length > 0;

      const systemPrompt = `You are VitalCoach's elite technique analyst. You specialize in sports biomechanics and movement analysis across all sports.
${hasPoseData ? `
IMPORTANT: You have been provided with precise MediaPipe pose detection data including joint angles (in degrees) and body symmetry measurements. The annotated images show the detected skeleton overlay. USE THIS DATA to provide biomechanically precise feedback — reference specific angles and measurements in your analysis rather than just visual impressions.
` : ''}
Your analysis approach:
- Examine body positioning, alignment, and form in each image
- ${hasPoseData ? 'Reference the exact joint angle measurements provided by MediaPipe' : 'Estimate body positioning from visual inspection'}
- If multiple frames are provided, analyze movement patterns and transitions
- Provide sport-specific feedback based on the athlete's sport: ${sportContext}
- Be direct and actionable — athletes want to know exactly what to fix
- Rate key aspects on a scale (e.g., Form: 8/10)
- Always include what they're doing WELL before corrections

Format your response as:
**Sport**: ${sportContext}
${hasPoseData ? '\n**Pose Analysis** (from MediaPipe)\n- [Reference specific joint angles and what they indicate for the sport]\n- [Note any asymmetries or alignment issues detected]\n' : ''}
**What You're Doing Well**
- [specific positives with detail]

**Areas to Improve**
- [specific corrections with how-to instructions${hasPoseData ? ', referencing measured angles vs ideal angles for the sport' : ''}]

**Key Metrics**
- Form: X/10
- Balance: X/10
- Technique: X/10

**Drill to Practice**
- [one specific drill to address the biggest improvement area]

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

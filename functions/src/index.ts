import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();

import { 
  GEMINI_API_KEY, 
  checkRateLimit, 
  verifyTeacher, 
  checkTokenBudget, 
  recordTokenUsage 
} from "./shared";

// ─── Shared Types ──────────────────────────────────────────────────────────────
interface GeminiBlock {
  type:    "heading" | "text" | "keyTerms" | "formula" | "audio" | "image" | "file";
  content: Record<string, any>;
}

import { GoogleGenerativeAI } from "@google/generative-ai";

async function callGeminiAPI(
  prompt:    string,
  maxTokens: number = 4096
): Promise<{ text: string; tokens: number }> {
  const apiKey = GEMINI_API_KEY.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "GEMINI_API_KEY secret is not configured.");
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-lite-preview",
      generationConfig: {
        temperature:     0.7,
        topK:            40,
        topP:            0.95,
        maxOutputTokens: Math.min(maxTokens, 4096),
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    
    return { text, tokens };
  } catch (err: any) {
    console.error("Gemini SDK error:", err);
    throw new HttpsError("internal", `AI service error: ${err.message || "Unknown error"}`);
  }
}

// ─── Block parser ──────────────────────────────────────────────────────────────
function parseBlocksFromText(raw: string): GeminiBlock[] {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const match   = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]) as GeminiBlock[];
  } catch {
    return [];
  }
}

// ─── Write AI assistance log ───────────────────────────────────────────────────
async function writeAILog(
  uid:        string,
  assistanceType: string,
  targetId:   string,
  prompt:     string,
  generated:  object,
  model:      string,
  tokens:     number
): Promise<string> {
  const ref = await admin.firestore()
    .collection("users").doc(uid)
    .collection("ai_assistance_logs")
    .add({
      assistanceType,
      targetType:       "lesson",
      targetId,
      prompt,
      generatedContent: generated,
      accepted:         false,   // updated to true when teacher clicks "Add to Lesson"
      edited:           false,
      editCount:        0,
      model,
      tokens,
      timestamp:        admin.firestore.FieldValue.serverTimestamp(),
    });
  return ref.id;
}

// ─── FUNCTION 1: generateLessonContent ────────────────────────────────────────
interface GenerateLessonRequest {
  lessonId:     string;
  userPrompt:   string;
  documentText?: string;
  lessonMeta: {
    title:       string;
    type:        string;
    level:       string;
    description: string;
  };
  currentBlocks: { type: string; preview: string }[];
}

interface GenerateLessonResult {
  reasoning:      string;
  suggestedBlocks: GeminiBlock[];
  metaUpdates:    Record<string, string> | null;
  logId:          string;
}

export const generateLessonContent = onCall(
  {
    secrets:        [GEMINI_API_KEY],
    region:         "us-central1",
    timeoutSeconds: 90,
    memory:         "512MiB",
    enforceAppCheck: false,
  },
  async (request): Promise<GenerateLessonResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in to use AI features.");
    }
    const uid = request.auth.uid;

    await verifyTeacher(uid);
    checkRateLimit(uid);
    await checkTokenBudget(uid);

    const {
      lessonId,
      userPrompt,
      documentText,
      lessonMeta,
      currentBlocks = [],
    } = request.data as GenerateLessonRequest;

    if (!lessonId || typeof lessonId !== "string") {
      throw new HttpsError("invalid-argument", "lessonId is required.");
    }
    if (!userPrompt || typeof userPrompt !== "string" || userPrompt.trim().length < 2) {
      throw new HttpsError("invalid-argument", "userPrompt is required.");
    }
    if (userPrompt.length > 2000) {
      throw new HttpsError("invalid-argument", "userPrompt too long (max 2000 chars).");
    }
    if (documentText && documentText.length > 10_000) {
      throw new HttpsError("invalid-argument", "Document too large (max 10,000 chars).");
    }

    const blockSummary = currentBlocks.length > 0
      ? currentBlocks.map((b, i) => `  ${i + 1}. [${b.type}] ${b.preview}`).join("\n")
      : "  (no blocks yet — this is a new lesson)";

    const docSection = documentText
      ? `\nUPLOADED DOCUMENT CONTENT:\n---\n${documentText.slice(0, 8000)}\n---\n`
      : "";

    const assistanceType = documentText ? "generate_from_doc" : "chat_generate";

    const prompt = `
You are an expert English language teacher's assistant helping build a structured lesson in a learning app.

LESSON CONTEXT:
- Title: "${lessonMeta.title || "Untitled"}"
- Type: ${lessonMeta.type}
- CEFR Level: ${lessonMeta.level}
- Description: "${lessonMeta.description || "none"}"

CURRENT LESSON BLOCKS (${currentBlocks.length} total):
${blockSummary}
${docSection}
TEACHER'S INSTRUCTION: "${userPrompt}"

YOUR TASK:
Based on the instruction${documentText ? " and the uploaded document" : ""}, generate new lesson blocks to ADD to this lesson.
Focus on educational quality appropriate for ${lessonMeta.level} level ${lessonMeta.type} learners.

STRICT BLOCK SCHEMA — follow exactly, no extra fields:

Heading block:
{"type":"heading","content":{"text":"<h2>Your Title Here</h2>","_level":"h2"}}
(use h1 for main titles, h2 for sections, h3 for subsections)

Text block:
{"type":"text","content":{"text":"<p>Your paragraph text here</p>","_boxed":false}}
(set _boxed to true to highlight important content in a green box)

Key Terms block:
{"type":"keyTerms","content":{"terms":[{"word":"word","type":"noun","definition":"clear definition here"}]}}
(include 4-8 terms relevant to the lesson)

Formula / Structure block:
{"type":"formula","content":{"title":"Structure Name","steps":[{"stepNumber":1,"label":"Step Name","description":"What to do in this step"}]}}
(use for grammar patterns, writing frameworks, speaking structures)

RESPONSE FORMAT — use EXACTLY this structure:
REASONING: [One sentence explaining what you generated and why]
META_UPDATES: null
BLOCKS: [your JSON array here]

RULES:
- BLOCKS must be a valid JSON array starting with [ and ending with ]
- No trailing commas anywhere in the JSON
- No comments inside JSON
- Generate 2-6 blocks appropriate for the instruction
- If generating from a document, include heading + text blocks summarizing key content, plus a keyTerms block
- All text content must be appropriate for ${lessonMeta.level} CEFR level
`.trim();

    const { text: rawResponse, tokens } = await callGeminiAPI(prompt, 4096);

    const reasoningMatch    = rawResponse.match(/REASONING:\s*(.+?)(?=\nMETA_UPDATES:|$)/s);
    const metaUpdatesMatch  = rawResponse.match(/META_UPDATES:\s*(.+?)(?=\nBLOCKS:|$)/s);
    const blocksMatch       = rawResponse.match(/BLOCKS:\s*(\[[\s\S]*\])/);

    const reasoning   = reasoningMatch?.[1]?.trim()   ?? "I've generated content for your lesson.";
    const blocksRaw   = blocksMatch?.[1]              ?? "[]";
    const metaRaw     = metaUpdatesMatch?.[1]?.trim() ?? "null";

    const suggestedBlocks = parseBlocksFromText(blocksRaw);

    let metaUpdates: Record<string, string> | null = null;
    try {
      const parsed = JSON.parse(metaRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        metaUpdates = parsed;
      }
    } catch {
      metaUpdates = null;
    }

    const logId = await writeAILog(
      uid,
      assistanceType,
      lessonId,
      userPrompt,
      { blocks: suggestedBlocks, reasoning, documentProvided: !!documentText },
      "gemini-3.1-flash-lite-preview",
      tokens
    );

    await recordTokenUsage(uid, tokens);

    return { reasoning, suggestedBlocks, metaUpdates, logId };
  }
);

// ─── FUNCTION 2: markAILogAccepted ────────────────────────────────────────────
export const markAILogAccepted = onCall(
  {
    region:         "us-central1",
    timeoutSeconds: 10,
    memory:         "128MiB",
    enforceAppCheck: false,
  },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in.");
    }
    const uid   = request.auth.uid;
    const logId = request.data?.logId as string | undefined;
    if (!logId || typeof logId !== "string") {
      throw new HttpsError("invalid-argument", "logId is required.");
    }
    const logRef = admin.firestore()
      .collection("users").doc(uid)
      .collection("ai_assistance_logs").doc(logId);
    const snap = await logRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Log entry not found.");
    }
    await logRef.update({ accepted: true });
    return { success: true };
  }
);

// ─── FUNCTION 3: markAILogEdited ──────────────────────────────────────────────
export const markAILogEdited = onCall(
  {
    region:         "us-central1",
    timeoutSeconds: 10,
    memory:         "128MiB",
    enforceAppCheck: false,
  },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in.");
    }
    const uid   = request.auth.uid;
    const logId = request.data?.logId as string | undefined;
    if (!logId || typeof logId !== "string") {
      throw new HttpsError("invalid-argument", "logId is required.");
    }
    const logRef = admin.firestore()
      .collection("users").doc(uid)
      .collection("ai_assistance_logs").doc(logId);
    const snap = await logRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Log entry not found.");
    }
    await logRef.update({
      edited:    true,
      editCount: admin.firestore.FieldValue.increment(1),
    });
    return { success: true };
  }
);

// ─── Re-export exercise functions ─────────────────────────────────────────────
export { generateExerciseContent } from "./generateExerciseContent";
export {generateSpeakingContent} from "./generateSpeakingContent";
// Add to the bottom of functions/src/index.ts
export { generateTTSAudio } from "./generateTTSAudio";

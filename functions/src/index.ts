import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();

export const deleteCourseData = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "User must be logged in");

  const { courseId } = request.data as { courseId: string };
  if (!courseId) throw new HttpsError("invalid-argument", "Course ID is required");

  const courseRef = admin.firestore().collection("courses").doc(courseId);
  const courseSnap = await courseRef.get();
  
  if (!courseSnap.exists) {
    return { success: true, message: "Course already deleted" };
  }
  
  const courseData = courseSnap.data();
  if (courseData?.createdBy !== uid && courseData?.instructor?.id !== uid) {
    throw new HttpsError("permission-denied", "Only the course creator can delete it.");
  }
  
  // Recursively delete Firestore data using bulkWriter
  const bulkWriter = admin.firestore().bulkWriter();
  bulkWriter.onWriteError((error) => {
    if (error.failedAttempts < 3) {
      return true; // Retry up to 3 times
    } else {
      console.error('Failed to write document: ', error.documentRef.path);
      return false; // Stop retrying
    }
  });

  await admin.firestore().recursiveDelete(courseRef, bulkWriter);

  // Delete Storage folder
  const bucket = admin.storage().bucket();
  const folderPath = `courses/${courseId}/`;
  try {
    await bucket.deleteFiles({ prefix: folderPath });
  } catch (err) {
    console.error(`Failed to delete storage folder ${folderPath}:`, err);
    // Continue even if storage delete fails
  }

  return { success: true };
});

export const deleteTeacherAccount = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "User must be logged in");

  const db = admin.firestore();
  
  // Get all courses owned by this user
  const coursesSnap = await db.collection("courses").where("createdBy", "==", uid).get();
  
  // We can just call recursiveDelete on each course
  const bulkWriter = db.bulkWriter();
  
  const bucket = admin.storage().bucket();
  
  for (const doc of coursesSnap.docs) {
    await db.recursiveDelete(doc.ref, bulkWriter);
    // Delete course storage
    const folderPath = `courses/${doc.id}/`;
    try {
      await bucket.deleteFiles({ prefix: folderPath });
    } catch (err) {
      console.error(`Failed to delete storage folder ${folderPath}:`, err);
    }
  }

  // Delete user document
  const userRef = db.collection("users").doc(uid);
  await db.recursiveDelete(userRef, bulkWriter);
  
  await bulkWriter.close();
  
  // Teacher-owned avatars and course media are stored beneath this prefix.
  try {
    await bucket.deleteFiles({ prefix: `teachers/${uid}/` });
  } catch (err) {
    console.error(`Failed to delete teacher storage teachers/${uid}/:`, err);
  }

  // Keep this cleanup for any legacy user-scoped uploads.
  try {
    await bucket.deleteFiles({ prefix: `users/${uid}/` });
  } catch (err) {
    console.error(`Failed to delete legacy user storage users/${uid}/:`, err);
  }

  // Delete Auth user
  await admin.auth().deleteUser(uid);

  return { success: true };
});

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
        responseMimeType: "application/json",
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

function parseStructuredResponse<T extends Record<string, unknown>>(raw: string): T | null {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : null;
  } catch {
    return null;
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

RESPONSE FORMAT:
Return one valid JSON object only. Do not use markdown fences or labels.
{"reasoning":"One sentence explaining what you generated and why","metaUpdates":null,"blocks":[your block objects]}

RULES:
- "blocks" must be a valid JSON array
- No trailing commas anywhere in the JSON
- No comments inside JSON
- Generate 2-6 blocks appropriate for the instruction
- If generating from a document, include heading + text blocks summarizing key content, plus a keyTerms block
- All text content must be appropriate for ${lessonMeta.level} CEFR level
`.trim();

    const { text: rawResponse, tokens } = await callGeminiAPI(prompt, 4096);

    const structured = parseStructuredResponse<{
      reasoning?: unknown;
      metaUpdates?: unknown;
      blocks?: unknown;
    }>(rawResponse);
    const suggestedBlocks = Array.isArray(structured?.blocks)
      ? structured.blocks.filter((block): block is GeminiBlock =>
          !!block && typeof block === "object" &&
          typeof (block as GeminiBlock).type === "string" &&
          !!(block as GeminiBlock).content && typeof (block as GeminiBlock).content === "object"
        )
      : parseBlocksFromText(rawResponse.match(/BLOCKS:\s*(\[[\s\S]*\])/i)?.[1] ?? "[]");
    const reasoning = typeof structured?.reasoning === "string" && structured.reasoning.trim()
      ? structured.reasoning.trim()
      : "I've generated content for your lesson.";
    const metaUpdates = structured?.metaUpdates && typeof structured.metaUpdates === "object" && !Array.isArray(structured.metaUpdates)
      ? structured.metaUpdates as Record<string, string>
      : null;

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
// Export the video processor
export { onVideoUpload } from "./processVideo";

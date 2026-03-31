"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTTSAudio = exports.generateSpeakingContent = exports.generateExerciseContent = exports.markAILogEdited = exports.markAILogAccepted = exports.generateLessonContent = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const shared_1 = require("./shared");
const generative_ai_1 = require("@google/generative-ai");
async function callGeminiAPI(prompt, maxTokens = 4096) {
    const apiKey = shared_1.GEMINI_API_KEY.value();
    if (!apiKey) {
        throw new https_1.HttpsError("failed-precondition", "GEMINI_API_KEY secret is not configured.");
    }
    try {
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-flash-lite-preview",
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: Math.min(maxTokens, 4096),
            },
        });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const tokens = response.usageMetadata?.totalTokenCount ?? 0;
        return { text, tokens };
    }
    catch (err) {
        console.error("Gemini SDK error:", err);
        throw new https_1.HttpsError("internal", `AI service error: ${err.message || "Unknown error"}`);
    }
}
// ─── Block parser ──────────────────────────────────────────────────────────────
function parseBlocksFromText(raw) {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match)
        return [];
    try {
        return JSON.parse(match[0]);
    }
    catch {
        return [];
    }
}
// ─── Write AI assistance log ───────────────────────────────────────────────────
async function writeAILog(uid, assistanceType, targetId, prompt, generated, model, tokens) {
    const ref = await admin.firestore()
        .collection("users").doc(uid)
        .collection("ai_assistance_logs")
        .add({
        assistanceType,
        targetType: "lesson",
        targetId,
        prompt,
        generatedContent: generated,
        accepted: false, // updated to true when teacher clicks "Add to Lesson"
        edited: false,
        editCount: 0,
        model,
        tokens,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
}
exports.generateLessonContent = (0, https_1.onCall)({
    secrets: [shared_1.GEMINI_API_KEY],
    region: "us-central1",
    timeoutSeconds: 90,
    memory: "512MiB",
    enforceAppCheck: false,
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in to use AI features.");
    }
    const uid = request.auth.uid;
    await (0, shared_1.verifyTeacher)(uid);
    (0, shared_1.checkRateLimit)(uid);
    await (0, shared_1.checkTokenBudget)(uid);
    const { lessonId, userPrompt, documentText, lessonMeta, currentBlocks = [], } = request.data;
    if (!lessonId || typeof lessonId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "lessonId is required.");
    }
    if (!userPrompt || typeof userPrompt !== "string" || userPrompt.trim().length < 2) {
        throw new https_1.HttpsError("invalid-argument", "userPrompt is required.");
    }
    if (userPrompt.length > 2000) {
        throw new https_1.HttpsError("invalid-argument", "userPrompt too long (max 2000 chars).");
    }
    if (documentText && documentText.length > 10000) {
        throw new https_1.HttpsError("invalid-argument", "Document too large (max 10,000 chars).");
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
    const reasoningMatch = rawResponse.match(/REASONING:\s*(.+?)(?=\nMETA_UPDATES:|$)/s);
    const metaUpdatesMatch = rawResponse.match(/META_UPDATES:\s*(.+?)(?=\nBLOCKS:|$)/s);
    const blocksMatch = rawResponse.match(/BLOCKS:\s*(\[[\s\S]*\])/);
    const reasoning = reasoningMatch?.[1]?.trim() ?? "I've generated content for your lesson.";
    const blocksRaw = blocksMatch?.[1] ?? "[]";
    const metaRaw = metaUpdatesMatch?.[1]?.trim() ?? "null";
    const suggestedBlocks = parseBlocksFromText(blocksRaw);
    let metaUpdates = null;
    try {
        const parsed = JSON.parse(metaRaw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            metaUpdates = parsed;
        }
    }
    catch {
        metaUpdates = null;
    }
    const logId = await writeAILog(uid, assistanceType, lessonId, userPrompt, { blocks: suggestedBlocks, reasoning, documentProvided: !!documentText }, "gemini-3.1-flash-lite-preview", tokens);
    await (0, shared_1.recordTokenUsage)(uid, tokens);
    return { reasoning, suggestedBlocks, metaUpdates, logId };
});
// ─── FUNCTION 2: markAILogAccepted ────────────────────────────────────────────
exports.markAILogAccepted = (0, https_1.onCall)({
    region: "us-central1",
    timeoutSeconds: 10,
    memory: "128MiB",
    enforceAppCheck: false,
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    }
    const uid = request.auth.uid;
    const logId = request.data?.logId;
    if (!logId || typeof logId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "logId is required.");
    }
    const logRef = admin.firestore()
        .collection("users").doc(uid)
        .collection("ai_assistance_logs").doc(logId);
    const snap = await logRef.get();
    if (!snap.exists) {
        throw new https_1.HttpsError("not-found", "Log entry not found.");
    }
    await logRef.update({ accepted: true });
    return { success: true };
});
// ─── FUNCTION 3: markAILogEdited ──────────────────────────────────────────────
exports.markAILogEdited = (0, https_1.onCall)({
    region: "us-central1",
    timeoutSeconds: 10,
    memory: "128MiB",
    enforceAppCheck: false,
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    }
    const uid = request.auth.uid;
    const logId = request.data?.logId;
    if (!logId || typeof logId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "logId is required.");
    }
    const logRef = admin.firestore()
        .collection("users").doc(uid)
        .collection("ai_assistance_logs").doc(logId);
    const snap = await logRef.get();
    if (!snap.exists) {
        throw new https_1.HttpsError("not-found", "Log entry not found.");
    }
    await logRef.update({
        edited: true,
        editCount: admin.firestore.FieldValue.increment(1),
    });
    return { success: true };
});
// ─── Re-export exercise functions ─────────────────────────────────────────────
var generateExerciseContent_1 = require("./generateExerciseContent");
Object.defineProperty(exports, "generateExerciseContent", { enumerable: true, get: function () { return generateExerciseContent_1.generateExerciseContent; } });
var generateSpeakingContent_1 = require("./generateSpeakingContent");
Object.defineProperty(exports, "generateSpeakingContent", { enumerable: true, get: function () { return generateSpeakingContent_1.generateSpeakingContent; } });
// Add to the bottom of functions/src/index.ts
var generateTTSAudio_1 = require("./generateTTSAudio");
Object.defineProperty(exports, "generateTTSAudio", { enumerable: true, get: function () { return generateTTSAudio_1.generateTTSAudio; } });
//# sourceMappingURL=index.js.map
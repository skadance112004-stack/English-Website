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
exports.generateSpeakingContent = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
const GEMINI_API_KEY = (0, params_1.defineSecret)("GEMINI_API_KEY");
// ─── Shared helpers ────────────────────────────────────────────────────────────
const rateLimitMap = new Map();
function checkRateLimit(uid) {
    const now = Date.now();
    const e = rateLimitMap.get(uid);
    if (!e || now > e.resetAt) {
        rateLimitMap.set(uid, { count: 1, resetAt: now + 60000 });
        return;
    }
    if (e.count >= 10)
        throw new https_1.HttpsError("resource-exhausted", "Too many requests. Please wait.");
    e.count++;
}
async function verifyTeacher(uid) {
    const snap = await admin.firestore().collection("users").doc(uid).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "User not found.");
    if (snap.data()?.role !== "teacher")
        throw new https_1.HttpsError("permission-denied", "Only teachers can use AI generation.");
}
async function checkTokenBudget(uid) {
    const today = new Date().toISOString().slice(0, 10);
    const snap = await admin.firestore().collection("users").doc(uid).collection("ai_usage").doc(today).get();
    if ((snap.data()?.tokensUsed ?? 0) >= 50000)
        throw new https_1.HttpsError("resource-exhausted", "Daily AI token limit reached.");
}
async function recordTokenUsage(uid, tokens) {
    const today = new Date().toISOString().slice(0, 10);
    await admin.firestore().collection("users").doc(uid).collection("ai_usage").doc(today)
        .set({ tokensUsed: admin.firestore.FieldValue.increment(tokens), lastUpdated: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}
async function writeAILog(uid, targetId, prompt, generated, tokens) {
    const ref = await admin.firestore().collection("users").doc(uid).collection("ai_assistance_logs").add({
        assistanceType: "chat_generate",
        targetType: "speaking_exercise",
        targetId,
        prompt,
        generatedContent: generated,
        accepted: false,
        edited: false,
        editCount: 0,
        model: "gemini-3.1-flash-lite-preview",
        tokens,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
}
async function callGemini(prompt) {
    const apiKey = GEMINI_API_KEY.value();
    if (!apiKey)
        throw new https_1.HttpsError("failed-precondition", "GEMINI_API_KEY secret is not configured.");
    try {
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-flash-lite-preview",
            generationConfig: { temperature: 0.75, topK: 40, topP: 0.95, maxOutputTokens: 4096 },
        });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return { text: response.text(), tokens: response.usageMetadata?.totalTokenCount ?? 0 };
    }
    catch (err) {
        console.error("Gemini error:", err);
        throw new https_1.HttpsError("internal", `AI service error: ${err.message || "Unknown"}`);
    }
}
function parseLines(raw) {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match)
        return [];
    try {
        const parsed = JSON.parse(match[0]);
        if (!Array.isArray(parsed))
            return [];
        // Validate and normalize each line
        return parsed.map((l) => ({
            speaker: l.speaker === "Student" ? "Student" : "AI",
            text: String(l.text || ""),
            pronunciationFocus: String(l.pronunciationFocus || ""),
            vocabularyHelp: Array.isArray(l.vocabularyHelp)
                ? l.vocabularyHelp.map((v) => ({ word: String(v.word || ""), definition: String(v.definition || "") }))
                : [],
            keyWords: Array.isArray(l.keyWords) ? l.keyWords.map(String) : [],
            studentHint: String(l.studentHint || ""),
        }));
    }
    catch {
        return [];
    }
}
// ─── FUNCTION: generateSpeakingContent ────────────────────────────────────────
exports.generateSpeakingContent = (0, https_1.onCall)({ secrets: [GEMINI_API_KEY], region: "us-central1", timeoutSeconds: 90, memory: "512MiB", enforceAppCheck: false }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    const uid = request.auth.uid;
    await verifyTeacher(uid);
    checkRateLimit(uid);
    await checkTokenBudget(uid);
    const { exerciseId, userPrompt, documentText, exerciseMeta, lineCount = 6, currentLines = [], } = request.data;
    if (!exerciseId || typeof exerciseId !== "string")
        throw new https_1.HttpsError("invalid-argument", "exerciseId is required.");
    if (!userPrompt || typeof userPrompt !== "string" || userPrompt.trim().length < 2)
        throw new https_1.HttpsError("invalid-argument", "userPrompt is required.");
    if (userPrompt.length > 2000)
        throw new https_1.HttpsError("invalid-argument", "userPrompt too long.");
    if (documentText && documentText.length > 10000)
        throw new https_1.HttpsError("invalid-argument", "Document too large.");
    const docSection = documentText ? `\nDOCUMENT / SCRIPT CONTENT:\n---\n${documentText.slice(0, 8000)}\n---\n` : "";
    const existingSummary = currentLines.length > 0
        ? currentLines.map((l, i) => `  ${i + 1}. [${l.speaker}] ${l.preview}`).join("\n")
        : "  (no lines yet — brand new dialogue)";
    const prompt = `
You are an expert English language teacher's assistant helping build a speaking practice exercise.

EXERCISE CONTEXT:
- Title: "${exerciseMeta.title || "Speaking Practice"}"
- Description: "${exerciseMeta.description || "none"}"
- CEFR Level: ${exerciseMeta.cefr || "B1"}
- Tone: ${exerciseMeta.tone || "Casual"}
- Scenario: "${exerciseMeta.scenario || "general conversation"}"

EXISTING LINES (${currentLines.length} so far):
${existingSummary}
${docSection}
TEACHER'S INSTRUCTION: "${userPrompt}"

YOUR TASK:
Generate ${lineCount} conversation lines alternating between "AI" and "Student" speakers.
The dialogue should be natural, educational, and appropriate for ${exerciseMeta.cefr || "B1"} CEFR level.
Tone must be: ${exerciseMeta.tone || "Casual"}
${exerciseMeta.scenario ? `The conversation is about: ${exerciseMeta.scenario}` : ""}
${documentText ? "Base the dialogue on the uploaded document/script content." : ""}
${currentLines.length > 0 ? "Continue from or complement the existing lines." : "Start a fresh dialogue."}

RESPONSE FORMAT:
REASONING: [One sentence explaining the dialogue you created]
LINES: [JSON array]

The LINES JSON array must follow this EXACT schema for each line:
{
  "speaker": "AI" | "Student",
  "text": "What this speaker says",
  "pronunciationFocus": "specific word or sound to practice (Student lines only, or empty string)",
  "vocabularyHelp": [
    {"word": "difficult word", "definition": "simple definition"}
  ],
  "keyWords": ["keyword1", "keyword2"],
  "studentHint": "Optional hint shown to student before they speak (Student lines only, or empty string)"
}

RULES:
- Alternate AI → Student → AI → Student...
- Start with "AI" speaker unless existing lines end with AI
- Student lines MUST have at least 1 keyWord for evaluation
- Student lines SHOULD have a pronunciationFocus if there's a challenging word/sound
- AI lines typically have empty pronunciationFocus, keyWords [], studentHint ""
- vocabularyHelp: include 1-3 items only for words that ${exerciseMeta.cefr || "B1"} learners might find difficult
- Keep text natural and conversational, appropriate for ${exerciseMeta.tone || "Casual"} tone
- All text in English only
- LINES must be valid JSON — no trailing commas, no comments
`.trim();
    const { text: rawResponse, tokens } = await callGemini(prompt);
    // Parse response sections
    const reasoningMatch = rawResponse.match(/REASONING:\s*(.+?)(?=\nLINES:|$)/s);
    const linesMatch = rawResponse.match(/LINES:\s*(\[[\s\S]*\])/);
    const reasoning = reasoningMatch?.[1]?.trim() ?? "Generated a conversation dialogue.";
    const suggestedLines = linesMatch?.[1] ? parseLines(linesMatch[1]) : [];
    const logId = await writeAILog(uid, exerciseId, userPrompt, { lines: suggestedLines, reasoning, documentProvided: !!documentText }, tokens);
    await recordTokenUsage(uid, tokens);
    return { reasoning, suggestedLines, logId };
});
//# sourceMappingURL=generateSpeakingContent.js.map
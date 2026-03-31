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
exports.generateExerciseContent = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
const shared_1 = require("./shared");
// ─── AI Log Helper ───────────────────────────────────────────────────────────
async function writeAILog(uid, assistanceType, targetId, prompt, generated, tokens) {
    const ref = await admin.firestore().collection("users").doc(uid).collection("ai_assistance_logs").add({
        assistanceType, targetType: "exercise", targetId, prompt,
        generatedContent: generated, accepted: false, edited: false, editCount: 0,
        model: "gemini-3.1-flash-lite-preview", tokens, timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
}
// ─── Gemini caller ─────────────────────────────────────────────────────────────
async function callGemini(prompt) {
    const apiKey = shared_1.GEMINI_API_KEY.value();
    if (!apiKey)
        throw new https_1.HttpsError("failed-precondition", "GEMINI_API_KEY secret is not configured.");
    try {
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-flash-lite-preview",
            generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 4096 },
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
// ─── Parse JSON section from AI response ──────────────────────────────────────
function parseJSON(raw, fallback) {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const match = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (!match)
        return fallback;
    try {
        return JSON.parse(match[0]);
    }
    catch {
        return fallback;
    }
}
const uid6 = () => Math.random().toString(36).slice(2, 8);
// ─── FUNCTION: generateExerciseContent ────────────────────────────────────────
exports.generateExerciseContent = (0, https_1.onCall)({ secrets: [shared_1.GEMINI_API_KEY], region: "us-central1", timeoutSeconds: 90, memory: "512MiB", enforceAppCheck: false }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    const uid = request.auth.uid;
    await (0, shared_1.verifyTeacher)(uid);
    (0, shared_1.checkRateLimit)(uid);
    await (0, shared_1.checkTokenBudget)(uid);
    const { exerciseId, userPrompt, documentText, exerciseMeta, currentQuestions = [], hasPassage, hasAudio } = request.data;
    if (!exerciseId || typeof exerciseId !== "string")
        throw new https_1.HttpsError("invalid-argument", "exerciseId is required.");
    if (!userPrompt || typeof userPrompt !== "string" || userPrompt.trim().length < 2)
        throw new https_1.HttpsError("invalid-argument", "userPrompt is required.");
    if (userPrompt.length > 2000)
        throw new https_1.HttpsError("invalid-argument", "userPrompt too long.");
    if (documentText && documentText.length > 10000)
        throw new https_1.HttpsError("invalid-argument", "Document too large.");
    const isReading = exerciseMeta.type === "Reading";
    const isListening = exerciseMeta.type === "Listening";
    const docSection = documentText ? `\nUPLOADED CONTENT:\n---\n${documentText.slice(0, 8000)}\n---\n` : "";
    const qSummary = currentQuestions.length > 0
        ? currentQuestions.map((q, i) => `  ${i + 1}. [${q.type}] ${q.preview}`).join("\n")
        : "  (no questions yet)";
    const prompt = `
You are an expert English language teacher's assistant. Help build a ${exerciseMeta.type} exercise.

EXERCISE CONTEXT:
- Title: "${exerciseMeta.title || "Untitled"}"
- Type: ${exerciseMeta.type}
- CEFR Level: ${exerciseMeta.cefr || "B1"}
- Description: "${exerciseMeta.description || "none"}"
- Has reading passage: ${hasPassage}
- Has audio material: ${hasAudio}

CURRENT QUESTIONS (${currentQuestions.length} total):
${qSummary}
${docSection}
TEACHER'S INSTRUCTION: "${userPrompt}"

YOUR TASK: Generate content for this exercise. Respond with ALL three sections below.

═══ SECTION 1: REASONING ═══
REASONING: [One sentence explaining what you generated]

═══ SECTION 2: QUESTIONS ═══
Generate 3-5 questions appropriate for ${exerciseMeta.type} exercises at ${exerciseMeta.cefr || "B1"} level.
${isReading ? "Questions should test comprehension of the reading passage." : ""}
${isListening ? "Questions should test comprehension of the audio content." : ""}

QUESTIONS_JSON:
[
  {
    "questionType": "Multiple Choice",
    "questionText": "Question text here?",
    "options": [
      {"optionId":"opt1","text":"Option A","imageUrl":"","isCorrect":true},
      {"optionId":"opt2","text":"Option B","imageUrl":"","isCorrect":false},
      {"optionId":"opt3","text":"Option C","imageUrl":"","isCorrect":false},
      {"optionId":"opt4","text":"Option D","imageUrl":"","isCorrect":false}
    ],
    "acceptedAnswers": [],
    "caseSensitive": false,
    "explanation": "Why this answer is correct",
    "hint": "A helpful hint",
    "points": 1
  }
]

Valid questionType values: "Multiple Choice", "True/False", "Fill in the Blank", "Short Answer"
For True/False: options must be exactly [{"text":"True",...},{"text":"False",...}]
For Fill in the Blank: put ___ in questionText, fill acceptedAnswers array, options can be []
For Short Answer: acceptedAnswers should list valid responses, options can be []

${(isReading && !hasPassage) ? `
═══ SECTION 3: READING PASSAGE ═══
Generate a reading passage appropriate for this exercise.

PASSAGE_JSON:
{
  "title": "Passage title",
  "category": "Business/Academic/etc",
  "source": "",
  "cefr": "${exerciseMeta.cefr || "B1"}",
  "paragraphs": [
    {"paragraphId":"p1","order":0,"text":"First paragraph...","startLine":0,"endLine":3},
    {"paragraphId":"p2","order":1,"text":"Second paragraph...","startLine":4,"endLine":7}
  ]
}
` : "PASSAGE_JSON: null"}

${(isListening && !hasAudio) ? `
═══ SECTION 4: AUDIO CONTENT ═══
Generate audio content metadata and a transcript for this listening exercise.

AUDIO_JSON:
{
  "title": "Audio title",
  "topic": "Topic description",
  "difficulty": "${exerciseMeta.cefr || "B1"}",
  "accent": "American",
  "transcript": {
    "full": "Full transcript text here...",
    "timestamped": []
  }
}
` : "AUDIO_JSON: null"}

IMPORTANT RULES:
- All JSON must be valid — no trailing commas, no comments
- questionType must be exactly one of the four valid values
- Each Multiple Choice question must have exactly 4 options
- Exactly one option must have isCorrect: true for Multiple Choice
- Content must be appropriate for ${exerciseMeta.cefr || "B1"} CEFR level
- If generating from a document, base questions on the document content
`.trim();
    const { text: rawResponse, tokens } = await callGemini(prompt);
    const reasoningMatch = rawResponse.match(/REASONING:\s*(.+?)(?=\n|QUESTIONS_JSON:|$)/s);
    const questionsMatch = rawResponse.match(/QUESTIONS_JSON:\s*(\[[\s\S]*?\])(?=\s*PASSAGE_JSON:|AUDIO_JSON:|$)/s);
    const passageMatch = rawResponse.match(/PASSAGE_JSON:\s*(\{[\s\S]*?\})(?=\s*AUDIO_JSON:|$)/s);
    const passageNullMatch = rawResponse.match(/PASSAGE_JSON:\s*null/);
    const audioMatch = rawResponse.match(/AUDIO_JSON:\s*(\{[\s\S]*?\})(?=$|\s*[A-Z_]+:)/s);
    const audioNullMatch = rawResponse.match(/AUDIO_JSON:\s*null/);
    const reasoning = reasoningMatch?.[1]?.trim() ?? "Generated exercise content.";
    const rawQuestions = questionsMatch?.[1] ? parseJSON(questionsMatch[1], []) : [];
    const suggestedQuestions = rawQuestions.map(q => ({
        ...q,
        options: (q.options ?? []).map(o => ({ ...o, optionId: o.optionId || uid6() })),
    }));
    const suggestedPassage = passageNullMatch || !passageMatch?.[1] ? null
        : parseJSON(passageMatch[1], null);
    if (suggestedPassage?.paragraphs) {
        suggestedPassage.paragraphs = suggestedPassage.paragraphs.map((p, i) => ({
            ...p, paragraphId: p.paragraphId || uid6(), order: i,
        }));
    }
    const suggestedAudio = audioNullMatch || !audioMatch?.[1] ? null
        : parseJSON(audioMatch[1], null);
    const logId = await writeAILog(uid, documentText ? "generate_from_doc" : "chat_generate", exerciseId, userPrompt, { questions: suggestedQuestions, passage: suggestedPassage, audio: suggestedAudio, reasoning, documentProvided: !!documentText }, tokens);
    await (0, shared_1.recordTokenUsage)(uid, tokens);
    return { reasoning, suggestedQuestions, suggestedPassage, suggestedAudio, logId };
});
//# sourceMappingURL=generateExerciseContent.js.map
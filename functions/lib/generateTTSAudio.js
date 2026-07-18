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
exports.generateTTSAudio = exports.AZURE_VOICES = void 0;
// functions/src/generateTTSAudio.ts
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
const AZURE_TTS_KEY = (0, params_1.defineSecret)("AZURE_TTS_KEY");
const AZURE_TTS_REGION = (0, params_1.defineSecret)("AZURE_TTS_REGION");
// ─── Available Azure Neural Voices ────────────────────────────────────────────
exports.AZURE_VOICES = {
    "en-US-JennyNeural": { name: "Jenny", locale: "en-US", gender: "Female" },
    "en-US-GuyNeural": { name: "Guy", locale: "en-US", gender: "Male" },
    "en-US-AriaNeural": { name: "Aria", locale: "en-US", gender: "Female" },
    "en-US-DavisNeural": { name: "Davis", locale: "en-US", gender: "Male" },
    "en-US-SaraNeural": { name: "Sara", locale: "en-US", gender: "Female" },
    "en-GB-SoniaNeural": { name: "Sonia", locale: "en-GB", gender: "Female" },
    "en-GB-RyanNeural": { name: "Ryan", locale: "en-GB", gender: "Male" },
    "en-AU-NatashaNeural": { name: "Natasha", locale: "en-AU", gender: "Female" },
    "en-AU-WilliamNeural": { name: "William", locale: "en-AU", gender: "Male" },
    "en-IN-NeerjaNeural": { name: "Neerja", locale: "en-IN", gender: "Female" },
};
// ─── Verify teacher ────────────────────────────────────────────────────────────
async function verifyTeacher(uid) {
    const snap = await admin.firestore().collection("users").doc(uid).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "User not found.");
    if (snap.data()?.role !== "teacher") {
        throw new https_1.HttpsError("permission-denied", "Only teachers can generate audio.");
    }
}
// ─── Rate limit (TTS is expensive — stricter limit) ───────────────────────────
const rateLimitMap = new Map();
function checkRateLimit(uid, requestedCount = 1) {
    const now = Date.now();
    const e = rateLimitMap.get(uid);
    if (!e || now > e.resetAt) {
        rateLimitMap.set(uid, { count: requestedCount, resetAt: now + 60000 });
        return;
    }
    // TTS: max 20 lines per minute
    if (e.count + requestedCount > 20) {
        throw new https_1.HttpsError("resource-exhausted", "Too many TTS requests. Please wait a minute.");
    }
    e.count += requestedCount;
}
// ─── Build SSML ───────────────────────────────────────────────────────────────
function buildSSML(text, voiceName, rate, pitch) {
    const locale = exports.AZURE_VOICES[voiceName]?.locale ?? "en-US";
    const rateStr = rate !== 1.0 ? `rate="${rate}"` : "";
    const pitchStr = pitch !== 0 ? `pitch="${pitch > 0 ? "+" : ""}${pitch}Hz"` : "";
    const prosody = (rateStr || pitchStr) ? `<prosody ${rateStr} ${pitchStr}>${text}</prosody>` : text;
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">
  <voice name="${voiceName}">
    ${prosody}
  </voice>
</speak>`.trim();
}
// ─── THE FUNCTION ─────────────────────────────────────────────────────────────
exports.generateTTSAudio = (0, https_1.onCall)({
    secrets: [AZURE_TTS_KEY, AZURE_TTS_REGION],
    region: "us-central1",
    timeoutSeconds: 120, // Increased for batch processing
    memory: "256MiB",
    enforceAppCheck: false,
}, async (request) => {
    // ── Auth ──────────────────────────────────────────────────────────────────
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    const uid = request.auth.uid;
    console.log("TTS Request from UID:", uid, "Data:", JSON.stringify(request.data));
    await verifyTeacher(uid);
    // ── Validate input ────────────────────────────────────────────────────────
    const { courseId, exerciseId, lines, rate = 1.0, pitch = 0, } = request.data;
    if (!courseId || !exerciseId) {
        throw new https_1.HttpsError("invalid-argument", "courseId and exerciseId are required.");
    }
    // Verify Ownership and Target Existence
    const courseRef = admin.firestore().collection("courses").doc(courseId);
    const courseSnap = await courseRef.get();
    if (!courseSnap.exists) {
        throw new https_1.HttpsError("not-found", "Course not found.");
    }
    const courseData = courseSnap.data();
    if (courseData?.createdBy !== uid && courseData?.instructor?.id !== uid) {
        throw new https_1.HttpsError("permission-denied", "You do not own this course.");
    }
    const exerciseRef = courseRef.collection("exercises").doc(exerciseId);
    const exerciseSnap = await exerciseRef.get();
    if (!exerciseSnap.exists) {
        throw new https_1.HttpsError("not-found", "Exercise not found.");
    }
    if (!Array.isArray(lines) || lines.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "lines array is required and must not be empty.");
    }
    if (lines.length > 20) {
        throw new https_1.HttpsError("invalid-argument", "Max 20 lines per batch.");
    }
    if (rate < 0.5 || rate > 2.0)
        throw new https_1.HttpsError("invalid-argument", "rate must be 0.5–2.0");
    if (pitch < -50 || pitch > 50)
        throw new https_1.HttpsError("invalid-argument", "pitch must be -50 to +50 Hz");
    checkRateLimit(uid, lines.length);
    const key = AZURE_TTS_KEY.value();
    const region = AZURE_TTS_REGION.value();
    const ttsUrl = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const bucket = admin.storage().bucket();
    const results = [];
    // ── Process Batch ─────────────────────────────────────────────────────────
    for (const line of lines) {
        const { lineId, text, voiceName } = line;
        try {
            if (!text?.trim())
                throw new Error("text is required.");
            if (text.length > 1000)
                throw new Error("Text too long (max 1000 chars).");
            if (!voiceName)
                throw new Error("voiceName is required.");
            if (!exports.AZURE_VOICES[voiceName])
                throw new Error(`Unknown voice: ${voiceName}`);
            if (!lineId)
                throw new Error("lineId is required.");
            const ssml = buildSSML(text.trim(), voiceName, rate, pitch);
            // Call Azure TTS
            const response = await fetch(ttsUrl, {
                method: "POST",
                headers: {
                    "Ocp-Apim-Subscription-Key": key,
                    "Content-Type": "application/ssml+xml",
                    "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
                    "User-Agent": "EnginuityApp",
                },
                body: ssml,
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Azure TTS error for line ${lineId}:`, response.status, errorText);
                throw new Error("Azure TTS service failed.");
            }
            const audioBuffer = Buffer.from(await response.arrayBuffer());
            const storagePath = `courses/${courseId}/exercises/${exerciseId}/audio/${lineId}.mp3`;
            const file = bucket.file(storagePath);
            const downloadToken = (0, crypto_1.randomUUID)();
            // Save to Storage
            await file.save(audioBuffer, {
                metadata: {
                    contentType: "audio/mpeg",
                    cacheControl: "public, max-age=31536000",
                    metadata: {
                        firebaseStorageDownloadTokens: downloadToken,
                        voiceName,
                        generatedAt: new Date().toISOString(),
                        courseId,
                        exerciseId,
                        lineId,
                    },
                },
            });
            // Construct Firebase Storage Download URL
            // Format: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media&token=<token>
            const audioUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;
            // Update Firestore (use set with merge:true so it works even if line doc hasn't been saved yet)
            await admin.firestore()
                .collection("courses").doc(courseId)
                .collection("exercises").doc(exerciseId)
                .collection("lines").doc(lineId)
                .set({ audioUrl, voiceName }, { merge: true });
            const durationMs = Math.round((audioBuffer.length / 12000) * 1000);
            results.push({
                lineId,
                audioUrl,
                durationMs,
                success: true
            });
        }
        catch (err) {
            console.error(`Error processing TTS for line ${line.lineId}:`, err);
            results.push({
                lineId: line.lineId,
                audioUrl: "",
                durationMs: 0,
                success: false,
                error: err.message || "Unknown error"
            });
        }
    }
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    return { results, successCount, failureCount };
});
//# sourceMappingURL=generateTTSAudio.js.map
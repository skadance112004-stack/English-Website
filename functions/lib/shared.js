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
exports.GEMINI_API_KEY = void 0;
exports.checkRateLimit = checkRateLimit;
exports.verifyTeacher = verifyTeacher;
exports.checkTokenBudget = checkTokenBudget;
exports.recordTokenUsage = recordTokenUsage;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
exports.GEMINI_API_KEY = (0, params_1.defineSecret)("GEMINI_API_KEY");
const rateLimitMap = new Map();
const MAX_REQUESTS_PER_MINUTE = 10;
function checkRateLimit(userId) {
    const now = Date.now();
    const entry = rateLimitMap.get(userId);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(userId, { count: 1, resetAt: now + 60000 });
        return;
    }
    if (entry.count >= MAX_REQUESTS_PER_MINUTE) {
        throw new https_1.HttpsError("resource-exhausted", "Too many requests. Please wait a moment.");
    }
    entry.count++;
}
// ─── Teacher Verification ──────────────────────────────────────────────────────
async function verifyTeacher(uid) {
    const snap = await admin.firestore().collection("users").doc(uid).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "User not found.");
    if (snap.data()?.role !== "teacher") {
        throw new https_1.HttpsError("permission-denied", "Only teachers can use AI generation.");
    }
}
// ─── Token Budgeting ───────────────────────────────────────────────────────────
const DAILY_TOKEN_LIMIT = 50000;
async function checkTokenBudget(uid) {
    const today = new Date().toISOString().slice(0, 10);
    const snap = await admin.firestore()
        .collection("users").doc(uid)
        .collection("ai_usage").doc(today).get();
    if ((snap.data()?.tokensUsed ?? 0) >= DAILY_TOKEN_LIMIT) {
        throw new https_1.HttpsError("resource-exhausted", "Daily AI token limit reached. Resets at midnight.");
    }
}
async function recordTokenUsage(uid, tokens) {
    const today = new Date().toISOString().slice(0, 10);
    await admin.firestore()
        .collection("users").doc(uid)
        .collection("ai_usage").doc(today)
        .set({
        tokensUsed: admin.firestore.FieldValue.increment(tokens),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}
//# sourceMappingURL=shared.js.map
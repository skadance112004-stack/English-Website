import { HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

export const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
interface RateLimitEntry { count: number; resetAt: number; }
const rateLimitMap = new Map<string, RateLimitEntry>();
const MAX_REQUESTS_PER_MINUTE = 10;

export function checkRateLimit(userId: string): void {
  const now   = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60_000 });
    return;
  }
  if (entry.count >= MAX_REQUESTS_PER_MINUTE) {
    throw new HttpsError("resource-exhausted", "Too many requests. Please wait a moment.");
  }
  entry.count++;
}

// ─── Teacher Verification ──────────────────────────────────────────────────────
export async function verifyTeacher(uid: string): Promise<void> {
  const snap = await admin.firestore().collection("users").doc(uid).get();
  if (!snap.exists) throw new HttpsError("not-found", "User not found.");
  if (snap.data()?.role !== "teacher") {
    throw new HttpsError("permission-denied", "Only teachers can use AI generation.");
  }
}

// ─── Token Budgeting ───────────────────────────────────────────────────────────
const DAILY_TOKEN_LIMIT = 100_000;

export async function checkTokenBudget(uid: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const snap  = await admin.firestore()
    .collection("users").doc(uid)
    .collection("ai_usage").doc(today).get();
  if ((snap.data()?.tokensUsed ?? 0) >= DAILY_TOKEN_LIMIT) {
    throw new HttpsError("resource-exhausted", "Daily AI token limit reached. Resets at midnight.");
  }
}

export async function recordTokenUsage(uid: string, tokens: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await admin.firestore()
    .collection("users").doc(uid)
    .collection("ai_usage").doc(today)
    .set({
      tokensUsed:  admin.firestore.FieldValue.increment(tokens),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}

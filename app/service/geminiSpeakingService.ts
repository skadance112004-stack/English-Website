import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/firebase";

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface AILine {
  speaker:            "AI" | "Student";
  text:               string;
  pronunciationFocus: string;
  vocabularyHelp:     { word: string; definition: string }[];
  keyWords:           string[];
  studentHint:        string;
}

export interface GenerateSpeakingResponse {
  reasoning:      string;
  suggestedLines: AILine[];
  logId:          string;
}

export interface SpeakingMetaSummary {
  title:       string;
  description: string;
  cefr:        string;
  tone:        string;
  scenario:    string;
}

export interface LineSummary {
  speaker: string;
  preview: string;
}

// ─── Callable references ───────────────────────────────────────────────────────
const generateSpeakingContentFn = httpsCallable<
  {
    exerciseId:    string;
    userPrompt:    string;
    documentText?: string;
    exerciseMeta:  SpeakingMetaSummary;
    lineCount:     number;
    currentLines:  LineSummary[];
  },
  GenerateSpeakingResponse
>(functions, "generateSpeakingContent");

const markAILogAcceptedFn = httpsCallable<{ logId: string }, { success: boolean }>(
  functions, "markAILogAccepted"
);

// ─── Exported wrappers ─────────────────────────────────────────────────────────
export async function generateSpeakingContent(data: {
  exerciseId:    string;
  userPrompt:    string;
  documentText?: string;
  exerciseMeta:  SpeakingMetaSummary;
  lineCount:     number;
  currentLines:  LineSummary[];
}): Promise<GenerateSpeakingResponse> {
  const result = await generateSpeakingContentFn(data);
  return result.data;
}

export async function markSpeakingLogAccepted(logId: string): Promise<void> {
  try { await markAILogAcceptedFn({ logId }); } catch { /* non-critical */ }
}

export function summarizeLines(lines: { speaker: string; text: string }[]): LineSummary[] {
  return lines.map(l => ({
    speaker: l.speaker,
    preview: (l.text || "").slice(0, 50),
  }));
}
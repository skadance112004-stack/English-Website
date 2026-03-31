// app/services/geminiExerciseService.ts
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/firebase";

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface AIQuestion {
  questionType:    "MCQ" | "T-F-NG" | "SHORT ANSWER";
  questionText:    string;
  options:         { optionId: string; text: string; isCorrect: boolean }[];
  acceptedAnswers: string[];
  explanation:     string;
  hint:            string;
  points:          number;
}

export interface AIPassage {
  title: string;
  wordcount: number;
  thumbnail: string;
  text: string;
}

export interface AIAudioContent {
  title:      string;
  topic:      string;
  difficulty: string;
  accent:     string;
  transcript: { full: string; timestamped: any[] };
}

export interface GenerateExerciseResponse {
  reasoning:          string;
  suggestedQuestions: AIQuestion[];
  suggestedPassage:   AIPassage   | null;
  suggestedAudio:     AIAudioContent | null;
  logId:              string;
}

export interface ExerciseSummary {
  title:       string;
  type:        string;
  description: string;
  cefr?:       string;
}

export interface QuestionSummary {
  type:    string;
  preview: string;
}

// ─── Callable references (created once outside any component) ─────────────────
const generateExerciseContentFn = httpsCallable<
  {
    exerciseId:       string;
    userPrompt:       string;
    documentText?:    string;
    exerciseMeta:     ExerciseSummary;
    currentQuestions: QuestionSummary[];
    hasPassage:       boolean;
    hasAudio:         boolean;
  },
  GenerateExerciseResponse
>(functions, "generateExerciseContent");

const markAILogAcceptedFn = httpsCallable<{ logId: string }, { success: boolean }>(
  functions, "markAILogAccepted"
);

// ─── Exported wrappers ─────────────────────────────────────────────────────────

export async function generateExerciseContent(data: {
  exerciseId:       string;
  userPrompt:       string;
  documentText?:    string;
  exerciseMeta:     ExerciseSummary;
  currentQuestions: QuestionSummary[];
  hasPassage:       boolean;
  hasAudio:         boolean;
}): Promise<GenerateExerciseResponse> {
  const result = await generateExerciseContentFn(data);
  return result.data;
}

export async function markExerciseLogAccepted(logId: string): Promise<void> {
  try { await markAILogAcceptedFn({ logId }); } catch { /* non-critical */ }
}

// ─── Helper: summarize questions for AI context ────────────────────────────────
export function summarizeQuestions(questions: { questionType: string; questionText: string }[]): QuestionSummary[] {
  return questions.map(q => ({
    type:    q.questionType,
    preview: (q.questionText || "").slice(0, 60),
  }));
}
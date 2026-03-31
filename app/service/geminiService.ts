import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/firebase";

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface GeminiBlock {
  id?: string;
  type: "heading" | "text" | "keyTerms" | "formula" | "audio" | "image" | "file";
  content: Record<string, any>;
  aiGenerated?: boolean;
}

export interface LessonMetaSummary {
  title: string;
  type: string;
  level: string;
  description: string;
}

export interface BlockSummary {
  type: string;
  preview: string;
}

export interface GenerateLessonResponse {
  reasoning: string;
  suggestedBlocks: GeminiBlock[];
  metaUpdates: Record<string, any> | null;
  logId: string;
}

// ─── Cloud Function Wrappers ───────────────────────────────────────────────────

/**
 * Calls the Cloud Function to generate lesson content using Gemini.
 */
export async function generateLessonContent(data: {
  lessonId: string;
  userPrompt: string;
  documentText?: string;
  lessonMeta: LessonMetaSummary;
  currentBlocks: BlockSummary[];
}): Promise<GenerateLessonResponse> {
  const genFn = httpsCallable<any, GenerateLessonResponse>(functions, "generateLessonContent");
  const result = await genFn(data);
  return result.data;
}

/**
 * Marks an AI assistance log as accepted by the teacher.
 */
export async function markAILogAccepted(logId: string): Promise<void> {
  const markFn = httpsCallable<{ logId: string }, { success: boolean }>(functions, "markAILogAccepted");
  await markFn({ logId });
}

/**
 * Marks an AI-generated block as edited by the teacher.
 */
export async function markAILogEdited(logId: string): Promise<void> {
  const markFn = httpsCallable<{ logId: string }, { success: boolean }>(functions, "markAILogEdited");
  await markFn({ logId });
}

// ─── Helper: Summarize blocks for AI context ───────────────────────────────────
export function summarizeBlocks(blocks: any[]): BlockSummary[] {
  return blocks.map(b => ({
    type: b.type,
    preview: getBlockPreview(b)
  }));
}

function getBlockPreview(block: any): string {
  try {
    switch (block.type) {
      case "heading":
      case "text":
        const text = block.content.text ?? "";
        return text.replace(/<[^>]+>/g, "").slice(0, 60);
      case "keyTerms":
        return `${block.content.terms?.length ?? 0} terms`;
      case "formula":
        return block.content.title?.slice(0, 40) ?? "";
      default:
        return block.type;
    }
  } catch {
    return block.type;
  }
}

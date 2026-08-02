type FirebaseAIError = {
  code?: string;
  message?: string;
};

/** Converts callable-function failures into messages teachers can act on. */
export function getAIErrorMessage(error: unknown): string {
  const { code, message } = (error ?? {}) as FirebaseAIError;

  if (code === "functions/unauthenticated") return "Please sign in again before using AI generation.";
  if (code === "functions/permission-denied") return "AI generation is available to teacher accounts only.";
  if (code === "functions/resource-exhausted") return message || "The AI request limit has been reached. Please try again shortly.";
  if (code === "functions/failed-precondition") return "AI generation is not configured yet. Ask an administrator to configure the Gemini API key.";
  if (code === "functions/deadline-exceeded" || code === "functions/unavailable") return "The AI service is taking too long to respond. Please try again.";

  return "We couldn't generate content right now. Please try again in a moment.";
}

// app/services/ttsService.ts
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/firebase";

// ─── Voice options ─────────────────────────────────────────────────────────────
export interface VoiceOption {
  id:     string;
  name:   string;
  locale: string;
  gender: "Male" | "Female";
  flag:   string;
  accent: string;
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { id:"en-US-JennyNeural",   name:"Jenny",   locale:"en-US", gender:"Female", flag:"🇺🇸", accent:"American"   },
  { id:"en-US-GuyNeural",     name:"Guy",     locale:"en-US", gender:"Male",   flag:"🇺🇸", accent:"American"   },
  { id:"en-US-AriaNeural",    name:"Aria",    locale:"en-US", gender:"Female", flag:"🇺🇸", accent:"American"   },
  { id:"en-US-DavisNeural",   name:"Davis",   locale:"en-US", gender:"Male",   flag:"🇺🇸", accent:"American"   },
  { id:"en-US-SaraNeural",    name:"Sara",    locale:"en-US", gender:"Female", flag:"🇺🇸", accent:"American"   },
  { id:"en-US-TonyNeural",    name:"Tony",    locale:"en-US", gender:"Male",   flag:"🇺🇸", accent:"American"   },
  { id:"en-GB-SoniaNeural",   name:"Sonia",   locale:"en-GB", gender:"Female", flag:"🇬🇧", accent:"British"    },
  { id:"en-GB-RyanNeural",    name:"Ryan",    locale:"en-GB", gender:"Male",   flag:"🇬🇧", accent:"British"    },
  { id:"en-AU-NatashaNeural", name:"Natasha", locale:"en-AU", gender:"Female", flag:"🇦🇺", accent:"Australian" },
  { id:"en-AU-WilliamNeural", name:"William", locale:"en-AU", gender:"Male",   flag:"🇦🇺", accent:"Australian" },
  { id:"en-IN-NeerjaNeural",  name:"Neerja",  locale:"en-IN", gender:"Female", flag:"🇮🇳", accent:"Indian"     },
];

export const DEFAULT_VOICE = "en-US-JennyNeural";

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface TTSLineInput {
  lineId:    string;
  text:      string;
  voiceName: string;
}

export interface TTSLineResult {
  lineId:     string;
  audioUrl:   string;
  durationMs: number;
  success:    boolean;
  error?:     string;
}

export interface BatchTTSResult {
  results:      TTSLineResult[];
  successCount: number;
  failureCount: number;
}

// ─── Request / response shapes ─────────────────────────────────────────────────
interface BatchTTSRequest {
  courseId:   string;
  exerciseId: string;
  lines:      TTSLineInput[];
  rate?:      number;
  pitch?:     number;
}

// ─── Callable references — typed explicitly to avoid 'unknown' errors ──────────
const generateTTSFn = httpsCallable<BatchTTSRequest, BatchTTSResult>(
  functions,
  "generateTTSAudio"
);

// ─── Exported wrappers ─────────────────────────────────────────────────────────
export async function batchGenerateTTS(data: BatchTTSRequest): Promise<BatchTTSResult> {
  const result = await generateTTSFn(data);
  return result.data;
}

// ─── Helper: pick only AI lines that have text ────────────────────────────────
export function prepareAILinesForTTS(
  lines: { lineId: string; speaker: string; text: string; voiceName?: string }[],
  defaultVoice: string = DEFAULT_VOICE,
): TTSLineInput[] {
  return lines
    .filter(l => l.speaker === "AI" && l.text.trim().length > 0)
    .map(l => ({
      lineId:    l.lineId,
      text:      l.text.trim(),
      voiceName: l.voiceName || defaultVoice,
    }));
}
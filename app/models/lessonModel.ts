import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// Strictly follows the Firestore schema in the spec document.
// UI-only fields (level, targetLanguage, etc.) live ONLY in the LessonMeta
// interface inside LessonBuilder — they are never written to Firestore.
// ─────────────────────────────────────────────────────────────────────────────

export type BlockType =
  | "heading"
  | "text"
  | "audio"
  | "image"
  | "video"
  | "keyTerms"
  | "formula"
  | "file"
  | "flashcard"   // UI-only block; stored with custom content
  | "dialogue";   // UI-only block; stored with custom content

// ─── Lesson (courses/{courseId}/lessons/{lessonId}) ───────────────────────────
// These fields EXACTLY match the schema. No extra fields.
export interface Lesson {
  lessonId:    string;   // = Firestore doc ID
  sectionId:   string;
  title:       string;
  description: string;
  type:        string;   // Listening | Reading | Writing | Speaking | Vocabulary | Grammar | General …
  duration:    number;   // minutes
  order:       number;   // position within section
  thumbnail:   string;   // URL
  metadata: {
    hasVideo: boolean;
    hasAudio: boolean;
  };
  aiGenerated: boolean;
  createdAt?:  any;      // Firestore Timestamp — read-only after creation
  updatedAt?:  any;
}

// ─── Block (courses/{courseId}/lessons/{lessonId}/blocks/{blockId}) ───────────
export interface LessonBlock {
  id:          string;   // = Firestore doc ID
  type:        BlockType;
  order:       number;
  content:     BlockContent;
  aiGenerated: boolean;
  logId?:      string;   // Optional reference to ai_assistance_logs
  createdAt?:  any;
}

// ─── Per-type content shapes (exactly matches schema) ─────────────────────────
//
// Rule: the "text" field for heading/text stores the FULL html string
//       (flutter_html compatible) — this is what the schema says:
//         heading.content.text = "html string"
//         text.content.text    = "html string"
//
// Extra UI-only fields (boxed, level for heading) are stored alongside
// because they don't break flutter_html — it just renders the html field.
// The Flutter app only reads `content.text` for these two types.

export interface HeadingContent {
  text:   string;  // Full <h1/h2/h3> html string — this IS the persisted field
  _level: "h1" | "h2" | "h3";  // UI helper (prefixed _ = not read by Flutter)
}

export interface TextContent {
  text:   string;  // Full html string (<p>, <ul>, <b>, etc.)
  _boxed: boolean; // UI helper — Flutter ignores; actual boxed styling is in the html
}

export interface AudioContent {
  url:         string;
  title:       string;
  duration:    number;  // seconds
  transcript?: string;
}

export interface ImageContent {
  url:     string;
  caption: string;
}

export interface VideoContent {
  url:       string;
  thumbnail: string;
  title:     string;
  duration:  number;  // seconds
}

export interface KeyTerm {
  word:       string;
  type:       string;
  definition: string;
}
export interface KeyTermsContent {
  terms: KeyTerm[];
}

export interface FormulaStep {
  stepNumber:  number;
  label:       string;
  description: string;
}
export interface FormulaContent {
  title: string;
  steps: FormulaStep[];
}

export interface FileContent {
  fileUrl:   string;
  fileName?: string;  // display name, not in schema but harmless
}

// UI-only block types — Flutter renders these via custom widgets
export interface FlashcardContent {
  front: string;
  back:  string;
}

export interface DialogueLine { speaker: string; text: string; }
export interface DialogueContent {
  lines: DialogueLine[];
}

export type BlockContent =
  | HeadingContent
  | TextContent
  | AudioContent
  | ImageContent
  | VideoContent
  | KeyTermsContent
  | FormulaContent
  | FileContent
  | FlashcardContent
  | DialogueContent;

// ─────────────────────────────────────────────────────────────────────────────
// HTML GENERATION  (flutter_html ^3 compatible)
// ─────────────────────────────────────────────────────────────────────────────
//
// For heading + text:  the html IS content.text (stored directly)
// For all other types: html is generated on-the-fly for display; the raw
//                      structured fields are what Firestore stores.
//
// Supported tags:   h1-h6, p, span, b, strong, i, em, u, s, br, hr,
//                   ul, ol, li, dl, dt, dd, blockquote, figure, figcaption,
//                   img (src, width, height), a (href), div
// Supported CSS:    color, background-color, font-size, font-weight,
//                   font-style, text-decoration, text-align, line-height,
//                   letter-spacing, padding, margin, border, border-radius,
//                   width, height, list-style

// Returns the html string that flutter_html should render for a given block.
export const blockToHtml = (type: BlockType, content: any): string => {
  switch (type) {

    // heading: content.text IS already the html string
    case "heading":
      return content.text || "<h2></h2>";

    // text: content.text IS already the html string
    case "text":
      return content.text || "<p></p>";

    case "audio": {
      const { title = "", duration = 0, transcript = "" } = content as AudioContent;
      const mins = String(Math.floor(duration / 60)).padStart(2, "0");
      const secs = String(duration % 60).padStart(2, "0");
      return [
        `<p style="font-size:14px; font-weight:600; color:#374151;">${esc(title)}</p>`,
        `<p style="font-size:12px; color:#9ca3af;">Duration: ${mins}:${secs}</p>`,
        transcript
          ? `<p style="font-size:13px; color:#6b7280; font-style:italic;">${esc(transcript)}</p>`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "image": {
      const { url = "", caption = "" } = content as ImageContent;
      return `<figure style="margin:0; padding:0;">
  <img src="${escAttr(url)}" style="width:100%; border-radius:6px;" />
  ${caption ? `<figcaption style="font-size:12px; color:#6b7280; text-align:center; margin-top:6px;">${esc(caption)}</figcaption>` : ""}
</figure>`;
    }

    case "video": {
      const { title = "", duration = 0 } = content as VideoContent;
      const mins = String(Math.floor(duration / 60)).padStart(2, "0");
      const secs = String(duration % 60).padStart(2, "0");
      return [
        `<p style="font-size:14px; font-weight:600; color:#374151;">${esc(title)}</p>`,
        `<p style="font-size:12px; color:#9ca3af;">Duration: ${mins}:${secs}</p>`,
      ].join("\n");
    }

    case "flashcard": {
      const { front = "", back = "" } = content as FlashcardContent;
      return `<div style="padding:16px; background-color:#fffbeb; border:1px solid #fde68a; border-radius:10px; margin-bottom:8px;">
  <p style="font-size:11px; font-weight:700; color:#d97706; letter-spacing:0.06em; margin:0 0 8px 0;">FRONT</p>
  <p style="font-size:18px; font-weight:700; color:#111827; margin:0;">${esc(front)}</p>
</div>
<div style="padding:16px; background-color:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px;">
  <p style="font-size:11px; font-weight:700; color:#16a34a; letter-spacing:0.06em; margin:0 0 8px 0;">BACK</p>
  <p style="font-size:16px; color:#374151; margin:0;">${esc(back)}</p>
</div>`;
    }

    case "dialogue": {
      const { lines = [] } = content as DialogueContent;
      const items = lines
        .map((l, i) => {
          const left      = i % 2 === 0;
          const nameColor = left ? "#2563eb" : "#db2777";
          const align     = left ? "left"    : "right";
          return `  <li style="margin-bottom:10px; text-align:${align};">
    <b style="color:${nameColor};">${esc(l.speaker)}:</b>
    <span style="font-size:14px; color:#374151;"> ${esc(l.text)}</span>
  </li>`;
        })
        .join("\n");
      return `<ul style="list-style:none; padding:0; margin:0;">\n${items}\n</ul>`;
    }

    case "keyTerms": {
      const { terms = [] } = content as KeyTermsContent;
      const pairs = terms
        .map(
          (t) => `  <dt style="font-size:15px; font-weight:700; color:#111827; margin-top:12px;">
    ${esc(t.word)} <span style="font-size:11px; font-weight:400; color:#6b7280; font-style:italic;">(${esc(t.type)})</span>
  </dt>
  <dd style="font-size:14px; color:#374151; margin:4px 0 0 16px; line-height:1.6;">${esc(t.definition)}</dd>`
        )
        .join("\n");
      return `<dl style="margin:0; padding:0;">\n${pairs}\n</dl>`;
    }

    case "formula": {
      const { title = "", steps = [] } = content as FormulaContent;
      const lis = steps
        .map(
          (s) =>
            `  <li style="margin-bottom:6px;"><b>${esc(s.label)}:</b> ${esc(s.description)}</li>`
        )
        .join("\n");
      return [
        `<h3 style="font-size:16px; font-weight:700; color:#111827; margin:0 0 10px 0;">${esc(title)}</h3>`,
        `<ol style="margin:0; padding-left:20px; color:#374151; font-size:14px; line-height:1.75;">\n${lis}\n</ol>`,
      ].join("\n");
    }

    case "file": {
      const { fileUrl = "", fileName = "Download file" } = content as FileContent;
      return `<p style="font-size:14px; color:#374151;">
  <a href="${escAttr(fileUrl)}" style="color:#22c55e; text-decoration:underline;">${esc(fileName || fileUrl)}</a>
</p>`;
    }

    default:
      return "<p>Unsupported block type</p>";
  }
};

// ─── HTML helpers for heading / text blocks ────────────────────────────────
// Converts plain text from the web editor into a flutter_html-ready string.

export const plainTextToHeadingHtml = (
  text: string, 
  level: "h1" | "h2" | "h3" = "h2",
  fontSize?: number,
  fontFamily: string = "DM Sans"
): string => {
  const defaultSizes: Record<string, string> = { h1: "28px", h2: "22px", h3: "17px" };
  const size = fontSize ? `${fontSize}px` : defaultSizes[level];
  return `<${level} style="font-size:${size}; font-family:'${fontFamily}', sans-serif; font-weight:700; color:#111827; margin:0 0 4px 0; line-height:1.3;">${esc(text)}</${level}>`;
};

export const plainTextToBodyHtml = (
  text: string, 
  boxed = false,
  fontSize: number = 15,
  fontFamily: string = "DM Sans"
): string => {
  // Each non-empty line → <p>; blank line → <br>
  const inner = text
    .split("\n")
    .map((line) =>
      line.trim() === ""
        ? "<br />"
        : `<p style="font-size:${fontSize}px; font-family:'${fontFamily}', sans-serif; line-height:1.75; color:#374151; margin:0 0 6px 0;">${esc(line)}</p>`
    )
    .join("\n");
  if (!boxed) return inner;
  return `<div style="border:1.5px solid #22c55e; border-radius:10px; padding:16px 20px;">\n${inner}\n</div>`;
};

// ─── Default content factory ───────────────────────────────────────────────
// Returns the initial content object for a newly created block.
// heading/text: content.text = the html string (per schema).

export const defaultBlockContent = (type: BlockType): BlockContent => {
  switch (type) {
    case "heading":
      return {
        text:   plainTextToHeadingHtml("New Heading", "h2"),
        _level: "h2",
      } satisfies HeadingContent;

    case "text":
      return {
        text:   `<p style="font-size:15px; line-height:1.75; color:#374151;">Start typing your content here...</p>`,
        _boxed: false,
      } satisfies TextContent;

    case "audio":
      return { url: "", title: "audio_file.mp3", duration: 0, transcript: "" } satisfies AudioContent;

    case "image":
      return { url: "", caption: "" } satisfies ImageContent;

    case "video":
      return { url: "", thumbnail: "", title: "Video Title", duration: 0 } satisfies VideoContent;

    case "flashcard":
      return { front: "Term", back: "Definition" } satisfies FlashcardContent;

    case "dialogue":
      return { lines: [{ speaker: "A", text: "Hello!" }, { speaker: "B", text: "Hi there!" }] } satisfies DialogueContent;

    case "keyTerms":
      return { terms: [{ word: "Example", type: "noun", definition: "A representative instance." }] } satisfies KeyTermsContent;

    case "formula":
      return {
        title: "Formula Title",
        steps: [{ stepNumber: 1, label: "Step One", description: "Describe the first step." }],
      } satisfies FormulaContent;

    case "file":
      return { fileUrl: "", fileName: "document.pdf" } satisfies FileContent;

    default:
      return { text: "<p></p>", _boxed: false } as any;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LESSON CRUD
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch and parse lesson metadata with safe defaults for missing fields. */
export const getLesson = async (
  courseId: string,
  lessonId: string
): Promise<Lesson | null> => {
  const ref  = doc(db, "courses", courseId, "lessons", lessonId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const d = snap.data();

  // Parse with safe defaults — guards against older docs missing new fields
  return {
    lessonId:    snap.id,
    sectionId:   d.sectionId   ?? "",
    title:       d.title       ?? "",
    description: d.description ?? "",
    type:        d.type        ?? "General",
    duration:    typeof d.duration === "number" ? d.duration : 0,
    order:       typeof d.order    === "number" ? d.order    : 0,
    thumbnail:   d.thumbnail   ?? "",
    metadata: {
      hasVideo: d.metadata?.hasVideo ?? false,
      hasAudio: d.metadata?.hasAudio ?? false,
    },
    aiGenerated: d.aiGenerated ?? false,
    createdAt:   d.createdAt,
    updatedAt:   d.updatedAt,
  };
};

/**
 * Save lesson metadata.
 * Only writes schema-defined fields — never writes UI-only fields.
 * Uses merge:true so partial updates don't wipe unrelated fields.
 */
export const saveLesson = async (
  courseId: string,
  lesson: Omit<Lesson, "createdAt" | "updatedAt" | "lessonId">
    & Pick<Lesson, "lessonId">
) => {
  const ref = doc(db, "courses", courseId, "lessons", lesson.lessonId);

  // Only the schema fields — strip UI extras
  const payload: Omit<Lesson, "lessonId" | "createdAt"> = {
    sectionId:   lesson.sectionId,
    title:       lesson.title,
    description: lesson.description,
    type:        lesson.type,
    duration:    lesson.duration,
    order:       lesson.order,
    thumbnail:   lesson.thumbnail,
    metadata:    lesson.metadata,
    aiGenerated: lesson.aiGenerated,
    updatedAt:   serverTimestamp(),
  };

  await setDoc(ref, payload, { merge: true });
};

/** Partial update — useful for thumbnail change, status change, etc. */
export const updateLesson = async (
  courseId: string,
  lessonId: string,
  data: Partial<Omit<Lesson, "lessonId" | "createdAt">>
) => {
  const ref = doc(db, "courses", courseId, "lessons", lessonId);
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
};

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK CRUD
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch all blocks ordered by `order`. Parses each with safe defaults. */
export const getBlocks = async (
  courseId: string,
  lessonId: string
): Promise<LessonBlock[]> => {
  const colRef = collection(db, "courses", courseId, "lessons", lessonId, "blocks");
  const snap   = await getDocs(query(colRef, orderBy("order", "asc")));

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id:          d.id,
      type:        (data.type        ?? "text") as BlockType,
      order:       typeof data.order === "number" ? data.order : 0,
      content:     parseBlockContent(data.type, data.content ?? {}),
      aiGenerated: data.aiGenerated ?? false,
      logId:       data.logId,
      createdAt:   data.createdAt,
    } satisfies LessonBlock;
  });
};

/**
 * Parse and validate block content from Firestore.
 * Guards against missing/null fields — all content shapes are safe to render.
 */
const parseBlockContent = (type: string, raw: any): BlockContent => {
  switch (type as BlockType) {
    case "heading":
      return {
        text:   raw.text   ?? "<h2>Heading</h2>",
        _level: raw._level ?? "h2",
      } satisfies HeadingContent;

    case "text":
      return {
        text:   raw.text   ?? "<p></p>",
        _boxed: raw._boxed ?? false,
      } satisfies TextContent;

    case "audio":
      return {
        url:        raw.url        ?? "",
        title:      raw.title      ?? "",
        duration:   typeof raw.duration === "number" ? raw.duration : 0,
        transcript: raw.transcript ?? "",
      } satisfies AudioContent;

    case "image":
      return {
        url:     raw.url     ?? "",
        caption: raw.caption ?? "",
      } satisfies ImageContent;

    case "video":
      return {
        url:       raw.url       ?? "",
        thumbnail: raw.thumbnail ?? "",
        title:     raw.title     ?? "",
        duration:  typeof raw.duration === "number" ? raw.duration : 0,
      } satisfies VideoContent;

    case "flashcard":
      return {
        front: raw.front ?? "",
        back:  raw.back  ?? "",
      } satisfies FlashcardContent;

    case "dialogue":
      return {
        lines: Array.isArray(raw.lines)
          ? raw.lines.map((l: any) => ({
              speaker: l?.speaker ?? "",
              text:    l?.text    ?? "",
            }))
          : [],
      } satisfies DialogueContent;

    case "keyTerms":
      return {
        terms: Array.isArray(raw.terms)
          ? raw.terms.map((t: any) => ({
              word:       t?.word       ?? "",
              type:       t?.type       ?? "",
              definition: t?.definition ?? "",
            }))
          : [],
      } satisfies KeyTermsContent;

    case "formula":
      return {
        title: raw.title ?? "",
        steps: Array.isArray(raw.steps)
          ? raw.steps.map((s: any) => ({
              stepNumber:  typeof s?.stepNumber === "number" ? s.stepNumber : 0,
              label:       s?.label       ?? "",
              description: s?.description ?? "",
            }))
          : [],
      } satisfies FormulaContent;

    case "file":
      return {
        fileUrl:  raw.fileUrl  ?? "",
        fileName: raw.fileName ?? "",
      } satisfies FileContent;

    default:
      // Unknown type — fall back to a safe text block
      return { text: raw.text ?? "<p></p>", _boxed: false } as TextContent;
  }
};

/**
 * Batch-replace all blocks for a lesson.
 * Strategy: delete all existing docs then write the new set.
 * Content is saved exactly as-is — no html injection into the payload
 * (heading/text already store html in content.text per schema).
 */
export const saveBlocks = async (
  courseId: string,
  lessonId: string,
  blocks: LessonBlock[]
) => {
  const colRef   = collection(db, "courses", courseId, "lessons", lessonId, "blocks");
  const existing = await getDocs(colRef);
  const batch    = writeBatch(db);

  // Delete old blocks
  existing.docs.forEach((d) => batch.delete(d.ref));

  // Write new blocks — assign order = array index
  blocks.forEach((block, idx) => {
    const blockRef = doc(colRef, block.id);

    // Strip UI-only helper fields that start with _ before persisting
    const cleanContent = stripUiFields(block.content);

    batch.set(blockRef, {
      type:        block.type,
      order:       idx,
      content:     cleanContent,
      aiGenerated: block.aiGenerated ?? false,
      logId:       block.logId       ?? null,
      createdAt:   block.createdAt   ?? serverTimestamp(),
    });
  });

  await batch.commit();
};

/** Remove _ prefixed UI helper keys before writing to Firestore. */
const stripUiFields = (content: any): any => {
  if (!content || typeof content !== "object") return content;
  return Object.fromEntries(
    Object.entries(content).filter(([key]) => !key.startsWith("_"))
  );
};

export const addBlock = async (
  courseId: string,
  lessonId: string,
  block: Omit<LessonBlock, "id">
): Promise<string> => {
  const colRef = collection(db, "courses", courseId, "lessons", lessonId, "blocks");
  const ref    = await addDoc(colRef, {
    ...block,
    content:   stripUiFields(block.content),
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const updateBlock = async (
  courseId: string,
  lessonId: string,
  blockId:  string,
  data:     Partial<LessonBlock>
) => {
  const ref = doc(db, "courses", courseId, "lessons", lessonId, "blocks", blockId);
  const payload: any = { ...data };
  if (payload.content) {
    payload.content = stripUiFields(payload.content);
  }
  await updateDoc(ref, payload);
};

export const deleteBlock = async (
  courseId: string,
  lessonId: string,
  blockId:  string
) => {
  const ref = doc(db, "courses", courseId, "lessons", lessonId, "blocks", blockId);
  await deleteDoc(ref);
};

// ─── String escape helpers ─────────────────────────────────────────────────────
const esc = (s: string): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const escAttr = (s: string): string =>
  String(s ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
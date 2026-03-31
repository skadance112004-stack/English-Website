import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  orderBy, 
  setDoc, 
  updateDoc, 
  serverTimestamp, 
  writeBatch,
  deleteDoc
} from "firebase/firestore";
import { db } from "../firebase/firebase";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ExerciseType = "Reading" | "Listening" | "Speaking" | "Quiz";
export type QuestionType = "MCQ" | "T-F-NG" | "SHORT ANSWER";

export interface Option {
  optionId: string;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  questionId:      string;
  questionType:    QuestionType;
  order:           number;
  questionText:    string;
  options:         Option[];
  acceptedAnswers: string[];
  explanation:     string;
  hint?:           string;
  points?:         number;
  aiGenerated?:    boolean;
}

export interface Exercise {
  exerciseId:  string;
  sectionId:   string;
  title:       string;
  description: string;
  type:        ExerciseType;
  metadata: {
    questionCount: number;
    duration:      number;
    xpReward:      number;
    pointsReward:  number;
    passingScore:  number;
  };
  order:       number;
  createdAt:   any;
  updatedAt:   any;
  aiGenerated: boolean;
}

export interface ReadingContent {
  title: string;
  wordcount: number;
  thumbnail: string;
  text: string;
}

export interface AudioContent {
  url:        string;
  duration:   number;
  title:      string;
  difficulty: string;
  topic:      string;
  accent:     string;
  transcript: { full: string; timestamped: any[] };
}

// ─── Functions ─────────────────────────────────────────────────────────────────

export const getExercise = async (courseId: string, exerciseId: string): Promise<Exercise | null> => {
  const ref = doc(db, "courses", courseId, "exercises", exerciseId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return { exerciseId: snap.id, ...snap.data() } as Exercise;
  }
  return null;
};

export const getQuestions = async (courseId: string, exerciseId: string): Promise<Question[]> => {
  const q = query(
    collection(db, "courses", courseId, "exercises", exerciseId, "questions"),
    orderBy("order", "asc")
  );
  const snap = await getDocs(q);
  const list: Question[] = [];
  snap.forEach(d => list.push({ questionId: d.id, ...d.data() } as Question));
  return list;
};

export const getExerciseContent = async (courseId: string, exerciseId: string, contentType: "passage" | "audio") => {
  const ref = doc(db, "courses", courseId, "exercises", exerciseId, "content", contentType);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  return null;
};

export const saveExercise = async (
  courseId: string, 
  exercise: Partial<Exercise> & { exerciseId: string },
  questions: Question[],
  content?: { type: "Reading" | "Listening"; data: ReadingContent | AudioContent }
) => {
  const exerciseRef = doc(db, "courses", courseId, "exercises", exercise.exerciseId);
  const now = serverTimestamp();

  // 1. Save Exercise Meta
  await setDoc(exerciseRef, {
    ...exercise,
    updatedAt: now,
    createdAt: exercise.createdAt || now,
  }, { merge: true });

  // 2. Save Questions
  const batch = writeBatch(db);
  questions.forEach((q, idx) => {
    const qRef = doc(db, "courses", courseId, "exercises", exercise.exerciseId, "questions", q.questionId);
    batch.set(qRef, { ...q, order: idx }, { merge: true });
  });
  await batch.commit();

  // 3. Save Content if any
  if (content) {
    const contentType = content.type === "Reading" ? "passage" : "audio";
    const contentRef = doc(db, "courses", courseId, "exercises", exercise.exerciseId, "content", contentType);
    await setDoc(contentRef, content.data, { merge: true });
  }
};

export const deleteExercise = async (courseId: string, exerciseId: string) => {
  await deleteDoc(doc(db, "courses", courseId, "exercises", exerciseId));
};

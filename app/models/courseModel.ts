import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  setDoc, 
  updateDoc, 
  serverTimestamp,
  deleteDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { uploadCourseThumbnail } from "./storageModel";

export type LessonType = "Reading" | "Listening" | "Speaking" | "Writing" | "Grammar" | "Vocabulary" | "General";
export type ExerciseType = "Quiz" | "Speaking" | "Listening" | "Reading";

export interface LessonItem {
  id: string;
  kind: "lesson";
  number: number;
  title: string;
  type: LessonType;
  duration: number; // minutes
  exerciseCount: number;
  audioCount?: number;
}

export interface ExerciseItem {
  id: string;
  kind: "exercise";
  number: number;
  title: string;
  type: ExerciseType;
  duration: number;
  questionCount: number;
}

export type SectionItem = LessonItem | ExerciseItem;

export interface Section {
  id: string;
  title: string;
  expanded: boolean;
  items: SectionItem[];
}

export interface Course {
  courseId: string;
  title: string;
  subtitle?: string; // Keep for UI if needed, but not in gemini.md root
  description?: string;
  averageProgress?: number;
  instructor: {
    id: string;
    name: string;
    avatar: string;
    experience: string;
  };
  thumbnail: string;
  price: number;
  level: string;
  category: string;
  rating: number;
  studentCompleted: number;
  totalRatings: number;
  totalStudents: number;
  totalLessons: number;
  totalExercises: number;
  totalExams: number;
  totalDuration: number;
  createdAt: any;
  updatedAt: any;
  tags: string[];
  whatYouLearn: string[];
  firstFiveLessons: string[];
  published: boolean;
  createdBy: string;
  aiAssisted: boolean;
  draftStatus?: {
    lastEditedAt: any;
  };
  // UI helper fields (optional if they don't exist in DB)
  sections?: Section[];
}

export const getCourse = async (courseId: string): Promise<Course | null> => {
  const courseRef = doc(db, "courses", courseId);
  const snap = await getDoc(courseRef);
  if (snap.exists()) {
    return { courseId: snap.id, ...snap.data() } as Course;
  }
  return null;
};

export const getCoursesByTeacher = async (uid: string): Promise<Course[]> => {
  const q = query(collection(db, "courses"), where("createdBy", "==", uid));
  
  const snap = await getDocs(q);
  const list: Course[] = [];
  snap.forEach((d) => {
    list.push({ courseId: d.id, ...d.data() } as Course);
  });

  return list.sort((a, b) => {
    const timeA = a.updatedAt?.seconds || 0;
    const timeB = b.updatedAt?.seconds || 0;
    return timeB - timeA;
  });
};

export const createCourse = async (courseData: Omit<Course, "courseId" | "updatedAt" | "createdAt">) => {
  const courseRef = doc(collection(db, "courses"));
  const now = serverTimestamp();
  const newCourse = {
    ...courseData,
    courseId: courseRef.id,
    createdAt: now,
    updatedAt: now,
  };
  
  // Write to root courses collection
  await setDoc(courseRef, newCourse);
  
  return newCourse;
};

export const updateCourse = async (courseId: string, data: Partial<Course>) => {
  const courseRef = doc(db, "courses", courseId);
  const updateData = {
    ...data,
    updatedAt: serverTimestamp(),
  };
  
  // Update in root courses collection
  await updateDoc(courseRef, updateData);
};

export const saveSection = async (courseId: string, section: any, order: number) => {
  const id = section.id || section.sectionId;
  if (!id) throw new Error("Section ID is missing");
  
  const sectionRef = doc(db, "courses", courseId, "sections", id);
  const items = section.items || [];
  const lessons = items.filter((item: any) => item.kind === "lesson").length;
  const exercises = items.filter((item: any) => item.kind === "exercise").length;
  const duration = items.reduce((acc: number, item: any) => acc + (item.duration || 0), 0);

  await setDoc(sectionRef, {
    sectionId: id,
    title: section.title || "",
    order,
    totalLessons: lessons,
    totalExercises: exercises,
    duration,
    items: items, 
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

export const updateSections = async (courseId: string, sections: Section[]) => {
  const batch = writeBatch(db);
  for (let i = 0; i < sections.length; i++) {
    await saveSection(courseId, sections[i], i + 1);

    // Update the order for each item in the section
    const items = sections[i].items || [];
    items.forEach((item, idx) => {
      if (item.kind === "lesson") {
        const ref = doc(db, "courses", courseId, "lessons", item.id);
        batch.set(ref, { order: idx + 1 }, { merge: true });
      } else if (item.kind === "exercise") {
        const ref = doc(db, "courses", courseId, "exercises", item.id);
        batch.set(ref, { order: idx + 1 }, { merge: true });
      }
    });
  }
  await batch.commit();
};
export const getSections = async (courseId: string): Promise<Section[]> => {
  const sectionsCol = collection(db, "courses", courseId, "sections");
  const q = query(sectionsCol); 
  const snap = await getDocs(q);
  const sections: Section[] = [];
  
  snap.forEach(d => {
    const data = d.data();
    sections.push({ 
      title: data.title || "",
      expanded: true,
      ...data,
      id: d.id, 
      items: [] // Initialize empty, will populate from subcollections
    } as unknown as Section);
  });
  
  // Sort sections by order
  sections.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

  // Fetch lessons
  const lessonsCol = collection(db, "courses", courseId, "lessons");
  const lessonsSnap = await getDocs(lessonsCol);
  const lessonsBySection: Record<string, LessonItem[]> = {};
  
  lessonsSnap.forEach(d => {
    const data = d.data();
    if (data.sectionId) {
      if (!lessonsBySection[data.sectionId]) lessonsBySection[data.sectionId] = [];
      lessonsBySection[data.sectionId].push({
        id: d.id,
        kind: "lesson",
        number: data.order || 0,
        title: data.title || "",
        type: data.type || "General",
        duration: data.duration || 0,
        exerciseCount: 0, // Would need fetching blocks if needed
        ...data
      } as LessonItem);
    }
  });

  // Fetch exercises
  const exercisesCol = collection(db, "courses", courseId, "exercises");
  const exercisesSnap = await getDocs(exercisesCol);
  const exercisesBySection: Record<string, ExerciseItem[]> = {};
  
  exercisesSnap.forEach(d => {
    const data = d.data();
    if (data.sectionId) {
      if (!exercisesBySection[data.sectionId]) exercisesBySection[data.sectionId] = [];
      exercisesBySection[data.sectionId].push({
        id: d.id,
        kind: "exercise",
        number: data.order || 0,
        title: data.title || "",
        type: data.type || "Quiz",
        duration: data.metadata?.duration || 0,
        questionCount: data.metadata?.questionCount || 0,
        ...data
      } as ExerciseItem);
    }
  });

  // Attach items to sections and sort by order
  for (const section of sections) {
    const items: SectionItem[] = [
      ...(lessonsBySection[section.id] || []),
      ...(exercisesBySection[section.id] || [])
    ];
    
    // Sort items by their order
    items.sort((a, b) => (a.number || 0) - (b.number || 0));
    
    // Normalize number to 1-based index based on position
    items.forEach((item, index) => {
      item.number = index + 1;
    });
    
    section.items = items;
  }

  return sections;
};

/**
 * Orchestrates uploading a new thumbnail and updating the course in Firestore.
 * @param teacherUid The teacher's UID.
 * @param courseId The course ID.
 * @param file The image file.
 * @returns The new download URL.
 */
export const updateCourseThumbnailWithUpload = async (teacherUid: string, courseId: string, file: File): Promise<string> => {
  const downloadUrl = await uploadCourseThumbnail(teacherUid, courseId, file);
  await updateCourse(courseId, { thumbnail: downloadUrl });
  return downloadUrl;
};

export const deleteCourse = async (courseId: string, teacherId: string) => {
  await deleteDoc(doc(db, "courses", courseId));
};

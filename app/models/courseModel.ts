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
  deleteDoc
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
  const q = query(collection(db, "users", uid, "courses"));
  
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
  
  // Write to teacher's courses subcollection
  const teacherCourseRef = doc(db, "users", courseData.createdBy, "courses", courseRef.id);
  await setDoc(teacherCourseRef, newCourse);
  
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
  
  // If we have the createdBy (or can get it), update in teacher's courses subcollection
  let creatorId = data.createdBy;
  if (!creatorId) {
    const snap = await getDoc(courseRef);
    if (snap.exists()) {
      creatorId = snap.data().createdBy;
    }
  }
  
  if (creatorId) {
    const teacherCourseRef = doc(db, "users", creatorId, "courses", courseId);
    await updateDoc(teacherCourseRef, updateData);
  }
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
  for (let i = 0; i < sections.length; i++) {
    await saveSection(courseId, sections[i], i + 1);
  }
};

export const getSections = async (courseId: string): Promise<Section[]> => {
  const sectionsCol = collection(db, "courses", courseId, "sections");
  const q = query(sectionsCol); 
  const snap = await getDocs(q);
  const list: Section[] = [];
  snap.forEach(d => {
    const data = d.data();
    list.push({ 
      ...data,
      id: d.id, 
      items: data.items || [] 
    } as Section);
  });
  return list.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
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
  await deleteDoc(doc(db, "users", teacherId, "courses", courseId));
};

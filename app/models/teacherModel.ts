import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { uploadTeacherAvatar } from "./storageModel";

export interface TeacherStats {
  totalCourses: number;
  activeCourses: number;
  draftCourses: number;
  totalStudents: number;
  activeStudents: number;
  lessonsCreated: number;
  exercisesCreated: number;
  examsCreated: number;
  averageCompletionRate: number;
  averageStudentRating: number;
  totalRevenue: number;
  monthlyRevenue: number;
}

export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  avatar: string;
  role: string;
  phone?: string;
  notificationPreferences?: {
    courseUpdates: boolean;
    studentActivity: boolean;
    directMessages: boolean;
    marketingEmails: boolean;
  };
  teacherProfile?: {
    bio: string;
    experience: string;
    expertise: string[];
    totalCourses: number;
    totalStudents: number;
    averageRating: number;
  };
}

export const getTeacherProfile = async (uid: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
};

export const updateTeacherProfile = async (uid: string, data: Partial<UserProfile>) => {
  const userRef = doc(db, "users", uid);
  await updateDoc(userRef, {
    ...data,
    lastActiveAt: serverTimestamp(),
  });
};

/**
 * Orchestrates uploading a new avatar and updating the teacher profile in Firestore.
 * @param uid The teacher's UID.
 * @param file The image file.
 * @returns The new download URL.
 */
export const updateTeacherAvatarWithUpload = async (uid: string, file: File): Promise<string> => {
  const downloadUrl = await uploadTeacherAvatar(uid, file);
  await updateTeacherProfile(uid, { avatar: downloadUrl });
  return downloadUrl;
};

export const getTeacherStats = async (uid: string): Promise<TeacherStats | null> => {
  const snap = await getDoc(doc(db, "users", uid, "teacher_stats", "overview"));
  return snap.exists() ? (snap.data() as TeacherStats) : null;
};

export const createTeacherProfile = async (userId: string, name: string, email: string) => {
  const now = serverTimestamp();
  const userRef = doc(db, "users", userId);
  
  await setDoc(userRef, {
    userId,
    name,
    email,
    avatar: "",
    role: "teacher",
    createdAt: now,
    lastActiveAt: now,
    teacherProfile: {
      experience: "",
      expertise: [],
      bio: "",
      totalCourses: 0,
      totalStudents: 0,
    },
  });

  const statsRef = doc(db, "users", userId, "teacher_stats", "overview");
  await setDoc(statsRef, {
    totalCourses: 0,
    activeStudents: 0,
    totalStudents: 0,
    lastUpdated: now,
  });
};

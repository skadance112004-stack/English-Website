import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from "firebase/storage";
import { storage } from "../firebase/firebase";

/**
 * Uploads a file to Firebase Storage and returns the download URL.
 * @param file The file to upload.
 * @param path The path in storage where the file should be saved (e.g., 'avatars/uid.png').
 * @returns A promise that resolves to the download URL.
 */
export const uploadFile = async (file: File, path: string): Promise<string> => {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
};

/**
 * Deletes a file from Firebase Storage.
 * @param path The path in storage of the file to delete.
 */
export const deleteFile = async (path: string): Promise<void> => {
  const storageRef = ref(storage, path);
  await deleteObject(storageRef);
};

/**
 * Helper to upload a teacher avatar.
 * @param uid The teacher's UID.
 * @param file The image file.
 */
export const uploadTeacherAvatar = async (uid: string, file: File): Promise<string> => {
  const extension = file.name.split('.').pop();
  const path = `teachers/${uid}/avatar.${extension}`;
  return await uploadFile(file, path);
};

/**
 * Helper to upload a course thumbnail.
 * @param teacherUid The teacher's UID.
 * @param courseId The course ID (or a temporary ID/timestamp).
 * @param file The image file.
 */
export const uploadCourseThumbnail = async (teacherUid: string, courseId: string, file: File): Promise<string> => {
  const extension = file.name.split('.').pop();
  const path = `teachers/${teacherUid}/courses/${courseId}/thumbnail.${extension}`;
  return await uploadFile(file, path);
};

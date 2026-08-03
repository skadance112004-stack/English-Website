import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from "firebase/storage";
import { storage, auth } from "../firebase/firebase";

/**
 * Uploads a file to Firebase Storage and returns the download URL.
 * @param file The file to upload.
 * @param path The path in storage where the file should be saved (e.g., 'avatars/uid.png').
 * @returns A promise that resolves to the download URL.
 */
export const uploadFile = async (file: File, path: string): Promise<string> => {
  const storageRef = ref(storage, path);
  const metadata = {
    ...(file.type ? { contentType: file.type } : {}),
    ...(auth.currentUser ? { customMetadata: { uploaderUid: auth.currentUser.uid } } : {}),
  };
  await uploadBytes(storageRef, file, metadata);
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
  // A stable path prevents one abandoned object per file extension when a photo changes.
  const path = `teachers/${uid}/avatar`;
  return await uploadFile(file, path);
};

/** Delete the current avatar, accepting either a Storage download URL or its storage path. */
export const deleteTeacherAvatar = async (avatarUrlOrPath: string): Promise<void> => {
  if (!avatarUrlOrPath) return;
  try {
    await deleteObject(ref(storage, avatarUrlOrPath));
  } catch (error: any) {
    // Treat a missing object as already removed, while preserving real permission/network failures.
    if (error?.code !== "storage/object-not-found") throw error;
  }
};

export const isCanonicalTeacherAvatar = (avatarUrl: string, uid: string): boolean => {
  if (!avatarUrl) return false;
  try {
    return ref(storage, avatarUrl).fullPath === `teachers/${uid}/avatar`;
  } catch {
    return false;
  }
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

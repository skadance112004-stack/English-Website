// src/firebase/authService.ts
import { 
  createUserWithEmailAndPassword, 
  updateProfile, 
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "./firebase";
import { createTeacherProfile, getTeacherProfile } from "../models/teacherModel";

// Logic for Email/Password Sign Up
export const signUpTeacherWithEmail = async (form: any) => {
  const fullName = `${form.firstName} ${form.lastName}`.trim();
  
  // 1. Create Auth User
  const userCred = await createUserWithEmailAndPassword(
    auth,
    form.email,
    form.password
  );

  // 2. Update Auth Profile (Display Name)
  await updateProfile(userCred.user, {
    displayName: fullName,
  });

  // 3. Create Firestore Entry
  await createTeacherProfile(userCred.user.uid, fullName, form.email);

  return userCred.user;
};

// Ensure teacher profile exists
const ensureTeacherProfile = async (user: any) => {
  const profile = await getTeacherProfile(user.uid);
  if (!profile) {
    await createTeacherProfile(
      user.uid, 
      user.displayName || "New Teacher", 
      user.email || ""
    );
  }
};

// Logic for Google Sign In / Sign Up
export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  
  await ensureTeacherProfile(result.user);
  return result.user;
};

// Kept for backwards compatibility
export const signUpWithGoogle = signInWithGoogle;

// Logic for Facebook Sign In / Sign Up
export const signInWithFacebook = async () => {
  const provider = new FacebookAuthProvider();
  const result = await signInWithPopup(auth, provider);
  
  await ensureTeacherProfile(result.user);
  return result.user;
};

// Logic for Password Reset
export const resetPassword = async (email: string) => {
  return await sendPasswordResetEmail(auth, email);
};


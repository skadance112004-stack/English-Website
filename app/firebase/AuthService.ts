// src/firebase/authService.ts
import { 
  createUserWithEmailAndPassword, 
  updateProfile, 
  GoogleAuthProvider, 
  signInWithPopup,
} from "firebase/auth";
import { auth } from "./firebase";
import { createTeacherProfile } from "../models/teacherModel";

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

// Logic for Google Sign Up
export const signUpWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  
  // Only create DB entry if it's a brand new user
  const isNewUser = result.user.metadata.creationTime === result.user.metadata.lastSignInTime;
  
  if (isNewUser) {
    await createTeacherProfile(
      result.user.uid, 
      result.user.displayName || "New Teacher", 
      result.user.email || ""
    );
  }
  return result.user;
};

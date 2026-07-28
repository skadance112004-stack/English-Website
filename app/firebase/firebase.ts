import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// For Vite, use import.meta.env
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBFHxVwb1y7c_LvTEjzLbfBAm9F8B8YDec",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "english-learning-cb841.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "english-learning-cb841",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "english-learning-cb841.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "472623890763",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:472623890763:web:49cefe04bdb6703b5228ce",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-KF7B3750ES"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export default app;
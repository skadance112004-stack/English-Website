import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyBFHxVwb1y7c_LvTEjzLbfBAm9F8B8YDec",
  authDomain: "english-learning-cb841.firebaseapp.com",
  projectId: "english-learning-cb841",
  storageBucket: "english-learning-cb841.firebasestorage.app",
  messagingSenderId: "472623890763",
  appId: "1:472623890763:web:49cefe04bdb6703b5228ce",
  measurementId: "G-KF7B3750ES"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export default app;
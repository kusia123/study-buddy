import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDenZCDT2ojMb-GLzKkElOAmbuWWKqnNUQ",
  authDomain: "study-buddy-ded85.firebaseapp.com",
  projectId: "study-buddy-ded85",
  storageBucket: "study-buddy-ded85.firebasestorage.app",
  messagingSenderId: "462608951622",
  appId: "1:462608951622:web:76c5257b8c0adb4b4f1d47"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Auth helpers
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logOut = () => signOut(auth);
export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);

// Firestore helpers — save/load user data
export const saveUserData = async (uid, data) => {
  try {
    await setDoc(doc(db, "users", uid), data, { merge: true });
  } catch (e) {
    console.error("Save failed:", e);
  }
};

export const loadUserData = async (uid) => {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error("Load failed:", e);
    return null;
  }
};
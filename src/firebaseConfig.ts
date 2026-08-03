import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  projectId: "app-productividad-54955",
  appId: "1:261671365641:web:6b43ce1fac05993c79dcd8",
  apiKey: "AIzaSyAaE4DdRcccl5tcnownqe-dEPPh1CURyJI",
  authDomain: "app-productividad-54955.firebaseapp.com",
  storageBucket: "app-productividad-54955.firebasestorage.app",
  messagingSenderId: "261671365641",
  measurementId: ""
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore
export const db = getFirestore(app, "ai-studio-focusflow-1fca40e6-32c0-45ea-8748-5742e0617783");

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
    console.warn('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
  } else if (err.code == 'unimplemented') {
    console.warn('The current browser does not support all of the features required to enable persistence');
  }
});

// Auth helper functions
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

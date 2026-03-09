import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Firebase configuration
const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_API_KEY !== 'undefined') ? import.meta.env.VITE_FIREBASE_API_KEY : "AIzaSyBwlZOsjFegMLwgZn5DhczD_z-y-H2t7g4",
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN && import.meta.env.VITE_FIREBASE_AUTH_DOMAIN !== 'undefined') ? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN : "jcpsacadamicsubteachpro.firebaseapp.com",
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_FIREBASE_PROJECT_ID !== 'undefined') ? import.meta.env.VITE_FIREBASE_PROJECT_ID : "jcpsacadamicsubteachpro",
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET && import.meta.env.VITE_FIREBASE_STORAGE_BUCKET !== 'undefined') ? import.meta.env.VITE_FIREBASE_STORAGE_BUCKET : "jcpsacadamicsubteachpro.firebasestorage.app",
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID && import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID !== 'undefined') ? import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID : "1054145930017",
  appId: (import.meta.env.VITE_FIREBASE_APP_ID && import.meta.env.VITE_FIREBASE_APP_ID !== 'undefined') ? import.meta.env.VITE_FIREBASE_APP_ID : "1:1054145930017:web:774d79061ad1fc2c7e5460"
};

// Initialize Firebase
let app;
try {
  console.log("Firebase config:", firebaseConfig);
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'undefined' || firebaseConfig.apiKey === '') {
    console.warn("Firebase API Key is missing. Real-time features will be disabled. Please set VITE_FIREBASE_API_KEY in your environment variables to enable cloud sync.");
  } else {
    app = initializeApp(firebaseConfig);
    console.log("Firebase app initialized:", app);
  }
} catch (error) {
  console.error("Firebase initialization failed:", error);
}

// Initialize Firestore and Auth
export const db = app ? getFirestore(app) : null as any;
export const auth = app ? getAuth(app) : null as any;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export default app;

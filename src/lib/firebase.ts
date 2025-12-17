import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

/**
 * Firebase initialization using Vite environment variables.
 *
 * The values here are derived from the original firebaseConfig.js:
 *
 *   apiKey:            VITE_FIREBASE_API_KEY
 *   authDomain:        VITE_FIREBASE_AUTH_DOMAIN
 *   projectId:         VITE_FIREBASE_PROJECT_ID
 *   storageBucket:     VITE_FIREBASE_STORAGE_BUCKET
 *   messagingSenderId: VITE_FIREBASE_MESSAGING_SENDER_ID
 *   appId:             VITE_FIREBASE_APP_ID
 *   measurementId:     VITE_FIREBASE_MEASUREMENT_ID
 *
 * Create a local .env (or .env.local) file and set these variables accordingly.
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

let app: FirebaseApp;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

export const db = getFirestore(app);



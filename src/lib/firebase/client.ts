import { config } from "@/lib/config";
import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";
import { type Firestore, getFirestore } from "firebase/firestore";

// Next.js hot-reloads client modules in dev; reuse the existing app instance
// instead of calling initializeApp() again (Firebase throws if you don't).
const app: FirebaseApp = getApps()[0] ?? initializeApp(config.firebase);

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

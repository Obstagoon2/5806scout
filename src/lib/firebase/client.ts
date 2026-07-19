import { config } from "@/lib/config";
import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";
import {
  type Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

// Next.js hot-reloads client modules in dev; reuse the existing app instance
// instead of calling initializeApp() again (Firebase throws if you don't).
const app: FirebaseApp = getApps()[0] ?? initializeApp(config.firebase);

export const auth: Auth = getAuth(app);

// IndexedDB-backed offline cache: reads serve cached data and writes queue
// locally when the venue has no signal (the normal state at an FRC event),
// then sync on reconnect. The multi-tab manager keeps several open tabs
// consistent. initializeFirestore throws if Firestore already exists for the
// app (dev hot reload) — fall back to the existing instance.
function createDb(): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    return getFirestore(app);
  }
}

export const db: Firestore = createDb();

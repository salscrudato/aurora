/**
 * AuroraNotes API - Firestore Database Connection
 *
 * Provides a singleton Firestore instance for the application.
 * Initializes Firebase Admin SDK and exports the database getter.
 */

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { PROJECT_ID } from "./config";

let app: App | null = null;
let db: Firestore | null = null;

/**
 * Initialize Firebase Admin SDK if not already initialized
 */
function initializeFirebase(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // In production (Cloud Run), use default credentials
  // In development, use GOOGLE_APPLICATION_CREDENTIALS env var
  const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (serviceAccount) {
    // Local development with service account file
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: PROJECT_ID,
    });
  } else {
    // Production: use default credentials (Cloud Run service account)
    return initializeApp({
      projectId: PROJECT_ID,
    });
  }
}

/**
 * Get the Firestore database instance
 *
 * Lazily initializes Firebase Admin SDK on first call.
 * Returns the same instance for subsequent calls.
 */
export function getDb(): Firestore {
  if (!db) {
    if (!app) {
      app = initializeFirebase();
    }
    db = getFirestore(app);

    // Enable settings for better performance
    db.settings({
      ignoreUndefinedProperties: true,
    });
  }
  return db;
}

/**
 * Get the Firebase Admin App instance
 */
export function getApp(): App {
  if (!app) {
    app = initializeFirebase();
  }
  return app;
}


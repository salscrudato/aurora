/**
 * AuroraNotes API - Firestore Database Connection
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { PROJECT_ID } from "./config";

let db: Firestore | null = null;

function getOrInitApp() {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return initializeApp(
    serviceAccount
      ? { credential: cert(serviceAccount), projectId: PROJECT_ID }
      : { projectId: PROJECT_ID }
  );
}

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getOrInitApp());
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

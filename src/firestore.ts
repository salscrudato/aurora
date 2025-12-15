import admin from "firebase-admin";

let app: admin.app.App | null = null;

export function getDb() {
  if (!app) {
    // On Cloud Run, default credentials are provided via the service account.
    app = admin.initializeApp();
  }
  return admin.firestore();
}
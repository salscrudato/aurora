import admin from "firebase-admin";

let app: admin.app.App | null = null;

export function getDb() {
  if (!app) {
    // On Cloud Run, default credentials are provided via the service account.
    // Use GOOGLE_CLOUD_PROJECT env var to ensure we connect to the correct project.
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

    if (projectId) {
      app = admin.initializeApp({
        projectId: projectId,
      });
    } else {
      // Fallback to default (will use metadata server project)
      app = admin.initializeApp();
    }
  }
  return admin.firestore();
}
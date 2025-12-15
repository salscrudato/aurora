/**
 * Backfill script to set missing tenantId fields on notes
 * 
 * This script is required for proper pagination with the tenantId index.
 * After running this script, all notes will have a tenantId field.
 * 
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *   npx ts-node scripts/backfill-tenant-ids.ts [default-tenant-id]
 * 
 * Options:
 *   default-tenant-id: The tenantId to assign to notes without one (default: 'public')
 * 
 * Required Firestore Index (create after backfill):
 *   Collection: notes
 *   Fields: tenantId ASC, createdAt DESC, __name__ DESC
 */

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "../src/firestore";

const DEFAULT_TENANT = process.argv[2] || 'public';
const BATCH_SIZE = 400; // Firestore batch limit is 500

interface NoteDoc {
  id: string;
  text: string;
  tenantId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

async function backfillTenantIds(): Promise<void> {
  console.log('🔧 TenantId Backfill Script\n');
  console.log(`Default tenantId: ${DEFAULT_TENANT}`);
  console.log(`Batch size: ${BATCH_SIZE}\n`);
  console.log('─'.repeat(60));

  const db = getDb();
  let processedCount = 0;
  let updatedCount = 0;
  let batchCount = 0;

  // Get all notes that don't have tenantId or have it as undefined
  // Note: Firestore doesn't have a "field does not exist" query,
  // so we fetch all and filter client-side
  let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  let hasMore = true;

  while (hasMore) {
    let query = db.collection('notes')
      .orderBy('createdAt', 'desc')
      .limit(BATCH_SIZE);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    let batchUpdates = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data() as NoteDoc;
      processedCount++;

      // Check if tenantId is missing or undefined
      if (!data.tenantId) {
        batch.update(doc.ref, { tenantId: DEFAULT_TENANT });
        batchUpdates++;
        updatedCount++;
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    hasMore = snapshot.docs.length === BATCH_SIZE;

    // Commit batch if we have updates
    if (batchUpdates > 0) {
      await batch.commit();
      batchCount++;
      console.log(`Batch ${batchCount}: Updated ${batchUpdates} notes (total: ${updatedCount})`);
    } else {
      console.log(`Scanned ${processedCount} notes, no updates needed in this batch`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📊 BACKFILL COMPLETE\n');
  console.log(`Total notes scanned: ${processedCount}`);
  console.log(`Notes updated: ${updatedCount}`);
  console.log(`Batches committed: ${batchCount}`);

  if (updatedCount > 0) {
    console.log(`\n✅ All notes now have tenantId="${DEFAULT_TENANT}"`);
    console.log('\n📝 Next steps:');
    console.log('1. Create the composite index in Firestore:');
    console.log('   Collection: notes');
    console.log('   Fields: tenantId ASC, createdAt DESC, __name__ DESC');
    console.log('\n2. Verify with: npx ts-node scripts/test-api-contracts.ts');
  } else {
    console.log('\n✅ All notes already have tenantId set');
  }
}

// Also backfill noteChunks collection
async function backfillChunkTenantIds(): Promise<void> {
  console.log('\n\n🔧 Backfilling noteChunks collection...\n');
  console.log('─'.repeat(60));

  const db = getDb();
  let processedCount = 0;
  let updatedCount = 0;
  let batchCount = 0;
  let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  let hasMore = true;

  while (hasMore) {
    let query = db.collection('noteChunks')
      .orderBy('createdAt', 'desc')
      .limit(BATCH_SIZE);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    let batchUpdates = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      processedCount++;

      if (!data.tenantId) {
        batch.update(doc.ref, { tenantId: DEFAULT_TENANT });
        batchUpdates++;
        updatedCount++;
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    hasMore = snapshot.docs.length === BATCH_SIZE;

    if (batchUpdates > 0) {
      await batch.commit();
      batchCount++;
      console.log(`Batch ${batchCount}: Updated ${batchUpdates} chunks`);
    }
  }

  console.log(`\nChunks scanned: ${processedCount}, updated: ${updatedCount}`);
}

async function main() {
  try {
    await backfillTenantIds();
    await backfillChunkTenantIds();
    console.log('\n🎉 All backfills complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }
}

main();


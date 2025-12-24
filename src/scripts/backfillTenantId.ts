/**
 * Backfill Script: Add tenantId to Legacy Documents
 * 
 * This script finds all notes and chunks that lack a tenantId and assigns them
 * to a specified tenant. Run this BEFORE enabling strict tenant isolation.
 * 
 * Usage:
 *   npx ts-node src/scripts/backfillTenantId.ts --tenant=USER_UID [--dry-run] [--batch-size=400]
 * 
 * Options:
 *   --tenant=USER_UID    Required. The tenant ID to assign to orphaned documents
 *   --dry-run            List documents without modifying them
 *   --batch-size=N       Documents per batch (default: 400, max: 500)
 * 
 * IMPORTANT: This is a one-time migration script. After running, all documents
 * will have proper tenantId values and the legacy 'public' default will be removed.
 */

import admin from 'firebase-admin';

// Initialize Firebase Admin (uses GOOGLE_APPLICATION_CREDENTIALS or default credentials)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const NOTES_COLLECTION = process.env.NOTES_COLLECTION || 'notes';
const CHUNKS_COLLECTION = process.env.CHUNKS_COLLECTION || 'noteChunks';

interface BackfillOptions {
  tenantId: string;
  dryRun: boolean;
  batchSize: number;
}

async function findOrphanedDocs(collection: string): Promise<string[]> {
  const orphaned: string[] = [];
  
  // Query docs where tenantId doesn't exist or is empty
  // Firestore doesn't have a "field not exists" query, so we check for common patterns
  const allDocs = await db.collection(collection).limit(10000).get();
  
  for (const doc of allDocs.docs) {
    const data = doc.data();
    if (!data.tenantId || data.tenantId === '' || data.tenantId === 'public') {
      orphaned.push(doc.id);
    }
  }
  
  return orphaned;
}

async function backfillCollection(
  collection: string,
  orphanedIds: string[],
  options: BackfillOptions
): Promise<{ updated: number; errors: number }> {
  let updated = 0;
  let errors = 0;
  
  console.log(`\n📦 Processing ${collection}: ${orphanedIds.length} documents`);
  
  if (options.dryRun) {
    console.log('   (DRY RUN - no changes will be made)');
    for (const id of orphanedIds.slice(0, 10)) {
      console.log(`   - ${id}`);
    }
    if (orphanedIds.length > 10) {
      console.log(`   ... and ${orphanedIds.length - 10} more`);
    }
    return { updated: 0, errors: 0 };
  }
  
  // Process in batches
  for (let i = 0; i < orphanedIds.length; i += options.batchSize) {
    const batchIds = orphanedIds.slice(i, i + options.batchSize);
    const batch = db.batch();
    
    for (const id of batchIds) {
      const ref = db.collection(collection).doc(id);
      batch.update(ref, { 
        tenantId: options.tenantId,
        _backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    
    try {
      await batch.commit();
      updated += batchIds.length;
      console.log(`   ✓ Batch ${Math.floor(i / options.batchSize) + 1}: updated ${batchIds.length} docs`);
    } catch (err) {
      errors += batchIds.length;
      console.error(`   ✗ Batch ${Math.floor(i / options.batchSize) + 1} failed:`, err);
    }
  }
  
  return { updated, errors };
}

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  let tenantId = '';
  let dryRun = false;
  let batchSize = 400;
  
  for (const arg of args) {
    if (arg.startsWith('--tenant=')) {
      tenantId = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--batch-size=')) {
      batchSize = Math.min(500, Math.max(1, parseInt(arg.split('=')[1], 10) || 400));
    }
  }
  
  if (!tenantId) {
    console.error('Error: --tenant=USER_UID is required');
    console.error('Usage: npx ts-node src/scripts/backfillTenantId.ts --tenant=USER_UID [--dry-run]');
    process.exit(1);
  }
  
  return { tenantId, dryRun, batchSize };
}

async function main() {
  const options = parseArgs();
  
  console.log('🔧 TenantId Backfill Script');
  console.log('===========================');
  console.log(`Target Tenant: ${options.tenantId}`);
  console.log(`Dry Run: ${options.dryRun}`);
  console.log(`Batch Size: ${options.batchSize}`);
  
  // Find orphaned documents
  console.log('\n🔍 Scanning for documents without tenantId...');
  
  const [orphanedNotes, orphanedChunks] = await Promise.all([
    findOrphanedDocs(NOTES_COLLECTION),
    findOrphanedDocs(CHUNKS_COLLECTION),
  ]);
  
  console.log(`   Found ${orphanedNotes.length} notes without tenantId`);
  console.log(`   Found ${orphanedChunks.length} chunks without tenantId`);
  
  if (orphanedNotes.length === 0 && orphanedChunks.length === 0) {
    console.log('\n✅ All documents have tenantId - no migration needed!');
    process.exit(0);
  }
  
  // Backfill
  const [notesResult, chunksResult] = await Promise.all([
    backfillCollection(NOTES_COLLECTION, orphanedNotes, options),
    backfillCollection(CHUNKS_COLLECTION, orphanedChunks, options),
  ]);
  
  // Summary
  console.log('\n📊 Summary');
  console.log('==========');
  console.log(`Notes:  ${notesResult.updated} updated, ${notesResult.errors} errors`);
  console.log(`Chunks: ${chunksResult.updated} updated, ${chunksResult.errors} errors`);
  
  if (options.dryRun) {
    console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Backfill complete!');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


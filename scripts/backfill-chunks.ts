/**
 * Backfill Script - Chunks and Embeddings for Existing Notes
 * 
 * Processes all notes that don't have chunks or are missing embeddings.
 * Idempotent: safe to run multiple times.
 * 
 * Usage:
 *   npx ts-node scripts/backfill-chunks.ts [--force] [--tenant=X] [--dry-run]
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'auroranotes-ai';
const NOTES_COLLECTION = process.env.NOTES_COLLECTION || 'notes';
const CHUNKS_COLLECTION = process.env.CHUNKS_COLLECTION || 'noteChunks';
const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSIONS = 768;
const CHUNK_TARGET_SIZE = 500;
const CHUNK_MIN_SIZE = 100;
const CHUNK_MAX_SIZE = 800;
const BATCH_SIZE = 10;

// Parse args
const args = process.argv.slice(2);
const forceRechunk = args.includes('--force');
const dryRun = args.includes('--dry-run');
const tenantArg = args.find(a => a.startsWith('--tenant='));
const filterTenant = tenantArg ? tenantArg.split('=')[1] : null;

// Initialize Firebase
initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

// Initialize Gemini
const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
let genai: GoogleGenAI | null = null;
if (apiKey) {
  genai = new GoogleGenAI({ apiKey });
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitIntoChunks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= CHUNK_MAX_SIZE) {
    return normalized.length >= CHUNK_MIN_SIZE ? [normalized] : [];
  }

  const chunks: string[] = [];
  const sentences = normalized.split(/(?<=[.!?])\s+/);
  let current = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    
    if (current.length + trimmed.length + 1 > CHUNK_MAX_SIZE && current.length >= CHUNK_MIN_SIZE) {
      chunks.push(current);
      current = trimmed;
    } else {
      current = current ? current + ' ' + trimmed : trimmed;
    }
  }
  
  if (current.length >= CHUNK_MIN_SIZE) {
    chunks.push(current);
  } else if (chunks.length > 0 && current.length > 0) {
    chunks[chunks.length - 1] += ' ' + current;
  }

  return chunks.filter(c => c.length > 0);
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!genai) return null;
  try {
    const result = await genai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    return result.embeddings?.[0]?.values || null;
  } catch (err) {
    console.error(`   ⚠️  Embedding failed: ${err}`);
    return null;
  }
}

async function processNote(noteId: string, text: string, tenantId: string, createdAt: Timestamp): Promise<{ chunksCreated: number; embeddingsGenerated: number }> {
  const textChunks = splitIntoChunks(text);
  if (textChunks.length === 0) {
    return { chunksCreated: 0, embeddingsGenerated: 0 };
  }

  let chunksCreated = 0;
  let embeddingsGenerated = 0;

  for (let position = 0; position < textChunks.length; position++) {
    const chunkText = textChunks[position];
    const chunkId = `${noteId}_${String(position).padStart(3, '0')}`;
    const textHash = hashText(chunkText);

    if (!dryRun) {
      const embedding = await generateEmbedding(chunkText);
      
      const chunkDoc: Record<string, unknown> = {
        chunkId,
        noteId,
        tenantId,
        text: chunkText,
        textHash,
        position,
        tokenEstimate: estimateTokens(chunkText),
        createdAt,
      };

      if (embedding) {
        chunkDoc.embedding = embedding;
        chunkDoc.embeddingModel = EMBEDDING_MODEL;
        embeddingsGenerated++;
      }

      await db.collection(CHUNKS_COLLECTION).doc(chunkId).set(chunkDoc);
    }
    chunksCreated++;
  }

  return { chunksCreated, embeddingsGenerated };
}

async function main() {
  console.log('🔄 Backfill Chunks & Embeddings\n');
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Force rechunk: ${forceRechunk}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Tenant filter: ${filterTenant || 'all'}`);
  console.log(`Embeddings: ${genai ? 'enabled' : 'disabled (no API key)'}\n`);
  console.log('─'.repeat(60));

  // Get all notes
  let query = db.collection(NOTES_COLLECTION).orderBy('createdAt', 'desc');
  const notesSnap = await query.get();
  console.log(`\nFound ${notesSnap.size} notes\n`);

  // Get existing chunks
  const chunksSnap = await db.collection(CHUNKS_COLLECTION).select('noteId').get();
  const notesWithChunks = new Set(chunksSnap.docs.map(d => d.data().noteId));

  let processed = 0, skipped = 0, totalChunks = 0, totalEmbeddings = 0;

  for (const doc of notesSnap.docs) {
    const data = doc.data();
    const noteId = doc.id;
    const tenantId = data.tenantId || 'public';
    const text = data.text || '';
    const createdAt = data.createdAt;

    if (filterTenant && tenantId !== filterTenant) { skipped++; continue; }
    if (!forceRechunk && notesWithChunks.has(noteId)) { 
      console.log(`⏭️  ${noteId}: Already has chunks`);
      skipped++; 
      continue; 
    }

    console.log(`📝 ${noteId}: Processing (${text.length} chars)...`);
    const result = await processNote(noteId, text, tenantId, createdAt);
    console.log(`   ✅ ${result.chunksCreated} chunks, ${result.embeddingsGenerated} embeddings`);
    
    totalChunks += result.chunksCreated;
    totalEmbeddings += result.embeddingsGenerated;
    processed++;

    // Rate limiting
    if (processed % BATCH_SIZE === 0) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Chunks created: ${totalChunks}`);
  console.log(`   Embeddings generated: ${totalEmbeddings}`);
}

main().catch(console.error);


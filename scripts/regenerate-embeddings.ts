/**
 * Script to regenerate embeddings for existing chunks
 * 
 * Run this to add embeddings to chunks that were created before the API key was configured
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'auroranotes-ai-251214-21398';
const CHUNKS_COLLECTION = 'noteChunks';
const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSIONS = 768;

// Initialize Firebase
initializeApp({
  projectId: PROJECT_ID,
});

const db = getFirestore();

// Initialize Gemini
const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌ GOOGLE_API_KEY or GEMINI_API_KEY required');
  process.exit(1);
}

const genai = new GoogleGenAI({ apiKey });

async function generateEmbedding(text: string): Promise<number[]> {
  const result = await genai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });
  
  if (result.embeddings && result.embeddings.length > 0 && result.embeddings[0].values) {
    return result.embeddings[0].values;
  }
  
  throw new Error('No embedding values in response');
}

async function main() {
  console.log('🔄 Regenerating embeddings for chunks...\n');
  
  // Get all chunks
  const snapshot = await db.collection(CHUNKS_COLLECTION).get();
  
  console.log(`Found ${snapshot.size} chunks\n`);
  
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const chunkId = doc.id;
    
    // Skip if already has embedding
    if (data.embedding && Array.isArray(data.embedding) && data.embedding.length > 0) {
      console.log(`⏭️  ${chunkId}: Already has embedding`);
      skipped++;
      continue;
    }
    
    try {
      console.log(`📝 ${chunkId}: Generating embedding...`);
      const embedding = await generateEmbedding(data.text);
      
      await doc.ref.update({
        embedding,
        embeddingModel: EMBEDDING_MODEL,
      });
      
      console.log(`✅ ${chunkId}: Updated with ${embedding.length}-dim embedding`);
      updated++;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      console.error(`❌ ${chunkId}: Failed - ${err}`);
      failed++;
    }
  }
  
  console.log('\n─'.repeat(40));
  console.log(`\n📊 Summary:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total: ${snapshot.size}`);
}

main().catch(console.error);


/**
 * AuroraNotes API - Chunking Pipeline
 *
 * Splits notes into semantic chunks for embedding and retrieval.
 * Uses improved semantic boundary detection and context preservation.
 */

import { FieldValue, Timestamp, WriteBatch } from "firebase-admin/firestore";
import { getDb } from "./firestore";
import {
  CHUNKS_COLLECTION,
  CHUNK_TARGET_SIZE,
  CHUNK_MIN_SIZE,
  CHUNK_MAX_SIZE,
  CHUNK_OVERLAP,
  EMBEDDINGS_ENABLED,
} from "./config";
import { NoteDoc, ChunkDoc } from "./types";
import { hashText, estimateTokens, logInfo, logError } from "./utils";
import { generateEmbeddings } from "./embeddings";

// Semantic boundary patterns (ordered by preference)
const PARAGRAPH_BOUNDARY = /\n\n+/;
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-Z])/;
const LIST_BOUNDARY = /\n(?=[-*•]|\d+\.)/;
const COLON_BOUNDARY = /:\s*\n/;

/**
 * Split text into semantic units (paragraphs, then sentences)
 */
function splitIntoSemanticUnits(text: string): string[] {
  // First split by paragraphs
  const paragraphs = text.split(PARAGRAPH_BOUNDARY).filter(p => p.trim());

  const units: string[] = [];

  for (const para of paragraphs) {
    // If paragraph is small enough, keep it as one unit
    if (para.length <= CHUNK_TARGET_SIZE) {
      units.push(para.trim());
    } else {
      // Split long paragraphs into sentences
      const sentences = para.split(/(?<=[.!?])\s+/).filter(s => s.trim());
      units.push(...sentences.map(s => s.trim()));
    }
  }

  return units;
}

/**
 * Split text into chunks using improved semantic boundary detection
 */
export function splitIntoChunks(text: string): string[] {
  const normalizedText = text.replace(/\r\n/g, '\n').trim();

  // Short text: return as single chunk if it meets minimum size
  if (normalizedText.length <= CHUNK_MAX_SIZE) {
    return normalizedText.length >= CHUNK_MIN_SIZE ? [normalizedText] : [];
  }

  const units = splitIntoSemanticUnits(normalizedText);
  const chunks: string[] = [];
  let currentChunk = '';
  let previousContext = ''; // Store context for overlap

  for (const unit of units) {
    const trimmedUnit = unit.trim();
    if (!trimmedUnit) continue;

    const potentialLength = currentChunk.length + (currentChunk ? 1 : 0) + trimmedUnit.length;

    // If adding this unit exceeds max, finalize current chunk
    if (potentialLength > CHUNK_MAX_SIZE && currentChunk.length >= CHUNK_MIN_SIZE) {
      chunks.push(currentChunk);

      // Create overlap context from the end of previous chunk
      previousContext = extractOverlapContext(currentChunk, CHUNK_OVERLAP);
      currentChunk = previousContext ? previousContext + ' ' + trimmedUnit : trimmedUnit;
    } else if (potentialLength > CHUNK_MAX_SIZE && currentChunk.length < CHUNK_MIN_SIZE) {
      // Current chunk too small but adding unit exceeds max - force add
      currentChunk = currentChunk ? currentChunk + ' ' + trimmedUnit : trimmedUnit;

      // If now exceeds max, force split
      if (currentChunk.length > CHUNK_MAX_SIZE) {
        const splitPoint = findBestSplitPoint(currentChunk, CHUNK_TARGET_SIZE);
        chunks.push(currentChunk.slice(0, splitPoint).trim());
        previousContext = extractOverlapContext(currentChunk.slice(0, splitPoint), CHUNK_OVERLAP);
        currentChunk = previousContext + ' ' + currentChunk.slice(splitPoint).trim();
      }
    } else {
      // Add unit to current chunk
      currentChunk = currentChunk ? currentChunk + ' ' + trimmedUnit : trimmedUnit;
    }

    // Check if we're at a good size to finalize
    if (currentChunk.length >= CHUNK_TARGET_SIZE && currentChunk.length <= CHUNK_MAX_SIZE) {
      // Look for a natural break point
      const breakPoint = findNaturalBreak(currentChunk, CHUNK_TARGET_SIZE);
      if (breakPoint > CHUNK_MIN_SIZE && breakPoint < currentChunk.length - 50) {
        chunks.push(currentChunk.slice(0, breakPoint).trim());
        previousContext = extractOverlapContext(currentChunk.slice(0, breakPoint), CHUNK_OVERLAP);
        currentChunk = previousContext + ' ' + currentChunk.slice(breakPoint).trim();
      }
    }
  }

  // Handle remaining text
  if (currentChunk.trim()) {
    if (currentChunk.length >= CHUNK_MIN_SIZE) {
      chunks.push(currentChunk.trim());
    } else if (chunks.length > 0) {
      // Merge small remainder with last chunk if possible
      const lastChunk = chunks[chunks.length - 1];
      if (lastChunk.length + currentChunk.length + 1 <= CHUNK_MAX_SIZE) {
        chunks[chunks.length - 1] = lastChunk + ' ' + currentChunk.trim();
      } else {
        // Keep as separate chunk even if small
        chunks.push(currentChunk.trim());
      }
    } else {
      // Only chunk and it's small - keep it anyway
      chunks.push(currentChunk.trim());
    }
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Extract context for overlap, preferring sentence boundaries
 */
function extractOverlapContext(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const suffix = text.slice(-maxLength);

  // Try to start at a sentence boundary
  const sentenceStart = suffix.search(/(?<=[.!?])\s+/);
  if (sentenceStart > 10) {
    return suffix.slice(sentenceStart).trim();
  }

  // Fall back to word boundary
  const wordStart = suffix.indexOf(' ');
  if (wordStart > 0) {
    return suffix.slice(wordStart).trim();
  }

  return suffix.trim();
}

/**
 * Find the best split point near target, preferring sentence boundaries
 */
function findBestSplitPoint(text: string, target: number): number {
  const searchStart = Math.max(0, target - 100);
  const searchEnd = Math.min(text.length, target + 100);
  const window = text.slice(searchStart, searchEnd);

  // Prefer sentence endings
  const sentenceEnd = window.search(/[.!?]\s+/);
  if (sentenceEnd > 0) {
    return searchStart + sentenceEnd + 2;
  }

  // Fall back to comma or semicolon
  const clauseEnd = window.search(/[,;]\s+/);
  if (clauseEnd > 0) {
    return searchStart + clauseEnd + 2;
  }

  // Fall back to space
  const lastSpace = window.lastIndexOf(' ');
  if (lastSpace > 0) {
    return searchStart + lastSpace;
  }

  return target;
}

/**
 * Find a natural break point in text
 */
function findNaturalBreak(text: string, target: number): number {
  return findBestSplitPoint(text, target);
}

/**
 * Compute a hash of the full note text for idempotency checking
 */
function computeNoteTextHash(text: string): string {
  return hashText(text);
}

/**
 * Process a note into chunks and store them
 *
 * IDEMPOTENT: Skips processing if note text hasn't changed (based on hash).
 * Only regenerates embeddings for chunks that are missing them.
 */
export async function processNoteChunks(note: NoteDoc): Promise<void> {
  const db = getDb();
  const startTime = Date.now();
  const noteTextHash = computeNoteTextHash(note.text);

  try {
    // Fetch existing chunks for this note (with fallback if index missing)
    let existingChunks: ChunkDoc[] = [];
    try {
      const existingChunksSnap = await db
        .collection(CHUNKS_COLLECTION)
        .where('noteId', '==', note.id)
        .orderBy('position', 'asc')
        .get();
      existingChunks = existingChunksSnap.docs.map(d => d.data() as ChunkDoc);
    } catch (indexErr: unknown) {
      const errMsg = indexErr instanceof Error ? indexErr.message : String(indexErr);
      if (errMsg.includes('FAILED_PRECONDITION') || errMsg.includes('requires an index')) {
        // Fallback: query without orderBy, sort in memory
        const fallbackSnap = await db
          .collection(CHUNKS_COLLECTION)
          .where('noteId', '==', note.id)
          .get();
        existingChunks = fallbackSnap.docs
          .map(d => d.data() as ChunkDoc)
          .sort((a, b) => a.position - b.position);
      } else {
        throw indexErr;
      }
    }

    // Check if note text has changed by comparing content hashes
    // If chunks exist and their combined hashes match, skip reprocessing
    if (existingChunks.length > 0) {
      const existingHashes = existingChunks.map(c => c.textHash).join('|');
      const newTextChunks = splitIntoChunks(note.text);
      const newHashes = newTextChunks.map(t => hashText(t)).join('|');

      if (existingHashes === newHashes) {
        // Note hasn't changed - check if any chunks need embeddings
        const chunksMissingEmbeddings = existingChunks.filter(c => !c.embedding);

        if (chunksMissingEmbeddings.length === 0) {
          logInfo('Note unchanged and all embeddings present, skipping', {
            noteId: note.id,
            chunkCount: existingChunks.length,
          });
          return;
        }

        // Only regenerate missing embeddings
        if (EMBEDDINGS_ENABLED && chunksMissingEmbeddings.length > 0) {
          logInfo('Regenerating missing embeddings', {
            noteId: note.id,
            missingCount: chunksMissingEmbeddings.length,
            totalChunks: existingChunks.length,
          });

          try {
            const textsToEmbed = chunksMissingEmbeddings.map(c => c.text);
            const embeddings = await generateEmbeddings(textsToEmbed);

            const batch = db.batch();
            for (let i = 0; i < chunksMissingEmbeddings.length && i < embeddings.length; i++) {
              const chunkRef = db.collection(CHUNKS_COLLECTION).doc(chunksMissingEmbeddings[i].chunkId);
              batch.update(chunkRef, {
                embedding: embeddings[i],
                embeddingModel: 'text-embedding-004',
              });
            }
            await batch.commit();

            logInfo('Missing embeddings regenerated', {
              noteId: note.id,
              embeddingsAdded: Math.min(chunksMissingEmbeddings.length, embeddings.length),
              elapsedMs: Date.now() - startTime,
            });
          } catch (err) {
            logError('Embedding regeneration failed', err, { noteId: note.id });
          }
        }
        return;
      }
    }

    // Note has changed - full reprocessing required
    logInfo('Note changed, reprocessing chunks', {
      noteId: note.id,
      hadExistingChunks: existingChunks.length > 0,
    });

    // Delete existing chunks by fetching fresh references
    if (existingChunks.length > 0) {
      const deleteBatch = db.batch();
      for (const chunk of existingChunks) {
        const docRef = db.collection(CHUNKS_COLLECTION).doc(chunk.chunkId);
        deleteBatch.delete(docRef);
      }
      await deleteBatch.commit();
    }

    // Split note into chunks
    const textChunks = splitIntoChunks(note.text);

    if (textChunks.length === 0) {
      logInfo('Note too short for chunking', { noteId: note.id });
      return;
    }

    // Create chunk documents
    const chunks: ChunkDoc[] = textChunks.map((text, position) => ({
      chunkId: `${note.id}_${String(position).padStart(3, '0')}`,
      noteId: note.id,
      tenantId: note.tenantId,
      text,
      textHash: hashText(text),
      position,
      tokenEstimate: estimateTokens(text),
      createdAt: note.createdAt,
    }));

    // Generate embeddings if enabled
    if (EMBEDDINGS_ENABLED) {
      try {
        const embeddings = await generateEmbeddings(textChunks);
        for (let i = 0; i < chunks.length && i < embeddings.length; i++) {
          chunks[i].embedding = embeddings[i];
          chunks[i].embeddingModel = 'text-embedding-004';
        }
      } catch (err) {
        logError('Embedding generation failed', err, { noteId: note.id });
        // Continue without embeddings - retrieval will fall back to keyword search
      }
    }

    // Store chunks in batches (Firestore limit: 500 per batch)
    const BATCH_SIZE = 400;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);

      for (const chunk of batchChunks) {
        const ref = db.collection(CHUNKS_COLLECTION).doc(chunk.chunkId);
        batch.set(ref, chunk);
      }

      await batch.commit();
    }

    const elapsedMs = Date.now() - startTime;
    logInfo('Chunks processed', {
      noteId: note.id,
      chunkCount: chunks.length,
      hasEmbeddings: chunks[0]?.embedding !== undefined,
      elapsedMs,
    });
  } catch (err) {
    logError('Chunk processing failed', err, { noteId: note.id });
    throw err;
  }
}

/**
 * Get all chunks for a note
 */
export async function getChunksForNote(noteId: string): Promise<ChunkDoc[]> {
  const db = getDb();
  const snap = await db
    .collection(CHUNKS_COLLECTION)
    .where('noteId', '==', noteId)
    .orderBy('position', 'asc')
    .get();

  return snap.docs.map(d => d.data() as ChunkDoc);
}


/**
 * AuroraNotes API - Chunking Pipeline
 *
 * Splits notes into semantic chunks for embedding and retrieval.
 * Uses semantic boundary detection with context overlap for citation accuracy.
 *
 * Key features:
 * - Paragraph and sentence-aware splitting
 * - Configurable chunk sizes with overlap for context preservation
 * - Character offset tracking for precise citation anchoring
 * - Idempotent processing (skips unchanged notes)
 * - Vertex AI Vector Search integration
 */

import { getDb } from "./firestore";
import {
  CHUNKS_COLLECTION,
  CHUNK_TARGET_SIZE,
  CHUNK_MIN_SIZE,
  CHUNK_MAX_SIZE,
  CHUNK_OVERLAP,
  EMBEDDINGS_ENABLED,
  EMBEDDING_MODEL,
  VERTEX_VECTOR_SEARCH_ENABLED,
} from "./config";
import { NoteDoc, ChunkDoc } from "./types";
import { hashText, estimateTokens, logInfo, logError, logWarn, extractTermsForIndexing, TERMS_VERSION } from "./utils";
import { generateEmbeddings, EmbeddingError } from "./embeddings";
import { getVertexIndex, VertexDatapoint } from "./vectorIndex";

// =============================================================================
// Constants
// =============================================================================

/** Pattern for splitting text into paragraphs */
const PARAGRAPH_BOUNDARY = /\n\n+/;

/** Pattern for splitting text into sentences */
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;

/** Characters of context to include from adjacent chunks */
const CONTEXT_WINDOW_SIZE = 100;

/** Firestore batch size limit */
const FIRESTORE_BATCH_SIZE = 400;

// =============================================================================
// Types
// =============================================================================

/** Chunk with offset information for precise citation anchoring */
export interface ChunkWithOffset {
  text: string;
  startOffset: number;
  endOffset: number;
  anchor: string;
}

// =============================================================================
// Text Splitting Functions
// =============================================================================

/**
 * Split text into semantic units (paragraphs, then sentences).
 * Paragraphs are kept whole if under target size, otherwise split into sentences.
 */
function splitIntoSemanticUnits(text: string): string[] {
  const paragraphs = text.split(PARAGRAPH_BOUNDARY).filter(p => p.trim());
  const units: string[] = [];

  for (const para of paragraphs) {
    if (para.length <= CHUNK_TARGET_SIZE) {
      units.push(para.trim());
    } else {
      // Split long paragraphs into sentences
      const sentences = para.split(SENTENCE_BOUNDARY).filter(s => s.trim());
      units.push(...sentences.map(s => s.trim()));
    }
  }

  return units;
}

/**
 * Split text into chunks using improved semantic boundary detection
 * Returns chunks with character offset information for citation precision
 */
export function splitIntoChunksWithOffsets(text: string): ChunkWithOffset[] {
  const normalizedText = text.replace(/\r\n/g, '\n').trim();

  // Empty text: return nothing
  if (!normalizedText) {
    return [];
  }

  // Short text: return as single chunk (always index short notes for retrieval)
  if (normalizedText.length <= CHUNK_MAX_SIZE) {
    return [{
      text: normalizedText,
      startOffset: 0,
      endOffset: normalizedText.length,
      anchor: normalizedText.slice(0, 50),
    }];
  }

  // For longer text, we need to track offsets as we split
  const chunks = splitIntoChunksInternal(normalizedText);
  return calculateOffsets(normalizedText, chunks);
}

/**
 * Legacy function for backward compatibility
 */
export function splitIntoChunks(text: string): string[] {
  return splitIntoChunksWithOffsets(text).map(c => c.text);
}

/**
 * Calculate character offsets for chunks by finding them in the original text
 */
function calculateOffsets(originalText: string, chunks: string[]): ChunkWithOffset[] {
  const result: ChunkWithOffset[] = [];
  let searchStart = 0;

  for (const chunk of chunks) {
    // Find the chunk in the original text, starting from where we left off
    // Handle overlap by looking for the unique part of the chunk
    const chunkStart = originalText.indexOf(chunk.slice(0, 100), searchStart);

    if (chunkStart >= 0) {
      result.push({
        text: chunk,
        startOffset: chunkStart,
        endOffset: chunkStart + chunk.length,
        anchor: chunk.slice(0, 50),
      });
      // Move search start forward, but allow some overlap
      searchStart = chunkStart + Math.max(1, chunk.length - 100);
    } else {
      // Fallback: use approximate position
      result.push({
        text: chunk,
        startOffset: searchStart,
        endOffset: searchStart + chunk.length,
        anchor: chunk.slice(0, 50),
      });
      searchStart += chunk.length;
    }
  }

  return result;
}

/**
 * Internal function that does the actual splitting
 */
function splitIntoChunksInternal(normalizedText: string): string[] {

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
      const breakPoint = findBestSplitPoint(currentChunk, CHUNK_TARGET_SIZE);
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

// =============================================================================
// Note Processing
// =============================================================================

/**
 * Process a note into chunks and store them.
 *
 * IDEMPOTENT: Skips processing if note text hasn't changed (based on hash).
 * Only regenerates embeddings for chunks that are missing them.
 */
export async function processNoteChunks(note: NoteDoc): Promise<void> {
  const db = getDb();
  const startTime = Date.now();

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

        // Regenerate missing embeddings
        if (EMBEDDINGS_ENABLED) {
          await regenerateMissingEmbeddings(db, chunksMissingEmbeddings, note.id, startTime);
        }
        return;
      }
    }

    // Note has changed - full reprocessing required
    logInfo('Note changed, reprocessing chunks', {
      noteId: note.id,
      hadExistingChunks: existingChunks.length > 0,
    });

    // Compute old Vertex datapoint IDs for cleanup BEFORE deleting Firestore chunks
    const oldDatapointIds = existingChunks.map(chunk => `${chunk.chunkId}:${chunk.noteId}`);

    // Delete existing chunks from Firestore
    if (existingChunks.length > 0) {
      const deleteBatch = db.batch();
      for (const chunk of existingChunks) {
        const docRef = db.collection(CHUNKS_COLLECTION).doc(chunk.chunkId);
        deleteBatch.delete(docRef);
      }
      await deleteBatch.commit();
    }

    // Remove stale datapoints from Vertex index (best-effort, non-blocking)
    if (oldDatapointIds.length > 0 && VERTEX_VECTOR_SEARCH_ENABLED) {
      removeStaleVertexDatapoints(oldDatapointIds, note.id).catch(err => {
        logWarn('Failed to remove stale Vertex datapoints', {
          noteId: note.id,
          datapointCount: oldDatapointIds.length,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Split note into chunks with offset information
    const chunksWithOffsets = splitIntoChunksWithOffsets(note.text);

    if (chunksWithOffsets.length === 0) {
      logInfo('Note too short for chunking', { noteId: note.id });
      return;
    }

    // Create chunk documents with context windows for citation accuracy
    const chunks = buildChunkDocuments(note, chunksWithOffsets);

    // Generate embeddings if enabled
    if (EMBEDDINGS_ENABLED) {
      await generateAndAttachEmbeddings(chunks, note.id);
    }

    // Store chunks in batches
    await storeChunksInBatches(db, chunks);

    // Sync to Vertex AI Vector Search if enabled
    await syncChunksToVertexIndex(chunks);

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

/** Get all chunks for a note, ordered by position */
export async function getChunksForNote(noteId: string): Promise<ChunkDoc[]> {
  const db = getDb();
  const snap = await db
    .collection(CHUNKS_COLLECTION)
    .where('noteId', '==', noteId)
    .orderBy('position', 'asc')
    .get();

  return snap.docs.map(d => d.data() as ChunkDoc);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build ChunkDoc objects from chunked text with offsets.
 * Includes context windows from adjacent chunks for citation accuracy.
 */
function buildChunkDocuments(note: NoteDoc, chunksWithOffsets: ChunkWithOffset[]): ChunkDoc[] {
  return chunksWithOffsets.map((chunkData, position) => {
    const prevContext = position > 0
      ? chunksWithOffsets[position - 1].text.slice(-CONTEXT_WINDOW_SIZE)
      : null;
    const nextContext = position < chunksWithOffsets.length - 1
      ? chunksWithOffsets[position + 1].text.slice(0, CONTEXT_WINDOW_SIZE)
      : null;

    const chunk: ChunkDoc = {
      chunkId: `${note.id}_${String(position).padStart(3, '0')}`,
      noteId: note.id,
      tenantId: note.tenantId,
      text: chunkData.text,
      textHash: hashText(chunkData.text),
      position,
      tokenEstimate: estimateTokens(chunkData.text),
      createdAt: note.createdAt,
      terms: extractTermsForIndexing(chunkData.text),
      termsVersion: TERMS_VERSION,
      totalChunks: chunksWithOffsets.length,
      startOffset: chunkData.startOffset,
      endOffset: chunkData.endOffset,
      anchor: chunkData.anchor,
    };

    // Only add context fields if they have values (Firestore doesn't accept undefined)
    if (prevContext) chunk.prevContext = prevContext;
    if (nextContext) chunk.nextContext = nextContext;

    return chunk;
  });
}

/**
 * Generate embeddings for chunks and attach them to the chunk documents.
 * Logs errors but doesn't throw - retrieval falls back to keyword search.
 */
async function generateAndAttachEmbeddings(chunks: ChunkDoc[], noteId: string): Promise<void> {
  try {
    const texts = chunks.map(c => c.text);
    const embeddings = await generateEmbeddings(texts);

    for (let i = 0; i < chunks.length; i++) {
      chunks[i].embedding = embeddings[i];
      chunks[i].embeddingModel = EMBEDDING_MODEL;
    }
  } catch (err) {
    logEmbeddingError(err, noteId);
  }
}

/**
 * Store chunks in Firestore using batched writes.
 */
async function storeChunksInBatches(
  db: FirebaseFirestore.Firestore,
  chunks: ChunkDoc[]
): Promise<void> {
  for (let i = 0; i < chunks.length; i += FIRESTORE_BATCH_SIZE) {
    const batch = db.batch();
    const batchChunks = chunks.slice(i, i + FIRESTORE_BATCH_SIZE);

    for (const chunk of batchChunks) {
      const ref = db.collection(CHUNKS_COLLECTION).doc(chunk.chunkId);
      batch.set(ref, chunk);
    }

    await batch.commit();
  }
}

/**
 * Log embedding errors with appropriate context.
 */
function logEmbeddingError(err: unknown, noteId: string): void {
  if (err instanceof EmbeddingError) {
    logError('Embedding generation failed with misalignment', err, {
      noteId,
      missingIndices: err.missingIndices,
    });
  } else {
    logError('Embedding generation failed', err, { noteId });
  }
}

/**
 * Regenerate embeddings for chunks that are missing them.
 * Updates chunks in-place in Firestore.
 */
async function regenerateMissingEmbeddings(
  db: FirebaseFirestore.Firestore,
  chunks: ChunkDoc[],
  noteId: string,
  startTime: number
): Promise<void> {
  if (chunks.length === 0) return;

  logInfo('Regenerating missing embeddings', {
    noteId,
    missingCount: chunks.length,
  });

  try {
    const texts = chunks.map(c => c.text);
    const embeddings = await generateEmbeddings(texts);

    const batch = db.batch();
    for (let i = 0; i < chunks.length; i++) {
      const ref = db.collection(CHUNKS_COLLECTION).doc(chunks[i].chunkId);
      batch.update(ref, {
        embedding: embeddings[i],
        embeddingModel: EMBEDDING_MODEL,
      });
    }
    await batch.commit();

    logInfo('Missing embeddings regenerated', {
      noteId,
      embeddingsAdded: chunks.length,
      elapsedMs: Date.now() - startTime,
    });
  } catch (err) {
    logEmbeddingError(err, noteId);
  }
}

// =============================================================================
// Vertex AI Integration
// =============================================================================

/**
 * Remove stale datapoints from Vertex index when chunks are replaced.
 * This prevents orphan datapoints from accumulating and degrading retrieval quality.
 *
 * Called during note reprocessing when old chunks are being deleted.
 * Non-blocking: logs errors but doesn't throw.
 */
async function removeStaleVertexDatapoints(datapointIds: string[], noteId: string): Promise<void> {
  if (datapointIds.length === 0) {
    return;
  }

  const vertexIndex = getVertexIndex();
  if (!vertexIndex) {
    return;
  }

  const startTime = Date.now();

  try {
    const success = await vertexIndex.remove(datapointIds);
    if (success) {
      logInfo('Removed stale Vertex datapoints', {
        noteId,
        datapointCount: datapointIds.length,
        elapsedMs: Date.now() - startTime,
      });
    } else {
      logWarn('Failed to remove stale Vertex datapoints', {
        noteId,
        datapointCount: datapointIds.length,
      });
    }
  } catch (err) {
    // Log but don't throw - stale cleanup is best-effort
    logError('Error removing stale Vertex datapoints', err, {
      noteId,
      datapointCount: datapointIds.length,
    });
  }
}

/**
 * Sync chunks to Vertex AI Vector Search index
 *
 * This is called after chunks are saved to Firestore.
 * Only syncs chunks that have embeddings.
 * Fails silently to avoid blocking note creation.
 */
async function syncChunksToVertexIndex(chunks: ChunkDoc[]): Promise<void> {
  if (!VERTEX_VECTOR_SEARCH_ENABLED) {
    return;
  }

  const vertexIndex = getVertexIndex();
  if (!vertexIndex) {
    return;
  }

  // Filter to chunks with embeddings
  const chunksWithEmbeddings = chunks.filter(c => c.embedding && c.embedding.length > 0);
  if (chunksWithEmbeddings.length === 0) {
    return;
  }

  // Convert to Vertex datapoints
  const datapoints: VertexDatapoint[] = chunksWithEmbeddings.map(chunk => ({
    datapointId: `${chunk.chunkId}:${chunk.noteId}`,
    featureVector: chunk.embedding!,
    restricts: [
      {
        namespace: 'tenantId',
        allowList: [chunk.tenantId],
      },
    ],
  }));

  try {
    const success = await vertexIndex.upsert(datapoints);
    if (success) {
      logInfo('Synced chunks to Vertex index', {
        chunkCount: datapoints.length,
        noteId: chunks[0]?.noteId,
      });
    } else {
      logWarn('Failed to sync chunks to Vertex index', {
        chunkCount: datapoints.length,
        noteId: chunks[0]?.noteId,
      });
    }
  } catch (err) {
    // Log but don't throw - Vertex sync is best-effort
    logError('Vertex index sync error', err, {
      chunkCount: datapoints.length,
      noteId: chunks[0]?.noteId,
    });
  }
}

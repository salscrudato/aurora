/**
 * Seed script - Generate test notes for RAG testing
 *
 * Run with: npx ts-node scripts/seed-notes.ts
 */

import { createNote } from "../src/notes";

const SEED_NOTES = [
  // Technical decisions - clear decision statements
  `Decision: We chose Cloud Run for the API because it offers automatic scaling, pay-per-use pricing, and easy deployment from Docker containers. The cold start times are acceptable for our use case. Alternatives considered were AWS Lambda (rejected due to cold starts) and GKE (too complex for MVP).`,

  `Decision: Firestore was selected as our database. Key reasons: real-time sync capabilities, automatic scaling with no server management, seamless integration with Google Cloud services. The document model fits our notes structure perfectly. Considered MongoDB Atlas but chose Firestore for GCP consistency.`,

  `Decision: For the frontend, we went with React + Vite. Rationale: fast HMR for better dev experience, excellent TypeScript support, modern ESM-based build system. Significantly better developer experience compared to Create React App which is now deprecated.`,

  `Architecture decision: Hybrid retrieval strategy using vector similarity (50%), BM25 keyword matching (35%), and recency (15%). This balances semantic understanding with exact keyword matches and favors recent notes.`,

  `Decision: Text embedding model is text-embedding-004 with 768 dimensions. Chosen for good quality-to-cost ratio. Each embedding is approximately 3KB which is manageable for storage.`,

  // Project milestones and timelines
  `Milestone: MVP launch target is December 31st. Core features required: note creation with chunking, note listing with cursor-based pagination, AI chat with inline citations. Nice-to-have: dark mode, keyboard shortcuts.`,

  `Sprint 1 goals (Dec 1-15): (1) Backend API with notes CRUD, (2) Chunking pipeline with sentence-aware splitting, (3) Embedding generation with caching, (4) Basic retrieval with hybrid scoring.`,

  `Sprint 2 goals (Dec 16-31): (1) Chat endpoint with citation validation, (2) Frontend integration, (3) Production deployment to Cloud Run, (4) Cost monitoring setup.`,

  // Meeting notes with specific dates
  `Meeting notes December 10: Discussed scaling strategy with the team. Key decisions: implement cursor-based pagination to handle 100k+ notes efficiently, use Firestore compound indexes for query performance. Action item: Create indexes before production deploy.`,

  `Meeting notes December 12: Reviewed RAG implementation progress. Team decided on hybrid retrieval approach combining vectors and keywords. Added requirement for inline citations using [N1] format. Frontend will show clickable citation badges that expand to show source text.`,

  `Standup December 14: Completed backend refactoring to TypeScript strict mode. Added comprehensive error handling with specific error classes. Implemented structured JSON logging for Cloud Logging integration. Ready for production testing.`,

  `Team sync December 15: Discussed citation accuracy improvements. Decided to add citation repair mechanism - if LLM response has no valid citations, we retry with a repair prompt. Also adding validation to remove invalid citation IDs from responses.`,

  // Technical specifications
  `Technical spec: Chunking configuration - target size 500 chars, minimum 100 chars, maximum 800 chars, overlap 50 chars. Sentence-aware splitting prevents mid-sentence breaks. Paragraphs are split first, then sentences.`,

  `API specification: POST /chat accepts { message: string, tenantId?: string }. Returns { answer: string, citations: Citation[], meta: object }. Citations include cid (N1, N2), noteId, chunkId, snippet, and relevance score.`,

  `API specification: POST /notes accepts { text: string, tenantId?: string }. Returns NoteResponse with id, text, tenantId, createdAt, updatedAt. Maximum note length is 5000 characters.`,

  `API specification: GET /notes supports pagination with ?limit=N&cursor=X&tenantId=Y. Returns { notes: [], cursor: string|null, hasMore: boolean }. Default limit 50, max 100.`,

  // Cost and budget
  `Cost analysis: Current estimates show $0.50 per 1000 chat requests with our token limits in place. Breakdown: embeddings $0.15, LLM generation $0.30, Firestore reads $0.05. Need to monitor actual usage after launch.`,

  `Budget controls implemented: Max 12 chunks in context (prevents token explosion), 12000 chars max context, 30 second timeout, 2000 char max query length. These prevent runaway costs from edge cases.`,

  `Cost optimization idea: Implement embedding cache with LRU eviction. Identical text produces same embedding so we can avoid redundant API calls. Current cache size is 1000 entries.`,

  // Action items and todos
  `TODO: Before production launch - (1) Create Firestore composite indexes, (2) Set up Cloud Monitoring alerts, (3) Configure rate limiting, (4) Test with 1000+ notes dataset, (5) Review security rules.`,

  `Action item for next week: Implement voice-to-text for quick note capture. Could use Web Speech API for browser-based recognition or integrate Google Cloud Speech-to-Text for higher accuracy on mobile.`,

  `Reminder: Review the cost projections with stakeholders before scaling to production. Need approval for the estimated $500/month at 100k requests/month scale.`,

  // Feature ideas
  `Feature idea: Note tagging with auto-suggestions. Use the embedding model to cluster similar notes and suggest common themes. Could help users organize and find related notes more easily.`,

  `Feature idea: Keyboard shortcuts for power users - Cmd+Enter to save note, Cmd+K for quick search, Escape to clear input. These will make the app feel more responsive.`,

  `Feature idea: Export functionality - allow users to export all their notes as Markdown, JSON, or PDF. Important for data portability and backup.`,

  // Learnings and best practices
  `Learning: Firestore queries are much more efficient with composite indexes. Always create indexes for common query patterns (tenantId + createdAt) to avoid full collection scans. Index creation can take several minutes.`,

  `Best practice: Always sanitize user input before storing. Remove control characters, normalize unicode, limit length. Prevents injection attacks and data corruption.`,

  `Learning: BM25 keyword matching often outperforms pure vector similarity for precise queries. Our hybrid approach uses both: vectors capture semantic meaning, BM25 handles exact matches.`,

  // Personal and misc
  `Book recommendation: "Designing Data-Intensive Applications" by Martin Kleppmann is essential reading for understanding distributed systems, database internals, and data processing pipelines.`,

  `Quote: "Make it work, make it right, make it fast" - Kent Beck. We're currently in the "make it right" phase, having shipped working code. Performance optimization comes after correctness.`,

  `Note to self: The chunking algorithm could be improved with semantic segmentation. Consider using sentence transformers to identify topic boundaries instead of just character counts.`,

  `Health reminder: Take breaks every 90 minutes. Stand up, stretch, look at something 20 feet away for 20 seconds (20-20-20 rule). Eyes and back will thank you later.`,

  // Error handling and edge cases
  `Error handling: Three custom error classes - ConfigurationError for missing API keys (503), RateLimitError for quota exceeded (429), and validation errors (400). All logged with structured JSON for Cloud Logging.`,

  `Edge case handled: Empty notes are rejected with "text is required" error. Notes over 5000 chars are rejected with "text too long" error. Both return 400 status code.`,

  `Edge case handled: If LLM response contains no valid citations and doesn't acknowledge uncertainty, we trigger citation repair. This improves citation accuracy by about 15% in testing.`,
];

async function seedNotes() {
  console.log("🌱 Starting note seeding...\n");
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < SEED_NOTES.length; i++) {
    const text = SEED_NOTES[i];
    try {
      const note = await createNote(text, "public");
      console.log(`✅ [${i + 1}/${SEED_NOTES.length}] Created note: ${note.id}`);
      console.log(`   Preview: "${text.slice(0, 60)}..."\n`);
      successCount++;
      
      // Small delay to avoid overwhelming Firestore
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`❌ [${i + 1}/${SEED_NOTES.length}] Failed:`, err);
      errorCount++;
    }
  }
  
  console.log("\n" + "=".repeat(50));
  console.log(`🎉 Seeding complete!`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log("=".repeat(50));
  
  process.exit(0);
}

seedNotes().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});


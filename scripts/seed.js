/**
 * Seed notes to Firestore for RAG testing
 */
const { createNote } = require('../dist/notes');

const NOTES = [
  "Decision: We chose Cloud Run for the API because it offers automatic scaling, pay-per-use pricing, and easy deployment from Docker containers. The cold start times are acceptable for our use case.",
  "Decision: Firestore was selected as our database because it provides real-time sync, automatic scaling, and works seamlessly with other Google Cloud services.",
  "Architecture note: The RAG pipeline uses a hybrid retrieval strategy - combining vector similarity (60%), keyword matching (25%), and recency (15%).",
  "Technical spec: Chunks are sized between 400-800 characters with 50-character overlap. Sentence-aware splitting prevents mid-sentence breaks.",
  "Sprint planning: Focus areas for this sprint are implementing cursor-based pagination, building the chunking pipeline, and creating the chat UI with citations.",
  "Milestone: MVP launch target is end of December. Core features needed: note creation, note listing with pagination, and AI chat with citations.",
  "Meeting notes 12/10: Discussed scaling strategy. Agreed to implement cursor-based pagination to handle 100k+ notes.",
  "Meeting notes 12/12: Reviewed RAG implementation. Team decided on hybrid retrieval approach. Added requirement for inline citations with [N1] format.",
  "Idea: Add voice-to-text for quick note capture. Could use Web Speech API for browser-based recognition.",
  "Feature idea: Implement note tagging with auto-suggestions based on content analysis using embeddings.",
  "API design: POST /chat returns { answer, citations[], meta }. Citations include cid (N1, N2...), noteId, snippet, and score.",
  "Embedding model: Using text-embedding-004 with 768 dimensions. This provides good balance between quality and storage costs.",
  "Cost control: Hard limits implemented - max 12 chunks in context, 12000 chars total, 30 second timeout.",
  "Book recommendation: Designing Data-Intensive Applications by Martin Kleppmann is essential reading for distributed systems.",
  "Reminder: Review cost projections before scaling to production. Current estimate is $0.50 per 1000 chat requests.",
];

async function seed() {
  console.log("🌱 Seeding notes...\n");
  
  for (let i = 0; i < NOTES.length; i++) {
    try {
      const note = await createNote(NOTES[i], "public");
      console.log(`✅ [${i + 1}/${NOTES.length}] ${note.id.slice(0, 8)}... - "${NOTES[i].slice(0, 50)}..."`);
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`❌ [${i + 1}/${NOTES.length}] Error:`, err.message);
    }
  }
  
  console.log("\n🎉 Done seeding!");
  process.exit(0);
}

seed().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});


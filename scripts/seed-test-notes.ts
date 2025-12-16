#!/usr/bin/env ts-node
/**
 * Seed Script - Create 25+ diverse test notes for model performance testing
 * 
 * Usage: npx ts-node scripts/seed-test-notes.ts [--api-url URL] [--tenant-id ID]
 */

const API_URL = process.argv.find(a => a.startsWith('--api-url='))?.split('=')[1] 
  || 'https://auroranotes-api-884985856308.us-central1.run.app';
const TENANT_ID = process.argv.find(a => a.startsWith('--tenant-id='))?.split('=')[1] 
  || 'eval-test';

interface Note {
  text: string;
  category: string;
}

// Diverse notes covering multiple domains for comprehensive testing
const TEST_NOTES: Note[] = [
  // === Technical Architecture (5 notes) ===
  {
    category: 'architecture',
    text: `Architecture Decision: We chose Cloud Run for API hosting because it scales to zero when idle, keeping costs near zero during development. The service auto-scales up to 10 instances under load. We use Firestore for persistence since it's serverless and integrates seamlessly with Cloud Run.`
  },
  {
    category: 'architecture', 
    text: `Technical Stack Decision: The backend uses TypeScript with Express.js for type safety and better developer experience. We evaluated Python Flask but TypeScript won due to team familiarity and strong typing. The frontend uses React with Vite for fast development builds.`
  },
  {
    category: 'architecture',
    text: `Database Schema: Notes collection stores id, text (max 5000 chars), tenantId, createdAt, updatedAt. Chunks collection stores chunkId, noteId, text, embedding (768 floats), position, tokenEstimate. We use cursor-based pagination with createdAt|id encoding.`
  },
  {
    category: 'architecture',
    text: `RAG Pipeline Design: The retrieval system uses hybrid search combining vector similarity (cosine) with keyword matching. Embeddings are 768-dimensional using text-embedding-004. Chunks target 450 characters with 75 char overlap for context continuity.`
  },
  {
    category: 'architecture',
    text: `API Rate Limits: Production has 60 requests per minute per tenant. Chat endpoint has 30 second timeout. Max query length is 2000 characters. We use in-memory rate limiting with sliding window algorithm.`
  },
  // === Project Planning (4 notes) ===
  {
    category: 'planning',
    text: `Sprint 1 Goals: Complete MVP with basic notes CRUD, simple search, and chat endpoint. Target launch date is January 15, 2025. Team consists of 2 backend devs and 1 frontend dev. Budget is $500/month for cloud costs.`
  },
  {
    category: 'planning',
    text: `Q1 2025 Roadmap: Phase 1 (Jan) - Launch MVP with core features. Phase 2 (Feb) - Add collaborative features and sharing. Phase 3 (Mar) - Premium tier with advanced AI features. Revenue target is $10k MRR by end of Q1.`
  },
  {
    category: 'planning',
    text: `Risk Assessment: Main risks are API cost overruns, user adoption, and competition from established players like Notion AI. Mitigation includes strict rate limits, freemium model, and focus on simplicity as differentiator.`
  },
  {
    category: 'planning',
    text: `Team Standup Dec 15: Sarah completed authentication integration. Mike is blocked on Vertex AI setup - needs project permissions. Emma finished initial UI mockups. Next week focus is on end-to-end testing.`
  },
  // === Meeting Notes (4 notes) ===
  {
    category: 'meeting',
    text: `Product Strategy Meeting: Decided to focus on individual knowledge workers rather than enterprise. Target users are researchers, students, and writers. Pricing will be $9.99/month for Pro, free tier limited to 100 notes.`
  },
  {
    category: 'meeting',
    text: `Technical Sync Dec 12: Discussed embedding model options. Vertex AI text-embedding-004 chosen for quality. Considered open-source alternatives but latency was 3x worse. Cost estimate is $0.025 per 1000 embeddings.`
  },
  {
    category: 'meeting',
    text: `Customer Interview Summary: User A wants browser extension for web clipping. User B needs mobile app. User C loves the citation feature, says it builds trust. Priority: citations > web clipper > mobile.`
  },
  {
    category: 'meeting',
    text: `Retrospective Dec 10: What went well - CI/CD pipeline is solid, deployments are smooth. What needs improvement - documentation is sparse, onboarding new devs took 3 days. Action: Create dev setup guide.`
  },
  // === Technical Decisions (4 notes) ===
  {
    category: 'technical',
    text: `Chunking Strategy: After testing, 450 char chunks with 75 char overlap perform best. Sentence-aware splitting preserves meaning. Tested 200, 400, 600, 800 char chunks - 450 had best retrieval accuracy at 87%.`
  },
  {
    category: 'technical',
    text: `Citation Accuracy Fix: Implemented citation verification using lexical overlap scoring. Min overlap threshold is 0.15. Added repair prompt when citations are missing. Coverage target is 80% of sources cited.`
  },
  {
    category: 'technical',
    text: `Error Handling: All endpoints return structured JSON errors. 400 for validation, 429 for rate limits, 500 for server errors, 503 for service unavailable. Errors include code, message, and requestId for debugging.`
  },
  {
    category: 'technical',
    text: `Deployment Process: Merge to main triggers Cloud Build. Docker image built and pushed to Artifact Registry. Cloud Run deployment with zero-downtime rolling update. Rollback available via Cloud Console.`
  },
  // === Research & Learning (4 notes) ===
  {
    category: 'research',
    text: `RAG Best Practices (paper notes): Hybrid retrieval outperforms pure vector by 15-20%. Reranking improves top-k precision. Cross-encoder rerankers are best but slow. MMR diversity helps with broad queries.`
  },
  {
    category: 'research',
    text: `Competitor Analysis: Notion AI uses GPT-4, $10/user/month. Mem.ai focuses on memory graph, $15/month. Obsidian Copilot is local-first, one-time $50. Our advantage is simplicity and citation transparency.`
  },
  {
    category: 'research',
    text: `User Research Findings: 78% of note-takers forget what they wrote after 2 weeks. 65% use search but 40% can't find what they need. Key insight: surface relevant notes proactively before user searches.`
  },
  {
    category: 'research',
    text: `LLM Evaluation Notes: Gemini 2.0 Flash is 3x faster than Pro at similar quality for summarization. Temperature 0.3 works best for factual Q&A. Max 1024 output tokens is enough for most responses.`
  },
  // === Personal/Misc (4 notes) ===
  {
    category: 'personal',
    text: `Book Notes - Building a Second Brain by Tiago Forte: CODE method - Capture, Organize, Distill, Express. Progressive summarization layers. Intermediate packets for reuse. Key insight: offload thinking to system.`
  },
  {
    category: 'personal',
    text: `Conference Talk Ideas: Topic 1 - Building production RAG systems. Topic 2 - Firebase + Cloud Run architecture patterns. Topic 3 - Citation accuracy in AI responses. Submit to GDG DevFest by Jan 30.`
  },
  {
    category: 'personal',
    text: `Learning Goals 2025: Master Vertex AI ecosystem. Learn Kubernetes for larger scale. Improve system design skills. Read 2 books on distributed systems. Goal: become AI infrastructure specialist.`
  },
  {
    category: 'personal',
    text: `Grocery list and meal prep: Monday - pasta with vegetables. Tuesday - grilled chicken salad. Wednesday - leftover pasta. Thursday - salmon with rice. Friday - pizza night. Shopping: tomatoes, chicken, salmon, greens, rice.`
  },
];

async function createNote(text: string): Promise<{ id: string; text: string }> {
  const res = await fetch(`${API_URL}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, tenantId: TENANT_ID }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create note: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ id: string; text: string }>;
}

async function main() {
  console.log(`\n🌱 Seeding ${TEST_NOTES.length} test notes`);
  console.log(`   API: ${API_URL}`);
  console.log(`   Tenant: ${TENANT_ID}\n`);

  let created = 0;
  let failed = 0;

  for (const note of TEST_NOTES) {
    try {
      const result = await createNote(note.text);
      created++;
      console.log(`  ✓ [${note.category}] ${result.id.slice(0, 8)}... (${note.text.slice(0, 50)}...)`);
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      failed++;
      console.error(`  ✗ [${note.category}] ${err}`);
    }
  }

  console.log(`\n✅ Seeding complete: ${created} created, ${failed} failed\n`);
}

main().catch(console.error);


#!/bin/bash
API="https://auroranotes-api-884985856308.us-central1.run.app"

echo "=== Testing Chat Endpoint ==="
curl -s -X POST "$API/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"What are my decisions?"}' | python3 -m json.tool

echo ""
echo "=== Adding Seed Notes ==="
curl -s -X POST "$API/notes" -H "Content-Type: application/json" -d '{"text":"Decision: Cloud Run was chosen for the API because it offers automatic scaling and pay-per-use pricing."}' | python3 -c "import sys,json; print('Added note:', json.load(sys.stdin).get('id','error'))"

curl -s -X POST "$API/notes" -H "Content-Type: application/json" -d '{"text":"Architecture note: The RAG pipeline uses hybrid retrieval combining vector similarity, keyword matching, and recency."}' | python3 -c "import sys,json; print('Added note:', json.load(sys.stdin).get('id','error'))"

curl -s -X POST "$API/notes" -H "Content-Type: application/json" -d '{"text":"Technical spec: Chunks are sized between 400-800 characters with sentence-aware splitting."}' | python3 -c "import sys,json; print('Added note:', json.load(sys.stdin).get('id','error'))"

echo ""
echo "=== Testing Chat Again ==="
curl -s -X POST "$API/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"What decisions have been made?"}' | python3 -m json.tool


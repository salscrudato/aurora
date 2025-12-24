#!/bin/bash
#
# Local test script for AuroraNotes API
# Uses X-Dev-User header (works in development mode only)
#

cd /Users/salscrudato/Projects/auroranotes-api

echo "=== AuroraNotes Local API Test ==="
echo "Time: $(date)"
echo ""

# Build first
echo "Building TypeScript..."
npm run build 2>&1 | tail -5

# Kill any existing server
pkill -f "node dist/index.js" 2>/dev/null || true
sleep 2

# Start server in dev mode
echo ""
echo "Starting server (NODE_ENV=development)..."
NODE_ENV=development node dist/index.js > /tmp/aurora-server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server
echo "Waiting for server..."
for i in {1..20}; do
  if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "Server ready after $i seconds"
    break
  fi
  sleep 1
done

# Check server log
echo ""
echo "=== Server Log (last 10 lines) ==="
tail -10 /tmp/aurora-server.log

# Health check
echo ""
echo "=== Health Check ==="
curl -s http://localhost:8080/health | python3 -m json.tool

# Test user
TEST_USER="test-user-$$"

# Create notes
echo ""
echo "=== Creating Test Notes ==="

create_note() {
  curl -s -X POST "http://localhost:8080/notes" \
    -H "Content-Type: application/json" \
    -H "X-Dev-User: $TEST_USER" \
    -d "$1"
}

echo "Note 1 (Quantum)..."
N1=$(create_note '{"title":"AQP-7 Specs","content":"The AQP-7 has 127 qubits. Price: $15 million.","tags":["quantum"]}')
N1_ID=$(echo "$N1" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id','ERROR'))" 2>/dev/null)
echo "  ID: $N1_ID"

echo "Note 2 (Meeting)..."
N2=$(create_note '{"title":"Q4 Meeting","content":"Budget: $2.4 million. Kubernetes deadline: February 28, 2025.","tags":["meeting"]}')
N2_ID=$(echo "$N2" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id','ERROR'))" 2>/dev/null)
echo "  ID: $N2_ID"

echo "Note 3 (Recipe)..."
N3=$(create_note '{"title":"Marinara","content":"15 basil leaves. Simmer 45 minutes.","tags":["recipe"]}')
N3_ID=$(echo "$N3" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id','ERROR'))" 2>/dev/null)
echo "  ID: $N3_ID"

# Wait for embeddings
echo ""
echo "Waiting 8 seconds for embeddings..."
sleep 8

# Chat tests
echo ""
echo "=== Chat Accuracy Tests ==="
PASSED=0
TOTAL=0

chat_test() {
  local q="$1"
  local expect="$2"
  TOTAL=$((TOTAL+1))
  
  echo ""
  echo "Q: $q"
  R=$(curl -s -X POST "http://localhost:8080/chat" \
    -H "Content-Type: application/json" \
    -H "X-Dev-User: $TEST_USER" \
    -d "{\"message\":\"$q\"}")
  
  A=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('response','')[:200])" 2>/dev/null || echo "ERROR")
  
  if echo "$A" | grep -qi "$expect"; then
    echo "✓ Found '$expect'"
    PASSED=$((PASSED+1))
  else
    echo "✗ Missing '$expect' in: ${A:0:100}..."
  fi
}

chat_test "How many qubits does the AQP-7 have?" "127"
chat_test "What is the budget from the Q4 meeting?" "2.4 million"
chat_test "How long to simmer the marinara?" "45"

# Cleanup
echo ""
echo "=== Cleanup ==="
for ID in $N1_ID $N2_ID $N3_ID; do
  [ -n "$ID" ] && [ "$ID" != "ERROR" ] && curl -s -X DELETE "http://localhost:8080/notes/$ID" -H "X-Dev-User: $TEST_USER" > /dev/null && echo "Deleted $ID"
done

kill $SERVER_PID 2>/dev/null

echo ""
echo "=== RESULTS: $PASSED/$TOTAL passed ==="


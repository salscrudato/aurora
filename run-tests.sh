#!/bin/bash
#
# AuroraNotes API Integration Test
# Tests retrieval accuracy using the internal test endpoints
#

set -e

API_URL="${API_URL:-http://localhost:8080}"
TEST_SECRET="${INTEGRATION_TEST_SECRET:-test-secret-local-only}"
TEST_USER="integration-test-$$"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       AuroraNotes API Integration Test Suite               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo "API URL: $API_URL"
echo "Test User: $TEST_USER"
echo "Time: $(date)"
echo ""

# Health check
echo "=== 1. Health Check ==="
HEALTH=$(curl -s "$API_URL/health")
echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"

# Function to make API calls with test auth
api_call() {
  local method="$1"
  local endpoint="$2"
  local data="$3"

  if [ -n "$data" ]; then
    curl -s -X "$method" "$API_URL$endpoint" \
      -H "Content-Type: application/json" \
      -H "X-Integration-Test-Secret: $TEST_SECRET" \
      -H "X-Test-User-Id: $TEST_USER" \
      -d "$data"
  else
    curl -s -X "$method" "$API_URL$endpoint" \
      -H "Content-Type: application/json" \
      -H "X-Integration-Test-Secret: $TEST_SECRET" \
      -H "X-Test-User-Id: $TEST_USER"
  fi
}

# Create test notes
echo ""
echo "=== 2. Creating Test Notes ==="

echo "Creating Quantum Note..."
NOTE1=$(api_call POST "/_internal/test/notes" '{"title":"AQP-7 Quantum Processor","content":"The Aurora Quantum Processor AQP-7 has exactly 127 qubits with 99.9% gate fidelity. Operating temperature: 15 millikelvin. Coherence time: 300 microseconds. Price: $15 million. Release date: March 15, 2024.","tags":["quantum"]}')
NOTE1_ID=$(echo "$NOTE1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') if 'id' in d else 'ERROR: '+str(d))" 2>/dev/null)
echo "  Note 1: $NOTE1_ID"

echo "Creating Meeting Note..."
NOTE2=$(api_call POST "/_internal/test/notes" '{"title":"Q4 2024 Meeting","content":"Meeting on December 10, 2024. Attendees: Sarah Chen CEO, Marcus Johnson CTO. Budget approved: $2.4 million. Kubernetes migration deadline: February 28, 2025. Hiring goal: 12 engineers in Q1.","tags":["meeting"]}')
NOTE2_ID=$(echo "$NOTE2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') if 'id' in d else 'ERROR: '+str(d))" 2>/dev/null)
echo "  Note 2: $NOTE2_ID"

echo "Creating Recipe Note..."
NOTE3=$(api_call POST "/_internal/test/notes" '{"title":"Grandma Maria Marinara","content":"Recipe from 1962. Ingredients: 15 fresh basil leaves, 6 cloves garlic, 2 cans San Marzano tomatoes, 1/4 cup olive oil. Simmer for exactly 45 minutes.","tags":["recipe"]}')
NOTE3_ID=$(echo "$NOTE3" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') if 'id' in d else 'ERROR: '+str(d))" 2>/dev/null)
echo "  Note 3: $NOTE3_ID"

# Wait for embeddings
echo ""
echo "=== 3. Waiting 10 seconds for embeddings to process ==="
sleep 10

# Test chat accuracy
echo ""
echo "=== 4. Testing Chat Accuracy ==="
PASSED=0
TOTAL=0

test_query() {
  local query="$1"
  local expected="$2"
  TOTAL=$((TOTAL + 1))

  echo ""
  echo "Q: $query"

  RESPONSE=$(api_call POST "/_internal/test/chat" "{\"message\":\"$query\"}")
  ANSWER=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('response','')[:250])" 2>/dev/null || echo "$RESPONSE")

  if echo "$ANSWER" | grep -qi "$expected"; then
    echo "✓ PASS - Contains '$expected'"
    PASSED=$((PASSED + 1))
  else
    echo "✗ FAIL - Expected '$expected'"
    echo "  Response: ${ANSWER:0:150}..."
  fi
}

test_query "How many qubits does the AQP-7 have?" "127"
test_query "What is the price of the Aurora quantum processor?" "15 million"
test_query "What is the approved budget from the Q4 meeting?" "2.4 million"
test_query "When is the Kubernetes migration deadline?" "February 28"
test_query "How many basil leaves are in the marinara recipe?" "15"
test_query "How long should the marinara sauce simmer?" "45"

# Cleanup
echo ""
echo "=== 5. Cleanup ==="
for NOTE_ID in $NOTE1_ID $NOTE2_ID $NOTE3_ID; do
  if [ -n "$NOTE_ID" ] && [ "$NOTE_ID" != "ERROR:"* ]; then
    api_call DELETE "/_internal/test/notes/$NOTE_ID" > /dev/null 2>&1 && echo "  Deleted: $NOTE_ID" || echo "  Failed to delete: $NOTE_ID"
  fi
done

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  RESULTS: $PASSED/$TOTAL tests passed ($(python3 -c "print(round($PASSED/$TOTAL*100))" 2>/dev/null || echo "?")%)                                    ║"
echo "╚════════════════════════════════════════════════════════════╝"

if [ $PASSED -eq $TOTAL ]; then
  echo "✅ All tests passed!"
  exit 0
else
  echo "⚠️  Some tests failed"
  exit 1
fi


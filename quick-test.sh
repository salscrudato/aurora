#!/bin/bash
#
# Quick integration test using the internal test endpoints
#

API_URL="https://aurora-api-884985856308.us-central1.run.app"
TEST_SECRET="aurora-test-b7a02aa9bac703a5403e5a22441d0b47"
TEST_USER="quick-test-$$"

echo "=== AuroraNotes Quick Integration Test ==="
echo "API: $API_URL"
echo "Test User: $TEST_USER"
echo ""

# 1. Health check
echo "1. Health Check:"
curl -s "$API_URL/health" | python3 -m json.tool
echo ""

# 2. Create a test note
echo "2. Creating test note..."
NOTE=$(curl -s -X POST "$API_URL/_internal/test/notes" \
  -H "Content-Type: application/json" \
  -H "X-Integration-Test-Secret: $TEST_SECRET" \
  -H "X-Test-User-Id: $TEST_USER" \
  -d '{"title":"AQP-7 Quantum Processor","content":"The AQP-7 has 127 qubits. Price: $15 million.","tags":["test"]}')

echo "$NOTE" | python3 -m json.tool
NOTE_ID=$(echo "$NOTE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
echo "Note ID: $NOTE_ID"
echo ""

# 3. Wait for embeddings
echo "3. Waiting 8 seconds for embeddings..."
sleep 8
echo ""

# 4. Test chat
echo "4. Testing chat..."
CHAT=$(curl -s -X POST "$API_URL/_internal/test/chat" \
  -H "Content-Type: application/json" \
  -H "X-Integration-Test-Secret: $TEST_SECRET" \
  -H "X-Test-User-Id: $TEST_USER" \
  -d '{"message":"How many qubits does the AQP-7 have?"}')

echo "$CHAT" | python3 -m json.tool
RESPONSE=$(echo "$CHAT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('response',''))" 2>/dev/null)
echo ""

# 5. Check if answer contains "127"
if echo "$RESPONSE" | grep -q "127"; then
  echo "✅ PASS: Response contains '127'"
else
  echo "❌ FAIL: Response does not contain '127'"
  echo "Response: $RESPONSE"
fi
echo ""

# 6. Cleanup
echo "5. Cleaning up..."
if [ -n "$NOTE_ID" ]; then
  curl -s -X DELETE "$API_URL/_internal/test/notes/$NOTE_ID" \
    -H "X-Integration-Test-Secret: $TEST_SECRET" \
    -H "X-Test-User-Id: $TEST_USER" | python3 -m json.tool
fi

echo ""
echo "=== Test Complete ==="


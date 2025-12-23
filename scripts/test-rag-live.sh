#!/bin/bash
#
# AuroraNotes RAG Pipeline Live Testing Script
#
# Tests the production RAG pipeline for retrieval quality and response times.
# Requires a valid Firebase ID token for authentication.
#
# Usage:
#   export FIREBASE_TOKEN="your-firebase-id-token"
#   ./scripts/test-rag-live.sh
#
# Or for local testing:
#   export API_URL="http://localhost:8080"
#   ./scripts/test-rag-live.sh

set -euo pipefail

# Configuration
API_URL="${API_URL:-https://auroranotes-api-i77nrfls2a-uc.a.run.app}"
FIREBASE_TOKEN="${FIREBASE_TOKEN:-}"
VERBOSE="${VERBOSE:-false}"

# Colors for output (light-theme friendly - using bold/dark variants)
RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;35m'  # Magenta for better visibility on light backgrounds
BLUE='\033[1;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== AuroraNotes RAG Pipeline Live Tests ===${NC}"
echo "API URL: $API_URL"
echo ""

# Firebase token is optional if auth is disabled on the server
if [ -z "$FIREBASE_TOKEN" ]; then
  echo -e "${YELLOW}Note: FIREBASE_TOKEN not set - some endpoints may require auth${NC}"
  echo "To get a token:"
  echo "  1. Sign into your app via Firebase Auth"
  echo "  2. Call firebase.auth().currentUser.getIdToken()"
  echo "  3. Export it: export FIREBASE_TOKEN=\"<token>\""
  echo ""
fi

# Function to make chat API call and extract metrics
test_chat() {
  local test_name="$1"
  local query="$2"
  local expected_field="${3:-}"
  local stream="${4:-false}"
  
  echo -e "${YELLOW}Testing: ${test_name}${NC}"
  echo "  Query: ${query:0:80}..."
  
  local start_time=$(date +%s%3N)
  
  # Build request body - test 'query' field (preferred)
  local request_body=$(cat <<EOF
{
  "query": "$query",
  "stream": $stream
}
EOF
)
  
  local response
  local http_code
  
  # Make the API call (include auth header only if token is provided)
  local auth_header=""
  if [ -n "$FIREBASE_TOKEN" ]; then
    auth_header="-H \"Authorization: Bearer $FIREBASE_TOKEN\""
  fi

  response=$(curl -s -w "\n%{http_code}" \
    -X POST "$API_URL/chat" \
    -H "Content-Type: application/json" \
    ${auth_header} \
    -d "$request_body" 2>&1)
  
  http_code=$(echo "$response" | tail -n1)
  response=$(echo "$response" | sed '$d')
  
  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))
  
  # Parse response
  if [ "$http_code" = "200" ]; then
    local answer=$(echo "$response" | jq -r '.answer // empty' 2>/dev/null || echo "")
    local source_count=$(echo "$response" | jq -r '.sources | length' 2>/dev/null || echo "0")
    local confidence=$(echo "$response" | jq -r '.meta.confidence // "unknown"' 2>/dev/null || echo "unknown")
    local intent=$(echo "$response" | jq -r '.meta.intent // "unknown"' 2>/dev/null || echo "unknown")
    local strategy=$(echo "$response" | jq -r '.meta.debug.strategy // "unknown"' 2>/dev/null || echo "unknown")
    local api_time=$(echo "$response" | jq -r '.meta.responseTimeMs // "N/A"' 2>/dev/null || echo "N/A")
    
    echo -e "  ${GREEN}✓ Status: $http_code${NC}"
    echo "  Response time: ${duration}ms (API reported: ${api_time}ms)"
    echo "  Sources: $source_count | Confidence: $confidence | Intent: $intent"
    echo "  Strategy: $strategy"
    
    if [ "$VERBOSE" = "true" ]; then
      echo "  Answer: ${answer:0:200}..."
    fi
    
    # Check for expected field/keyword in answer
    if [ -n "$expected_field" ]; then
      if echo "$answer" | grep -qi "$expected_field"; then
        echo -e "  ${GREEN}✓ Expected content found: '$expected_field'${NC}"
      else
        echo -e "  ${YELLOW}⚠ Expected content not found: '$expected_field'${NC}"
      fi
    fi
  else
    echo -e "  ${RED}✗ Status: $http_code${NC}"
    local error=$(echo "$response" | jq -r '.error.message // .error // .' 2>/dev/null || echo "$response")
    echo "  Error: ${error:0:200}"
  fi
  echo ""
}

# Function to test with 'message' field for backward compatibility
test_message_field() {
  echo -e "${BLUE}--- Testing 'message' field compatibility ---${NC}"

  local request_body='{"message": "What topics are in my notes?"}'

  local auth_header=""
  if [ -n "$FIREBASE_TOKEN" ]; then
    auth_header="-H \"Authorization: Bearer $FIREBASE_TOKEN\""
  fi

  local response=$(curl -s -w "\n%{http_code}" \
    -X POST "$API_URL/chat" \
    -H "Content-Type: application/json" \
    ${auth_header} \
    -d "$request_body" 2>&1)
  
  local http_code=$(echo "$response" | tail -n1)
  
  if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ 'message' field is supported${NC}"
  else
    echo -e "${YELLOW}⚠ 'message' field returned status $http_code${NC}"
  fi
  echo ""
}

# Run health check first
echo -e "${BLUE}--- Health Check ---${NC}"
health_response=$(curl -s -w "\n%{http_code}" "$API_URL/health" 2>&1)
health_code=$(echo "$health_response" | tail -n1)
if [ "$health_code" = "200" ]; then
  echo -e "${GREEN}✓ API is healthy${NC}"
else
  echo -e "${RED}✗ API health check failed: $health_code${NC}"
fi
echo ""

# Test backward compatibility
test_message_field

echo -e "${BLUE}--- RAG Quality Tests ---${NC}"
echo ""

# Category 1: Technical/Database Queries
echo -e "${BLUE}Category 1: Technical Queries${NC}"
test_chat "PostgreSQL decisions" "What database decisions have we made and why?"
test_chat "Architecture overview" "What is the architecture of our system?"
test_chat "Configuration details" "What configuration or settings are documented?"

# Category 2: Personal Information
echo -e "${BLUE}Category 2: Personal Information${NC}"
test_chat "Names and people" "Who are the people mentioned in my notes?"
test_chat "Dates and events" "What important dates or events are noted?"
test_chat "Personal projects" "What projects am I working on?"

# Category 3: Procedural Queries
echo -e "${BLUE}Category 3: Procedural Queries${NC}"
test_chat "How-to instructions" "How do I deploy the application?"
test_chat "Step-by-step process" "What are the steps to set up the development environment?"

# Category 4: Conceptual Queries
echo -e "${BLUE}Category 4: Conceptual Queries${NC}"
test_chat "Explanation query" "Explain the RAG pipeline and how it works"
test_chat "Summary query" "Summarize my recent notes"
test_chat "Definition query" "What is the chunking strategy we use?"

# Category 5: Out-of-scope Queries
echo -e "${BLUE}Category 5: Out-of-scope Queries${NC}"
test_chat "Unrelated topic" "What is the weather forecast for next week?"
test_chat "Non-existent topic" "Tell me about quantum computing algorithms"

# Category 6: Edge Cases
echo -e "${BLUE}Category 6: Edge Cases${NC}"
test_chat "Very short query" "notes"
test_chat "Long detailed query" "I need a comprehensive overview of all the technical decisions made regarding database architecture, API design patterns, authentication mechanisms, and deployment strategies documented in my notes over the past several months"
test_chat "Query with special chars" "What's the status of the 'high-priority' tasks? (including sub-tasks)"

# Category 7: Intent-specific Tests
echo -e "${BLUE}Category 7: Intent Detection${NC}"
test_chat "Summarize intent" "summarize the key decisions from my meeting notes"
test_chat "List intent" "list all the action items I have pending"
test_chat "Decision intent" "what did we decide about the database?"
test_chat "Question intent" "when was the last deployment?"

echo -e "${BLUE}=== Test Summary ===${NC}"
echo "All tests completed. Review output above for:"
echo "  • Response times (target: <2s for chat, <1s for search)"
echo "  • Source counts and relevance"
echo "  • Confidence levels"
echo "  • Edge case handling"
echo ""
echo "To see full answers, run with: VERBOSE=true ./scripts/test-rag-live.sh"


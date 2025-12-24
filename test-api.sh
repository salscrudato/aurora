#!/bin/bash
# API Testing Script for AuroraNotes

API_URL="http://localhost:8080"
HEADERS=(-H "Content-Type: application/json" -H "X-Dev-User: test-accuracy-user")

echo "=== Testing AuroraNotes API ==="
echo ""

# Test 1: Health check
echo "1. Health Check:"
curl -s "$API_URL/health" | jq -r '.status'
echo ""

# Test 2: Create Note 1 - Quantum Processor
echo "2. Creating Note 1 (Quantum Processor)..."
NOTE1=$(curl -s -X POST "$API_URL/notes" "${HEADERS[@]}" \
  -d '{"title": "Aurora Quantum Processor Specifications", "content": "The Aurora Quantum Processor (AQP-7) is our flagship quantum computing chip. Key specifications: 127 qubits with 99.9% gate fidelity. Operating temperature: 15 millikelvin. Coherence time: 300 microseconds. The chip uses superconducting transmon qubits arranged in a heavy-hex topology. Power consumption: 25 kilowatts for the cryogenic cooling system. Release date: March 15, 2024. Price: $15 million per unit. The AQP-7 can perform 10^18 operations per second for specific quantum algorithms.", "tags": ["hardware", "quantum", "specifications"]}')
echo "$NOTE1" | jq -r '"Created note: " + .id'

# Test 3: Create Note 2 - Meeting Notes
echo "3. Creating Note 2 (Meeting Notes)..."
NOTE2=$(curl -s -X POST "$API_URL/notes" "${HEADERS[@]}" \
  -d '{"title": "Q4 Planning Meeting Notes - December 2024", "content": "Attendees: Sarah Chen (CEO), Marcus Johnson (CTO), Elena Rodriguez (VP Engineering), James Park (CFO). Meeting Date: December 10, 2024. Budget approved: $2.4 million for infrastructure upgrades. Key decisions: 1) Migrate to Kubernetes by February 28, 2025. 2) Hire 12 new engineers in Q1. 3) Launch mobile app beta on January 15, 2025. Action items: Marcus to finalize cloud provider selection by December 20. Elena to submit hiring plan by December 18. James to release Q1 budget allocations by January 3, 2025. Next meeting scheduled for January 7, 2025 at 2pm EST.", "tags": ["meeting", "planning", "q4-2024"]}')
echo "$NOTE2" | jq -r '"Created note: " + .id'

# Test 4: Create Note 3 - Recipe
echo "4. Creating Note 3 (Recipe)..."
NOTE3=$(curl -s -X POST "$API_URL/notes" "${HEADERS[@]}" \
  -d '{"title": "Grandma Maria Secret Marinara Sauce", "content": "Family recipe passed down from my grandmother Maria Rossi in 1962. Ingredients: 2 cans (28 oz each) San Marzano tomatoes, 6 cloves garlic (minced), 1/4 cup extra virgin olive oil, 1 teaspoon sugar, 2 teaspoons salt, 1/2 teaspoon black pepper, 15 fresh basil leaves, 1 tablespoon dried oregano. Instructions: Heat olive oil over medium heat. Saute garlic for 90 seconds until fragrant. Crush tomatoes by hand and add to pot. Add sugar, salt, pepper, and oregano. Simmer for 45 minutes, stirring every 10 minutes. Add basil leaves in final 5 minutes. Yields approximately 6 cups of sauce. Can be frozen for up to 3 months.", "tags": ["recipe", "italian", "family"]}')
echo "$NOTE3" | jq -r '"Created note: " + .id'

# Test 5: Create Note 4 - Medical Information
echo "5. Creating Note 4 (Medical Info)..."
NOTE4=$(curl -s -X POST "$API_URL/notes" "${HEADERS[@]}" \
  -d '{"title": "Dr. Thompson Appointment Notes - November 2024", "content": "Appointment with Dr. Sarah Thompson on November 15, 2024 at 2:30pm. Blood pressure: 118/76 mmHg. Weight: 172 lbs. Cholesterol: Total 195, LDL 110, HDL 65. Vitamin D level: 28 ng/mL (slightly low). Prescribed: Vitamin D3 2000 IU daily. Next annual physical scheduled for November 2025. Recommend: Increase omega-3 intake, continue current exercise routine of 30 minutes walking 5 days per week.", "tags": ["health", "medical", "appointments"]}')
echo "$NOTE4" | jq -r '"Created note: " + .id'

# Test 6: Create Note 5 - Project Details
echo "6. Creating Note 5 (Project Details)..."
NOTE5=$(curl -s -X POST "$API_URL/notes" "${HEADERS[@]}" \
  -d '{"title": "Project Phoenix - Architecture Overview", "content": "Project Phoenix is our next-generation microservices platform. Tech stack: Golang 1.21 for backend services, PostgreSQL 15 for primary database, Redis 7.2 for caching, Kafka 3.6 for event streaming. Deployment: Kubernetes 1.28 on AWS EKS across 3 availability zones. Target SLA: 99.95% uptime, p99 latency under 100ms. Team size: 8 engineers, 2 QA, 1 DevOps. Sprint duration: 2 weeks. Current milestone: Beta release on February 1, 2025. Budget: $450,000 for 2024.", "tags": ["project", "architecture", "phoenix"]}')
echo "$NOTE5" | jq -r '"Created note: " + .id'

echo ""
echo "=== Waiting 5 seconds for embeddings to process ==="
sleep 5

echo ""
echo "=== Running Accuracy Tests ==="
echo ""

# Accuracy Test 1: Exact number recall
echo "TEST 1: How many qubits does the AQP-7 have?"
curl -s -X POST "$API_URL/chat" "${HEADERS[@]}" \
  -d '{"message": "How many qubits does the AQP-7 quantum processor have?"}' | jq -r '.response'
echo ""
echo "EXPECTED: 127 qubits"
echo "---"

# Accuracy Test 2: Specific date recall
echo "TEST 2: What is the Kubernetes migration deadline?"
curl -s -X POST "$API_URL/chat" "${HEADERS[@]}" \
  -d '{"message": "When is the deadline to migrate to Kubernetes?"}' | jq -r '.response'
echo ""
echo "EXPECTED: February 28, 2025"
echo "---"

# Accuracy Test 3: Recipe ingredient amount
echo "TEST 3: How many basil leaves in the marinara recipe?"
curl -s -X POST "$API_URL/chat" "${HEADERS[@]}" \
  -d '{"message": "How many fresh basil leaves does grandma marinara recipe need?"}' | jq -r '.response'
echo ""
echo "EXPECTED: 15 fresh basil leaves"
echo "---"

# Accuracy Test 4: Medical measurement
echo "TEST 4: What was my blood pressure at Dr Thompson?"
curl -s -X POST "$API_URL/chat" "${HEADERS[@]}" \
  -d '{"message": "What was my blood pressure reading at my last doctor appointment?"}' | jq -r '.response'
echo ""
echo "EXPECTED: 118/76 mmHg"
echo "---"

# Accuracy Test 5: Budget amount
echo "TEST 5: What is Project Phoenix budget?"
curl -s -X POST "$API_URL/chat" "${HEADERS[@]}" \
  -d '{"message": "What is the budget for Project Phoenix in 2024?"}' | jq -r '.response'
echo ""
echo "EXPECTED: $450,000"
echo "---"

# Accuracy Test 6: Combined details
echo "TEST 6: What is the AQP-7 price and release date?"
curl -s -X POST "$API_URL/chat" "${HEADERS[@]}" \
  -d '{"message": "What is the price and release date of the Aurora Quantum Processor?"}' | jq -r '.response'
echo ""
echo "EXPECTED: $15 million, March 15, 2024"
echo "---"

# Accuracy Test 7: List recall
echo "TEST 7: Who attended the Q4 planning meeting?"
curl -s -X POST "$API_URL/chat" "${HEADERS[@]}" \
  -d '{"message": "Who were the attendees at the Q4 planning meeting in December 2024?"}' | jq -r '.response'
echo ""
echo "EXPECTED: Sarah Chen (CEO), Marcus Johnson (CTO), Elena Rodriguez (VP Engineering), James Park (CFO)"
echo "---"

# Accuracy Test 8: Specific technical detail
echo "TEST 8: What is the coherence time of AQP-7?"
curl -s -X POST "$API_URL/chat" "${HEADERS[@]}" \
  -d '{"message": "What is the coherence time of the quantum processor?"}' | jq -r '.response'
echo ""
echo "EXPECTED: 300 microseconds"
echo "---"

echo ""
echo "=== Testing Complete ==="


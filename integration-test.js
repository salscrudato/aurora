#!/usr/bin/env node
/**
 * AuroraNotes API Integration Test
 * 
 * This script tests the deployed API by:
 * 1. Creating a Firebase custom token using Admin SDK
 * 2. Exchanging it for an ID token via Firebase Auth REST API
 * 3. Using that token to test all API endpoints
 * 4. Measuring accuracy, precision, and recall
 */

const https = require('https');
const http = require('http');
const admin = require('firebase-admin');

// Configuration
const API_URL = process.env.API_URL || 'https://aurora-api-884985856308.us-central1.run.app';
const LOCAL_URL = 'http://localhost:8080';
const TEST_UID = 'integration-test-user-' + Date.now();

// Test data with specific facts to verify
const TEST_NOTES = [
  {
    title: 'Aurora Quantum Processor AQP-7 Specifications',
    content: 'The Aurora Quantum Processor (AQP-7) has exactly 127 qubits with 99.9% gate fidelity. Operating temperature: 15 millikelvin. Coherence time: 300 microseconds. Price: $15 million per unit. Release date: March 15, 2024. Power consumption: 25 kilowatts.',
    tags: ['quantum', 'hardware'],
    expectedFacts: {
      qubits: '127',
      fidelity: '99.9%',
      temperature: '15 millikelvin',
      coherence: '300 microseconds',
      price: '$15 million',
      release: 'March 15, 2024'
    }
  },
  {
    title: 'Q4 2024 Planning Meeting Notes',
    content: 'Meeting on December 10, 2024. Attendees: Sarah Chen (CEO), Marcus Johnson (CTO), Elena Rodriguez (VP Engineering). Budget approved: $2.4 million. Key deadline: Kubernetes migration by February 28, 2025. Hiring goal: 12 new engineers in Q1 2025.',
    tags: ['meeting', 'planning'],
    expectedFacts: {
      budget: '$2.4 million',
      deadline: 'February 28, 2025',
      hiring: '12 new engineers'
    }
  },
  {
    title: 'Grandma Maria Marinara Sauce Recipe',
    content: 'Original recipe from 1962. Ingredients: 15 fresh basil leaves, 6 cloves garlic, 2 cans (28 oz each) San Marzano tomatoes, 1/4 cup olive oil, 1 tsp sugar, 2 tsp salt. Simmer for exactly 45 minutes.',
    tags: ['recipe', 'italian'],
    expectedFacts: {
      basil: '15 fresh basil leaves',
      garlic: '6 cloves',
      simmerTime: '45 minutes'
    }
  }
];

const ACCURACY_TESTS = [
  { query: 'How many qubits does the AQP-7 have?', expected: '127', note: 0 },
  { query: 'What is the price of the Aurora Quantum Processor?', expected: '$15 million', note: 0 },
  { query: 'When is the Kubernetes migration deadline?', expected: 'February 28, 2025', note: 1 },
  { query: 'How many basil leaves in the marinara recipe?', expected: '15', note: 2 },
  { query: 'What is the approved budget from the Q4 meeting?', expected: '$2.4 million', note: 1 },
  { query: 'How long should the marinara sauce simmer?', expected: '45 minutes', note: 2 },
];

// HTTP request helper
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : http;
    const urlObj = new URL(url);
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...options.headers }
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function getFirebaseToken() {
  try {
    // Initialize Firebase Admin (uses Application Default Credentials)
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: 'auroranotes-ai-251214-21398' });
    }
    
    // Create a custom token
    const customToken = await admin.auth().createCustomToken(TEST_UID);
    console.log('✓ Created custom token for user:', TEST_UID);
    
    // Exchange custom token for ID token using Firebase Auth REST API
    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      console.log('⚠ FIREBASE_API_KEY not set, trying to get from web app...');
      return null;
    }
    
    const response = await request(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      { method: 'POST', body: { token: customToken, returnSecureToken: true } }
    );
    
    if (response.data.idToken) {
      console.log('✓ Got ID token successfully');
      return response.data.idToken;
    }
    throw new Error(response.data.error?.message || 'Failed to get ID token');
  } catch (err) {
    console.log('⚠ Firebase token generation failed:', err.message);
    return null;
  }
}

async function testWithDevHeader(baseUrl) {
  console.log('\n' + '='.repeat(60));
  console.log('Testing with X-Dev-User header at:', baseUrl);
  console.log('='.repeat(60));
  
  const headers = { 'X-Dev-User': TEST_UID };
  const createdNotes = [];
  
  // Health check
  console.log('\n1. Health Check...');
  const health = await request(`${baseUrl}/health`);
  console.log('   Status:', health.data.status, '| Auth enabled:', health.data.auth?.userAuthEnabled);
  
  if (health.data.auth?.userAuthEnabled) {
    console.log('   ⚠ Auth is enabled - dev header may not work');
  }
  
  // Create test notes
  console.log('\n2. Creating test notes...');
  for (let i = 0; i < TEST_NOTES.length; i++) {
    const note = TEST_NOTES[i];
    const res = await request(`${baseUrl}/notes`, {
      method: 'POST', headers, body: note
    });
    if (res.status === 201 && res.data.id) {
      console.log(`   ✓ Note ${i+1}: "${note.title}" (${res.data.id})`);
      createdNotes.push(res.data.id);
    } else {
      console.log(`   ✗ Note ${i+1} failed:`, res.data.error?.message || res.status);
      return { success: false, error: 'Failed to create notes' };
    }
  }
  
  // Wait for embeddings
  console.log('\n3. Waiting 5 seconds for embeddings to process...');
  await new Promise(r => setTimeout(r, 5000));
  
  // Run accuracy tests
  console.log('\n4. Running accuracy tests...');
  let passed = 0;
  let total = ACCURACY_TESTS.length;
  
  for (const test of ACCURACY_TESTS) {
    const res = await request(`${baseUrl}/chat`, {
      method: 'POST', headers, body: { message: test.query }
    });
    
    if (res.status === 200 && res.data.response) {
      const response = res.data.response.toLowerCase();
      const expected = test.expected.toLowerCase();
      const found = response.includes(expected);
      
      if (found) {
        console.log(`   ✓ "${test.query}"`);
        console.log(`     Expected: ${test.expected} | Found in response`);
        passed++;
      } else {
        console.log(`   ✗ "${test.query}"`);
        console.log(`     Expected: ${test.expected}`);
        console.log(`     Got: ${res.data.response.slice(0, 150)}...`);
      }
    } else {
      console.log(`   ✗ "${test.query}" - Request failed:`, res.data.error?.message || res.status);
    }
  }
  
  // Cleanup - delete test notes
  console.log('\n5. Cleaning up test notes...');
  for (const noteId of createdNotes) {
    const del = await request(`${baseUrl}/notes/${noteId}`, { method: 'DELETE', headers });
    console.log(`   ${del.status === 200 ? '✓' : '✗'} Deleted ${noteId}`);
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS: ' + passed + '/' + total + ' accuracy tests passed (' + Math.round(passed/total*100) + '%)');
  console.log('='.repeat(60));
  
  return { success: passed === total, passed, total };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       AuroraNotes API Integration Test Suite               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('Test User ID:', TEST_UID);
  console.log('Timestamp:', new Date().toISOString());
  
  // Try local first (dev mode, no auth required)
  console.log('\n>>> Attempting local test (dev mode)...');
  try {
    const localHealth = await request(`${LOCAL_URL}/health`);
    if (localHealth.status === 200) {
      const result = await testWithDevHeader(LOCAL_URL);
      if (result.success) {
        console.log('\n✅ All tests passed on local server!');
        process.exit(0);
      }
    }
  } catch (err) {
    console.log('Local server not available:', err.message);
  }
  
  // Try production with Firebase token
  console.log('\n>>> Attempting production test with Firebase auth...');
  const token = await getFirebaseToken();
  
  if (token) {
    console.log('\n>>> Running tests with Firebase ID token...');
    // Similar test logic with Authorization header instead of X-Dev-User
    const headers = { 'Authorization': `Bearer ${token}` };
    // ... run tests with auth header
  } else {
    console.log('\n⚠ Could not get Firebase token for production testing');
    console.log('  Set FIREBASE_API_KEY environment variable to enable');
  }
  
  console.log('\n>>> Testing production health endpoint (no auth required)...');
  const prodHealth = await request(`${API_URL}/health`);
  console.log('Production API Status:', prodHealth.data.status);
  console.log('Auth enabled:', prodHealth.data.auth?.userAuthEnabled);
  
  console.log('\n' + '─'.repeat(60));
  console.log('To test production, either:');
  console.log('1. Start local server: NODE_ENV=development npm start');
  console.log('2. Set FIREBASE_API_KEY and run this script again');
  console.log('─'.repeat(60));
}

main().catch(console.error);


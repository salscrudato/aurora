#!/bin/bash
#
# Build, deploy, and test the AuroraNotes API
#

set -e
cd /Users/salscrudato/Projects/auroranotes-api

# Generate a random test secret
TEST_SECRET="aurora-test-$(openssl rand -hex 16)"
echo "Generated test secret: ${TEST_SECRET:0:20}..."

# Build
echo ""
echo "=== Building TypeScript ==="
npm run build

# Deploy with test secret
echo ""
echo "=== Deploying to Cloud Run ==="
gcloud run deploy aurora-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --timeout 300 \
  --set-env-vars "INTEGRATION_TEST_SECRET=$TEST_SECRET"

# Get the URL
API_URL=$(gcloud run services describe aurora-api --region us-central1 --format='value(status.url)')
echo ""
echo "Deployed to: $API_URL"

# Wait for service to be ready
echo ""
echo "=== Waiting for service to be ready ==="
sleep 5

# Run tests
echo ""
echo "=== Running Integration Tests ==="
export API_URL
export INTEGRATION_TEST_SECRET="$TEST_SECRET"
chmod +x run-tests.sh
./run-tests.sh

# Remove test secret after testing (optional - for security)
echo ""
echo "=== Removing test secret from production ==="
gcloud run services update aurora-api \
  --region us-central1 \
  --remove-env-vars INTEGRATION_TEST_SECRET \
  --quiet

echo ""
echo "Done! Test secret has been removed from production."


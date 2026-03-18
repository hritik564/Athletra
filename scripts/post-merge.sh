#!/bin/bash
set -e

npm install --legacy-peer-deps

if [ -f "shared/schema.ts" ]; then
  npm run db:push --if-present || true
fi

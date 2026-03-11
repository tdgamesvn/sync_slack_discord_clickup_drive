#!/bin/bash
# Quick deploy script: commit, push, and deploy to VPS
# Usage: ./deploy.sh "commit message"

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check commit message
if [ -z "$1" ]; then
    echo -e "${RED}❌ Please provide a commit message${NC}"
    echo "Usage: ./deploy.sh \"your commit message\""
    exit 1
fi

echo -e "${YELLOW}📦 Staging changes...${NC}"
git add .

echo -e "${YELLOW}💾 Committing: $1${NC}"
git commit -m "$1"

echo -e "${YELLOW}🚀 Pushing to GitHub...${NC}"
git push origin main

echo -e "${GREEN}✅ Pushed! GitHub Actions will auto-deploy to VPS.${NC}"
echo -e "${GREEN}   Check: https://github.com/tdgamesvn/sync_slack_discord_clickup_drive/actions${NC}"

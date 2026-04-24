#!/bin/bash
# ════════════════════════════════════════════════
#  NEXRAD 3D Radar Visualization — Startup Script
# ════════════════════════════════════════════════

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/server"
DATA_DIR="$SCRIPT_DIR/data"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${CYAN}  ◈ NEXRAD 3D Radar Visualization System${NC}"
echo -e "${CYAN}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo -e "${RED}  ✗ Node.js not found. Install from https://nodejs.org${NC}"
  exit 1
fi

NODE_VER=$(node -v)
echo -e "  ${GREEN}✓${NC} Node.js $NODE_VER"

# Install dependencies if needed
if [ ! -d "$SERVER_DIR/node_modules" ]; then
  echo -e "  ${YELLOW}⟳${NC} Installing server dependencies..."
  cd "$SERVER_DIR" && npm install --silent
  echo -e "  ${GREEN}✓${NC} Dependencies installed"
fi

# Create data directory
mkdir -p "$DATA_DIR"
echo -e "  ${GREEN}✓${NC} Data directory: $DATA_DIR"

# Check port availability
PORT=${PORT:-3000}
if lsof -Pi :$PORT -sTCP:LISTEN -t &>/dev/null 2>&1; then
  echo -e "  ${YELLOW}⚠${NC}  Port $PORT in use. Set PORT= env to use another."
fi

echo ""
echo -e "  ${CYAN}Starting server on http://localhost:$PORT${NC}"
echo -e "  Press Ctrl+C to stop."
echo ""

# Start server
cd "$SERVER_DIR"
PORT=$PORT node --max-old-space-size=1536 index.js
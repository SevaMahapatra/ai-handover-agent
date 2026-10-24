# Always-on handover worker: one Slack Socket Mode listener that runs handover cycles every CYCLE_MINUTES.
# UNTESTED: Docker isn't installed on the build laptop. See DEPLOY.md.
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts skips ffmpeg-static's 80 MB download (the camera pipeline isn't used by the handover).
RUN npm ci --omit=dev --ignore-scripts
COPY . .
# Mount a persistent volume here: ledger, shift state, drafts.
VOLUME ["/app/state"]
# First boot on an empty volume: start from the committed ledger, so obligation keys match the existing Linear issues (no duplicates).
CMD ["sh", "-c", "mkdir -p state && { [ -f state/ledger.json ] || cp deploy/ledger.seed.json state/ledger.json; } && exec node handover/listen.js"]

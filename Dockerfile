# syntax=docker/dockerfile:1.7

# ─── Build stage ────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:css

# Strip dev deps for the runtime image.
RUN npm prune --omit=dev

# ─── Runtime stage ──────────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates postgresql-client \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/logs

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.json ./

EXPOSE 3000

CMD ["npm", "start"]

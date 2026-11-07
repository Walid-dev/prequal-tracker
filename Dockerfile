# Builds the app in a full image, then runs it in a small one as a non-root user.
# Both stages use Debian bookworm, so the SQLite driver installed in the first stage also runs in the second.

FROM node:22-bookworm AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/app.db
# The database lives in /data, which compose mounts as a named volume.
RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "server.js"]

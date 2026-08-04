# syntax=docker/dockerfile:1.7

ARG APP_BASE_PATH=/dogs/akita

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@11.9.0 --activate

WORKDIR /app


FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile


FROM dependencies AS migrator

COPY . .
USER node

CMD ["pnpm", "db:deploy"]


FROM dependencies AS builder

ARG APP_BASE_PATH
ENV APP_BASE_PATH=$APP_BASE_PATH

# Prisma loads DATABASE_URL while generating the client. No database connection
# is made during generation; the real value is supplied only at runtime.
ENV DATABASE_URL=postgresql://build-only:build-only@127.0.0.1:5432/build-only?schema=public
ENV DEFAULT_HOUSEHOLD_ID=00000000-0000-4000-8000-000000000001

COPY . .
RUN mkdir -p public \
    && pnpm build


FROM node:24-bookworm-slim AS runner

ARG APP_BASE_PATH

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_BASE_PATH=$APP_BASE_PATH
ENV HOSTNAME=0.0.0.0
ENV PORT=3101

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home --home-dir /app nextjs

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3101

CMD ["node", "server.js"]

# This is PRODUCTION Dockerfile for Strapi in Turborepo.
# It's assumed that this Dockerfile is run from the root of the monorepo.

# Related references:
# - https://docs.strapi.io/dev-docs/installation/docker#production-dockerfile
# - https://github.com/vercel/turbo/blob/main/examples/with-docker/apps/api/Dockerfile

# Customize APP (name of folder in /apps) and WORKSPACE (name from package.json) to match this app
ARG APP=strapi
ARG WORKSPACE=@repo/strapi

FROM node:22-alpine AS base

RUN apk update && apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev vips-dev git > /dev/null 2>&1

# Install pnpm globally
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# Set working directory
WORKDIR /app

# ---
FROM base AS prepare
ARG WORKSPACE

# Install turbo globally to prune below
RUN pnpm add -g turbo@2.7.3

COPY . .

# see https://turbo.build/repo/docs/reference/command-line-reference#turbo-prune---scopetarget
RUN turbo prune ${WORKSPACE} --docker

# ---
FROM base AS builder

ARG APP

# Install turbo globally to use during build below
RUN pnpm add -g turbo@2.7.3
# Install node-gyp globally to build native addons
RUN pnpm add -g node-gyp

# First install dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=prepare /app/out/json/ .
COPY --from=prepare /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=prepare /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Override NODE_ENV for build stage to install all dependencies including devDependencies
# They (typescrip, tailwindcss etc.) are needed during build and pnpm would skip them from the start
ENV NODE_ENV=development

# see https://github.com/moby/buildkit/blob/master/frontend/dockerfile/docs/reference.md#run---mounttypecache
# NOTE: --ignore-scripts is intentionally NOT set here. It empirically
# breaks creation of workspace bin shims (apps/strapi/node_modules/.bin/strapi)
# in this pnpm v10 setup, and native deps (sharp, esbuild) need their
# install scripts anyway.
RUN \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

ENV PATH=/app/apps/${APP}/node_modules/.bin:$PATH

# Build the project and its dependencies.
COPY --from=prepare /app/out/full/ .
COPY turbo.json turbo.json

# Cap Node heap so Vite (admin panel build) doesn't grow until the
# kernel OOM-kills it (exit 137) on memory-constrained hosts.
# Override with `--build-arg NODE_MAX_OLD_SPACE_SIZE=8192` if needed.
ARG NODE_MAX_OLD_SPACE_SIZE=4096
ENV NODE_OPTIONS=--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}

RUN turbo run build --concurrency=1

# NOTE: We intentionally do NOT run `pnpm prune --prod` here.
# In this pnpm v10 + Turborepo workspace it produces a broken
# node_modules tree where workspace `.bin/` shims end up missing in the
# runner stage. devDependencies stay in the final image — slightly
# larger but functional. TODO: switch to `pnpm --filter @repo/strapi
# deploy --prod /deploy` for a proper slim production install.

# ---
FROM node:22-alpine AS runner

RUN apk add --no-cache vips-dev

ARG APP
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# Don't run production as root
RUN addgroup --system --gid 1001 strapi
RUN adduser --system --uid 1001 strapi

WORKDIR /app
COPY --from=builder --chown=strapi:strapi /app /app

ENV PATH=/app/apps/${APP}/node_modules/.bin:$PATH

USER strapi
WORKDIR /app/apps/${APP}
EXPOSE ${PORT:-1337}
# Invoke the real strapi entrypoint via node, going through the
# @strapi/strapi symlink (which points into the pnpm virtual store).
# This avoids any dependency on the `.bin/strapi` shim, whose creation
# behavior in pnpm v10 + workspace + Docker has proven flaky.
CMD ["node", "node_modules/@strapi/strapi/bin/strapi.js", "start"]
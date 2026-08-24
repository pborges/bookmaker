# syntax=docker/dockerfile:1

# --- build ---
FROM node:22-alpine AS build
WORKDIR /app

# ARG, not ENV: only needs to be visible to the `npm run build` step below,
# where Vite bakes it into the static bundle as import.meta.env.VITE_APP_VERSION.
ARG APP_VERSION=dev
ENV VITE_APP_VERSION=$APP_VERSION

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- serve ---
# Unprivileged variant: listens on 8080 and runs as a non-root user out of the
# box, so the Deployment can set runAsNonRoot/drop-ALL without extra plumbing.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS serve

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

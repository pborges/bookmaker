// Set at Docker build time from the git tag (see Dockerfile/CI); falls back
// to "dev" for local `npm run dev` / unversioned builds.
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "dev";

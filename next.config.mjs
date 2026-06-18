import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // node:sqlite is a built-in; keep it external to the server bundle.
  serverExternalPackages: ["node:sqlite"],
  // We're inside a parent dir that also has a lockfile; pin the tracing root here.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;

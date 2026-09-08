/** @type {import('next').NextConfig} */
const nextConfig = {
  // Headless: no UI, route handlers only.

  // contract.md is read at runtime with readFileSync. Serverless bundles only trace
  // imported code, so without this the file is missing on Vercel and every tool call
  // throws ENOENT. Trace it into every route.
  outputFileTracingIncludes: {
    "/*": ["./lib/core/contract.md"],
  },
};
export default nextConfig;

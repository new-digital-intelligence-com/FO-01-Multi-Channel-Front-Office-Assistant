/** @type {import('next').NextConfig} */
const nextConfig = {
  // Headless: no UI, route handlers only.

  // rules.md is read at runtime with readFileSync. Serverless bundles only trace
  // imported code, so without this the file is missing on Vercel and every tool call
  // throws ENOENT. Trace it into every route.
  outputFileTracingIncludes: {
    "/*": ["./lib/core/rules.md"],
  },

  // The console is the app's front page. It is plain HTML in public/, so Vercel's CDN
  // serves it and Next never renders it.
  async rewrites() {
    return [{ source: "/", destination: "/console.html" }];
  },
};
export default nextConfig;

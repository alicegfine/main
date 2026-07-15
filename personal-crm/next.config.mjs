/** @type {import('next').NextConfig} */
const nextConfig = {
  // These are Node-only libs; keep webpack from bundling them (the scheduler
  // and email sender run only in the Node.js runtime).
  serverExternalPackages: ["node-cron", "nodemailer"],
  eslint: {
    // Deploys shouldn't be blocked on lint; run `npm run lint` locally.
    ignoreDuringBuilds: true,
  },
  webpack: (config, { nextRuntime }) => {
    // instrumentation.ts is compiled for the edge runtime too, which drags in
    // the (Node-only) scheduler → nodemailer chain. That code is guarded to
    // run only in the Node.js runtime, so stub the Node builtins in the
    // non-Node bundle to let the build succeed. They're never executed there.
    if (nextRuntime !== "nodejs") {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        path: false,
        stream: false,
        crypto: false,
        os: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
        zlib: false,
        http: false,
        https: false,
        url: false,
      };
    }
    return config;
  },
};

export default nextConfig;

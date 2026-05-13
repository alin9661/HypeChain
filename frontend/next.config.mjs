/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    // Privy pulls these Solana packages in server-side; keep them out of the
    // server bundle so Node.js's CommonJS loader resolves them at runtime.
    // DO NOT apply on the client bundle — `require()` is undefined in browsers,
    // so any leftover `require('@solana/kit')` would crash the layout at load.
    if (isServer) {
      config.externals.push({
        '@solana/kit': 'commonjs @solana/kit',
        '@solana-program/memo': 'commonjs @solana-program/memo',
        '@solana-program/system': 'commonjs @solana-program/system',
        '@solana-program/token': 'commonjs @solana-program/token',
      });
    }
    return config;
  },
  turbopack: {
    // Empty config to acknowledge Turbopack awareness
  },
}

export default nextConfig
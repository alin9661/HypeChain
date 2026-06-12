/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // @react-three/fiber 9.x ships no `exports` map (only main/module), the
  // classic dual-package hazard: Turbopack can instantiate the package twice
  // (ESM + CJS interop), so <Canvas> writes the R3F store into one copy while
  // drei's useThree/useFBO read the other → "R3F: Hooks can only be used
  // within the Canvas component!" in dev. Transpiling forces one resolution
  // path through Next for all three packages.
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
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
    // Pin every importer of fiber (the app, drei, its-fine) to the single ESM
    // build so Turbopack cannot create a second module instance — see the
    // transpilePackages comment above for the failure mode this prevents.
    resolveAlias: {
      '@react-three/fiber': '@react-three/fiber/dist/react-three-fiber.esm.js',
    },
  },
}

export default nextConfig
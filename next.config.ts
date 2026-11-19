import type { NextConfig } from 'next';

const isStaticExport = process.env.STATIC_EXPORT === 'true';

const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').trim().replace(/^\/+|\/+$/g, '');
const normalizedBasePath = rawBasePath ? `/${rawBasePath}` : '';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: isStaticExport
    ? {
        unoptimized: true,
      }
    : {
        remotePatterns: [
          {
            protocol: 'https',
            hostname: 'picsum.photos',
            port: '',
            pathname: '/**',
          },
        ],
      },
  ...(isStaticExport
    ? {
        output: 'export' as const,
        trailingSlash: true,
        ...(normalizedBasePath ? { basePath: normalizedBasePath } : {}),
      }
    : {
        output: 'standalone' as const,
        serverExternalPackages: ['firebase-admin'],
      }),
  transpilePackages: ['motion'],
  webpack: (config, { dev }) => {
    if (dev) {
      // Prevent Next.js 15 Webpack dev cache from serving mismatched module factory IDs
      // across clean restarts (Cannot read properties of undefined reading 'call').
      config.cache = false;
    }
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;

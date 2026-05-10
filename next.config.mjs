/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: '/PROJECT-X-worker',
  assetPrefix: '/PROJECT-X-worker',
  trailingSlash: true,
};

export default nextConfig;

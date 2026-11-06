import path from 'node:path';

/** @type {import('next').NextConfig} */
const config = {
  serverExternalPackages: ['xlsx'],
  poweredByHeader: false,
  outputFileTracingRoot: path.resolve(process.cwd()),
};

export default config;

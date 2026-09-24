/**
 * JpMC Synapse — Full-Stack Server Entry Point
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 * Timezone: Asia/Dhaka (UTC+6)
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const distDir = path.resolve(process.cwd(), 'dist');
const distServer = path.resolve(distDir, 'server.cjs');
const distHtml = path.resolve(distDir, 'index.html');

// In production / Cloud Run: ensure build artifacts exist
if (!fs.existsSync(distServer) || !fs.existsSync(distHtml)) {
  console.log('[server.ts] Production build artifacts not found in dist/. Triggering build...');
  try {
    const { execSync } = await import('node:child_process');
    execSync('npm run build', { stdio: 'inherit' });
  } catch (buildErr) {
    console.error('[server.ts] Automated build attempt failed:', buildErr);
  }
}

if (fs.existsSync(distServer)) {
  console.log('[server.ts] Loading pre-bundled production server from dist/server.cjs...');
  await import(pathToFileURL(distServer).href);
} else {
  console.log('[server.ts] dist/server.cjs missing. Spawning server via tsx loader...');
  const { fork } = await import('node:child_process');
  const tsxCli = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (fs.existsSync(tsxCli)) {
    fork(tsxCli, ['server.source.ts'], { stdio: 'inherit' });
  } else {
    // Fallback import
    await import('./server.source.ts');
  }
}

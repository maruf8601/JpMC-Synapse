/**
 * JpMC Synapse — Full-Stack Server Entry Point
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 * Timezone: Asia/Dhaka (UTC+6)
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const isProduction =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.K_SERVICE);

const distServer = path.resolve(process.cwd(), 'dist', 'server.cjs');

// In production / Cloud Run: run pre-bundled production server bundle
if (isProduction && fs.existsSync(distServer)) {
  await import(distServer);
} else {
  // In development (runs under tsx)
  await import('./server.source.ts');
}

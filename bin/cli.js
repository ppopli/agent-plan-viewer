#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distCli = path.resolve(__dirname, '../dist/cli/index.js');
const srcCli = path.resolve(__dirname, '../src/cli/index.ts');

if (fs.existsSync(distCli)) {
  await import(pathToFileURL(distCli).href);
} else {
  // Local dev fallback: register tsx ESM loader before importing .ts source
  try {
    const { register } = await import('tsx/esm/api');
    register();
    await import(pathToFileURL(srcCli).href);
  } catch (err) {
    console.error(
      'Error: Compiled CLI not found at dist/cli/index.js and tsx loader is unavailable.\nRun "npm run build" first.'
    );
    process.exit(1);
  }
}

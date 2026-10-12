#!/usr/bin/env node

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distCli = path.resolve(__dirname, '../dist/cli/index.js');
const srcCli = path.resolve(__dirname, '../src/cli/index.ts');

if (fs.existsSync(distCli)) {
  import(distCli);
} else {
  // Use tsx dynamically in dev/source mode
  import('tsx/cli').then(() => {
    import(srcCli);
  }).catch(() => {
    import(srcCli);
  });
}

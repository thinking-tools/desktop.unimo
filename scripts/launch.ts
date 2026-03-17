#!/usr/bin/env tsx
import { spawn } from 'child_process';
import { platform } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const electronPath = join(projectRoot, 'node_modules/electron/cli.js');

const args = [electronPath, '.'];
const env = { ...process.env };

if (platform() === 'linux') {
  args.push('--no-sandbox');
  env.LIBVA_DRIVER_NAME = '';
  env.LIBVA_DRIVERS_PATH = '';
  args.push('--disable-gpu');
}

const child = spawn('node', args, {
  cwd: projectRoot,
  stdio: 'inherit',
  env,
});

child.on('close', code => process.exit(code || 0));

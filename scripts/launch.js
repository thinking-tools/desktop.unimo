#!/usr/bin/env node
// Platform-aware Electron launcher
// Disables sandbox on Linux where SUID sandbox requires root permissions

import { spawn } from 'child_process';
import { platform } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const electronPath = join(projectRoot, 'node_modules/electron/cli.js');

const args = [electronPath, '.'];
const env = { ...process.env };

// Linux-specific configuration
if (platform() === 'linux') {
  // Disable sandbox (requires root-owned chrome-sandbox otherwise)
  args.push('--no-sandbox');

  // Suppress libva/vaapi errors by disabling hardware video acceleration
  // These errors occur when Intel/AMD GPU drivers aren't properly configured
  env.LIBVA_DRIVER_NAME = '';
  env.LIBVA_DRIVERS_PATH = '';

  // Disable GPU acceleration to avoid driver issues
  args.push('--disable-gpu');
}

const child = spawn('node', args, {
  cwd: projectRoot,
  stdio: 'inherit',
  env,
});

child.on('close', code => process.exit(code || 0));

# Linux/Ubuntu Setup Notes

This document describes the changes made to run the Unimo desktop app on Linux/Ubuntu.

## Prerequisites

1. Node.js (v18 or later recommended)
2. npm

## Setup Steps

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Copy the environment file:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Kagi API key if you want web search functionality.

3. Run in development mode:
   ```bash
   npm run dev
   ```

4. Run tests:
   ```bash
   npm run test
   ```

## Harmless Warnings

You may see these warnings on Linux - they are **non-critical** and do not affect functionality:

```
libva error: /usr/lib/x86_64-linux-gnu/dri/iHD_drv_video.so init failed
```
This occurs when Intel video acceleration drivers aren't configured. The app uses software rendering.

```
ERROR:dbus/object_proxy.cc:573] Failed to call method: org.freedesktop.systemd1.Manager.StartTransientUnit
```
This occurs when systemd scope creation conflicts (e.g., running multiple instances). Harmless.

## Changes Made for Linux Support

### 1. Platform-aware Electron Launcher (`scripts/launch.js`)

Created a launcher script that automatically adds `--no-sandbox` flag only on Linux. This is necessary because Electron's SUID sandbox requires the `chrome-sandbox` binary to be root-owned with mode 4755, which is impractical for development.

On macOS and Windows, sandboxing works normally without this flag.

### 2. Updated `package.json` Scripts

Modified `dev` and `start` scripts to use the platform-aware launcher instead of launching Electron directly.

### 3. Updated Playwright Tests (`tests/e2e/stratup.spec.ts`)

Added platform detection to pass `--no-sandbox` when running tests on Linux.

### 4. Linux App Detection (`src/providers/apps.ts`)

- Added `parseDesktopFile()` function to parse Linux `.desktop` files
- Added `getInstalledAppsLinux()` function to scan standard Linux application directories:
  - `/usr/share/applications`
  - `/usr/local/share/applications`
  - `~/.local/share/applications`
  - Flatpak locations
  - Snap locations
- Modified `buildIndex()` to use Linux-specific app detection
- Added `iconName` field to `AppEntry` interface to store icon names for Linux

### 5. Linux Icon Loading (`src/providers/apps.ts`)

Expanded `extractLinuxIcon()` to search many icon theme locations:
- `/usr/share/pixmaps`
- `/usr/share/icons/hicolor`, `/usr/share/icons/Adwaita`, `/usr/share/icons/gnome`, etc.
- User icon directories (`~/.local/share/icons`, `~/.icons`)
- Multiple icon sizes (32x32, 48x48, 64x64, 128x128, 256x256, scalable)
- Both PNG and SVG formats

### 6. Linux App Launching (`src/actions.ts`)

Added Linux-specific app launching that executes the command from the `.desktop` file's `Exec` field directly.

## Alternative: Enable Sandbox Properly

If you prefer to keep sandbox enabled on Linux (more secure), run:
```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

Then modify `scripts/launch.js` and `tests/e2e/stratup.spec.ts` to not add `--no-sandbox` on Linux.

## Build for Distribution

To build a Linux package:
```bash
npm run app:linux
```

This creates AppImage and .deb packages in the `dist/` directory.

import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const git = (command: string, fallback: string) => {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return fallback;
  }
};

// Baked in at build time so the header can show exactly which commit is
// deployed — Amplify builds from a fresh git checkout, so this works there
// the same as it does locally.
const commitHash = git('git rev-parse --short HEAD', 'dev');
const commitDate = git('git log -1 --format=%cd --date=format:%Y-%m-%d', '');

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(commitHash),
    __APP_BUILD_DATE__: JSON.stringify(commitDate),
  },
});

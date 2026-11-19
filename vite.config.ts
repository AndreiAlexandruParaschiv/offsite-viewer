import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { parseCustomerSelection } from './src/data/parseCustomerSelection';

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
const selectionFile = new URL('./private/customer-selection.local.json', import.meta.url);
const customerSelection = parseCustomerSelection(
  existsSync(selectionFile) ? JSON.parse(readFileSync(selectionFile, 'utf8')) : undefined,
);

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(commitHash),
    __APP_BUILD_DATE__: JSON.stringify(commitDate),
    __CUSTOMER_SELECTION__: JSON.stringify(customerSelection),
  },
});

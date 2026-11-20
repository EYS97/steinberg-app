// Copy the Vite build output (dist/) into public/ so `firebase deploy` ships
// the FRESH bundle.
//
// Why this exists: firebase.json has `"public": "public"`, but Vite builds to
// `dist/`. Without this step, `firebase deploy` uploads whatever stale files
// already sit in public/ and silently ships an old build (this bit us live on
// 2026-06-16). public/ also holds files that are NOT in dist/ (family-tree.html,
// source assets, etc.), so we MERGE dist into public (force-overwrite) rather
// than replacing the directory — leaving those public-only files intact.
//
// Cross-platform (pure Node) because npm scripts run under cmd.exe on Windows
// where `cp`/`Copy-Item` aren't portable. Paths resolve relative to this file
// so it works regardless of the process CWD.

import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const pub = join(root, 'public');

if (!existsSync(dist)) {
  console.error(`[copy-dist] No build found at ${dist}. Run "vite build" first.`);
  process.exit(1);
}

cpSync(dist, pub, { recursive: true, force: true });
console.log(`[copy-dist] Merged dist/ → public/ — deploy will ship the fresh build.`);

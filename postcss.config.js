import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the Tailwind config next to this file — the dev server can be
// launched with a CWD outside the project, which breaks CWD-based discovery.
const dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(dirname, 'tailwind.config.ts') },
    autoprefixer: {},
  },
};

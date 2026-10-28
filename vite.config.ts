import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { geminiProxy } from './server/gemini.ts';
import { higgsfieldProxy } from './server/higgsfield.ts';

export default defineConfig(({ command }) => ({
  // relative asset paths in the build, so it also works under a subpath like GitHub Pages' /surrealland/
  base: command === 'build' ? './' : '/',
  plugins: [react(), higgsfieldProxy(), geminiProxy()],
  server: { port: 5178 },
}));

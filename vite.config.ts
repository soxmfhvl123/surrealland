import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { geminiProxy } from './server/gemini.ts';
import { higgsfieldProxy } from './server/higgsfield.ts';

export default defineConfig({
  plugins: [react(), higgsfieldProxy(), geminiProxy()],
  server: { port: 5178 },
});

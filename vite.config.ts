import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 1420, strictPort: true, watch: {ignored:['**/artifacts/**','**/.cache/**','**/releases/**']} }, clearScreen: false });

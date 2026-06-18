import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === 'github' ? '/markdown-reading/' : '/',
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: mode === 'github' ? 'docs' : 'dist',
  },
}))

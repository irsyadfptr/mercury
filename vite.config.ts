import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { idxPlugin } from './idxPlugin.ts'
import { usPlugin } from './usPlugin.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), idxPlugin(), usPlugin()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})

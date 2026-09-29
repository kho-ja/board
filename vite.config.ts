import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const config = defineConfig({
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  resolve: {
    alias: {
      // Match the `@/*` tsconfig path so dev SSR (Node module runner) too.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})

export default config

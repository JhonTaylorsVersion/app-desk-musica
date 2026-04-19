import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    watch: {
      ignored: ['**/cargo-target-*/**', '**/src-tauri/target/**', '**/SpotiFLAC-main/**']
    }
  },
  build: {
    rollupOptions: {
      external: [/cargo-target-.*/, /src-tauri\/target.*/]
    }
  }
})
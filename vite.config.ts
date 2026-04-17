import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
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
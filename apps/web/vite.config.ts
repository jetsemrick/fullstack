import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        // Use IPv4 loopback — on macOS `localhost` often resolves to ::1 first,
        // which can hit a different process than the Bun API on 127.0.0.1:3001.
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
})

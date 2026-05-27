import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const devServerPort = 5173;
const hmrPort = 5174;

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [
    tailwindcss(),
    solid(),
  ],
  base: mode === 'development' ? './' : '/',

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  build: {
    // Ensure assets are properly hashed for production
    assetsDir: './',
    outDir: 'dist',
    emptyOutDir: true,
    // This ensures that the base is correctly set in the built files
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: devServerPort,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: hmrPort,
        }
      : undefined,
    watch: mode === 'development' ? {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    } : undefined,
  },
}));

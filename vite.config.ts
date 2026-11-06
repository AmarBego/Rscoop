import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;
const devServerPort = 5173;
const hmrPort = 5174;

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    solid(),
  ],
  base: mode === 'development' ? './' : '/',

  clearScreen: false,
  build: {
    assetsDir: './',
    outDir: 'dist',
    emptyOutDir: true,
    reportCompressedSize: false,
  },
  server: {
    port: devServerPort,
    strictPort: true,
    forwardConsole: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: hmrPort,
        }
      : undefined,
    watch: mode === 'development' ? {
      ignored: ["**/src-tauri/**"],
    } : undefined,
  },
}));

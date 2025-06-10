import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const tauriDevHost = process.env.TAURI_DEV_HOST;

// Ensure hostConfig is false if TAURI_DEV_HOST is undefined, null, empty, or whitespace only.
// Otherwise, use the trimmed value of TAURI_DEV_HOST.
const hostConfig = (tauriDevHost && tauriDevHost.trim() !== "") ? tauriDevHost.trim() : false;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [
    tailwindcss(),
    solid(),
  ],
  base: './',

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: hostConfig, // Use the robust hostConfig
    hmr: hostConfig // Only configure HMR if hostConfig is a valid host string
      ? {
          protocol: "ws",
          host: hostConfig,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

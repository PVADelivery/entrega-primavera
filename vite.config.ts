import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ command }) => {
  const isBuild = command === "build";
  
  return {
    plugins: [
      tailwindcss(),
      tsconfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        server: { entry: "server" }
      }),
      isBuild ? nitro({
        preset: process.env.NITRO_PRESET ?? "cloudflare-module",
        output: {
          dir: "dist",
          serverDir: "dist/server",
          publicDir: "dist/client"
        },
        cloudflare: { nodeCompat: true, deployConfig: true }
      }) : null,
      react(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@capacitor/push-notifications": path.resolve(__dirname, "./src/lib/pushNotifications.ts"),
        "@capacitor/local-notifications": path.resolve(__dirname, "./src/lib/localNotifications.ts"),
        "@capacitor/app": path.resolve(__dirname, "./src/lib/capacitorApp.ts"),
        "@capacitor/status-bar": path.resolve(__dirname, "./src/lib/statusBarPlugin.ts"),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core"
      ]
    },
    ssr: {
      external: [
        "@capacitor/core",
        "@capacitor/app",
        "@capacitor/status-bar",
        "@capacitor/push-notifications",
        "@capacitor/local-notifications"
      ]
    }
  };
});


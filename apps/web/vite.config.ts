import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load env from both the package directory and the monorepo root.
  // Package-level .env takes precedence over root .env for VITE_* vars.
  const rootEnv    = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  const packageEnv = loadEnv(mode, __dirname, "");
  const env = { ...rootEnv, ...packageEnv };

  return {
    plugins: [react()],
    server: {
      port: 5173,
    },
    define: {
      // Expose only VITE_* vars to the browser bundle (same as Vite's default behaviour)
      ...Object.fromEntries(
        Object.entries(env)
          .filter(([key]) => key.startsWith("VITE_"))
          .map(([key, val]) => [`import.meta.env.${key}`, JSON.stringify(val)])
      ),
    },
  };
});

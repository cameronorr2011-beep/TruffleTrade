import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@core": path.resolve(__dirname, "core"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});

import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // Two things in the tree are separate projects, not part of this suite:
    // git worktrees under .claude/ (other checkouts of this repo, whose tests
    // would resolve against *this* tree's `@` alias), and the Manual Q&A
    // Cloudflare Worker, which has its own vitest.config.mts and needs the
    // Workers pool to resolve `cloudflare:test`.
    exclude: [
      "**/node_modules*/**",
      "**/dist/**",
      "**/.claude/worktrees/**",
      "soft-hill-26e4/**",
      // Needs a Firestore emulator; run it with `npm run test:rules`.
      "firestore.rules.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

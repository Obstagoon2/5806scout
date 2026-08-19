import { defineConfig } from "vitest/config";

// The rules suite is separate from the main one because it needs a running
// Firestore emulator — `npm run test:rules` starts one around it. Keeping it
// out of `npm test` means the everyday suite still runs with nothing
// installed but node.
export default defineConfig({
  test: {
    environment: "node",
    include: ["firestore.rules.test.ts"],
    // The emulator's first response can be slow while it warms up.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});

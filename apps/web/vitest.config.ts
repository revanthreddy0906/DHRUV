import { defineConfig } from "vitest/config";

// Unit tests for the web app's live layer (engine adapter, views). Runs in Node: no browser APIs.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});

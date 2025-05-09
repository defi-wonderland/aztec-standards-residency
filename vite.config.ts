import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
    globals: true,
    hookTimeout: 9999999,
    testTimeout: 9999999,
    deps: {
      inline: [/@zkpassport\/utils/],
    },
  },
})

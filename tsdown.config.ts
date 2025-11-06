import { defineConfig } from "tsdown"

export default defineConfig({
  entry: "./src/**/index.ts",
  target: "esnext",
  format: ["esm", "cjs"],
  exports: false,
  platform: "neutral", // both browser and node
  external: [
    // WASM packages should be external dependencies, not bundled
    "brotli-wasm",
  ],
})

import { defineConfig } from "tsup";

export default defineConfig([
  // Main build config
  {
    entry: ["src/index.ts"],
    outDir: "dist",
    sourcemap: true,
    clean: true,
    format: ["esm"],
    external: [
        "dotenv",
        "fs",
        "path",
        "@reflink/reflink",
        "@node-llama-cpp",
        "https",
        "http",
        "agentkeepalive",
    ],
    treeshake: true,
    splitting: false,
    minify: false,
    dts: false, // Disable DTS in main build
  },
  // Separate DTS build config
  {
    entry: ["src/index.ts"],
    outDir: "dist",
    sourcemap: false,
    clean: false,
    dts: {
      only: true,
      resolve: true,
    },
    format: ["esm"],
  }
]);

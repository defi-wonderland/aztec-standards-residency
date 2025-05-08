import path from "path"
import { defineConfig, Plugin } from "vite"
import { nodePolyfills, PolyfillOptions } from "vite-plugin-node-polyfills"
import { visualizer } from "rollup-plugin-visualizer"

const nodePolyfillsFix = (options?: PolyfillOptions | undefined): Plugin => {
  return {
    ...nodePolyfills(options),
    resolveId(source: string) {
      const m = /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)$/.exec(source)
      if (m) {
        return `node_modules/vite-plugin-node-polyfills/shims/${m[1]}/dist/index.cjs`
      }
    },
  }
}

const chunkMappings: { pattern: string; chunkName: string }[] = [
  { pattern: "kernel_account-KernelAccount.json", chunkName: "kernel-account-artifact" },
  { pattern: "webauthn_authenticator-WebauthnModule.json", chunkName: "webauthn-module-artifact" },
  { pattern: "ecdsa_k256_authenticator-EcdsaK256Module.json", chunkName: "ecdsa-module-artifact" },
  { pattern: "fee_juice_contract-FeeJuice.json", chunkName: "fee-juice-artifact" },
  {
    pattern: "obsidion_deployer_fpc-ObsidionDeployerFPC.json",
    chunkName: "obsidion-deployer-fpc-artifact",
  },
  {
    pattern: "schnorr_account_contract-SchnorrAccount.json",
    chunkName: "schnorr-account-artifact",
  },
  { pattern: "email_registry-EmailRegistry.json", chunkName: "email-registry-artifact" },
  { pattern: "identity_registry-IdentityRegistry.json", chunkName: "identity-registry-artifact" },
  { pattern: "dev_authenticator-DevModule.json", chunkName: "dev-module-artifact" },
  { pattern: "sponsored_fpc_contract-SponsoredFPC.json", chunkName: "sponsored-fpc-artifact" },
]

export default defineConfig(() => {
  const isDev = process.env.NODE_ENV === "development"
  console.log("isDev", isDev)
  return {
    plugins: [
      nodePolyfillsFix({ protocolImports: true }),
      visualizer({
        filename: "dist/stats.html",
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        src: path.resolve(__dirname, "src"),
      },
    },
    base: "/",
    optimizeDeps: {
      // Vite has issues in dev mode with .wasm and worker files
      // https://github.com/vitejs/vite/issues/11672
      // https://github.com/vitejs/vite/issues/15618
      // https://github.com/vitejs/vite/issues/15618
      // These dependencies have to also be included in devDependencies for this to work!
      exclude: ["@aztec/bb.js", "@aztec/noir-noirc_abi", "@aztec/noir-acvm_js"],
    },
    server: {
      port: 5173,
      // Headers needed for multithreaded WASM to work
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
    build: {
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            const mapping = chunkMappings.find((mapping) => id.includes(mapping.pattern))
            return mapping ? mapping.chunkName : undefined
          },
        },
      },
    },
  }
})
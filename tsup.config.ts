import { defineConfig } from 'tsup';

export default defineConfig([
  // Runtime library (enhancer) — dual format, no bundling
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  // Migration transform — importable API
  {
    entry: ['src/migrate.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
  },
  // CLI entry point
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    sourcemap: true,
  },
]);

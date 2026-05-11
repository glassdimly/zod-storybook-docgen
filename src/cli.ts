#!/usr/bin/env node
/**
 * @fileoverview CLI for zod-storybook-docgen migration.
 *
 * Usage:
 *   npx zod-storybook-docgen migrate 'src/**\/*.{ts,tsx}'
 *   npx zod-storybook-docgen migrate 'src/**\/*.{ts,tsx}' --dry-run
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { migrateSource } from './migrate.js';

// ---------------------------------------------------------------------------
// Argument parsing (minimal — no deps)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const command = args[0];

if (command !== 'migrate') {
  console.error(
    `zod-storybook-docgen — one-time migration tool

Usage:
  npx zod-storybook-docgen migrate '<glob>' [--dry-run]

Converts JSDoc comments above Zod schema properties into .describe() calls
so the runtime enhancer can display them in Storybook docs.

Example:
  npx zod-storybook-docgen migrate 'src/**/*.{ts,tsx}'
  npx zod-storybook-docgen migrate 'packages/**/src/**/*.{ts,tsx}' --dry-run

Options:
  --dry-run   Preview changes without writing files
`,
  );
  process.exit(command === '--help' || command === '-h' ? 0 : 1);
}

const patterns = args.slice(1).filter((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');

if (patterns.length === 0) {
  console.error('Error: No glob pattern provided.\n');
  console.error("  npx zod-storybook-docgen migrate 'src/**/*.{ts,tsx}'");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (dryRun) {
    console.log('DRY RUN — no files will be modified.\n');
  }

  console.log(`Scanning: ${patterns.join(', ')}\n`);

  const files = await fg(patterns, {
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
  });

  if (files.length === 0) {
    console.log('No files matched the pattern.');
    process.exit(0);
  }

  let totalChanges = 0;
  let filesChanged = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf-8');
    const relative = resolve(file).replace(process.cwd() + '/', '');

    const { output, changes } = migrateSource(source, file);

    if (changes > 0) {
      filesChanged++;
      totalChanges += changes;
      console.log(`  + ${relative} (${changes} description${changes > 1 ? 's' : ''} added)`);

      if (!dryRun) {
        writeFileSync(file, output, 'utf-8');
      }
    }
  }

  console.log('');
  if (totalChanges === 0) {
    console.log('No JSDoc comments found to migrate.');
  } else if (dryRun) {
    console.log(
      `Would add ${totalChanges} .describe() call${totalChanges > 1 ? 's' : ''} across ${filesChanged} file${filesChanged > 1 ? 's' : ''}.`,
    );
  } else {
    console.log(
      `Done! Added ${totalChanges} .describe() call${totalChanges > 1 ? 's' : ''} across ${filesChanged} file${filesChanged > 1 ? 's' : ''}.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

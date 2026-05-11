import { describe, it, expect } from 'vitest';
import { migrateSource } from '../migrate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convenience wrapper — always uses a .ts filename. */
function migrate(source: string): { output: string; changes: number } {
  return migrateSource(source, 'test.ts');
}

// ---------------------------------------------------------------------------
// Basic functionality
// ---------------------------------------------------------------------------

describe('migrateSource', () => {
  it('adds .describe() for a single-line JSDoc comment', () => {
    const input = `
import { z } from 'zod';
const schema = z.object({
  /** The heading text */
  title: z.string(),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(1);
    expect(output).toContain("z.string().describe('The heading text')");
  });

  it('adds .describe() for a multi-line JSDoc comment', () => {
    const input = `
import { z } from 'zod';
const schema = z.object({
  /**
   * Array of title / content pair in obj from cms.
   */
  accordionItems: z.array(z.string()),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(1);
    expect(output).toContain(
      "z.array(z.string()).describe('Array of title / content pair in obj from cms.')",
    );
  });

  it('handles multiple properties', () => {
    const input = `
import { z } from 'zod';
const schema = z.object({
  /** First prop */
  alpha: z.string(),
  /** Second prop */
  beta: z.number(),
  gamma: z.boolean(),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(2);
    expect(output).toContain("z.string().describe('First prop')");
    expect(output).toContain("z.number().describe('Second prop')");
    // gamma has no JSDoc — unchanged
    expect(output).toContain('gamma: z.boolean(),');
    expect(output).not.toContain("z.boolean().describe(");
  });

  it('appends .describe() after chained methods like .optional()', () => {
    const input = `
const schema = z.object({
  /** Optional border */
  showBorder: z.boolean().optional(),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(1);
    expect(output).toContain(
      "z.boolean().optional().describe('Optional border')",
    );
  });

  it('appends .describe() after .default()', () => {
    const input = `
const schema = z.object({
  /** Number of items */
  count: z.number().default(0),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(1);
    expect(output).toContain("z.number().default(0).describe('Number of items')");
  });

  // ---------------------------------------------------------------------------
  // Skip / no-op cases
  // ---------------------------------------------------------------------------

  it('skips properties that already have .describe()', () => {
    const input = `
const schema = z.object({
  /** Title text */
  title: z.string().describe('existing'),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(0);
    expect(output).toContain("z.string().describe('existing')");
    expect(output).not.toContain("describe('existing').describe(");
  });

  it('skips .describe() anywhere in the chain', () => {
    const input = `
const schema = z.object({
  /** Some flag */
  flag: z.boolean().describe('already here').optional(),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(0);
  });

  it('skips properties without JSDoc comments', () => {
    const input = `
const schema = z.object({
  title: z.string(),
  count: z.number(),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(0);
    expect(output).toBe(input);
  });

  it('skips non-JSDoc block comments (no leading *)', () => {
    const input = `
const schema = z.object({
  /* not a JSDoc comment */
  title: z.string(),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(0);
  });

  it('returns 0 changes for files without z.object()', () => {
    const input = `
import { z } from 'zod';
const name = z.string();
export default name;`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(0);
    expect(output).toBe(input);
  });

  it('returns 0 changes for unparseable files', () => {
    const input = 'this is not valid {{ javascript }}';
    const { output, changes } = migrate(input);
    expect(changes).toBe(0);
    expect(output).toBe(input);
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('handles nested z.object() calls', () => {
    const input = `
const schema = z.object({
  /** Outer field */
  nested: z.object({
    /** Inner field */
    value: z.string(),
  }),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(2);
    expect(output).toContain(".describe('Outer field')");
    expect(output).toContain("z.string().describe('Inner field')");
  });

  it('escapes single quotes in descriptions', () => {
    const input = `
const schema = z.object({
  /** It's a title */
  title: z.string(),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(1);
    expect(output).toContain(".describe('It\\'s a title')");
  });

  it('escapes backslashes in descriptions', () => {
    const input = `
const schema = z.object({
  /** Use \\n for newlines */
  content: z.string(),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(1);
    expect(output).toContain(".describe('Use \\\\n for newlines')");
  });

  it('handles the full Accordion schema pattern', () => {
    const input = `
const accordionSchema = z.object({
  /**
   * Array of title / content pair in obj from cms.
   */
  accordionItems: z.array(accordionItemSchema),
  /**
   * Select between showing item numbers or not
   */
  showItemNumber: z.boolean(),
  /** Optionally displays border around each accordion item. */
  showBorder: z.boolean().optional(),
  /** Optionally disable hover effect */
  noHoverEffect: z.boolean().optional(),
  /** Optionally disable indentation to align accordion items */
  noIndent: z.boolean().optional(),
  /**
   * Additional classes to pass to the component
   */
  className: z.string().optional(),
  /** Set to true if the accordion is nested inside another accordion or has accordions nested inside it. */
  isNested: z.boolean().optional(),
  /** If true, only one item can be open at a time. Default is false. */
  enableSingleOpen: z.boolean().optional(),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(8);
    expect(output).toContain(
      "z.array(accordionItemSchema).describe('Array of title / content pair in obj from cms.')",
    );
    expect(output).toContain(
      "z.boolean().describe('Select between showing item numbers or not')",
    );
    expect(output).toContain(
      "z.boolean().optional().describe('Optionally displays border around each accordion item.')",
    );
    expect(output).toContain(
      "z.boolean().optional().describe('Optionally disable hover effect')",
    );
    expect(output).toContain(
      "z.boolean().optional().describe('Optionally disable indentation to align accordion items')",
    );
    expect(output).toContain(
      "z.string().optional().describe('Additional classes to pass to the component')",
    );
    expect(output).toContain(
      "z.boolean().optional().describe('Set to true if the accordion is nested inside another accordion or has accordions nested inside it.')",
    );
    expect(output).toContain(
      "z.boolean().optional().describe('If true, only one item can be open at a time. Default is false.')",
    );
  });

  it('handles TSX files', () => {
    const { output, changes } = migrateSource(
      `
const schema = z.object({
  /** The label */
  label: z.string(),
});`,
      'Component.tsx',
    );
    expect(changes).toBe(1);
    expect(output).toContain("z.string().describe('The label')");
  });

  it('preserves surrounding code unchanged', () => {
    const input = `import { z } from 'zod';

// Some comment
const other = 'hello';

const schema = z.object({
  /** Title */
  title: z.string(),
});

export default schema;
`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(1);
    // Everything except the describe insertion should be preserved
    expect(output).toContain("import { z } from 'zod';");
    expect(output).toContain("const other = 'hello';");
    expect(output).toContain('export default schema;');
    expect(output).toContain("z.string().describe('Title')");
  });

  it('handles multiple z.object() calls in the same file', () => {
    const input = `
const schemaA = z.object({
  /** Field A */
  a: z.string(),
});

const schemaB = z.object({
  /** Field B */
  b: z.number(),
});`;
    const { output, changes } = migrate(input);
    expect(changes).toBe(2);
    expect(output).toContain("z.string().describe('Field A')");
    expect(output).toContain("z.number().describe('Field B')");
  });
});

/**
 * @fileoverview One-time migration: convert JSDoc comments on Zod schema
 * properties into `.describe()` calls so the runtime enhancer picks them up.
 *
 * JSDoc comments like:
 *
 *   ```ts
 *   const schema = z.object({
 *     /** The heading text * /
 *     title: z.string(),
 *   });
 *   ```
 *
 * become:
 *
 *   ```ts
 *   const schema = z.object({
 *     /** The heading text * /
 *     title: z.string().describe('The heading text'),
 *   });
 *   ```
 *
 * The original JSDoc comment is preserved for IDE hover tooltips.
 *
 * @module
 */

import { parse, type ParserPlugin } from '@babel/parser';
import MagicString from 'magic-string';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of transforming a single file. */
export interface MigrateResult {
  /** Transformed source (unchanged if no modifications). */
  output: string;
  /** Number of `.describe()` calls inserted. */
  changes: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract plain text from a JSDoc comment body.
 *
 * Strips the leading `/**`, trailing `* /`, and per-line `*` prefixes,
 * then collapses the result into a single trimmed string.
 */
function extractJSDocText(commentValue: string): string {
  return commentValue
    .replace(/^\*\s*/, '') // strip leading "* " after "/*"
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, ''))
    .filter((line) => line.length > 0)
    .join(' ')
    .trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ASTNode = Record<string, any>;

/**
 * Check whether the expression chain already contains a `.describe()` call.
 *
 * Walks inward from the outermost CallExpression (e.g.
 * `z.string().optional().describe('x')`) so that `.describe()` at any
 * position in the chain is detected.
 */
function hasDescribeInChain(node: ASTNode): boolean {
  if (!node) return false;

  if (node.type === 'CallExpression') {
    if (
      node.callee?.type === 'MemberExpression' &&
      node.callee.property?.name === 'describe'
    ) {
      return true;
    }
    return hasDescribeInChain(node.callee as ASTNode);
  }

  if (node.type === 'MemberExpression') {
    return hasDescribeInChain(node.object as ASTNode);
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Transform a single source string: find `z.object({...})` calls, check
 * each property for a leading JSDoc comment, and append `.describe('...')`
 * if one is found and not already present.
 *
 * @param source - Full file source text
 * @param filename - File path (used for parser plugin selection)
 * @returns The transformed source and number of insertions made
 */
export function migrateSource(source: string, filename: string): MigrateResult {
  // Choose parser plugins based on file extension
  const plugins: ParserPlugin[] = ['decorators'];
  if (/\.tsx?$/.test(filename)) {
    plugins.push('typescript');
  }
  if (/\.[jt]sx$/.test(filename)) {
    plugins.push('jsx');
  }

  let ast;
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins,
      // Attach comments to nodes
      attachComment: true,
    });
  } catch {
    // Unparseable file — skip silently
    return { output: source, changes: 0 };
  }

  const s = new MagicString(source);
  let changes = 0;

  /**
   * Recursively visit every AST node looking for `z.object({...})` call
   * expressions (any receiver — `z`, `zod`, re-exports, etc.).
   */
  function visit(node: ASTNode): void {
    if (!node || typeof node !== 'object') return;

    // Detect *.object({...}) calls
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'MemberExpression' &&
      node.callee.property?.name === 'object' &&
      node.arguments?.[0]?.type === 'ObjectExpression'
    ) {
      const objExpr = node.arguments[0] as ASTNode;

      for (const prop of objExpr.properties as ASTNode[]) {
        if (prop.type !== 'ObjectProperty') continue;

        // Look for a leading block comment that looks like JSDoc
        const leadingComments = prop.leadingComments as ASTNode[] | undefined;
        if (!leadingComments || leadingComments.length === 0) continue;

        // Take the closest JSDoc comment (last in the array)
        const jsdoc = [...leadingComments]
          .reverse()
          .find(
            (c: ASTNode) =>
              c.type === 'CommentBlock' && (c.value as string).startsWith('*'),
          );
        if (!jsdoc) continue;

        const description = extractJSDocText(jsdoc.value as string);
        if (!description) continue;

        // Skip if the chain already has .describe()
        if (hasDescribeInChain(prop.value as ASTNode)) continue;

        // Insert .describe('...') at the end of the value expression
        const valueEnd = (prop.value as ASTNode).end as number;
        const escaped = description.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        s.appendLeft(valueEnd, `.describe('${escaped}')`);
        changes++;
      }
    }

    // Recurse into child nodes
    for (const key of Object.keys(node)) {
      if (
        key === 'leadingComments' ||
        key === 'trailingComments' ||
        key === 'innerComments'
      )
        continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && item.type) {
            visit(item as ASTNode);
          }
        }
      } else if (child && typeof child === 'object' && child.type) {
        visit(child as ASTNode);
      }
    }
  }

  visit(ast.program as unknown as ASTNode);

  return { output: s.toString(), changes };
}

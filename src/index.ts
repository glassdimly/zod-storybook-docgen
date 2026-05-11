/**
 * zod-storybook-docgen
 *
 * Auto-generate Storybook argTypes from Zod schemas. Fills the gap where
 * react-docgen can't understand `z.infer<typeof schema>`.
 *
 * @see https://storybook.js.org/docs/api/arg-types
 */

import type { ZodTypeAny, ZodObject } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Storybook argType control descriptor. */
interface ArgTypeControl {
  type?: string;
}

/** Storybook argType table descriptor. */
interface ArgTypeTable {
  type?: { summary?: string };
  defaultValue?: { summary: string };
}

/** Storybook argType descriptor for a single prop. */
export interface ArgType {
  control?: ArgTypeControl | false;
  description?: string;
  options?: unknown[];
  table?: ArgTypeTable;
  type?: { required: boolean };
}

/** Map of prop name to Storybook argType descriptor. */
export type ArgTypes = Record<string, ArgType>;

/**
 * Storybook story context passed to argTypes enhancers.
 * Only the fields we need are typed here.
 */
export interface StoryContext {
  component?: { zodSchema?: ZodTypeAny } & Record<string, unknown>;
  argTypes?: ArgTypes;
  [key: string]: unknown;
}

/** Metadata collected while unwrapping Zod wrapper types. */
interface UnwrapResult {
  inner: ZodTypeAny;
  isOptional: boolean;
  isNullable: boolean;
  defaultValue: unknown;
  description: string | undefined;
}

// ---------------------------------------------------------------------------
// Zod schema introspection helpers
// ---------------------------------------------------------------------------

/**
 * Unwrap Zod wrapper types (ZodOptional, ZodNullable, ZodDefault, ZodEffects,
 * ZodBranded, ZodPipeline, ZodCatch, ZodReadonly, ZodLazy) and collect
 * metadata (optional, nullable, default value, description) along the way.
 */
function unwrap(schema: ZodTypeAny): UnwrapResult {
  let inner: ZodTypeAny = schema;
  let isOptional = false;
  let isNullable = false;
  let defaultValue: unknown;
  let description: string | undefined;

  const seen = new Set<ZodTypeAny>();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (inner?._def && !seen.has(inner)) {
    seen.add(inner);

    // Collect description from any layer (outermost wins)
    if (inner._def.description && !description) {
      description = inner._def.description as string;
    }

    const typeName = inner._def.typeName as string | undefined;

    if (typeName === 'ZodOptional') {
      isOptional = true;
      inner = inner._def.innerType as ZodTypeAny;
    } else if (typeName === 'ZodNullable') {
      // Nullable means T | null — the field still requires a value (null counts),
      // so it does NOT make the field optional. Track it for type summary instead.
      isNullable = true;
      inner = inner._def.innerType as ZodTypeAny;
    } else if (typeName === 'ZodDefault') {
      // .default() makes the input optional (undefined -> default value),
      // so the field is not required from the consumer's perspective.
      isOptional = true;
      defaultValue = (inner._def.defaultValue as () => unknown)();
      inner = inner._def.innerType as ZodTypeAny;
    } else if (
      typeName === 'ZodEffects' ||
      typeName === 'ZodBranded' ||
      typeName === 'ZodPipeline' ||
      typeName === 'ZodCatch' ||
      typeName === 'ZodReadonly'
    ) {
      inner = (inner._def.innerType || inner._def.schema) as ZodTypeAny;
    } else if (typeName === 'ZodLazy') {
      inner = (inner._def.getter as () => ZodTypeAny)();
    } else {
      break;
    }
  }

  return { inner, isOptional, isNullable, defaultValue, description };
}

/**
 * Convert a Zod type to a human-readable type summary string.
 */
function zodTypeToSummary(schema: ZodTypeAny): string {
  const typeName = schema?._def?.typeName as string | undefined;

  switch (typeName) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodEnum':
      return (schema._def.values as string[]).map((v) => `"${v}"`).join(' | ');
    case 'ZodNativeEnum':
      return 'enum';
    case 'ZodLiteral':
      return JSON.stringify(schema._def.value);
    case 'ZodArray':
      return `${zodTypeToSummary(schema._def.type as ZodTypeAny)}[]`;
    case 'ZodObject':
      return 'object';
    case 'ZodRecord':
      return 'Record<string, ...>';
    case 'ZodMap':
      return 'Map';
    case 'ZodSet':
      return 'Set';
    case 'ZodTuple':
      return `[${((schema._def.items as ZodTypeAny[] | undefined) || []).map(zodTypeToSummary).join(', ')}]`;
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion':
      return ((schema._def.options as ZodTypeAny[] | undefined) || []).map(zodTypeToSummary).join(' | ');
    case 'ZodIntersection':
      return `${zodTypeToSummary(schema._def.left as ZodTypeAny)} & ${zodTypeToSummary(schema._def.right as ZodTypeAny)}`;
    case 'ZodFunction':
      return 'function';
    case 'ZodDate':
      return 'Date';
    case 'ZodBigInt':
      return 'bigint';
    case 'ZodSymbol':
      return 'symbol';
    case 'ZodAny':
      return 'any';
    case 'ZodUnknown':
      return 'unknown';
    case 'ZodVoid':
      return 'void';
    case 'ZodNever':
      return 'never';
    case 'ZodNull':
      return 'null';
    case 'ZodUndefined':
      return 'undefined';
    case 'ZodCustom':
      return (schema._def.description as string | undefined) || 'custom';
    default:
      return typeName ? typeName.replace('Zod', '').toLowerCase() : 'unknown';
  }
}

/**
 * Convert a single Zod field schema into a Storybook argType descriptor.
 */
function zodFieldToArgType(fieldSchema: ZodTypeAny): ArgType {
  const { inner, isOptional, isNullable, defaultValue, description } = unwrap(fieldSchema);
  const typeName = inner?._def?.typeName as string | undefined;
  const typeSummary = zodTypeToSummary(inner);

  const argType: ArgType = {
    table: {
      type: { summary: isNullable ? `${typeSummary} | null` : typeSummary },
    },
  };

  if (description) {
    argType.description = description;
  }

  if (defaultValue !== undefined) {
    argType.table!.defaultValue = {
      summary: typeof defaultValue === 'string' ? defaultValue : JSON.stringify(defaultValue),
    };
  }

  if (!isOptional) {
    argType.type = { required: true };
  }

  // Map Zod types to Storybook controls
  switch (typeName) {
    case 'ZodString':
      argType.control = { type: 'text' };
      break;

    case 'ZodNumber':
      argType.control = { type: 'number' };
      break;

    case 'ZodBoolean':
      argType.control = { type: 'boolean' };
      break;

    case 'ZodEnum':
      argType.control = { type: 'select' };
      argType.options = inner._def.values as string[];
      break;

    case 'ZodNativeEnum':
      argType.control = { type: 'select' };
      argType.options = Object.values(inner._def.values as Record<string, unknown>).filter(
        (v): v is string => typeof v === 'string',
      );
      break;

    case 'ZodLiteral':
      argType.control = false;
      break;

    case 'ZodUnion': {
      // If all options are literals, expose as a select control
      const options = (inner._def.options as ZodTypeAny[] | undefined) || [];
      const allLiteral = options.every(
        (o) => unwrap(o).inner?._def?.typeName === 'ZodLiteral',
      );
      if (allLiteral && options.length > 0) {
        argType.control = { type: 'select' };
        argType.options = options.map((o) => unwrap(o).inner._def.value as unknown);
      } else {
        argType.control = { type: 'text' };
      }
      break;
    }

    case 'ZodArray':
      argType.control = { type: 'object' };
      break;

    case 'ZodObject':
      argType.control = { type: 'object' };
      break;

    case 'ZodFunction':
      // Functions get no interactive control — use fn() in args instead
      argType.control = false;
      argType.table!.type = { summary: 'function' };
      break;

    case 'ZodDate':
      argType.control = { type: 'date' };
      break;

    case 'ZodCustom':
      // z.custom<ReactNode>() — no meaningful control
      argType.control = false;
      break;

    default:
      // Unknown Zod type — show info but no control
      argType.control = { type: 'text' };
      break;
  }

  return argType;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a Zod object schema to a Storybook argTypes map.
 *
 * Unwraps wrapper types (ZodEffects, ZodBranded, etc.) to reach the
 * underlying ZodObject, then iterates its shape to produce argTypes.
 *
 * @param schema - A `z.object({...})` schema (or wrapped variant)
 * @returns argTypes keyed by prop name
 */
export function zodSchemaToArgTypes(schema: ZodTypeAny): ArgTypes {
  // Support both z.object() and wrapped z.object() (e.g. z.object().strict())
  const { inner } = unwrap(schema);
  const shape: Record<string, ZodTypeAny> | undefined =
    (inner as ZodObject<Record<string, ZodTypeAny>>)?.shape ||
    (inner?._def?.shape as (() => Record<string, ZodTypeAny>) | undefined)?.();

  if (!shape) {
    return {};
  }

  const argTypes: ArgTypes = {};
  for (const [key, fieldSchema] of Object.entries(shape)) {
    argTypes[key] = zodFieldToArgType(fieldSchema);
  }
  return argTypes;
}

/**
 * Storybook argTypes enhancer that auto-generates argTypes from Zod schemas.
 *
 * Reads `context.component.zodSchema` and merges the generated argTypes
 * with any existing ones. Existing argTypes (from react-docgen or manual
 * story-level overrides) take precedence.
 *
 * Register in your `.storybook/preview.ts`:
 *
 * ```ts
 * import { zodArgTypesEnhancer } from 'zod-storybook-docgen';
 * export default { argTypesEnhancers: [zodArgTypesEnhancer] };
 * ```
 *
 * @param context - Storybook story context
 * @returns enhanced argTypes
 */
export function zodArgTypesEnhancer(context: StoryContext): ArgTypes {
  const { component, argTypes: existingArgTypes = {} } = context;
  const zodSchema = component?.zodSchema;

  if (!zodSchema) {
    return existingArgTypes;
  }

  const zodArgTypes = zodSchemaToArgTypes(zodSchema);

  // Merge: Zod-generated types provide the base, existing argTypes override.
  // This lets story-level argTypes and react-docgen descriptions win.
  const merged: ArgTypes = {};
  const allKeys = new Set([
    ...Object.keys(zodArgTypes),
    ...Object.keys(existingArgTypes),
  ]);

  for (const key of allKeys) {
    const zod = zodArgTypes[key];
    const existing = existingArgTypes[key];

    if (zod && existing) {
      // Deep-merge: existing overrides Zod-generated values
      merged[key] = {
        ...zod,
        ...existing,
        table: {
          ...zod?.table,
          ...existing?.table,
          type: { ...zod?.table?.type, ...existing?.table?.type },
          defaultValue: existing?.table?.defaultValue || zod?.table?.defaultValue,
        },
      };
    } else {
      merged[key] = existing || zod;
    }
  }

  return merged;
}

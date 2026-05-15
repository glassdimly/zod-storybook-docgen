# zod-storybook-docgen

Auto-generate Storybook argTypes from Zod schemas. Fills the gap where `react-docgen` can't understand `z.infer<typeof schema>`.

## The Problem

If you define your React component props with Zod schemas and use `z.infer<typeof schema>` for the TypeScript type, Storybook's built-in `react-docgen` can't generate controls or documentation for those props. You end up with an empty Controls panel.

## The Solution

`zod-storybook-docgen` reads a Zod schema attached to your component and generates Storybook argTypes with:

- Correct **controls** (text, number, boolean, select, date, object, etc.)
- **Type summaries** in the docs table (`string`, `"a" | "b" | "c"`, `number[]`, etc.)
- **Default values** from `.default()`
- **Required/optional** status (`.optional()` and `.default()` make fields optional; `.nullable()` does not)
- **Descriptions** from `.describe()`

## Install

```bash
npm install -D zod-storybook-docgen
# or
pnpm add -D zod-storybook-docgen
# or
yarn add -D zod-storybook-docgen
```

**Peer dependency:** `zod` >= 3.0.0

## Setup

### 1. Register the enhancer

In your `.storybook/preview.ts` (or `.js`):

```ts
import { zodArgTypesEnhancer } from 'zod-storybook-docgen';

export default {
  argTypesEnhancers: [zodArgTypesEnhancer],
};
```

### 2. Connect your Zod schema

The enhancer discovers the schema from two places (checked in order):

1. `component.zodSchema` — a static property on the component
2. `parameters.zodSchema` — passed via story/meta parameters

#### Option A: Pass the schema via parameters (recommended)

This is the simplest approach and doesn't require modifying your components. Just import the schema in your story file and pass it through `parameters`:

```tsx
// MyButton.tsx
import { z } from 'zod';

export const propsSchema = z.object({
  title: z.string().describe('The heading text'),
  variant: z.enum(['primary', 'secondary']).default('primary'),
  count: z.number().optional(),
  disabled: z.boolean(),
});

type Props = z.infer<typeof propsSchema>;

const MyButton = ({ title, variant = 'primary', count, disabled }: Props) => (
  <button disabled={disabled}>
    {title} ({variant}) {count !== undefined && `x${count}`}
  </button>
);

export default MyButton;
```

```tsx
// MyButton.stories.tsx
import MyButton, { propsSchema } from './MyButton';

const meta = {
  component: MyButton,
  parameters: { zodSchema: propsSchema },
};

export default meta;
```

#### Option B: Attach the schema to the component

If you prefer a zero-config story experience, attach the schema directly to the component using the exported `FCWithZodSchema` type. The enhancer picks it up automatically — no per-story wiring needed.

```tsx
import { z } from 'zod';
import type { FCWithZodSchema } from 'zod-storybook-docgen';

const propsSchema = z.object({
  title: z.string().describe('The heading text'),
  variant: z.enum(['primary', 'secondary']).default('primary'),
  count: z.number().optional(),
  disabled: z.boolean(),
});

type Props = z.infer<typeof propsSchema>;

const MyButton: FCWithZodSchema<Props, typeof propsSchema> = ({
  title,
  variant = 'primary',
  count,
  disabled,
}) => (
  <button disabled={disabled}>
    {title} ({variant}) {count !== undefined && `x${count}`}
  </button>
);

MyButton.zodSchema = propsSchema;

export default MyButton;
```

### 3. Add descriptions with `.describe()`

Zod's built-in `.describe()` method is how you add prop descriptions that appear in Storybook's docs table:

```ts
const schema = z.object({
  title: z.string().describe('The heading text displayed at the top'),
  count: z.number().optional().describe('Number of items to display'),
});
```

The enhancer reads `.describe()` from any position in the chain — before or after `.optional()`, `.default()`, etc.

## Migration: JSDoc to `.describe()`

If your codebase already has JSDoc comments above Zod schema properties, the included **one-time migration script** converts them into `.describe()` calls automatically.

### Before migration

```ts
const schema = z.object({
  /**
   * Array of title / content pair in obj from cms.
   */
  accordionItems: z.array(accordionItemSchema),
  /** Optionally displays border around each accordion item. */
  showBorder: z.boolean().optional(),
});
```

JSDoc comments are stripped by the compiler — Storybook never sees them at runtime.

### After migration

```ts
const schema = z.object({
  /**
   * Array of title / content pair in obj from cms.
   */
  accordionItems: z.array(accordionItemSchema).describe('Array of title / content pair in obj from cms.'),
  /** Optionally displays border around each accordion item. */
  showBorder: z.boolean().optional().describe('Optionally displays border around each accordion item.'),
});
```

The JSDoc comments are preserved (for IDE hover tooltips), and `.describe()` makes the same text available at runtime for Storybook.

### Running the migration

```bash
# Preview changes without modifying files
npx zod-storybook-docgen migrate 'src/**/*.{ts,tsx}' --dry-run

# Apply changes
npx zod-storybook-docgen migrate 'src/**/*.{ts,tsx}'

# Monorepo example
npx zod-storybook-docgen migrate 'packages/**/src/**/*.{ts,tsx}'
```

The script:

1. Parses each file's AST (supports TypeScript + JSX)
2. Finds `z.object({...})` calls (any receiver name — `z`, `zod`, etc.)
3. For each property with a leading `/** ... */` comment, appends `.describe('...')` if not already present
4. Writes the modified file back (or prints a summary in `--dry-run` mode)

**It's safe to run multiple times** — properties that already have `.describe()` are skipped.

### Programmatic API

```ts
import { migrateSource } from 'zod-storybook-docgen/migrate';

const { output, changes } = migrateSource(sourceCode, 'MyComponent.tsx');
```

## How It Works

The enhancer runs as a Storybook `argTypesEnhancer`. For each story, it:

1. Checks `context.component.zodSchema` for an attached Zod schema, falling back to `context.parameters.zodSchema`
2. Unwraps wrapper types (`ZodOptional`, `ZodNullable`, `ZodDefault`, `ZodEffects`, `ZodBranded`, `ZodLazy`, etc.)
3. Maps each field to a Storybook argType with the appropriate control
4. Merges with any existing argTypes — **existing argTypes always take precedence**

### Zod Type to Storybook Control Mapping

| Zod Type | Control | Notes |
|---|---|---|
| `z.string()` | `text` | |
| `z.number()` | `number` | |
| `z.boolean()` | `boolean` | |
| `z.enum([...])` | `select` | Options populated from enum values |
| `z.nativeEnum(E)` | `select` | String values extracted |
| `z.literal(v)` | disabled | Value shown in type summary |
| `z.union([literals])` | `select` | Only if all options are literals |
| `z.union([mixed])` | `text` | Fallback for mixed unions |
| `z.array(...)` | `object` | JSON editor |
| `z.object({...})` | `object` | JSON editor |
| `z.function()` | disabled | Use `fn()` in story args |
| `z.date()` | `date` | |
| `z.custom<T>()` | disabled | No meaningful control |

### Wrapper Type Handling

| Wrapper | Effect |
|---|---|
| `.optional()` | Field marked as not required |
| `.nullable()` | Type summary appended with `| null`; field still required |
| `.default(v)` | Field marked as not required; default value shown |
| `.describe(s)` | Description added to docs |
| `.refine()` / `.transform()` | Unwrapped to inner type |
| `.brand()` / `.pipe()` / `.catch()` / `.readonly()` | Unwrapped to inner type |
| `z.lazy(() => ...)` | Resolved and unwrapped |

## API

### `zodSchemaToArgTypes(schema)`

Convert a Zod object schema directly to a Storybook argTypes map.

```ts
import { zodSchemaToArgTypes } from 'zod-storybook-docgen';

const argTypes = zodSchemaToArgTypes(mySchema);
```

### `zodArgTypesEnhancer(context)`

Storybook argTypes enhancer function. Register it in your preview config and it handles everything automatically.

```ts
import { zodArgTypesEnhancer } from 'zod-storybook-docgen';

export default {
  argTypesEnhancers: [zodArgTypesEnhancer],
};
```

### `migrateSource(source, filename)`

Transform a source string, converting JSDoc comments on Zod properties into `.describe()` calls. Returns the modified source and number of changes.

```ts
import { migrateSource } from 'zod-storybook-docgen/migrate';

const { output, changes } = migrateSource(code, 'schema.ts');
```

### Types

```ts
import type { ArgType, ArgTypes, StoryContext, FCWithZodSchema } from 'zod-storybook-docgen';
import type { MigrateResult } from 'zod-storybook-docgen/migrate';
```

#### `FCWithZodSchema<P, S>`

A React function component type with an attached `.zodSchema` property. This is the type used by Option B (attaching the schema directly to the component).

```ts
type FCWithZodSchema<P = object, S extends ZodType = ZodType<P>> = FC<P> & {
  zodSchema: S;
};
```

| Parameter | Description |
|---|---|
| `P` | The component's props type (typically `z.infer<typeof schema>`) |
| `S` | The Zod schema type (defaults to `ZodType<P>`) |

**Usage with a simple component:**

```tsx
// MyButton.tsx
import { z } from 'zod';
import type { FCWithZodSchema } from 'zod-storybook-docgen';

export const propsSchema = z.object({
  label: z.string().describe('Button label'),
  variant: z.enum(['primary', 'secondary']).default('primary'),
});

type Props = z.infer<typeof propsSchema>;

const MyButton: FCWithZodSchema<Props, typeof propsSchema> = ({
  label,
  variant = 'primary',
}) => <button className={variant}>{label}</button>;

MyButton.zodSchema = propsSchema;

export default MyButton;
```

When using `FCWithZodSchema`, the story file needs no extra configuration — the enhancer discovers the schema automatically:

```tsx
// MyButton.stories.tsx
import MyButton from './MyButton';

const meta = {
  component: MyButton,
  // No parameters.zodSchema needed — it's on the component itself
};

export default meta;
```

If the component does **not** use `FCWithZodSchema`, pass the schema via `parameters` instead:

```tsx
// MyButton.stories.tsx
import MyButton, { propsSchema } from './MyButton';

const meta = {
  component: MyButton,
  parameters: { zodSchema: propsSchema },
};

export default meta;
```

**Usage with a factory function:**

If you have many components with Zod schemas, a factory helper reduces boilerplate:

```ts
import { z } from 'zod';
import type { FC } from 'react';
import type { FCWithZodSchema } from 'zod-storybook-docgen';

function createComponent<S extends z.ZodObject<z.ZodRawShape>>(
  schema: S,
  render: FC<z.infer<S>>,
): FCWithZodSchema<z.infer<S>, S> {
  const Component = render as FCWithZodSchema<z.infer<S>, S>;
  Component.zodSchema = schema;
  return Component;
}

// Usage:
const MyButton = createComponent(propsSchema, ({ label, variant }) => (
  <button className={variant}>{label}</button>
));
// MyButton.zodSchema is set automatically — no per-story config needed
```

## License

MIT

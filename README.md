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

### 2. Attach a Zod schema to your component

```tsx
import { z } from 'zod';
import type { FC } from 'react';

const propsSchema = z.object({
  title: z.string().describe('The heading text'),
  variant: z.enum(['primary', 'secondary']).default('primary'),
  count: z.number().optional(),
  disabled: z.boolean(),
  onClick: z.function(),
});

type Props = z.infer<typeof propsSchema>;

const MyButton: FC<Props> & { zodSchema?: z.ZodTypeAny } = ({
  title,
  variant = 'primary',
  count,
  disabled,
  onClick,
}) => (
  <button disabled={disabled} onClick={onClick}>
    {title} ({variant}) {count !== undefined && `x${count}`}
  </button>
);

MyButton.zodSchema = propsSchema;

export default MyButton;
```

That's it. Storybook will now show controls, types, defaults, and descriptions for all props defined in the schema.

## How It Works

The enhancer runs as a Storybook `argTypesEnhancer`. For each story, it:

1. Checks `context.component.zodSchema` for an attached Zod schema
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
| `.nullable()` | Type summary appended with `\| null`; field still required |
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

### Types

```ts
import type { ArgType, ArgTypes, StoryContext } from 'zod-storybook-docgen';
```

## Integration with FCWithZodSchema

If your codebase uses a pattern like `FCWithZodSchema` that attaches `.zodSchema` to components automatically, this package works out of the box with zero per-component config:

```ts
type FCWithZodSchema<P, S extends z.ZodType> = FC<P> & { zodSchema: S };

function createComponent<S extends z.ZodObject<z.ZodRawShape>>(
  schema: S,
  render: FC<z.infer<S>>,
): FCWithZodSchema<z.infer<S>, S> {
  const Component = render as FCWithZodSchema<z.infer<S>, S>;
  Component.zodSchema = schema;
  return Component;
}
```

## License

MIT

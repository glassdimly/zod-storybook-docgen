import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodSchemaToArgTypes, zodArgTypesEnhancer } from '../index';
import type { StoryContext } from '../index';

describe('zodSchemaToArgTypes', () => {
  it('generates argTypes for basic scalar fields', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean(),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.name).toEqual({
      control: { type: 'text' },
      table: { type: { summary: 'string' } },
      type: { required: true },
    });
    expect(result.age).toEqual({
      control: { type: 'number' },
      table: { type: { summary: 'number' } },
      type: { required: true },
    });
    expect(result.active).toEqual({
      control: { type: 'boolean' },
      table: { type: { summary: 'boolean' } },
      type: { required: true },
    });
  });

  it('marks optional fields as not required', () => {
    const schema = z.object({
      name: z.string(),
      nickname: z.string().optional(),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.name.type).toEqual({ required: true });
    expect(result.nickname.type).toBeUndefined();
  });

  it('marks nullable fields as required with "| null" in type summary', () => {
    const schema = z.object({
      value: z.string().nullable(),
    });

    const result = zodSchemaToArgTypes(schema);

    // Nullable fields are still required — they accept null but the key must be present
    expect(result.value.type).toEqual({ required: true });
    expect(result.value.table?.type?.summary).toBe('string | null');
  });

  it('marks fields with .default() as optional and captures default value', () => {
    const schema = z.object({
      color: z.string().default('red'),
      count: z.number().default(42),
    });

    const result = zodSchemaToArgTypes(schema);

    // .default() makes input optional
    expect(result.color.type).toBeUndefined();
    expect(result.color.table?.defaultValue?.summary).toBe('red');

    expect(result.count.type).toBeUndefined();
    expect(result.count.table?.defaultValue?.summary).toBe('42');
  });

  it('handles z.enum with select control', () => {
    const schema = z.object({
      status: z.enum(['active', 'inactive', 'pending']),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.status.control).toEqual({ type: 'select' });
    expect(result.status.options).toEqual(['active', 'inactive', 'pending']);
    expect(result.status.table?.type?.summary).toBe('"active" | "inactive" | "pending"');
  });

  it('handles z.literal with disabled control', () => {
    const schema = z.object({
      type: z.literal('button'),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.type.control).toBe(false);
    expect(result.type.table?.type?.summary).toBe('"button"');
  });

  it('handles z.union of literals as select control', () => {
    const schema = z.object({
      size: z.union([z.literal('sm'), z.literal('md'), z.literal('lg')]),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.size.control).toEqual({ type: 'select' });
    expect(result.size.options).toEqual(['sm', 'md', 'lg']);
  });

  it('handles z.union of mixed types as text control', () => {
    const schema = z.object({
      value: z.union([z.string(), z.number()]),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.value.control).toEqual({ type: 'text' });
    expect(result.value.table?.type?.summary).toBe('string | number');
  });

  it('handles z.array as object control', () => {
    const schema = z.object({
      items: z.array(z.string()),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.items.control).toEqual({ type: 'object' });
    expect(result.items.table?.type?.summary).toBe('string[]');
  });

  it('handles z.object (nested) as object control', () => {
    const schema = z.object({
      config: z.object({ key: z.string() }),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.config.control).toEqual({ type: 'object' });
    expect(result.config.table?.type?.summary).toBe('object');
  });

  it('handles z.function with disabled control', () => {
    const schema = z.object({
      onClick: z.function(),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.onClick.control).toBe(false);
    expect(result.onClick.table?.type?.summary).toBe('function');
  });

  it('handles z.date with date control', () => {
    const schema = z.object({
      createdAt: z.date(),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.createdAt.control).toEqual({ type: 'date' });
  });

  it('captures .describe() as description', () => {
    const schema = z.object({
      name: z.string().describe('The user display name'),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.name.description).toBe('The user display name');
  });

  it('unwraps ZodEffects (.refine, .transform) to reach the inner type', () => {
    const schema = z.object({
      email: z.string().email().refine((val) => val.includes('@')),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.email.control).toEqual({ type: 'text' });
    expect(result.email.table?.type?.summary).toBe('string');
  });

  it('unwraps ZodLazy', () => {
    const schema = z.object({
      value: z.lazy(() => z.string()),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.value.control).toEqual({ type: 'text' });
    expect(result.value.table?.type?.summary).toBe('string');
  });

  it('handles wrapped z.object (e.g. .strict())', () => {
    const schema = z.object({ name: z.string() }).strict();

    const result = zodSchemaToArgTypes(schema);

    expect(result.name).toBeDefined();
    expect(result.name.control).toEqual({ type: 'text' });
  });

  it('returns empty and warns for non-ZodObject schemas', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = zodSchemaToArgTypes(z.string());

    expect(result).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('ZodString schema instead of ZodObject'),
    );

    warnSpy.mockRestore();
  });

  it('handles z.nativeEnum', () => {
    enum Color {
      Red = 'red',
      Blue = 'blue',
    }
    const schema = z.object({
      color: z.nativeEnum(Color),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.color.control).toEqual({ type: 'select' });
    expect(result.color.options).toEqual(['red', 'blue']);
  });

  it('handles z.intersection', () => {
    const schema = z.object({
      value: z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() })),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.value.table?.type?.summary).toBe('object & object');
  });

  it('handles z.record', () => {
    const schema = z.object({
      metadata: z.record(z.string()),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.metadata.table?.type?.summary).toBe('Record<string, ...>');
  });

  it('handles z.tuple', () => {
    const schema = z.object({
      coords: z.tuple([z.number(), z.number()]),
    });

    const result = zodSchemaToArgTypes(schema);

    expect(result.coords.table?.type?.summary).toBe('[number, number]');
  });

  it('handles combined optional + nullable + default', () => {
    const schema = z.object({
      value: z.string().nullable().optional().default('hello'),
    });

    const result = zodSchemaToArgTypes(schema);

    // .default() wraps the outermost → isOptional
    expect(result.value.type).toBeUndefined();
    expect(result.value.table?.defaultValue?.summary).toBe('hello');
  });
});

describe('zodArgTypesEnhancer', () => {
  it('returns existing argTypes when component has no zodSchema', () => {
    const existing = { name: { control: { type: 'text' } } };
    const context: StoryContext = {
      component: {},
      argTypes: existing,
    };

    const result = zodArgTypesEnhancer(context);

    expect(result).toBe(existing);
  });

  it('generates argTypes from zodSchema on the component', () => {
    const schema = z.object({
      title: z.string(),
      count: z.number(),
    });

    const MyComponent = () => null;
    (MyComponent as Record<string, unknown>).zodSchema = schema;

    const context: StoryContext = {
      component: MyComponent as StoryContext['component'],
      argTypes: {},
    };

    const result = zodArgTypesEnhancer(context);

    expect(result.title).toBeDefined();
    expect(result.title.control).toEqual({ type: 'text' });
    expect(result.count).toBeDefined();
    expect(result.count.control).toEqual({ type: 'number' });
  });

  it('merges with existing argTypes (existing takes precedence)', () => {
    const schema = z.object({
      title: z.string().describe('From Zod'),
      count: z.number(),
    });

    const MyComponent = () => null;
    (MyComponent as Record<string, unknown>).zodSchema = schema;

    const context: StoryContext = {
      component: MyComponent as StoryContext['component'],
      argTypes: {
        title: {
          description: 'From react-docgen',
          control: { type: 'text' },
        },
      },
    };

    const result = zodArgTypesEnhancer(context);

    // Existing description wins over Zod description
    expect(result.title.description).toBe('From react-docgen');
    // Zod-generated count is still present
    expect(result.count).toBeDefined();
  });

  it('returns empty argTypes when component is undefined', () => {
    const context: StoryContext = {
      argTypes: {},
    };

    const result = zodArgTypesEnhancer(context);

    expect(result).toEqual({});
  });
});

// Test-only helper: validate a JSON value against the JSON Schema subset in ai/schemas.ts.
// Production code never imports this (parsers are hand-written, ARCH AD-12); it is tree-shaken from builds.
type S = Record<string, unknown>;

/** Returns a list of violations (empty = valid). */
export function validateJson(schema: S, value: unknown, path = '$'): string[] {
  const errs: string[] = [];
  const t = schema.type as string;
  const typeOk =
    t === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
    : t === 'array' ? Array.isArray(value)
    : t === 'string' ? typeof value === 'string'
    : t === 'number' ? typeof value === 'number' && Number.isFinite(value)
    : t === 'integer' ? Number.isInteger(value)
    : t === 'boolean' ? typeof value === 'boolean'
    : false;
  if (!typeOk) return [`${path}: expected ${t}`];
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errs.push(`${path}: ${JSON.stringify(value)} not in enum`);
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errs.push(`${path}: below minimum`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) errs.push(`${path}: above maximum`);
  }
  if (t === 'array') {
    const arr = value as unknown[];
    if (typeof schema.minItems === 'number' && arr.length < schema.minItems) errs.push(`${path}: fewer than minItems`);
    if (typeof schema.maxItems === 'number' && arr.length > schema.maxItems) errs.push(`${path}: more than maxItems`);
    arr.forEach((v, i) => errs.push(...validateJson(schema.items as S, v, `${path}[${i}]`)));
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, S>;
    for (const r of (schema.required as string[] | undefined) ?? []) if (!(r in obj)) errs.push(`${path}: missing ${r}`);
    for (const [k, v] of Object.entries(obj)) {
      if (k in props) errs.push(...validateJson(props[k], v, `${path}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${path}: unexpected property ${k}`);
    }
  }
  return errs;
}

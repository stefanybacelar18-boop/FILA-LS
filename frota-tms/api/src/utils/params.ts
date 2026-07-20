import { Request } from 'express';

/** Express 5 types params as string | string[]; normalize to a single string */
export function paramId(req: Request, name = 'id'): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

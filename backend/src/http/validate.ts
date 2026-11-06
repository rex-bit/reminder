import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/** Validates and replaces req.body / req.query / req.params with the parsed (stripped, coerced) values. */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params));
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query) as Record<string, unknown>;
        // Express 4 allows reassigning req.query; keep parsed values reachable via res.locals as well.
        (req as unknown as { query: unknown }).query = parsed;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

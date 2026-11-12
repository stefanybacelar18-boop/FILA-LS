/** Cliente PG mínimo para gateway (mesma forma do ProductsStock). */
export type PgQueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number | null;
};

export type PgQueryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<PgQueryResult<T>>;
};

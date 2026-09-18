// Pure use case: the PostgreSQL adapter is the injected `db.query` boundary.
export async function createUrl(db, {short, original}) {
  const result = await db.query(
    'INSERT INTO public.urls (short, original) VALUES ($1, $2) RETURNING id, short, original',
    [short, original]
  );
  return result.rows[0];
}

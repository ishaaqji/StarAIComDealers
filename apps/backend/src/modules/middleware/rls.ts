/**
 * Row-Level Security context helpers.
 *
 * Every dealer-scoped request must call setDealerContext(client, dealerId) before
 * any other query so PostgreSQL RLS policies (USING dealer_id = current_setting('app.dealer_id'))
 * enforce tenant isolation even if application code has a bug.
 */

import { PoolClient } from 'pg';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

const SET_CONTEXT_SQL = "SET LOCAL app.dealer_id = $1";
const RESET_CONTEXT_SQL = "RESET app.dealer_id";

/** Set the RLS dealer context within the current transaction. */
export async function setDealerContext(client: PoolClient, dealerId: string): Promise<void> {
  if (!UUID_RE.test(dealerId)) {
    throw new Error(`invalid dealer_id for RLS context: ${dealerId}`);
  }
  await client.query(`SET LOCAL app.dealer_id = '${dealerId}'`);
}

/** Reset the RLS context (restore default). */
export async function resetDealerContext(client: PoolClient): Promise<void> {
  await client.query(RESET_CONTEXT_SQL, []);
}

/**
 * Run a callback inside a transaction with RLS context set for the given dealer.
 * All queries performed with the transaction client are automatically scoped.
 */
export async function withDealerContext<T>(
  client: PoolClient,
  dealerId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  await client.query('BEGIN');
  try {
    await setDealerContext(client, dealerId);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

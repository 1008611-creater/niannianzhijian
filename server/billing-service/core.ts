import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

type WalletRow = { balance: number | string };
type LedgerRow = { amount: number | string; balance_after: number | string };

export interface BillingInput {
  readonly userId: string;
  readonly operationId: string;
  readonly step: string;
  readonly credits: number;
}

function integer(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) ? parsed : 0;
}

export function validBillingSignature(secret: string, payload: string, provided: string | undefined): boolean {
  if (secret.trim().length < 32 || !provided || !/^[a-f0-9]{64}$/i.test(provided)) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(payload).digest('hex'), 'hex');
  const actual = Buffer.from(provided, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeBillingInput(value: unknown): BillingInput | null {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const userId = typeof raw.userId === 'string' ? raw.userId.trim() : '';
  const operationId = typeof raw.operationId === 'string' ? raw.operationId.trim().slice(0, 160) : '';
  const step = typeof raw.step === 'string' ? raw.step.trim().replace(/[^a-z0-9_-]/gi, '_').slice(0, 64) : '';
  const credits = Number(raw.credits);
  return userId && operationId && step && Number.isInteger(credits) && credits >= 0 && credits <= 100_000
    ? { userId, operationId, step, credits }
    : null;
}

async function walletBalance(client: Pick<PoolClient, 'query'>, userId: string): Promise<number> {
  const result = await client.query<WalletRow>('SELECT balance FROM user_credits WHERE user_id = $1 LIMIT 1', [userId]);
  return integer(result.rows[0]?.balance);
}

export async function readBalance(pool: Pick<Pool, 'query'>, userId: string): Promise<number> {
  const result = await pool.query<WalletRow>('SELECT balance FROM user_credits WHERE user_id = $1 LIMIT 1', [userId]);
  return integer(result.rows[0]?.balance);
}

export async function consumeCredits(pool: Pick<Pool, 'connect'>, input: BillingInput) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reason = `editor_${input.step}`;
    const taskId = `editor:${input.userId}:${input.operationId}`;
    const existing = await client.query<LedgerRow>(
      'SELECT amount, balance_after FROM credit_ledger WHERE task_id = $1 AND reason = $2 LIMIT 1',
      [taskId, reason],
    );
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return {
        charged: false,
        credits: Math.abs(integer(existing.rows[0].amount)),
        balanceAfter: integer(existing.rows[0].balance_after),
        operationId: input.operationId,
        step: input.step,
      };
    }
    const changed = input.credits === 0
      ? { rowCount: 1 }
      : await client.query(
          'UPDATE user_credits SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2 AND balance >= $1',
          [input.credits, input.userId],
        );
    if (changed.rowCount !== 1) throw new Error('CREDITS_INSUFFICIENT');
    const balanceAfter = await walletBalance(client, input.userId);
    await client.query(
      `INSERT INTO credit_ledger
        (id, user_id, amount, balance_after, reason, task_id, recharge_request_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NOW())`,
      [crypto.randomUUID(), input.userId, -input.credits, balanceAfter, reason, taskId],
    );
    await client.query('COMMIT');
    return { charged: true, credits: input.credits, balanceAfter, operationId: input.operationId, step: input.step };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

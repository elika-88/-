import 'server-only';
import type { Client } from '@libsql/client';
import { withDatabase } from './database';

export type BillingChannel = 'paypal' | 'revenuecat';
export type BillingChannels = { paypal: boolean; revenuecat: boolean; revision: number };

async function initialize(db: Client) {
  await db.execute(`CREATE TABLE IF NOT EXISTS billing_channels (
    id INTEGER PRIMARY KEY CHECK(id=1), paypal INTEGER NOT NULL,
    revenuecat INTEGER NOT NULL, revision INTEGER NOT NULL
  )`);
  await db.execute('INSERT OR IGNORE INTO billing_channels VALUES (1, 1, 0, 0)');
}

export async function readBillingChannels(): Promise<BillingChannels> {
  return withDatabase(async db => {
    await initialize(db);
    const row = (await db.execute('SELECT paypal, revenuecat, revision FROM billing_channels WHERE id=1')).rows[0];
    return { paypal: Boolean(row.paypal), revenuecat: Boolean(row.revenuecat), revision: Number(row.revision) };
  });
}

// Compare-and-swap prevents another administrator's change being silently overwritten.
export async function setBillingChannel(channel: BillingChannel, enabled: boolean, revision: number) {
  return withDatabase(async db => {
    await initialize(db);
    const tx = await db.transaction('write');
    try {
      const result = await tx.execute({
        sql: `UPDATE billing_channels SET ${channel === 'paypal' ? 'paypal' : 'revenuecat'}=?, revision=revision+1 WHERE id=1 AND revision=?`,
        args: [enabled ? 1 : 0, revision],
      });
      if (!result.rowsAffected) throw new Error('CONFLICT');
      await tx.execute('CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, event TEXT NOT NULL, created_at INTEGER NOT NULL)');
      await tx.execute({ sql: 'INSERT INTO audit(event,created_at) VALUES (?,?)', args: [`billing_${channel}_${enabled ? 'enabled' : 'disabled'}`, Date.now()] });
      await tx.commit();
    } catch (error) { if (!tx.closed) await tx.rollback(); throw error; }
    finally { tx.close(); }
  });
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { studyTransport } from '@/lib/client/study-records';
import { createSession } from '@/lib/client/sessions';
const userId = 'a20e5041-118e-4de0-b7b6-6ecf279c5b23';
afterEach(() => vi.unstubAllGlobals());
describe('cloud transport response and identity validation', () => {
  it('sends the expected account, cookies and uncached requests', async () => {
    const fetch = vi.fn(async () => Response.json({ userId, sessions: [], revisions: {}, storage: 'local' })); vi.stubGlobal('fetch', fetch);
    await studyTransport(userId).list(new AbortController().signal);
    expect(fetch).toHaveBeenCalledWith('/api/study-sessions', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', headers: expect.objectContaining({ 'X-Lumina-Account': userId }) }));
  });
  it('rejects another account and incomplete/missing revisions instead of loading partial history', async () => {
    const item = createSession();
    for (const [body, code] of [
      [{ userId: '1a6c8cc9-8707-43b0-9072-3708383773c4', sessions: [], revisions: {}, storage: 'local' }, 'ACCOUNT_CHANGED'],
      [{ userId, sessions: [item], revisions: {}, storage: 'local' }, 'INVALID_RESPONSE'],
      [{ userId, sessions: [item, item], revisions: { [item.id]: 1 }, storage: 'local' }, 'INVALID_RESPONSE'],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)));
      await expect(studyTransport(userId).list(new AbortController().signal)).rejects.toMatchObject({ code });
    }
  });
  it('rejects a mismatched save acknowledgement and preserves non-JSON failures for retry', async () => {
    const item = createSession(); const api = studyTransport(userId); const signal = new AbortController().signal;
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ session: { ...item, id: 'wrong' }, revision: 1 })));
    await expect(api.save(item, 0, signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Gateway timeout</html>', { status: 504 })));
    await expect(api.list(signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Full', code: 'STORAGE_LIMIT' }, { status: 409 })));
    await expect(api.save(item, 0, signal)).rejects.toMatchObject({ code: 'STORAGE_LIMIT' });
  });
});

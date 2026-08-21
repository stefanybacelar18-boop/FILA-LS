import { describe, expect, it } from 'vitest';
import { healthPayload, probeDatabase } from './health';

describe('health', () => {
  it('marca db down se a query estourar o timeout', async () => {
    const db = await probeDatabase(() => new Promise(() => undefined), 20);
    expect(db).toBe('down');
  });

  it('responde ok:true mesmo com db down (liveness Render)', () => {
    expect(healthPayload({ db: 'down', uptimeSec: 1, commit: 'abc' })).toMatchObject({
      ok: true,
      db: 'down',
      commit: 'abc',
    });
  });
});

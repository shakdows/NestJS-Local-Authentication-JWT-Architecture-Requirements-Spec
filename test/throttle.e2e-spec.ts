import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from './utils/create-test-app.js';
import { http, PASSWORD } from './utils/auth-helpers.js';
import { resetDatabase } from './utils/reset-database.js';

describe('Rate limiting (e2e, SEC-RATE)', () => {
  let app: NestExpressApplication;
  const previous = process.env.THROTTLE_ENABLED;

  beforeAll(async () => {
    process.env.THROTTLE_ENABLED = 'true';
    app = await createTestApp();
  });
  beforeEach(() => resetDatabase(app));
  afterAll(async () => {
    await app.close();
    process.env.THROTTLE_ENABLED = previous;
  });

  it('SEC-RATE-03: the 6th login within 60s → 429 RATE_LIMITED with Retry-After', async () => {
    const attempt = () =>
      http(app)
        .post('/auth/login')
        .send({ email: 'x@example.com', password: 'Wrong-pass1' });
    for (let i = 0; i < 5; i += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later',
    });
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('SEC-RATE-02: the 6th registration within 60s → 429', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push(
        (
          await http(app)
            .post('/auth/register')
            .send({ email: `u${i}@example.com`, password: PASSWORD })
        ).status,
      );
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it('SEC-RATE-04: refresh allows 30/min, then 429', async () => {
    const statuses = [];
    for (let i = 0; i < 31; i += 1)
      statuses.push((await http(app).post('/auth/refresh').send({})).status);
    expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});

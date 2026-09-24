import argon2 from 'argon2';
import { PasswordService } from './password.service.js';

const defaults = { argon2: { memoryCost: 19456, timeCost: 2, parallelism: 1 } };

describe('PasswordService (SEC-HASH)', () => {
  const service = new PasswordService(defaults);

  it('produces argon2id PHC strings embedding the configured parameters', async () => {
    const hash = await service.hash('S3cure-passphrase');
    expect(hash.startsWith('$argon2id$v=19$')).toBe(true);
    expect(hash).toMatch(/\$m=19456,/);
    expect(hash).toMatch(/[$,]t=2[$,]/);
    expect(hash).toMatch(/[$,]p=1[$,]/);
  });

  it('salts every hash (two hashes of the same password differ)', async () => {
    expect(await service.hash('same-password-1')).not.toBe(await service.hash('same-password-1'));
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await service.hash('S3cure-passphrase');
    expect(await service.verify(hash, 'S3cure-passphrase')).toBe(true);
    expect(await service.verify(hash, 's3cure-passphrase')).toBe(false);
  });

  it('preserves whitespace in passwords (FR-PWD-05)', async () => {
    const hash = await service.hash(' padded1 ');
    expect(await service.verify(hash, 'padded1')).toBe(false);
    expect(await service.verify(hash, ' padded1 ')).toBe(true);
  });

  it('returns false instead of throwing for a malformed hash', async () => {
    await expect(service.verify('not-a-hash', 'x')).resolves.toBe(false);
  });

  it('reports needsRehash when parameters are raised', async () => {
    const hash = await service.hash('Password123');
    expect(service.needsRehash(hash)).toBe(false);
    const stronger = new PasswordService({ argon2: { memoryCost: 32768, timeCost: 3, parallelism: 1 } });
    expect(stronger.needsRehash(hash)).toBe(true);
  });

  it('verifyDummy performs one real argon2 verification and resolves false (SEC-ENUM-02)', async () => {
    const spy = vi.spyOn(argon2, 'verify');
    await service.onModuleInit();
    await expect(service.verifyDummy('anything')).resolves.toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

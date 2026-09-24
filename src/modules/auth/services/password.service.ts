import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import authConfig from '../../../config/auth.config.js';

/**
 * The only component that touches the hashing library (SEC-HASH-05).
 * Argon2id with configurable parameters (SEC-HASH-01); plaintext is never logged or stored.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash: string | undefined;

  constructor(@Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>) {}

  private get options() {
    return {
      type: argon2.argon2id,
      memoryCost: this.config.argon2.memoryCost,
      timeCost: this.config.argon2.timeCost,
      parallelism: this.config.argon2.parallelism,
    } as const;
  }

  /** Precomputes the dummy hash used to equalize timing for unknown emails (SEC-ENUM-02). */
  async onModuleInit(): Promise<void> {
    await this.getDummyHash();
  }

  /** Hashes a password into a self-describing PHC string (params + random salt embedded). */
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  /** Constant-time verification. Returns false (never throws) for mismatches and malformed hashes. */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /** True when the hash was produced with weaker/different parameters than the current config. */
  needsRehash(hash: string): boolean {
    try {
      const { memoryCost, timeCost, parallelism } = this.options;
      return argon2.needsRehash(hash, { memoryCost, timeCost, parallelism });
    } catch {
      return true;
    }
  }

  /** Performs one real Argon2 verification against a dummy hash, then reports failure. */
  async verifyDummy(plain: string): Promise<false> {
    await this.verify(await this.getDummyHash(), plain);
    return false;
  }

  private async getDummyHash(): Promise<string> {
    this.dummyHash ??= await this.hash(randomBytes(32).toString('hex'));
    return this.dummyHash;
  }
}

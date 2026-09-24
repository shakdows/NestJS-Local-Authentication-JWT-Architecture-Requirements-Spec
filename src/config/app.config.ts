import { registerAs } from '@nestjs/config';
import { ENV_DEFAULTS } from './env.validation.js';
import { envBool, envInt, envString } from './env.util.js';

function parseTrustProxy(raw: string): boolean | number {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return Number.parseInt(raw, 10);
}

export default registerAs('app', () => ({
  nodeEnv: envString('NODE_ENV', ENV_DEFAULTS.NODE_ENV) as 'development' | 'test' | 'production',
  port: envInt('PORT', ENV_DEFAULTS.PORT),
  apiPrefix: envString('API_PREFIX', ENV_DEFAULTS.API_PREFIX),
  corsOrigins: envString('CORS_ORIGINS', ENV_DEFAULTS.CORS_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustProxy: parseTrustProxy(envString('TRUST_PROXY', ENV_DEFAULTS.TRUST_PROXY)),
  throttle: {
    ttlSeconds: envInt('THROTTLE_TTL', ENV_DEFAULTS.THROTTLE_TTL),
    limit: envInt('THROTTLE_LIMIT', ENV_DEFAULTS.THROTTLE_LIMIT),
    enabled: envBool('THROTTLE_ENABLED', ENV_DEFAULTS.THROTTLE_ENABLED),
  },
}));

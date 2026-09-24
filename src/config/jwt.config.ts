import { registerAs } from '@nestjs/config';
import { parseDurationToSeconds } from './duration.util.js';
import { ENV_DEFAULTS } from './env.validation.js';
import { envRequired, envString } from './env.util.js';

export default registerAs('jwt', () => {
  const accessExpiresIn = envString(
    'JWT_ACCESS_EXPIRES_IN',
    ENV_DEFAULTS.JWT_ACCESS_EXPIRES_IN,
  );
  const refreshExpiresIn = envString(
    'JWT_REFRESH_EXPIRES_IN',
    ENV_DEFAULTS.JWT_REFRESH_EXPIRES_IN,
  );
  return {
    access: {
      secret: envRequired('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
      ttlSeconds: parseDurationToSeconds(accessExpiresIn),
    },
    refresh: {
      secret: envRequired('JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
      ttlSeconds: parseDurationToSeconds(refreshExpiresIn),
    },
    issuer: envString('JWT_ISSUER', ENV_DEFAULTS.JWT_ISSUER),
    audience: envString('JWT_AUDIENCE', ENV_DEFAULTS.JWT_AUDIENCE),
  };
});

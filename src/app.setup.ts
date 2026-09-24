import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ConfigType } from '@nestjs/config';
import helmet from 'helmet';
import appConfig from './config/app.config.js';

/**
 * HTTP-level setup shared by `main.ts` and the e2e test harness, so tests exercise the
 * exact production pipeline (AUTH_ARCHITECTURE §7).
 */
export function configureApp(
  app: NestExpressApplication,
): NestExpressApplication {
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(
    helmet({
      hsts:
        config.nodeEnv === 'production'
          ? { maxAge: 15552000, includeSubDomains: true }
          : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  if (config.corsOrigins.length > 0) {
    app.enableCors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      credentials: false,
    });
  }

  if (config.apiPrefix) {
    app.setGlobalPrefix(config.apiPrefix);
  }

  // Express' default JSON body limit is already 100kb (SEC-VAL-03); keep it explicit.
  app.useBodyParser('json', { limit: '100kb' });
  app.enableShutdownHooks();
  return app;
}

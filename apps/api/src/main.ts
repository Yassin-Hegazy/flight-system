import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { openApiDocument } from './openapi';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  SwaggerModule.setup('docs', app, () => openApiDocument(app), {
    swaggerOptions: {
      // "Try it out" sends the header CsrfMiddleware requires, as the web app does (NFR-SEC-04).
      requestInterceptor: (request: { headers: Record<string, string> }) => {
        request.headers['X-Requested-With'] = 'swagger-ui';
        return request;
      },
    },
  });

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();

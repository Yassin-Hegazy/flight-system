import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Flight Booking API')
    .setDescription('Flight search, booking and ticketing')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, swaggerConfig), {
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

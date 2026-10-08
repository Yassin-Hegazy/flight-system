import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { type Env, NodeEnv } from './env';

export const REQUEST_ID_HEADER = 'x-request-id';

// Accept a caller-supplied request ID only if it looks like an ID, so log lines cannot be polluted.
const REQUEST_ID_PATTERN = /^[\w.-]{1,128}$/;

function requestId(request: IncomingMessage, response: ServerResponse): string {
  const incoming = request.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  response.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: requestId,
          // Loggers used while handling a request carry only { reqId } rather than the whole request.
          quietReqLogger: true,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          transport:
            config.get('NODE_ENV', { infer: true }) === NodeEnv.Development
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}

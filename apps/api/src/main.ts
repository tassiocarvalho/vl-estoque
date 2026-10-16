import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { env, isProduction } from './config/env';
import { AppModule } from './app.module';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção extra contra CSRF: requisições que alteram dados precisam do cabeçalho
 * X-Requested-With, que formulários de outros sites não conseguem enviar.
 */
function requireAjaxHeader(req: Request, res: Response, next: NextFunction) {
  const isApi = req.path.startsWith('/api/');
  const isIntegration = req.path.startsWith('/api/integration/');
  if (!isApi || isIntegration || SAFE_METHODS.has(req.method) || req.get('x-requested-with') === 'XMLHttpRequest') {
    return next();
  }
  res.status(403).json({ statusCode: 403, message: 'Requisição bloqueada' });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback'); // IP real do cliente atrás de proxy reverso local (logs e rate limit)
  // 300 KB: comporta o logotipo da loja (até ~150 KB) nas configurações; o resto da API envia bem menos.
  app.useBodyParser('json', { limit: '300kb' });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          workerSrc: ["'self'", 'blob:'],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          // Só força HTTPS quando o sistema estiver publicado com certificado;
          // sem isso, o acesso pela rede local (http://IP:3000) quebraria.
          upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null,
        },
      },
      hsts: isProduction && env.COOKIE_SECURE,
    }),
  );
  app.use(cookieParser());
  app.use(requireAjaxHeader);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos não declarados nos DTOs
      forbidNonWhitelisted: true, // e rejeita a requisição se vierem campos extras
      transform: true,
      stopAtFirstError: true,
    }),
  );

  if (!isProduction) app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();

  await app.listen(env.PORT, env.HOST);
  Logger.log(`API rodando em http://localhost:${env.PORT}/api`, 'Bootstrap');
}

void bootstrap();

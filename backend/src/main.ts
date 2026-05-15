import { NestFactory }        from '@nestjs/core';
import { ValidationPipe }     from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService }      from '@nestjs/config';
import * as helmet            from 'helmet';
import * as compression       from 'compression';
import * as morgan            from 'morgan';
import { AppModule }          from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<import('@nestjs/platform-express').NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const isProd = config.get('NODE_ENV') === 'production';

  // ── Security headers ────────────────────────────────────────────────────
  app.use((helmet as any).default({
    hsts: { maxAge: 31536000, includeSubDomains: true },
    contentSecurityPolicy: isProd,
  }));

  // ── Compression ─────────────────────────────────────────────────────────
  app.use((compression as any)());

  // ── Request logging ─────────────────────────────────────────────────────
  app.use((morgan as any)(isProd ? 'combined' : 'dev'));

  // ── CORS ────────────────────────────────────────────────────────────────
  const origins = config.get<string>('ALLOWED_ORIGINS', 'http://localhost:3000').split(',');
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Authorization','Content-Type'],
  });

  // ── Global prefix ───────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Global pipes (validation) ───────────────────────────────────────────
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,           // strip unknown fields
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // ── Global filters & interceptors ───────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // ── Swagger (dev only) ──────────────────────────────────────────────────
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('FaireFund API')
      .setDescription('MSME Investment Exchange — v2')
      .setVersion('2.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
    console.log('📚 Swagger: http://localhost:5000/api/docs');
  }

  const port = config.get<number>('PORT', 5000);
  await app.listen(port, '0.0.0.0');
  console.log(`\n🚀 FaireFund API running on port ${port}`);
  console.log(`🌍 Environment: ${config.get('NODE_ENV', 'development')}\n`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});

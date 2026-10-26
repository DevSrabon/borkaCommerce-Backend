import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import 'dotenv/config';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './logger/all-exceptions.filter';
import { LoggerService } from './logger/logger.service';

async function bootstrap() {
  // rawBody is required to verify Stripe Webhook signatures
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Trust reverse proxy headers (e.g. Cloudflare, Nginx) for accurate client IP detection and Rate Limiting
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', true);

  // Ensure uploads folder and sub-folders exist
  const uploadsPath = path.join(process.cwd(), 'uploads');
  const subFolders = [
    'media', 'product', 'customer', 'banner', 'category', 'chat', 'blog',
    'product_files', 'product_category', 'banner_files', 'blog_files', 'website_settings_files', 'ecommerce_files'
  ];
  for (const folder of [uploadsPath, ...subFolders.map((f) => path.join(uploadsPath, f))]) {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  }

  // Serve static uploaded files (covers all sub-folders automatically)
  app.use('/uploads', express.static(uploadsPath));
  app.use('/saba-media', express.static(uploadsPath));

  // Increase payload size limit to prevent "request entity too large" errors (50MB)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Enable global DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global uniform response interceptor: { success, message, data, meta }
  app.useGlobalInterceptors(new TransformInterceptor());

  // Register Global Exception Filter to capture error stack traces for Logger
  const loggerService = app.get(LoggerService);
  app.useGlobalFilters(new AllExceptionsFilter(loggerService));

  // Enable CORS for frontend integration
  app.enableCors({
    origin: true, // In production, replace with specific frontend URL
    credentials: true,
    exposedHeaders: ['x-total-count'],
  });

  const port = process.env.PORT ?? 8080;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();

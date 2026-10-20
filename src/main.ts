import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { LoggerService } from './logger/logger.service';
import { AllExceptionsFilter } from './logger/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';

async function bootstrap() {
  // rawBody is required to verify Stripe Webhook signatures
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Ensure uploads folder and sub-folders exist
  const uploadsPath = path.join(process.cwd(), 'uploads');
  const subFolders = ['media', 'product', 'customer', 'banner', 'category', 'chat', 'blog'];
  for (const folder of [uploadsPath, ...subFolders.map((f) => path.join(uploadsPath, f))]) {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  }

  // Serve static uploaded files (covers all sub-folders automatically)
  app.use('/uploads', express.static(uploadsPath));

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

  // Configure Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('BorkaCommerce API')
    .setDescription('The BorkaCommerce eCommerce single-vendor API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 8080;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';

async function bootstrap() {
  // rawBody is required to verify Stripe Webhook signatures
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Ensure uploads folder and sub-folders exist
  const uploadsPath = path.join(process.cwd(), 'uploads');
  const subFolders = ['product', 'customer', 'banner', 'category'];
  for (const folder of [uploadsPath, ...subFolders.map((f) => path.join(uploadsPath, f))]) {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  }

  // Serve static uploaded files (covers all sub-folders automatically)
  app.use('/uploads', express.static(uploadsPath));


  // Enable global DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Enable CORS for frontend integration
  app.enableCors({
    origin: true, // In production, replace with specific frontend URL
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();

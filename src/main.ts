import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaClient } from '@prisma/client';
import { ValidationPipe } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // Skip ngrok free-tier browser warning when possible (API/callback requests).
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('ngrok-skip-browser-warning', '1');
    next();
  });

  await app.listen(process.env.PORT ?? 3000);

  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI ?? '(not set)';
  console.log(`✅ Server listening on port ${process.env.PORT ?? 3000}`);
  console.log(`📸 Instagram OAuth redirect URI: ${redirectUri}`);
  console.log(`   Setup page: /auth/instagram/setup`);

  const prisma = new PrismaClient();

  async function main() {
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL via Prisma', process.env.PORT);
    await prisma.$disconnect();
  }

  main().catch((e) => {
    console.error('❌ Connection failed:', e);
  });
}

bootstrap();

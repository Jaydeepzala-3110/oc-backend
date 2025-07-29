import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaClient } from '@prisma/client';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);

  const prisma = new PrismaClient();

  async function main() {
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL via Prisma');
    await prisma.$disconnect();
  }

  main().catch((e) => {
    console.error('❌ Connection failed:', e);
  });
}

bootstrap();

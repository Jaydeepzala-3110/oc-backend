/**
 * Seed one ADMIN and one CLIPPER (creator) account for local testing.
 *
 * Usage: npm run seed:users
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

function loadEnv(): void {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const prisma = new PrismaClient();

const USERS = [
  {
    email: 'admin@onlycreators.dev',
    password: 'Admin@123',
    firstName: 'Admin',
    lastName: 'OnlyCreators',
    role: UserRole.ADMIN,
  },
  {
    email: 'creator@onlycreators.dev',
    password: 'Creator@123',
    firstName: 'Creator',
    lastName: 'Test',
    role: UserRole.CLIPPER,
  },
];

async function main() {
  for (const user of USERS) {
    const existing = await prisma.users.findUnique({
      where: { email: user.email },
    });
    if (existing) {
      console.log(`Exists: ${user.email} (#${existing.id}, ${existing.role})`);
      continue;
    }

    const created = await prisma.users.create({
      data: {
        email: user.email,
        password: await bcrypt.hash(user.password, 10),
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
    console.log(
      `Created: ${user.email} / ${user.password} (#${created.id}, ${created.role})`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

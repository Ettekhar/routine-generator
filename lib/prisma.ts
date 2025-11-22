// lib/prisma.ts
// import { PrismaClient } from "@prisma/client";

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

declare global {
  // allow global for hot reload in dev
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const client = global.prisma ?? prisma;

if (process.env.NODE_ENV !== "production") global.prisma = client;

export default client;

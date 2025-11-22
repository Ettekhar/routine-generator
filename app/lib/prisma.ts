// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

declare global {
  // allow global for hot reload in dev
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const client = global.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") global.prisma = client;

export default client;

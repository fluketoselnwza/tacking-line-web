import { config } from './config';
import { PrismaClient } from '@prisma/client';
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalDb.prisma ?? new PrismaClient({datasourceUrl: config.databaseUrl});
if (!config.isProduction) globalDb.prisma = db;

/**
 * Applies the checked-in Prisma migration that renames legacy Better Auth
 * camelCase columns. Run with: npx ts-node prisma/migrate-to-snake-case.ts
 *
 * The migration is idempotently tracked by Prisma's _prisma_migrations table;
 * use this command in deployment after backing up the database.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'migrate', 'deploy', '--schema', join(process.cwd(), 'prisma', 'schema.prisma')], {
  stdio: 'inherit',
});

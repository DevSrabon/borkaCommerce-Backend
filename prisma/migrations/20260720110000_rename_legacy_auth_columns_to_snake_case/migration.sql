-- The original Better Auth tables predate the snake_case naming convention.
-- PostgreSQL preserves data, indexes, and foreign-key relationships when a
-- column is renamed, so this migration is safe for populated databases.
ALTER TABLE "sessions" RENAME COLUMN "expiresAt" TO "expires_at";
ALTER TABLE "sessions" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "sessions" RENAME COLUMN "updatedAt" TO "updated_at";
ALTER TABLE "sessions" RENAME COLUMN "ipAddress" TO "ip_address";
ALTER TABLE "sessions" RENAME COLUMN "userAgent" TO "user_agent";
ALTER TABLE "sessions" RENAME COLUMN "customerId" TO "customer_id";

ALTER TABLE "accounts" RENAME COLUMN "accountId" TO "account_id";
ALTER TABLE "accounts" RENAME COLUMN "providerId" TO "provider_id";
ALTER TABLE "accounts" RENAME COLUMN "customerId" TO "customer_id";
ALTER TABLE "accounts" RENAME COLUMN "accessToken" TO "access_token";
ALTER TABLE "accounts" RENAME COLUMN "refreshToken" TO "refresh_token";
ALTER TABLE "accounts" RENAME COLUMN "idToken" TO "id_token";
ALTER TABLE "accounts" RENAME COLUMN "accessTokenExpiresAt" TO "access_token_expires_at";
ALTER TABLE "accounts" RENAME COLUMN "refreshTokenExpiresAt" TO "refresh_token_expires_at";
ALTER TABLE "accounts" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "accounts" RENAME COLUMN "updatedAt" TO "updated_at";

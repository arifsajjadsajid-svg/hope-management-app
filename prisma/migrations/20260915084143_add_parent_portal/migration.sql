-- CreateTable
CREATE TABLE "parent_accounts" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_sessions" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "persistent" BOOLEAN NOT NULL DEFAULT true,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "parent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parent_accounts_phone_key" ON "parent_accounts"("phone");

-- CreateIndex
CREATE INDEX "parent_accounts_status_idx" ON "parent_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "parent_sessions_tokenHash_key" ON "parent_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "parent_sessions_parentId_idx" ON "parent_sessions"("parentId");

-- CreateIndex
CREATE INDEX "parent_sessions_expiresAt_idx" ON "parent_sessions"("expiresAt");

-- AddForeignKey
ALTER TABLE "parent_sessions" ADD CONSTRAINT "parent_sessions_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

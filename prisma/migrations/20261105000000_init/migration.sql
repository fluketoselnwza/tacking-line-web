-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PREVIEW', 'IMPORTED', 'CANCELLED', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialUsage" (
    "id" TEXT NOT NULL,
    "dataset" TEXT NOT NULL DEFAULT 'BIN',
    "usageDate" DATE NOT NULL,
    "recordNo" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "recipeCode" TEXT NOT NULL,
    "lineCode" TEXT NOT NULL,
    "sumMassKg" DECIMAL(38,15),
    "eachKg" DECIMAL(38,15) NOT NULL,
    "eachTons" DECIMAL(38,18) NOT NULL,
    "sourceEachTons" DECIMAL(38,18),
    "remark" TEXT NOT NULL,
    "kibbleCode" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "sourceSheet" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "dataset" TEXT NOT NULL DEFAULT 'BIN',
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PREVIEW',
    "dateFrom" DATE,
    "dateTo" DATE,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "previewData" JSONB NOT NULL,
    "replacedData" JSONB,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportError" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "fieldName" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,

    CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "MaterialUsage_usageDate_idx" ON "MaterialUsage"("usageDate");

-- CreateIndex
CREATE INDEX "MaterialUsage_lineCode_idx" ON "MaterialUsage"("lineCode");

-- CreateIndex
CREATE INDEX "MaterialUsage_recipeCode_idx" ON "MaterialUsage"("recipeCode");

-- CreateIndex
CREATE INDEX "MaterialUsage_productCode_idx" ON "MaterialUsage"("productCode");

-- CreateIndex
CREATE INDEX "MaterialUsage_importBatchId_idx" ON "MaterialUsage"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialUsage_dataset_usageDate_recordNo_key" ON "MaterialUsage"("dataset", "usageDate", "recordNo");

-- CreateIndex
CREATE INDEX "ImportBatch_fileHash_idx" ON "ImportBatch"("fileHash");

-- CreateIndex
CREATE INDEX "ImportBatch_uploadedAt_idx" ON "ImportBatch"("uploadedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "MaterialUsage" ADD CONSTRAINT "MaterialUsage_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


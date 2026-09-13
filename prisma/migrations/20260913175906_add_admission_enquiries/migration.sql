-- CreateTable
CREATE TABLE "admission_enquiries" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "fatherName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT NOT NULL DEFAULT 'MALE',
    "classApplyingFor" TEXT NOT NULL,
    "previousSchool" TEXT,
    "contactPhone" TEXT NOT NULL,
    "whatsappNumber" TEXT,
    "email" TEXT,
    "address" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "officeNotes" TEXT,
    "studentId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admission_enquiries_reference_key" ON "admission_enquiries"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "admission_enquiries_studentId_key" ON "admission_enquiries"("studentId");

-- CreateIndex
CREATE INDEX "admission_enquiries_status_createdAt_idx" ON "admission_enquiries"("status", "createdAt");

-- CreateIndex
CREATE INDEX "admission_enquiries_createdAt_idx" ON "admission_enquiries"("createdAt");

-- AddForeignKey
ALTER TABLE "admission_enquiries" ADD CONSTRAINT "admission_enquiries_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_enquiries" ADD CONSTRAINT "admission_enquiries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

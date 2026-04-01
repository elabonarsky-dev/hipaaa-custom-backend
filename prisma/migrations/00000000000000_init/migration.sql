-- CreateEnum
CREATE TYPE "FormType" AS ENUM ('REFERRAL', 'INTAKE', 'ENROLLMENT');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'FORWARDED', 'FAILED', 'REVIEW', 'REPLAYED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REPLAYED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'UPLOADING', 'UPLOADED', 'FAILED');

-- CreateEnum
CREATE TYPE "MemberStage" AS ENUM ('REFERRAL', 'INTAKE', 'ENROLLMENT');

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "cin_normalized" TEXT NOT NULL,
    "cin_raw" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "dob" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "current_stage" "MemberStage" NOT NULL DEFAULT 'REFERRAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_events" (
    "id" TEXT NOT NULL,
    "form_type" "FormType" NOT NULL,
    "jotform_submission_id" TEXT,
    "payload_hash" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "cin_normalized" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'RECEIVED',
    "vs_response_code" INTEGER,
    "vs_response_body" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submission_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_queue_items" (
    "id" TEXT NOT NULL,
    "submission_event_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sharepoint_documents" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "jotform_file_url" TEXT NOT NULL,
    "sharepoint_url" TEXT,
    "sharepoint_path" TEXT,
    "file_name" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sharepoint_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_cin_normalized_key" ON "members"("cin_normalized");

-- CreateIndex
CREATE INDEX "submission_events_cin_normalized_idx" ON "submission_events"("cin_normalized");

-- CreateIndex
CREATE INDEX "submission_events_jotform_submission_id_idx" ON "submission_events"("jotform_submission_id");

-- CreateIndex
CREATE INDEX "submission_events_payload_hash_idx" ON "submission_events"("payload_hash");

-- CreateIndex
CREATE INDEX "audit_logs_event_type_idx" ON "audit_logs"("event_type");

-- CreateIndex
CREATE INDEX "review_queue_items_status_idx" ON "review_queue_items"("status");

-- CreateIndex
CREATE INDEX "sharepoint_documents_member_id_idx" ON "sharepoint_documents"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_key_key" ON "idempotency_keys"("key");

-- AddForeignKey
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_submission_event_id_fkey" FOREIGN KEY ("submission_event_id") REFERENCES "submission_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sharepoint_documents" ADD CONSTRAINT "sharepoint_documents_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

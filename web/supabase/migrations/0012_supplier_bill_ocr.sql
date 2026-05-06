-- =========================================================================
-- Supplier Bill AI/OCR extraction
-- Adds columns to persist raw OCR text, model confidence, and extracted line
-- items so admins can audit AI extractions before approving them into the
-- GST purchase report.
-- Safe to run multiple times.
-- =========================================================================

alter table public.supplier_bill_uploads
  add column if not exists raw_text          text,
  add column if not exists ocr_confidence    numeric(5,4),
  add column if not exists ocr_model         text,
  add column if not exists ocr_extracted_at  timestamptz,
  add column if not exists ocr_notes         text;

-- supplier_bill_items already exists from 0010 — make sure it has all the
-- columns the OCR extractor wants to write.
alter table public.supplier_bill_items
  add column if not exists source            text not null default 'manual'
    check (source in ('manual','ocr')),
  add column if not exists ocr_confidence    numeric(5,4);

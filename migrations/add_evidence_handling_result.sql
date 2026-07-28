ALTER TABLE IF EXISTS settlement_evidence_records
  ADD COLUMN IF NOT EXISTS handling_result VARCHAR(50) DEFAULT '待判断',
  ADD COLUMN IF NOT EXISTS linked_visa_id INTEGER REFERENCES visas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_visa_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS handling_note TEXT;

UPDATE settlement_evidence_records
SET handling_result = COALESCE(NULLIF(handling_result, ''), '待判断')
WHERE handling_result IS NULL OR handling_result = '';

CREATE INDEX IF NOT EXISTS settlement_evidence_handling_result_idx
  ON settlement_evidence_records(handling_result);

CREATE INDEX IF NOT EXISTS settlement_evidence_linked_visa_id_idx
  ON settlement_evidence_records(linked_visa_id);

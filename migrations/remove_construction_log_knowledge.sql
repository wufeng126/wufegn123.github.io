-- Remove legacy knowledge documents generated from construction logs.
-- Manual knowledge is kept, even when its text mentions construction logs.
DELETE FROM ai_knowledge_docs
WHERE source_type = 'construction_log'
   OR (COALESCE(source_type, '') <> 'manual' AND source_ref LIKE 'cl:%');

-- Add search vector column
ALTER TABLE "notes" ADD COLUMN "search_vector" tsvector;

-- GIN index for full text search
CREATE INDEX "notes_search_idx" ON "notes" USING GIN ("search_vector");

-- Trigger function to keep search vector updated
CREATE OR REPLACE FUNCTION update_notes_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.content::text, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on insert/update
CREATE TRIGGER notes_search_vector_update
BEFORE INSERT OR UPDATE ON "notes"
FOR EACH ROW
EXECUTE FUNCTION update_notes_search_vector();

-- Backfill existing rows
UPDATE "notes"
SET "search_vector" =
  setweight(to_tsvector('english', COALESCE("title", '')), 'A') ||
  setweight(to_tsvector('english', COALESCE("content"::text, '')), 'B');

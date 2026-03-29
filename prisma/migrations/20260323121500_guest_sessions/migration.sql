-- Track temporary guest sessions and inactivity expiration.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "isGuest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "guestLastActiveAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "users_isGuest_guestLastActiveAt_idx"
  ON "users"("isGuest", "guestLastActiveAt");

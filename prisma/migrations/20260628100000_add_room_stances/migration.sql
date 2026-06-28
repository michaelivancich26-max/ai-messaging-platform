ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "stances" TEXT;
ALTER TABLE "UserPosition" ALTER COLUMN "position" TYPE TEXT USING "position"::text;

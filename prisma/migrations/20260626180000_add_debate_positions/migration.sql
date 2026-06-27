-- Add proposition field to Room
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "proposition" TEXT;

-- Create DebatePosition enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DebatePosition') THEN
    CREATE TYPE "DebatePosition" AS ENUM ('FOR', 'AGAINST', 'NEUTRAL');
  END IF;
END $$;

-- Create UserPosition table
CREATE TABLE IF NOT EXISTS "UserPosition" (
  "id"        TEXT          NOT NULL,
  "userId"    TEXT          NOT NULL,
  "roomId"    TEXT          NOT NULL,
  "position"  "DebatePosition" NOT NULL,
  "updatedAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserPosition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserPosition_userId_roomId_key"
  ON "UserPosition"("userId", "roomId");

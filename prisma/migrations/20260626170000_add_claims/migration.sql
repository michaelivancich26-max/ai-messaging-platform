DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClaimStatus') THEN
    CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'SUPPORTED', 'REFUTED', 'CONTESTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Claim" (
  "id"         TEXT NOT NULL,
  "messageId"  TEXT NOT NULL,
  "roomId"     TEXT NOT NULL,
  "channelId"  TEXT,
  "claimantId" TEXT NOT NULL,
  "text"       TEXT NOT NULL,
  "status"     "ClaimStatus" NOT NULL DEFAULT 'PENDING',
  "verdict"    TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ClaimChallenge" (
  "id"           TEXT NOT NULL,
  "claimId"      TEXT NOT NULL,
  "challengerId" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClaimChallenge_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Claim_messageId_fkey') THEN
    ALTER TABLE "Claim" ADD CONSTRAINT "Claim_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Claim_roomId_fkey') THEN
    ALTER TABLE "Claim" ADD CONSTRAINT "Claim_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClaimChallenge_claimId_fkey') THEN
    ALTER TABLE "ClaimChallenge" ADD CONSTRAINT "ClaimChallenge_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Poll" (
  "id"        TEXT NOT NULL,
  "roomId"    TEXT NOT NULL,
  "channelId" TEXT,
  "question"  TEXT NOT NULL,
  "options"   TEXT[] NOT NULL,
  "createdBy" TEXT NOT NULL,
  "closedAt"  TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PollVote" (
  "id"      TEXT NOT NULL,
  "pollId"  TEXT NOT NULL,
  "userId"  TEXT NOT NULL,
  "option"  TEXT NOT NULL,
  CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PollVote_pollId_userId_key" ON "PollVote"("pollId", "userId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Poll_roomId_fkey') THEN
    ALTER TABLE "Poll" ADD CONSTRAINT "Poll_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollVote_pollId_fkey') THEN
    ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey"
      FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- DM read state: when each participant last read the conversation.
-- Unread = messages from the other participant newer than this timestamp.
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "participant1ReadAt" TIMESTAMP(3);
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "participant2ReadAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "isDM" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "participant1Id" TEXT,
ADD COLUMN     "participant2Id" TEXT;

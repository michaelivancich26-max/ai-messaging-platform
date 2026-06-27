CREATE TABLE "GraphNodeMessage" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GraphNodeMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GraphNodeMessage_nodeId_messageId_key" ON "GraphNodeMessage"("nodeId", "messageId");

ALTER TABLE "GraphNodeMessage" ADD CONSTRAINT "GraphNodeMessage_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GraphNodeMessage" ADD CONSTRAINT "GraphNodeMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

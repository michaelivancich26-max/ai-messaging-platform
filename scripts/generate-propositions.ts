// Fill the deck. Seeds the existing catalog as live, then generates fresh
// candidates per category as drafts for review.
//
//   npm run props:generate                    -- 15 per category, every category
//   npm run props:generate -- --count=30
//   npm run props:generate -- --category=politics --count=40
//
// Nothing here reaches the deck on its own: generated rows land as 'draft' and
// need promoting to 'live'. Run the server once first so the tables exist.

import { PrismaClient } from "@prisma/client";
import { CATEGORY_IDS, isCategoryId, categoryLabel } from "../services/topics";
import { generatePropositions, insertDrafts, seedFromCatalog } from "../services/propositions";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — put it in .env and retry.");
    process.exit(1);
  }

  const count = Number(arg("count") ?? 15);
  const only = arg("category");
  if (only && !isCategoryId(only)) {
    console.error(`Unknown category "${only}". Known: ${CATEGORY_IDS.join(", ")}`);
    process.exit(1);
  }
  const categories = only ? [only] : CATEGORY_IDS;

  const seeded = await seedFromCatalog(prisma);
  console.log(seeded ? `Seeded ${seeded} catalog propositions as live.` : "Catalog already seeded.");

  let drafted = 0;
  for (const categoryId of categories) {
    // Feed it everything already on file for this category, live or draft, so
    // repeat runs accumulate instead of regenerating the same claims.
    const existing = await prisma.$queryRawUnsafe<{ text: string }[]>(
      `SELECT "text" FROM "Proposition" WHERE "categoryId" = $1 AND "status" <> 'retired'`,
      categoryId,
    );

    try {
      const texts = await generatePropositions(categoryId, count, existing.map((e) => e.text));
      const n = await insertDrafts(prisma, categoryId, texts);
      drafted += n;
      console.log(`${categoryLabel(categoryId).padEnd(12)} ${n} new drafts (${texts.length - n} were duplicates)`);
    } catch (e) {
      console.error(`${categoryLabel(categoryId).padEnd(12)} FAILED:`, e instanceof Error ? e.message : e);
    }
  }

  const [{ n: pending }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*) AS n FROM "Proposition" WHERE "status" = 'draft'`,
  );
  console.log(`\n${drafted} drafted this run. ${pending} awaiting review at /admin/propositions.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

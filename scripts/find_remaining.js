require("dotenv").config();

const SUPABASE_HEADERS = {
  authorization: `Bearer ${process.env.SUPABASE_TOKEN || "YOUR_SUPABASE_TOKEN_HERE"}`,
  apikey: process.env.SUPABASE_API_KEY,
  "content-type": "application/json",
};
const BASE_URL = "https://cyrxjeppjqsxxjayfrur.supabase.co/rest/v1";

async function main() {
  const resTags = await fetch(`${BASE_URL}/tags?select=*`, {
    headers: SUPABASE_HEADERS,
  });
  const tags = await resTags.json();
  const autreTag = tags.find((t) => t.name === "Autre");

  const resCards = await fetch(
    `${BASE_URL}/user_cards?select=*,cards(*)&limit=1000`,
    {headers: SUPABASE_HEADERS},
  );
  const allCards = await resCards.json();

  const resAssignments = await fetch(
    `${BASE_URL}/user_card_tags?select=*&limit=2000`,
    {headers: SUPABASE_HEADERS},
  );
  const assignments = await resAssignments.json();

  const assignedMap = {};
  for (const a of assignments) {
    if (!assignedMap[a.user_card_id]) assignedMap[a.user_card_id] = [];
    assignedMap[a.user_card_id].push(a.tag_id);
  }

  const remaining = [];
  for (const uc of allCards) {
    if (!uc.cards) continue;
    const cardTags = assignedMap[uc.id] || [];
    if (cardTags.length === 0 || cardTags.includes(autreTag?.id)) {
      remaining.push({
        id: uc.id,
        title: uc.cards.wikipedia_title,
        category: uc.cards.category,
        summary: uc.cards.summary?.substring(0, 100) || "",
      });
    }
  }

  console.log(`Found ${remaining.length} remaining cards`);
  for (const r of remaining) {
    console.log(
      `${r.id} | ${r.title} | ${r.category} | ${r.summary.replace(/\n/g, " ")}`,
    );
  }
}

main().catch(console.error);

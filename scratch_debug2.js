const {categorize} = require("./scripts/categorize_cards.js");

const headers = {
  authorization: `Bearer ${process.env.SUPABASE_TOKEN}`,
  apikey: "TOKEN",
  "content-type": "application/json",
};
const BASE_URL = "https://cyrxjeppjqsxxjayfrur.supabase.co/rest/v1";

async function test() {
  const resTags = await fetch(`${BASE_URL}/tags?select=*`, {headers});
  const existingTags = await resTags.json();
  const tagMap = {};
  for (const tag of existingTags) tagMap[tag.name] = tag.id;

  let userCards = [];
  let page = 0;
  let hasMore = true;
  while (hasMore) {
    const res = await fetch(
      `${BASE_URL}/user_cards?select=*,cards(*)&limit=1000&offset=${page * 1000}`,
      {headers},
    );
    const batch = await res.json();
    if (batch.length > 0) {
      userCards = userCards.concat(batch);
      page++;
    }
    if (batch.length < 1000) hasMore = false;
  }

  const batchPayload = [];
  for (const uc of userCards) {
    if (!uc.cards) continue;
    const categories = categorize(uc.cards);
    const uniqueCats = [...new Set(categories)];
    for (const cat of uniqueCats) {
      if (tagMap[cat])
        batchPayload.push({user_card_id: uc.id, tag_id: tagMap[cat]});
    }
  }

  // We know first 2000 worked, so let's check one from index 2000+
  console.log("Total payload size:", batchPayload.length);
  for (let i = 2000; i < 2010; i++) {
    const item = batchPayload[i];
    const addRes = await fetch(`${BASE_URL}/user_card_tags`, {
      method: "POST",
      headers: {...headers, Prefer: "resolution=ignore-duplicates"},
      body: JSON.stringify([item]),
    });
    if (!addRes.ok) {
      console.log(`Failed at index ${i}:`, item, await addRes.text());
    } else {
      console.log(`Success at index ${i}`);
    }
  }
}
test();

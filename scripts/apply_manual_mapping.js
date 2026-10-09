require("dotenv").config();
const fs = require("fs");

const SUPABASE_HEADERS = {
  authorization: `Bearer ${process.env.SUPABASE_TOKEN || "YOUR_SUPABASE_TOKEN_HERE"}`,
  apikey: process.env.SUPABASE_API_KEY,
  "content-type": "application/json",
};
const BASE_URL = "https://cyrxjeppjqsxxjayfrur.supabase.co/rest/v1";

async function main() {
  console.log("Lecture du mapping manuel de l'IA...");
  const manualDB = JSON.parse(
    fs.readFileSync(__dirname + "/manual_mapping_db.json", "utf8"),
  );

  // Inverser la map pour avoir id => categorie
  const idToCategory = {};
  for (const [category, ids] of Object.entries(manualDB)) {
    for (const id of ids) {
      idToCategory[id] = category;
    }
  }
  const mappedCount = Object.keys(idToCategory).length;
  console.log(
    `L'IA a catégorisé manuellement ${mappedCount} cartes difficiles.`,
  );

  console.log("Fetching tags from Supabase...");
  const resTags = await fetch(`${BASE_URL}/tags?select=*`, {
    headers: SUPABASE_HEADERS,
  });
  const tags = await resTags.json();
  const tagMap = {};
  tags.forEach((t) => (tagMap[t.name] = t.id));

  console.log("Fetching user cards from Supabase...");
  const resCards = await fetch(
    `${BASE_URL}/user_cards?select=*,cards(*)&limit=1000`,
    {headers: SUPABASE_HEADERS},
  );
  const allCards = await resCards.json();

  const assignments = [];
  let appliedCount = 0;

  for (const uc of allCards) {
    if (!uc.cards) continue;

    // Si l'IA l'a catégorisée manuellement, on applique cette catégorie prioritairement
    if (idToCategory[uc.id]) {
      const theme = idToCategory[uc.id];
      if (tagMap[theme]) {
        assignments.push({
          user_card_id: uc.id,
          tag_id: tagMap[theme],
        });
        appliedCount++;
      }
    }
  }

  console.log(
    `Mise à jour de ${appliedCount} cartes avec la classification sur-mesure de l'IA...`,
  );

  const chunkSize = 200;
  for (let i = 0; i < assignments.length; i += chunkSize) {
    const chunk = assignments.slice(i, i + chunkSize);
    const res = await fetch(`${BASE_URL}/user_card_tags`, {
      method: "POST",
      headers: {
        ...SUPABASE_HEADERS,
        Prefer: "resolution=ignore-duplicates", // On ignore les doublons si elles étaient déjà bien classées
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.error("Error inserting chunk:", await res.text());
    }
  }

  console.log(
    "✅ Les classifications manuelles de l'IA ont été injectées avec succès dans la base !",
  );
}

main().catch(console.error);

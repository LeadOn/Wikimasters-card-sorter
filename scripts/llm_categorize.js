require("dotenv").config();
const {GoogleGenAI} = require("@google/genai");

// Initialiser le client Gemini
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

const SUPABASE_HEADERS = {
  authorization: `Bearer ${process.env.SUPABASE_TOKEN || "YOUR_SUPABASE_TOKEN_HERE"}`,
  apikey: process.env.SUPABASE_API_KEY,
  "content-type": "application/json",
};
const BASE_URL = "https://cyrxjeppjqsxxjayfrur.supabase.co/rest/v1";

const THEMES = [
  "Politique Française",
  "Politique Internationale",
  "Automobile & Transports",
  "Pop-Culture & Divertissement",
  "Technologie & Informatique",
  "Sciences",
  "Atome & Chimie",
  "Sports",
  "Monuments & Lieux historiques",
  "Affaires Criminelles",
  "Religion & Mythes",
  "Histoire",
  "Géographie & Territoires",
  "Arts & Littérature",
  "Personnalités",
  "Faune & Flore",
  "Astronomie & Espace",
  "Militaire & Armement",
  "Divers & Homonymies",
  "Autre",
];

async function categorizeBatchWithLLM(cards) {
  const prompt = `
Tu es un classificateur de cartes Wikipédia.
Je vais te donner une liste de cartes sous format JSON. Chaque carte a un 'id', un 'title', un 'category' et un 'summary'.
Ta mission est d'assigner à chaque carte EXACTEMENT l'un des thèmes suivants, en trouvant la meilleure correspondance sémantique possible. Ne renvoie AUCUN autre thème que ceux de cette liste.

Thèmes autorisés :
${THEMES.map((t) => `- ${t}`).join("\n")}

Cartes à classifier :
${JSON.stringify(cards, null, 2)}

Tu dois répondre UNIQUEMENT avec un objet JSON valide, où chaque clé est l'ID de la carte, et la valeur est le thème choisi.
Exemple de réponse attendue :
{
  "0f9fdb9a-2ae0-4d9f-84be-5bbb2d5e21e4": "Personnalités",
  "bac37464-a5f0-42c9-8d47-44f0893cebdb": "Géographie & Territoires"
}
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });
    return JSON.parse(response.text);
  } catch (err) {
    console.error("Erreur avec l'API Gemini:", err);
    return null;
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error(
      "Veuillez définir la variable GEMINI_API_KEY dans votre fichier .env",
    );
    process.exit(1);
  }

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

  console.log(`Found ${allCards.length} cards to categorize via LLM.`);

  // Prepare simple payload for the LLM
  const cardsToProcess = allCards
    .filter((uc) => uc.cards)
    .map((uc) => ({
      id: uc.id,
      title: uc.cards.wikipedia_title,
      category: uc.cards.category,
      summary: (uc.cards.summary || "").substring(0, 150),
    }));

  const assignments = [];
  const BATCH_SIZE = 50;

  for (let i = 0; i < cardsToProcess.length; i += BATCH_SIZE) {
    const batch = cardsToProcess.slice(i, i + BATCH_SIZE);
    console.log(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(cardsToProcess.length / BATCH_SIZE)}...`,
    );

    const mapping = await categorizeBatchWithLLM(batch);
    if (mapping) {
      for (const card of batch) {
        let theme = mapping[card.id] || "Autre";
        if (!tagMap[theme]) theme = "Autre"; // Fallback si hallucination

        assignments.push({
          user_card_id: card.id,
          tag_id: tagMap[theme],
          user_id: allCards[0].user_id,
        });
      }
    } else {
      console.error("Failed to process this batch. Skipping.");
    }
  }

  console.log(`Clearing old tags...`);
  await fetch(`${BASE_URL}/user_card_tags?user_id=eq.${allCards[0].user_id}`, {
    method: "DELETE",
    headers: SUPABASE_HEADERS,
  });

  console.log(
    `Inserting ${assignments.length} new LLM-classified tag assignments...`,
  );
  const chunkSize = 200;
  for (let i = 0; i < assignments.length; i += chunkSize) {
    const chunk = assignments.slice(i, i + chunkSize);
    const res = await fetch(`${BASE_URL}/user_card_tags`, {
      method: "POST",
      headers: {
        ...SUPABASE_HEADERS,
        Prefer: "resolution=ignore-duplicates",
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.error("Error inserting chunk:", await res.text());
    }
  }

  console.log("Bulk insert of LLM mapping successful!");
}

main().catch(console.error);

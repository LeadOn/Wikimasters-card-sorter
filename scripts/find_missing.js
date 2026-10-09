const fs = require('fs');

const { categorize } = require('./categorize_cards');
const manualDB = JSON.parse(fs.readFileSync(__dirname + '/manual_mapping_db.json', 'utf8'));

const idToCategory = {};
for (const [category, ids] of Object.entries(manualDB)) {
  for (const id of ids) {
    idToCategory[id] = category;
  }
}

const allCards = JSON.parse(fs.readFileSync('/Users/leadon/.gemini/antigravity-ide/brain/21266172-30c6-4f8b-a16e-f735455d9498/scratch/cards_dump.json', 'utf8'));

const missing = [];
for (const uc of allCards) {
  if (!uc.cards) continue;
  
  if (idToCategory[uc.id]) continue; // Déjà fait manuellement

  const regexTheme = categorize(uc.cards);
  if (regexTheme === "Autre") {
    missing.push(uc);
  }
}

console.log(`Found ${missing.length} cards that are still 'Autre'`);
for (const uc of missing) {
  console.log(`- ${uc.id} | ${uc.cards.wikipedia_title} | ${uc.cards.category} | ${(uc.cards.summary || "").substring(0, 50).replace(/\n/g, ' ')}`);
}

const fs = require("fs");

// Fonction pour vérifier la présence de mots-clés exacts (évite les faux positifs type "transport" pour "sport")
function hasKeyword(text, keywords) {
  const regex = new RegExp(
    `(?:^|[^a-zà-ÿ])(?:${keywords})(?:[^a-zà-ÿ]|$)`,
    "i",
  );
  return regex.test(text);
}

function categorize(card) {
  const path = require("path");
  let manualCat = null;
  try {
    const manualDbPath = path.join(__dirname, "manual_mapping_db.json");
    if (fs.existsSync(manualDbPath)) {
      const manualDB = JSON.parse(fs.readFileSync(manualDbPath, "utf8"));
      for (const [cat, ids] of Object.entries(manualDB)) {
        if (ids.includes(card.id)) {
          manualCat = cat;
          break;
        }
      }
    }
  } catch (e) {}

  // On sépare les sources pour plus de précision si on veut faire des poids différents plus tard
  const title = (card.wikipedia_title || "").toLowerCase();
  const category = (card.category || "").toLowerCase();
  const summary = (card.summary || "").toLowerCase();

  // On regroupe tout le texte pour la recherche de mots-clés globale
  const text = `${title} ${category} ${summary}`;

  let genericCat = "Autre";

  if (manualCat) {
    genericCat = manualCat;
  } else {
    if (
      hasKeyword(
        text,
        "espèce|plante|animal|insecte|araignée|diptère|oiseau|poisson|mammifère|fleur|arbre|botanique|zoologie|tardigrade|arachnide|reptile|amphibien|végétal|algue|champignon|fongique|mycologie|fauve|marsupial|primate|crustacé|mollusque|bactérie|micro-organisme|flore|faune|félin|canidé",
      )
    )
      genericCat = "Faune & Flore";
    else if (
      hasKeyword(
        text,
        "théâtre|monument|château|musée|cathédrale|église|pont|bâtiment|tour|abbaye|palais|architecture|viaduc|écluse|gare|aéroport|station de métro|édifice|temple|mosquée|synagogue|basilique|chapelle|forteresse|citadelle|gratte-ciel|stade|cimetière|phare|barrage|ruine|monastère",
      )
    )
      genericCat = "Monuments & Lieux historiques";
    else if (
      hasKeyword(
        text,
        "politique|élection|parti politique|député|sénateur|ministre|gouvernement|parlement|référendum|diplomate|ambassadeur|président|premier ministre|législatif|maire|assemblée nationale|sénat|ministère|traité international|onu|diplomatie",
      )
    ) {
      if (hasKeyword(text, "france|français|française|paris"))
        genericCat = "Politique Française";
      else genericCat = "Politique Internationale";
    } else if (
      hasKeyword(
        text,
        "littérature|roman|écrivain|auteur|poète|peinture|tableau|sculpture|sculpteur|peintre|art|artiste|illustrateur|poésie|dessinateur|bande dessinée|photographe|photographie|gravure|graveur|exposition|chef-d'œuvre|dramaturge|comédie|tragédie|éditeur|nouvelle|essai|conte|fable|prix littéraire|mouvement artistique",
      )
    )
      genericCat = "Arts & Littérature";
    else if (
      hasKeyword(
        text,
        "film|série|télévisée|télévision|acteur|actrice|chanteur|chanteuse|musique|album|jeu vidéo|cinéma|réalisateur|groupe de|youtubeur|émission|manga|anime|super-héros|marvel|star wars|catch|wwe|court-métrage|téléréalité|streamer|twitch|podcast|humoriste|comedien|comédienne|scénariste|animation|disney|pixar|dc comics|rock|pop|rap|hip-hop|jazz|metal|concert|festival|sitcom",
      )
    )
      genericCat = "Pop-Culture & Divertissement";
    else if (
      hasKeyword(
        text,
        "sport|football|cycliste|cyclisme|olympique|tennis|basketball|basket-ball|championnat|tournoi|athlète|coureur|rallye|rugby|natation|gymnastique|baseball|haltérophil|rameur|archère|hockeyeur|boxe|boxeur|judo|judoka|karaté|lutte|escrime|escrimeur|ski|skieur|formule 1|coupe du monde|arts martiaux",
      )
    )
      genericCat = "Sports";
    else if (
      hasKeyword(
        text,
        "astronomie|astéroïde|planète|étoile|galaxie|transneptunien|corona|espace|spatial|orbite|nasa|cosmologie|astrophysique|comète|météorite|système solaire|constellation|télescope|observatoire|exoplanète|trou noir|nébuleuse|voie lactée|spationaute|astronaute|cosmonaute|apollo|satellite",
      )
    )
      genericCat = "Astronomie & Espace";
    else if (
      hasKeyword(
        text,
        "atome|nucléaire|particule|chimique|chimie|isotope|molécule|électron|proton|neutron|radioactivité|radioactif|composé|minéral|alliage|cristallin|matière|polymère|métal|ion|gaz|liquide|solide|réaction|élément chimique|tableau périodique|cristallographie",
      )
    )
      genericCat = "Atome & Chimie";
    else if (
      hasKeyword(
        text,
        "logiciel|ordinateur|informatique|technologie|console|smartphone|application|internet|réseau|programme|algorithme|apple|microsoft|google|web|serveur|système d'exploitation|langage de programmation|hacker|cybersécurité|intelligence artificielle|ia|robotique|électronique|processeur|carte mère|mémoire|base de données",
      )
    )
      genericCat = "Technologie & Informatique";
    else if (
      hasKeyword(
        text,
        "automobile|voiture|moteur|constructeur|bmw|citroën|renault|peugeot|véhicule|suv|cyclomoteur|locomotive|chemin de fer|autoroute|navire|sous-marin|avion|aviation|compagnie aérienne|train|tgv|tramway|bus|transport|bateau|paquebot|voilier|camion|motocyclette|moto|vélo|bicyclette|hélicoptère",
      )
    )
      genericCat = "Automobile & Transports";
    else if (
      hasKeyword(
        text,
        "religion|dieu|saint|pape|islam|christianisme|judaïsme|bouddhisme|monachisme|catholique|prélat|évêque|mythe|mythologie|hindouisme|protestantisme|orthodoxe|théologie|croyance|secte|temple|mosquée|église|synagogue|prêtre|pasteur|rabbin|imam|divinité|esprit|diocèse|archidiocèse",
      )
    )
      genericCat = "Religion & Mythes";
    else if (
      hasKeyword(
        text,
        "affaire criminelle|meurtre|criminel|tueur|assassin|prison|délit|pédicide|terroriste|attentat|crime|viol|vol|braquage|mafia|gang|cartel|police|enquête|juge|tribunal|condamnation|peine de mort|victime|homicide|kidnapping|enlèvement|tueur en série",
      )
    )
      genericCat = "Affaires Criminelles";
    else if (
      hasKeyword(
        text,
        "militaire|armée|armement|fusil|canon|torpilleur|cavalerie|soldat|officier|général|aviation militaire|marine|char d'assaut|blindé|missile|bombe|arme|infanterie|artillerie|stratégie|commandant|amiral|maréchal|troupe|régiment|bataillon|croiseur|sous-marinier",
      )
    )
      genericCat = "Militaire & Armement";
    else if (
      hasKeyword(
        text,
        "bataille|guerre|empire|révolution|siècle|dynastie|historique|antiquité|moyen âge|roi|reine|empereur|traité|seconde guerre|première guerre|légende|préhistoire|renaissance|époque moderne|époque contemporaine|pharaon|souverain|monarchie|république|empire romain|chronologie|archéologie|conflit armé",
      )
    )
      genericCat = "Histoire";
    else if (
      hasKeyword(
        text,
        "science|biologie|mathématiques|physique|médecine|théorème|laboratoire|chercheur|santé|maladie|virus|agronome|archéologue|scientifique|anatomie|génétique|géologie|neurologie|psychologie|sociologie|économie|philosophie|linguistique|géométrie|algèbre|syndrome|pathologie|vaccin",
      )
    )
      genericCat = "Sciences";
    else if (
      hasKeyword(
        text,
        "commune|ville|village|municipalité|localité|fleuve|rivière|montagne|pays|région|île|province|géographie|canton|arrondissement|département|lac|mer|océan|continent|archipel|golfe|baie|détroit|cap|péninsule|désert|forêt|vallée|massif|sommet|volcan|territoire|cratère",
      )
    )
      genericCat = "Géographie & Territoires";
    else if (
      hasKeyword(
        text,
        "personnalité|journaliste|avocat|chef cuisinier|entrepreneur|diplomate|ingénieur|animateur|homme d'affaires|femme d'affaires|milliardaire|philanthrope|mannequin|designer|architecte|médecin|avocate|explorateur|navigateur|inventeur",
      )
    )
      genericCat = "Personnalités";
    else if (
      hasKeyword(
        text,
        "homonymie|liste|page d'homonymie|liste de|chronologie de|glossaire|index",
      )
    )
      genericCat = "Divers & Homonymies";
  }

  const tags = [genericCat];

  // Custom tags for friends - on centralise le tout dans un seul tag par ami !

  // Note : hasKeyword impose une frontière de mot en fin de motif, donc les préfixes
  // doivent porter un suffixe explicite (ex: 'haltérophil[a-zà-ÿ]*').

  // JulienPct (Bourse & Crypto / Monde sous-marin & poissons / Circuits & F1 / Casino / Musculation / Tous les "Julien")
  if (
    hasKeyword(
      text,
      "bourse de (?:paris|new york|londres|tokyo|francfort|bruxelles|commerce)|bourse des valeurs|boursi(?:er|ère|ers|ères)|cotée? en bourse|introduction en bourse|marchés? financiers?|cac 40|nasdaq|dow jones|wall street|nyse|euronext|trading|trader|krach|crypto|cryptomonnaies?|crypto-monnaies?|cryptoactifs?|bitcoin|ethereum|dogecoin|blockchain|chaîne de blocs|binance|satoshi nakamoto" +
        "|monde sous-marin|sous-marin[a-zà-ÿ]*|fonds marins|plongée|plongeur|plongeuse|apnée|requins?|poissons?|ichtyologie|actinoptérygiens?|téléostéens?|chondrichtyens?|cétacés?|baleines?|dauphins?|orques?|pieuvres?|poulpes?|calmars?|méduses?|coraux|corail|récifs?|abysses|abyssale?s?|hippocampes?|murènes?|raies? manta|jacques-yves cousteau|commandant cousteau" +
        "|circuits? automobiles?|circuit de course|autodrome|formule 1|formula one|f1|grand prix automobile|grand prix de formule 1|course automobile|sport automobile|pilote automobile|écurie de formule 1|24 heures du mans|karting|nascar|indycar|rallye|scuderia ferrari|ferrari|mclaren|red bull racing|michael schumacher|ayrton senna|alain prost|lewis hamilton|max verstappen|juan manuel fangio|monza|silverstone|spa-francorchamps|nürburgring|magny-cours|circuit paul-ricard" +
        "|casinos?|jeux? d'argent|jeux? de hasard|machines? à sous|roulette|poker|blackjack|baccara|croupier|las vegas|paris sportifs?" +
        "|musculation|culturisme|culturiste|bodybuilding|bodybuilder|body-building|fitness|crossfit|powerlifting|force athlétique|haltères?|stéroïdes? anabolisants?|anabolisants?|mister olympia|mr\\. olympia|arnold schwarzenegger",
    ) ||
    hasKeyword(title, "julien")
  ) {
    tags.push("Pour : JulienPct");
  }

  // LeadOn (Technologie & Science / Actrice X / Politique FR / Atomique)
  if (
    hasKeyword(
      text,
      "technologies?|technologiques?|informatique|ordinateurs?|logiciels?|algorithmes?|cybersécurité|intelligence artificielle|robotique|électronique|processeurs?|internet|smartphones?|sciences?|scientifiques?|physique|physicien(?:ne)?|chimie|chimiste|biologie|biologiste|mathématiques?|mathématicien(?:ne)?|laboratoire|astronomie|astrophysique|génétique|théorème|équation|quantique|ingénieur|inventeur|inventrice|chercheur|chercheuse|prix nobel de (?:physique|chimie|médecine)" +
        "|actrices? x|acteurs? x|actrices? pornographiques?|acteurs? pornographiques?|pornographi[a-zà-ÿ]*|porno|films? x|cinéma x" +
        "|(?:homme|femme|personnalité|militant|militante) politique français(?:e)?|député(?:e)? français(?:e)?|sénat(?:eur|rice) français(?:e)?|ministre français(?:e)?|président de la république française|premier ministre français|assemblée nationale|sénat français|gouvernement français|élection présidentielle française|cinquième république|ve république|parti socialiste|les républicains|rassemblement national|front national|la france insoumise|europe écologie|emmanuel macron|macron|françois hollande|nicolas sarkozy|sarkozy|jacques chirac|chirac|françois mitterrand|mitterrand|charles de gaulle|giscard|georges pompidou|le pen|mélenchon|françois bayrou" +
        "|atomes?|atomiques?|nucléaires?|radioacti[a-zà-ÿ]*|isotopes?|uranium|plutonium|thorium|radium|polonium|tritium|deutérium|réacteurs?|fission|fusion nucléaire|centrale nucléaire|bombe a|bombe h|bombe atomique|bombe à hydrogène|bombe thermonucléaire|essai nucléaire|projet manhattan|hiroshima|nagasaki|tchernobyl|fukushima|three mile island|médecine nucléaire|radiothérapie|curiethérapie|scintigraphie|radiologie|irradiation|rayonnements? ionisants?|neutrons?|protons?|électrons?|positons?|tokamak|iter|oppenheimer|marie curie|pierre curie|enrico fermi",
    )
  ) {
    tags.push("Pour : LeadOn");
  }

  // NOMGENERIQUE (Armes, véhicules militaires & guerre / Allemagne nazie)
  if (
    genericCat === "Militaire & Armement" ||
    hasKeyword(
      text,
      "armes?|armement|arme à feu|fusils?|fusil d'assaut|carabine|pistolets?|revolver|mitrailleuses?|mitraillette|kalachnikov|ak-47|canons? (?:de|antichar|automoteur|antiaérien|anti-aérien|naval)|obusier|artillerie|lance-roquettes|roquettes?|missiles?|torpilles?|bombes?|grenades?|explosifs?|mines? antipersonnel|munitions?|baïonnette|épées?|sabres?|arbalète" +
        "|chars? d'assaut|chars? de combat|blindés?|véhicules? blindés?|véhicules? militaires?|véhicules? de combat|transport de troupes|avions? de chasse|avions? militaires?|chasseur-bombardier|bombardiers?|hélicoptères? de combat|porte-avions|cuirassés?|croiseurs?|destroyers?|frégates?|corvettes?|torpilleurs?|navires? de guerre|drones? militaires?" +
        "|guerres?|batailles?|conflit armé|guerre mondiale|invasion|opération militaire|armée|militaires?|soldats?|régiments?|division blindée" +
        "|allemagne nazie|nazi[a-zà-ÿ]*|troisième reich|iiie reich|hitler|adolf hitler|hitlérien[a-zà-ÿ]*|nsdap|ss|waffen-ss|gestapo|himmler|göring|goering|goebbels|heydrich|eichmann|mengele|rommel|rudolf hess|wehrmacht|luftwaffe|kriegsmarine|panzer|u-boot|messerschmitt|führer|jeunesses hitlériennes|shoah|holocauste|auschwitz|camps? de concentration|camps? d'extermination|nuit de cristal|anschluss|croix gammée|procès de nuremberg|lois de nuremberg",
    )
  ) {
    tags.push("Pour : NOMGENERIQUE");
  }

  // Splitjerk (Haltérophilie / Personnalités problématiques / Églises avec image)
  if (
    hasKeyword(
      text,
      "haltérophil[a-zà-ÿ]*|épaulé-jeté|épaulé jeté|weightlifting" +
        "|xavier dupont de ligonnès|dupont de ligonnès|ligonnès|patrick sébastien|tonton|criminel(?:le)?s?|tueurs? en série|tueuse en série|tueurs?|tueuse|assassins?|meurtrier|meurtrière|pédophile|pédocriminel(?:le)?|terroristes?|violeur|escroc|gourou|condamnée? pour|controversée?|négationniste|antisémite|dictateur|dictatrice|ben laden|staline|pol pot|mao zedong|hitler|charles manson|ted bundy|jeffrey dahmer|jeffrey epstein|harvey weinstein|michel fourniret|marc dutroux|émile louis|guy georges|francis heaulme|nordahl lelandais|landru|marcel petiot|jacques mesrine|dominique pelicot|joël le scouarnec|roman polanski|gabriel matzneff|dieudonné|gérard depardieu|patrick poivre d'arvor|pierre palmade|bertrand cantat|r\\. kelly|jimmy savile|andrew tate",
    ) ||
    (card.image_url &&
      hasKeyword(
        text,
        "églises?|cathédrales?|chapelles?|basiliques?|collégiale|abbayes?|abbatiale|prieuré|temples?|monastères?",
      ))
  ) {
    tags.push("Pour : Splitjerk");
  }

  // Oaffew (Serpent / Araignée / Animaux & insectes avec image / Star Wars / Rap français)
  const isPythonSnake =
    hasKeyword(text, "python") &&
    !hasKeyword(text, "monty python|langage|programmation");
  if (
    isPythonSnake ||
    hasKeyword(
      text,
      "serpents?|ophidiens?|vipères?|couleuvres?|cobras?|boas?|mambas?|anacondas?|crotales?|serpent à sonnette|aspic|naja|taïpan|élapidés?|colubridés?|vipéridés?|elapidae|colubridae|viperidae|pythonidae|boidae" +
        "|araignées?|aranéides?|araneae|mygales?|tarentules?|veuve noire|épeires?|lycoses?|araneidae|salticidae|theridiidae" +
        "|star wars|la guerre des étoiles|lucasfilm|george lucas|jedi|sith|skywalker|dark vador|darth vader|yoda|obi-wan|chewbacca|han solo|palpatine|boba fett|kylo ren|stormtroopers?|tatooine|étoile de la mort|r2-d2|c-3po|mandalorian|clone wars" +
        "|rap français|rap francophone|hip-hop français|rappeur français|rappeuse française|rappeur francophone|rappeur belge|booba|kaaris|nekfeu|damso|orelsan|jul|ninho|sch|pnl|rohff|maître gims|gims|soprano|vald|kery james|iam|suprême ntm|ntm|fonky family|mc solaar|oxmo puccino|lacrim|niska|gazo|tiakola|werenoi|freeze corleone|laylow|lomepal|bigflo et oli|sexion d'assaut|la fouine|sinik|diam's|youssoupha|akhenaton|disiz|seth gueko|heuss l'enfoiré|soolking|kalash criminel|koba lad|plk|gradur|black m",
    ) ||
    (card.image_url &&
      hasKeyword(
        text,
        "animal|animaux|insectes?|bestioles?|coléoptères?|lépidoptères?|diptères?|hyménoptères?|hémiptères?|orthoptères?|papillons?|fourmis?|abeilles?|guêpes?|frelons?|mouches?|moustiques?|scarabées?|coccinelles?|libellules?|sauterelles?|criquets?|cafards?|blattes?|punaises?|mammifères?|oiseaux|oiseau|poissons?|reptiles?|amphibiens?|batraciens?|grenouilles?|crapauds?|lézards?|tortues?|crocodiles?|félins?|canidés?|primates?|singes?|rongeurs?|chauves-souris|chauve-souris|marsupiaux|marsupial|mollusques?|crustacés?|escargots?|cétacés?",
      ))
  ) {
    tags.push("Pour : Oaffew");
  }

  // SuperMao (Russie / Bosnie / Football)
  if (
    hasKeyword(
      text,
      "russie|russes?|moscou|poutine|kremlin|staline|lénine|trotski|urss|union soviétique|soviétiques?|tsars?|tsarine|romanov|sibérie|sibérien(?:ne)?|saint-pétersbourg|leningrad|stalingrad|volgograd|oural|volga|kamtchatka|tchétchénie|bolcheviks?|révolution d'octobre|gorbatchev|eltsine|khrouchtchev|brejnev|raspoutine" +
        "|bosnie|bosnie-herzégovine|herzégovine|bosniaques?|bosniens?|sarajevo|srebrenica|mostar|banja luka|tuzla|republika srpska|guerre de bosnie|accords de dayton|izetbegović|karadžić|karadzic|mladić|mladic" +
        "|football(?! américain| canadien| australien| gaélique)|footballeur|footballeuse|ballon d'or|fifa|uefa|ligue des champions|coupe du monde de football|championnat d'europe de football|ligue 1|ligue 2|premier league|la liga|serie a|bundesliga|psg|paris saint-germain|olympique de marseille|olympique lyonnais|as saint-étienne|real madrid|fc barcelone|bayern munich|juventus|manchester united|manchester city|liverpool fc|chelsea fc|arsenal fc|ac milan|inter milan|lionel messi|messi|cristiano ronaldo|ronaldo|ronaldinho|mbappé|maradona|pelé|zinédine zidane|zidane|michel platini|johan cruyff|gardien de but|club de football|stade de football",
    )
  ) {
    tags.push("Pour : SuperMao");
  }

  return tags;
}

// Si SUPABASE_TOKEN n'est pas défini, on lit le token extrait par Playwright dans token.txt (gitignoré)
function readToken() {
  if (process.env.SUPABASE_TOKEN) return process.env.SUPABASE_TOKEN;
  try {
    const raw = fs.readFileSync(
      require("path").join(__dirname, "..", "token.txt"),
      "utf8",
    );
    return raw.replace(/["\s]/g, "");
  } catch (e) {
    return "YOUR_SUPABASE_TOKEN_HERE";
  }
}

const headers = {
  authorization: `Bearer ${readToken()}`,
  apikey: process.env.SUPABASE_API_KEY,
  "content-type": "application/json",
};

const BASE_URL = "https://cyrxjeppjqsxxjayfrur.supabase.co/rest/v1";

const TAG_COLORS = {
  "Politique Française": "#2563eb",
  "Politique Internationale": "#7c3aed",
  "Automobile & Transports": "#dc2626",
  "Pop-Culture & Divertissement": "#db2777",
  "Technologie & Informatique": "#059669",
  Sciences: "#0d9488",
  "Atome & Chimie": "#0891b2",
  Sports: "#ea580c",
  "Monuments & Lieux historiques": "#ca8a04",
  "Affaires Criminelles": "#1f2937",
  "Religion & Mythes": "#d97706",
  Histoire: "#65a30d",
  "Géographie & Territoires": "#16a34a",
  "Arts & Littérature": "#9333ea",
  Personnalités: "#4f46e5",
  "Faune & Flore": "#84cc16",
  "Astronomie & Espace": "#1e3a8a",
  "Militaire & Armement": "#3f6212",
  "Divers & Homonymies": "#9ca3af",
  Autre: "#6b7280",
  // 1 SEUL TAG PAR AMI
  "Pour : JulienPct": "#0ea5e9",
  "Pour : LeadOn": "#ec4899",
  "Pour : NOMGENERIQUE": "#475569",
  "Pour : Splitjerk": "#eab308",
  "Pour : Oaffew": "#22c55e",
  "Pour : SuperMao": "#dc2626",
  Doublon: "#ef4444",
};

async function processCards() {
  console.log("Fetching tags...");
  const resTags = await fetch(`${BASE_URL}/tags?select=*`, {headers});
  if (!resTags.ok)
    throw new Error("Failed to fetch tags: " + (await resTags.text()));

  const existingTags = await resTags.json();
  const tagMap = {};
  for (const tag of existingTags) tagMap[tag.name] = tag.id;

  let userId = existingTags.length > 0 ? existingTags[0].user_id : null;

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

  if (!userId && userCards.length > 0) userId = userCards[0].user_id;

  // Delete ALL existing tags completely from the database to purge old/unused ones
  if (existingTags.length > 0) {
    console.log("Deleting old tags entirely from database...");
    const chunkSize = 50;
    for (let i = 0; i < existingTags.length; i += chunkSize) {
      const chunk = existingTags.slice(i, i + chunkSize).map((t) => t.id);
      // First delete associations
      await fetch(`${BASE_URL}/user_card_tags?tag_id=in.(${chunk.join(",")})`, {
        method: "DELETE",
        headers,
      });
      // Then delete the tags themselves
      await fetch(`${BASE_URL}/tags?id=in.(${chunk.join(",")})`, {
        method: "DELETE",
        headers,
      });
    }
  }

  // Clear local maps so everything gets recreated
  for (const k in tagMap) delete tagMap[k];

  console.log("Creating fresh tags...");
  for (const tagName of Object.keys(TAG_COLORS)) {
    if (!tagMap[tagName] && userId) {
      const createRes = await fetch(`${BASE_URL}/tags?select=*`, {
        method: "POST",
        headers: {...headers, Prefer: "return=representation"},
        body: JSON.stringify({
          user_id: userId,
          name: tagName,
          color: TAG_COLORS[tagName],
        }),
      });
      if (createRes.ok) {
        const text = await createRes.text();
        if (text) {
          const created = JSON.parse(text);
          if (created && created.length > 0) tagMap[tagName] = created[0].id;
        }
      }
    }
  }

  const batchPayload = [];

  // Count duplicates
  const cardCount = {};
  for (const uc of userCards) {
    if (uc.cards && uc.cards.id) {
      cardCount[uc.cards.id] = (cardCount[uc.cards.id] || 0) + 1;
    }
  }

  for (const uc of userCards) {
    if (!uc.cards) continue;
    const categories = categorize(uc.cards);

    // Add Doublon tag if user owns more than one copy of this card
    if (uc.cards.id && cardCount[uc.cards.id] > 1) {
      categories.push("Doublon");
    }

    const uniqueCats = [...new Set(categories)];
    for (const cat of uniqueCats) {
      if (tagMap[cat])
        batchPayload.push({user_card_id: uc.id, tag_id: tagMap[cat]});
    }
  }

  const BATCH_SIZE = 100;
  for (let i = 0; i < batchPayload.length; i += BATCH_SIZE) {
    const chunk = batchPayload.slice(i, i + BATCH_SIZE);
    const addRes = await fetch(`${BASE_URL}/user_card_tags`, {
      method: "POST",
      headers: {...headers, Prefer: "resolution=ignore-duplicates"},
      body: JSON.stringify(chunk),
    });
    if (!addRes.ok) {
      for (const item of chunk) {
        await fetch(`${BASE_URL}/user_card_tags`, {
          method: "POST",
          headers: {...headers, Prefer: "resolution=ignore-duplicates"},
          body: JSON.stringify([item]),
        });
      }
    }
  }

  console.log(
    "Bulk insert successful with new smart categorization and friend tags!",
  );
}

if (require.main === module) processCards().catch(console.error);
module.exports = {categorize};

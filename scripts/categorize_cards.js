const fs = require("fs");
const path = require("path");
require("dotenv").config({quiet: true});

// ---------------------------------------------------------------------------
// Correspondance de mots-clés
// ---------------------------------------------------------------------------

// Un mot-clé doit être un mot entier. Le tiret compte comme une lettre, sinon
// "Saint-Priest" contiendrait "saint" et "Nouvelle-Aquitaine" "nouvelle".
// Exception : après un préfixe adjectival en "-o" ("germano-soviétique", "franco-russe").
const WORD_CHARS = "a-zà-ÿœæ0-9";
function compile(keywords) {
  return new RegExp(
    `(?:(?<![${WORD_CHARS}-])|(?<=[a-zà-ÿ]o-))(?:${keywords})(?![${WORD_CHARS}-])`,
  );
}

const regexCache = new Map();
function hasKeyword(text, keywords) {
  if (!regexCache.has(keywords)) regexCache.set(keywords, compile(keywords));
  return regexCache.get(keywords).test(text);
}

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[’`ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Position (en mots) de la première occurrence : sert à privilégier le nom de tête
// d'une description ("commune française…", "film sorti en…").
function firstMatch(re, text) {
  const m = re.exec(text);
  if (!m) return null;
  const before = text.slice(0, m.index).trim();
  return {index: m.index, word: before ? before.split(" ").length : 0, length: m[0].length, text: m[0]};
}

// ---------------------------------------------------------------------------
// Extraction des champs d'une carte
// ---------------------------------------------------------------------------

// Fin de phrase : ponctuation précédée d'au moins 2 lettres (évite "J. R. R. Tolkien")
// et suivie d'une majuscule.
const SENTENCE_END = /(?<=[a-zà-ÿ0-9)»"]{2}[.!?])\s+(?=[A-ZÀ-Ý«"(])/;

// "X est un/une …" : ce qui suit est la définition de l'article, le signal le plus fiable
// quand la description courte (`category`) est absente.
const COPULA =
  /(?<![a-zà-ÿ'-])(?:est|était|sont|étaient|fut|furent|désigne|désignait|reste|devient) (?:(?:actuellement|aujourd'hui|également|aussi|alors|désormais|notamment|plus précisément|à l'origine) )?(?:(?:une|un|les|le|la|des) |l')/;

function extractFields(card) {
  const summary = (card.summary || "").trim();
  const firstParagraph = summary.split(/\n+/)[0] || "";
  const leadRaw = firstParagraph.split(SENTENCE_END)[0] || "";
  const lead = normalize(leadRaw);
  const body = normalize(summary.slice(summary.indexOf(leadRaw) + leadRaw.length));
  const copula = COPULA.exec(lead);
  const title = normalize(card.wikipedia_title);
  const desc = normalize(card.category);
  return {
    title,
    rawTitle: (card.wikipedia_title || "").trim(),
    desc,
    // Définition après "est un/une…" ; à défaut, la première phrase entière (moins fiable)
    def: copula ? lead.slice(copula.index + copula[0].length) : "",
    lead: copula ? "" : lead,
    body,
    // Texte "fort" (titre + description + 1re phrase) utilisé pour les tags par ami
    leadFull: lead,
    focus: `${title} ${desc} ${lead}`,
    all: `${title} ${desc} ${lead} ${body}`,
  };
}

// ---------------------------------------------------------------------------
// Thèmes
// ---------------------------------------------------------------------------
// `kw`   : mots-clés recherchés dans tous les champs.
// `head` : mots ambigus ("tour", "fort", "port"…) qui ne comptent qu'en tête de la
//          description ou de la définition ("fort à l'Île-d'Yeu", pas "un fort courant").
// `weight` : multiplicateur du score (Personnalités ne sert qu'à défaut d'un domaine précis :
//          "avocat et homme d'État" → Politique).
// L'ordre ne sert qu'à départager deux scores strictement égaux.
// "Politique" est scindé ensuite en Politique Française / Internationale.

const THEMES = {
  "Divers & Homonymies": {
    kw: "pages? d'homonymie|homonymies?|mois de \\d{4}|pages? de liste|listes? (?:de|des|d')|glossaires?|chronologies? (?:de|des|du|d')|bilans? saison par saison|palmarès|décennies?|événements (?:survenus|liés)|faits marquants|répertoires?|annuaires?|nomenclatures?",
  },
  "Faune & Flore": {
    kw: "espèces?|sous-espèces?|taxons?|plantes?|végéta(?:l|le|les|ux)|flore|faune|botanique|zoologie|animal|animaux|insectes?|araignées?|aranéomorphes?|mygalomorphes?|mygales?|tarentules?|arachnides?|scorpions?|pseudoscorpions?|acariens?|diptères?|coléoptères?|lépidoptères?|hyménoptères?|hémiptères?|orthoptères?|papillons?|fourmis?|abeilles?|guêpes?|frelons?|moustiques?|oiseaux|oiseau|passereaux|rapaces?|poissons?|requins?|mammifères?|rongeurs?|chauves-souris|chauve-souris|primates?|singes?|félins?|canidés?|cétacés?|baleines?|dauphins?|marsupiaux|marsupial|reptiles?|sauriens?|lézards?|serpents?|tortues?|crocodiles?|amphibiens?|grenouilles?|crapauds?|salamandres?|mollusques?|gastéropodes?|escargots?|bivalves?|crustacés?|anémones? de mer|coraux|tardigrades?|nématodes?|bactéries?|micro-organismes?|fleurs?|arbres?|arbustes?|orchidées?|rosiers?|cultivars?|algues?|champignons?|lichens?|fougères?|graminées?|conifères?|fongiques?|mycologie|races? (?:de|d') (?:chevaux|chiens?|chats?|bovins?|vaches?|moutons?|poules?|porcs?|chèvres?|lapins?|poneys?)|races? (?:bovine|ovine|chevaline|canine|féline|porcine|caprine)s?|poneys?|chevaux|cheval|bovins?|variétés? (?:d'|de )(?:avocats?|pommes?|poires?|raisins?|vignes?|blé|riz|tomates?|pommes? de terre|olives?|agrumes?|bananes?|mangues?|cerises?|prunes?|pêches?|abricots?|oranges?|citrons?|figues?)|parcs? zoologiques?|zoos?|famille des [a-zà-ÿ]+(?:idés|acées|idae|aceae)|[a-z]{3,}idae|[a-z]{3,}aceae",
  },
  "Monuments & Lieux historiques": {
    kw: "monuments?|châteaux?|château fort|châteaux forts|forteresses?|citadelles?|fortifications?|remparts?|donjons?|musées?|cathédrales?|églises?|basiliques?|chapelles?|collégiales?|abbayes?|abbatiales?|prieurés?|monastères?|couvents?|mosquées?|synagogues?|temples?|sanctuaires?|calvaires?|palais|manoirs?|hôtels? particuliers?|hôtels? de ville|mairies?|maisons? (?:natales?|fortes?|à colombages)|villas?|bâtiments?|édifices?|gratte-ciel|tours? (?:de guet|médiévales?|de défense|d'observation|de télévision|de télécommunications?|de radio|carrées?|eiffel)|architecture|architectura(?:l|le|les|ux)|ponts?|viaducs?|aqueducs?|barrages?|phares?|moulins?|fontaines?|lavoirs?|statues?|arcs? (?:de triomphe|romains?)|obélisques?|mausolées?|tombeaux?|nécropoles?|cimetières?|dolmens?|menhirs?|mégalithes?|mégalithiques?|tumulus|sites? archéologiques?|ruines?|théâtres? (?:dans|à|de|du|des|d'|national|royal|municipa(?:l|ux)|antiques?|romains?|grecs?)|salles? de théâtre|opéras? (?:de|garnier|national)|salles? (?:de spectacles?|de concerts?|de cinéma|polyvalentes?|de sport|omnisports)|stades?|arènes|amphithéâtres?|hippodromes?|vélodromes?|patinoires?|auberges?|avenues?|boulevards?|squares?|jardins?|cheminées?|lanternes? des morts|verreries?|usines?|forges?|halles?|beffrois?|clochers?|cloîtres?|cryptes?",
    head: "tour|fort|place|rue|pont|stade|arena|salle|hôtel|maison|porte|cinéma|immeuble",
  },
  Politique: {
    kw: "politiques?|politiciens?|politiciennes?|hommes? d'état|femmes? d'état|élections?|électora(?:l|le|les|ux)|scrutins?|référendums?|partis? (?:politiques?|socialiste|communiste|vert|conservateur|libéral|démocrate|républicain|travailliste|populaire|nationaliste|écologiste|social-démocrate|démocrate-chrétien|du travail|du peuple)|travaillistes?|député(?:e)?s?|sénat(?:eur|rice)s?|sénat|ministres?|ministères?|gouvernements?(?! local)|gouvernementa(?:l|le|les|ux)|parlements?|parlementaires?|législatures?|législati(?:f|fs|ve|ves)|droit de vote|suffrage universel|constitution(?:nel|nelle)?s?|diplomates?|diplomatiques?|diplomatie|ambassadeurs?|ambassadrices?|ambassades?|consulats?|présidents? de la république|chefs? d'état|chef du gouvernement|premiers? ministres?|maires?|conseill(?:er|ère)s? (?:municipa(?:l|ux)|généra(?:l|ux)|régiona(?:l|ux))|assemblée nationale|nations unies|onu|otan|union européenne|traités? internationa(?:l|ux)|sommets? (?:de|du|des) (?:l'otan|g7|g8|g20)|circonscriptions? électorales?|divisions? électorales?|districts? sénatoria(?:l|ux)|mandats? (?:du|de) parlement|syndica(?:l|le|les|ux|lisme|listes?|ts?)|militante?s? (?:politiques?|anarchistes?|anarcho-syndicalistes?|communistes?|socialistes?|féministes?|écologistes?|indépendantistes?)|anarchis(?:me|tes?)|anarcho-syndicalis(?:me|tes?)|communis(?:me|tes?)|socialis(?:me|tes?)|nationalis(?:me|tes?)|irrédentismes?|sionis(?:me|tes?)|fascis(?:me|tes?)|extrême[ -](?:gauche|droite)|idéologies?|mouvances?|droits (?:de l'homme|humains|des peuples)|déclarations? (?:des droits|universelle)|opposants? politiques?|dissidents?|coups? d'état|pronunciamiento|commissions? nationales?|administrations? nationales?",
  },
  "Arts & Littérature": {
    kw: "littérature|littéraires?|femmes? de lettres|hommes? de lettres|manuscrits?|romans?|romanciers?|romancières?|écrivains?|écrivaines?|auteurs?|autrices?|auteures?|poètes?|poétesses?|poésies?|poèmes?|poétiques?|versification|recueils?|nouvellistes?|contes?|conteurs?|conteuses?|fables?|fabulistes?|essayistes?|dramaturges?|pièces? de théâtre|troupes? de théâtre|compagnies? de théâtre|théâtres?|théâtra(?:l|le|les|ux)|comédies?|tragédies?|livres?|ouvrages?|bibliothèques?|éditeurs?|éditrices?|maisons? d'édition|éditions|traduct(?:eur|rice)s?|critiques? littéraires?|prix littéraires?|mouvements? artistiques?|artistes?|artistiques?|œuvres? d'art|art (?:contemporain|moderne|urbain|abstrait|nouveau|déco|roman|gothique|baroque|naïf|brut)|street art|beaux-arts|arts (?:plastiques|décoratifs|graphiques)|historien(?:ne)?s? de l'art|peintres?|peintures?|tableaux? (?:de|d')|aquarelles?|fresques?|dessinat(?:eur|rice)s?|illustrat(?:eur|rice)s?|bandes? dessinées?|bédéistes?|mangakas?|graveurs?|gravures?|lithographes?|lithographies?|sculpt(?:eur|rice)s?|sculptures?|photographes?|photographies?|vitraillistes?|vitraux|vitrail|céramistes?|orfèvres?|designers?|scénographes?|stylistes?|couturi(?:er|ère)s?|haute couture|danseu(?:r|se)s?|chorégraphes?|ballets?|compositeurs?|compositrices?|musique classique|opéras?|symphonies?|symphoniques?|concertos?|sonates?|cantates?|requiems?|oratorios?|orchestres?|chefs? d'orchestre|organistes?|clavecinistes?|pianistes?|violonistes?|violoncellistes?|expositions?|galeries? d'art|chefs?-d'œuvre",
  },
  "Pop-Culture & Divertissement": {
    kw: "films?|téléfilms?|longs?-métrages?|courts?-métrages?|cinéma|cinématographiques?|réalisat(?:eur|rice)s?|scénaristes?|directeurs? de la photographie|chefs? opérat(?:eur|rice)s?|monteu(?:r|se)s?|cadreu(?:r|se)s?|producteurs? de (?:cinéma|films?|télévision)|sociétés? de production|box-office|séries? (?:télévisées?|d'animation|de télévision)|web-séries?|épisodes?|feuilletons?|sitcoms?|télévisée?s?|télévision|télévisuel(?:le)?s?|émissions?|jeux? télévisés?|animat(?:eur|rice)s? (?:de|à la) (?:télévision|radio)|radio|radiophoniques?|acteurs?|actrices?|comédien(?:ne)?s?|doubleu(?:r|se)s?|chanteu(?:r|se)s?|chansons?|chants?|singles?|albums?|ep|discographies?|musiques?|musicien(?:ne)?s?|musica(?:l|le|les|ux)|groupes? (?:de musique|de rock|de rap|de pop|de jazz|de metal|musica(?:l|ux))|rock|punk|pop|folk|rap|rappeu(?:r|se)s?|hip-hop|jazz|blues|reggae|funk|techno|metal|heavy metal|bassistes?|guitaristes?|batteu(?:r|se)s?|claviéristes?|flûtistes?|percussionnistes?|saxophonistes?|dj|disc-jockeys?|producteurs? de musique|auteure?-compositeur(?:-interprète)?|auteure?-compositrice(?:-interprète)?|concerts?|tournées?|festivals?|eurovision|classements? musica(?:l|ux)|hit-parades?|charts|labels? discographiques?|maisons? de disques|jeux? vidéo|jeux? de société|jeux? de cartes(?: à collectionner)?|jeux? de rôle|mangas?|animes?|animés?|dessins? animés?|animation|super-héros|marvel|dc comics|disney|pixar|star wars|doctor who|simpson|catch|wwe|téléréalité|youtubeu(?:r|se)s?|streameu(?:r|se)s?|twitch|podcasts?|humoristes?|one-man-show|stand-up|magazines?|quotidiens?|hebdomadaires?|presse écrite|personnages? de fiction|personnages? fictifs?|science-fiction|fantasy|bandes? originales?|récompenses? (?:télévisuelles?|cinématographiques?|musicales?)|saturn awards?|oscars?|grammy awards?|emmy awards?|modèles? de charme|actrices? x|acteurs? x|films? x|pornographi(?:e|que)s?|netflix|youtube",
    // "groupe allemand", "groupe japonais"… (mais pas "groupe de stéréoisomères")
    head: "groupe(?! (?:de |d'|du |des ))",
  },
  Sports: {
    kw: "sports?|sportifs?|sportives?|football|footballeurs?|footballeuses?|soccer|cyclistes?|cyclisme|cyclo-cross|olympiques?|jeux olympiques|délégations? olympiques?|paralympiques?|tennis|tennisman|tennismen|basket-ball|basketball|basket|volley-ball|volleyball|handball|handballeu(?:r|se)s?|rugby|championnats?|tournois?|coupes? (?:du monde|d'europe|d'afrique|d'asie|de france|d'allemagne|d'angleterre|d'italie|d'espagne|de la ligue|des confédérations)|ligues? des champions|ligue \\d|premier league|matchs?|athlètes?|athlétisme|coureu(?:r|se)s?|marathons?|sprinteu(?:r|se)s?|lanceu(?:r|se)s? (?:de disque|de javelot|de poids|de marteau)|décathl(?:on|onien)s?|heptathl(?:on|onienne)s?|natation|nageu(?:r|se)s?|gymnastes?|gymnastique|baseball|softball|cricket|golf|golfeu(?:r|se)s?|haltérophil[a-zà-ÿ]*|rameu(?:r|se)s?|aviron|canoë|kayak|archers?|archères?|tir à l'arc|escrime|escrimeu(?:r|se)s?|hockey|hockeyeu(?:r|se)s?|boxe|boxeu(?:r|se)s?|judo|judokas?|karaté|karatékas?|taekwondo|lutte (?:gréco-romaine|libre)|lutteu(?:r|se)s?|arts martiaux|triathl(?:on|ète)s?|duathl(?:on|ète)s?|pentathl(?:on|ète)s?|ironman|volleyeu(?:r|se)s?|surf|surfeu(?:r|se)s?|skateboard|escalade|grimpeu(?:r|se)s?|ski|skieu(?:r|se)s?|biathl(?:on|ète)s?|combiné nordique|saut à ski|snowboard|patinage|patineu(?:r|se)s?|curling|curleu(?:r|se)s?|bobsleigh|squash|badminton|tennis de table|équitation|saut d'obstacles|dressage|cavali(?:er|ère)s?|jockeys?|courses? (?:hippiques?|cyclistes?|à pied|automobiles?|de côte)|cheval de (?:course|saut d'obstacles|concours)|chevaux de course|pilotes? (?:automobiles?|de rallye|de course|de formule \\d|de vitesse moto|de moto|de motocross|d'endurance)|sport automobile|formule 1|formule un|grands? prix (?:de formule|automobiles?|moto)|rallyes?|24 heures du mans|nascar|indycar|karting|motocross|écuries? (?:de sport automobile|de formule)|équipes? (?:cyclistes?|de football|de rugby|de hockey|de basket-ball|nationales?|de france de)|clubs? (?:de football|de rugby|de basket-ball|de hockey|sportifs?|omnisports)|fédérations? (?:sportives?|nationales? de|internationales? de|françaises? de)|entraîneu(?:r|se)s?|sélectionneu(?:r|se)s?|arbitres?|joueu(?:r|se)s? (?:de|d') (?:football|rugby|basket-ball|tennis|hockey|baseball|handball|volley-ball|golf|cricket|water-polo|squash|badminton)|tour de france|tour d'italie|tour d'espagne|tours? (?:de |d'|du |des )[a-zà-ÿ' -]+ \\d{4}|uci|courses? par étapes|giro|vuelta|étapes? du tour|contre-la-montre|cross-country|internationaux de france|roland-garros|wimbledon|coupe davis|fed cup|wta|atp|fifa|uefa|nba|nfl|nhl|lhjmq|paris saint-germain|psg|médaillée?s? (?:olympiques?|d'or|d'argent|de bronze)",
    head: "joueur|joueuse|équipe|club|compétition|épreuve|champion|championne",
  },
  "Astronomie & Espace": {
    kw: "astronomie|astronomes?|astronomiques?|astéroïdes?|planètes?|planétaires?|planétologie|étoiles? (?:binaires?|doubles?|variables?|à neutrons|naines?|géantes?|filantes?)|naines? (?:blanches?|brunes?|rouges?)|supernovas?|pulsars?|quasars?|galaxies?|galactiques?|amas (?:stellaires?|globulaires?|ouverts?|de galaxies)|stellaires?|transneptuniens?|ceinture (?:principale|de kuiper)|nuage d'oort|comètes?|météorites?|système solaire|constellations?|télescopes?|observatoires?|exoplanètes?|trous? noirs?|nébuleuses?|voie lactée|cosmologie|cosmologiques?|astrophysi(?:que|cien|cienne)s?|astronautes?|cosmonautes?|spationautes?|spatia(?:l|le|les|ux)|aérospatia(?:l|le|les|ux)|nasa|esa|roscosmos|missions? spatiales?|stations? spatiales?|fusées?|sondes? spatiales?|satellites? (?:artificiels?|naturels?|de télécommunications?|d'observation|météorologiques?)|cratères? (?:lunaires?|martiens?|d'impact)|(?:sur|de) (?:la lune|vénus|mercure|jupiter|saturne|uranus|neptune|pluton)|sur mars|corona|coronae|programme apollo|orbites?|orbita(?:l|le|les|ux)",
    head: "étoile|satellite|lune",
  },
  "Atome & Chimie": {
    kw: "atomes?|atomiques?|nucléaires?|particules? (?:élémentaires?|subatomiques?)|physique des particules|chimiques?|chimie|chimistes?|biochimi(?:e|que|ste)s?|isotopes?|molécules?|moléculaires?|électrons?|protons?|neutrons?|positons?|quarks?|bosons?|radioactivité|radioacti(?:f|fs|ve|ves)|composés? (?:chimiques?|organiques?|inorganiques?|organométalliques?|aromatiques?)|minéra(?:l|ux)|minéralogie|minéralogiques?|cristaux|cristallins?|cristallographi(?:e|que)s?|alliages?|métaux|métal|métalliques?|métallurgie|polymères?|ions?|ioniques?|oxydes?|hydroxydes?|sulfures?|antimoniosulfures?|sulfates?|nitrates?|chlorures?|carbonates?|acides?|alcools?|esters?|cétones?|aldéhydes?|alcanes?|alcènes?|hydrocarbures?|stéréoisomères?|isomères?|énantiomères?|racémiques?|flavones?|flavonoïdes?|alcaloïdes?|hétérosides?|réactions? (?:chimiques?|nucléaires?|en chaîne)|catalyseurs?|électrochimi(?:e|que)s?|potentiels? standards?|électrodes?|oxydoréduction|éléments? chimiques?|tableau périodique|numéro atomique|formule chimique|gaz (?:nobles?|rares?)|uranium|plutonium|thorium|radium|polonium|hydrogène|hélium|lithium|carbone|azote|oxygène|sodium|magnésium|aluminium|silicium|soufre|potassium|calcium|titane|cuivre|zinc|plomb",
  },
  "Technologie & Informatique": {
    kw: "informatiques?|informaticien(?:ne)?s?|logiciels?|progiciels?|ordinateurs?|micro-ordinateurs?|technologies?|technologiques?|numériques?|smartphones?|téléphones? (?:mobiles?|portables?)|téléphonie|applications? (?:mobiles?|web|informatiques?)|appareils? mobiles?|internet|(?:médias?|jeux?|forums?|services?|plateformes?|sites?|ventes?|encyclopédies?|magazines?|journa(?:l|ux)) en ligne|sites? (?:web|internet)|navigateurs? web|web|forums? internet|réseaux? (?:informatiques?|sociaux|de télécommunications?|domestiques?|sans fil)|wi-fi|wifi|bluetooth|télécommunications?|télégraphie|code morse|radars?|programmation|programmeu(?:r|se)s?|développeu(?:r|se)s?|programmes? informatiques?|algorithmes?|algorithmiques?|codes? sources?|open source|apple|microsoft|google|ibm|intel|nvidia|samsung|nintendo|sega|atari|serveurs?|systèmes? d'exploitation|systèmes? embarqués?|langages? (?:de programmation|informatiques?)|python|javascript|linux|unix|windows|android|frameworks?|bibliothèques? logicielles?|interfaces? de programmation|hackers?|piratage informatique|cybersécurité|cyberattaques?|cyberactivistes?|intelligence artificielle|apprentissage automatique|robotique|robots?|électroniques?|électroniciens?|semi-conducteurs?|transistors?|microprocesseurs?|processeurs?|circuits? intégrés?|cartes? mères?|mémoires? (?:vive|morte|flash|cache|interne)|registres? (?:de|du) processeur|bases? de données|wikipédia|wikimédia|émulateurs?|consoles? (?:de jeux|portables?)|ingénieu(?:r|se)s?|ingénierie|machines? électriques?|électrotechniques?|électricité|énergies? renouvelables?|énergétiques?|photovoltaïques?|éoliennes?",
  },
  "Automobile & Transports": {
    kw: "automobiles?|automobilistes?|voitures?|véhicules?|moteurs?(?! de recherche)|constructeurs? (?:automobiles?|aéronautiques?|ferroviaires?|navals?)|marques? automobiles?|modèles? (?:d'automobiles?|de voitures?|automobiles?)|berlines?|cabriolets?|monospaces?|suv|bmw|citroën|renault|peugeot|volkswagen|audi|toyota|nissan|honda|hyundai|opel|chevrolet|porsche|lamborghini|bugatti|maserati|alfa romeo|skoda|volvo|mazda|subaru|mitsubishi|suzuki|camions?|tracteurs?|autobus|autocars?|bus|trolleybus|tramways?|métros?|métropolitain|rer|chemins? de fer|ferroviaires?|(?<!en )trains?|tgv|locomotives?|automotrices?|autorails?|wagons?|gares?|aéroports?|aérodromes?|pistes? d'atterrissage|aéroportuaires?|compagnies? aériennes?|avions?|aviation (?:civile|commerciale)|aéronefs?|aéronautiques?|hélicoptères?|dirigeables?|turbopropulsion|quadrimoteurs?|bimoteurs?|monomoteurs?|biréacteurs?|navires?|bateaux?|paquebots?|cargos?|ferrys?|ferries|voiliers?|goélettes?|brise-glaces?|remorqueurs?|chalutiers?|classes? de navires?|constructions? navales?|chantiers? nava(?:l|ls)|ports? (?:maritimes?|fluviaux|fluvial|de commerce|de plaisance|autonomes?)|canal (?:de|du|des|d')|canal maritime|canaux|écluses?|voies? navigables?|autoroutes?|routes? (?:nationales?|départementales?|provinciales?|européennes?|régionales?|\\d+)|échangeurs?|motocyclettes?|motos?|scooters?|cyclomoteurs?|vélos?|bicyclettes?|transports? (?:en commun|ferroviaires?|routiers?|aériens?|maritimes?|fluviaux|publics?|urbains?|de voyageurs|de marchandises)|entreprises? de transports?|chemins de fer vicinaux",
    head: "route|port|transport|piste|canal",
  },
  "Religion & Mythes": {
    kw: "religions?|religieu(?:x|se|ses)|spiritualités?|spirituel(?:le)?s?|lieux? de culte|dieux?|déesses?|divinités?|saints?|saintes?|béatifiée?s?|canonisée?s?|martyrs?|papes?|papauté|cardinaux|évêques?|archevêques?|évêchés?|prélats?|diocèses?|archidiocèses?|paroisses?|prêtres?|curés?|abbés?|abbesses?|moines?|moniales?|nonnes?|ordres? (?:religieux|monastiques?|mendiants?)|bénédictins?|cisterciens?|franciscains?|dominicains?|jésuites?|congrégations?|monachisme|monastiques?|ermites?|pasteurs? (?:protestants?|luthériens?|évangéliques?|baptistes?|réformés?)|rabbins?|imams?|gourous?|chamans?|chamanisme|théologi(?:e|en|enne|ens|ques?)|catholiques?|catholicisme|chrétien(?:ne)?s?|christianisme|christ|jésus|protestant(?:e|es|s|isme)?|luthérien(?:ne)?s?|calvinistes?|anglicans?|orthodoxes?|évangéliques?|islam|islamiques?|musulman(?:e|es|s)?|coran|judaïsme|juifs?|juives?|talmud|bouddhisme|bouddhistes?|bouddha|hindouisme|hindous?|shintoïsme|taoïsme|sikhisme|bibles?|bibliques?|psaumes?|évangiles?|apôtres?|prophètes?|anges?|démons?|hérésies?|hérétiques?|sectes?|croyances?|mythes?|mythologies?|mythologiques?|mythiques?|légendes?|légendaires?|folklores?|folkloriques?|créatures? (?:légendaires?|mythologiques?|fantastiques?)|nymphes?|néréides?|pèlerinages?|reliques?|liturgi(?:e|ques?)|guérisseu(?:r|se|sse)s?|sorcellerie|sorci(?:er|ère)s?|occultisme|ésotérisme|astrologie",
  },
  "Affaires Criminelles": {
    kw: "affaires? criminelles?|affaires? judiciaires?|faits? divers|criminels?|criminelles?|criminalité|crimes?|meurtres?|meurtri(?:er|ère)s?|assassinats?|assassin(?:e|es|s)?(?!'s)|homicides?|féminicides?|infanticides?|parricides?|pédicides?|tueu(?:r|se)s?|violeurs?|viols?|agressions? sexuelles?|pédophil(?:e|ie)s?|pédocriminel(?:le)?s?|enlèvements?|kidnappings?|séquestrations?|prises? d'otages?|disparitions? (?:inquiétantes?|mystérieuses?)|vols? à main armée|cambriolages?|braquages?|braqueurs?|escroqueries?|escrocs?|fraudes?|blanchiment|corruption|trafics? (?:de drogue|d'armes|d'êtres humains|de stupéfiants)|trafiquants?|narcotrafi(?:quants?|c)|cartels?|mafias?|mafieu(?:x|se)s?|gangs?|gangsters?|yakuzas?|terroris(?:me|tes?)|attentats?|polices? (?:nationale|judiciaire|municipale|secrète)|policiers?|gendarmerie|enquêtes? (?:criminelles?|judiciaires?|policières?)|détectives?|juges? d'instruction|tribuna(?:l|ux)|procès|cours? d'assises|condamnée?s?|condamnations?|peines? de mort|exécutions?|prisons?|pénitenciers?|bagnes?|détenue?s?|évasions?|victimes?|tortures?|violences? (?:sexuelles?|conjugales?|policières?)",
  },
  "Militaire & Armement": {
    kw: "militaires?|militarisme|armées?(?! du salut)|forces armées|armements?|armes? (?:à feu|blanches?|nucléaires?|chimiques?|biologiques?|de guerre|d'épaule|de poing|légères?|automatiques?|antichars?)|fusils?|carabines?|pistolets?|revolvers?|mitrailleuses?|mitraillettes?|kalachnikov|ak-47|canons? (?:de|antichars?|automoteurs?|antiaériens?|anti-aériens?|navals?)|obusiers?|mortiers?|lance-roquettes|lance-grenades|roquettes?|missiles?|torpilles?|bombes?|bombardements?|bombardiers?|grenades? (?:à main|offensives?|défensives?)|explosifs?|mines? (?:antipersonnel|antichars?|navales?)|mouilleurs? de mines|munitions?|chars? (?:d'assaut|de combat)|panzer[a-z]*|blindés?|véhicules? (?:blindés?|militaires?|de combat)|transports? de troupes|avions? (?:de chasse|militaires?|de combat|de reconnaissance)|chasseurs?-bombardiers?|aviation militaire|armée de l'air|luftwaffe|royal air force|escadrilles?|pilotes? de chasse|marines? (?:nationale|royale|impériale|militaire|de guerre)|kaiserliche marine|kriegsmarine|royal navy|us navy|navires? de guerre|bâtiments? de guerre|porte-avions|porte-hélicoptères|cuirassés?|croiseurs?|destroyers?|frégates?|corvettes?|avisos?|torpilleurs?|contre-torpilleurs?|vedettes?-torpilleurs?|sous-marins?|u-boote?|unterseeboot|sous-mariniers?|uss|hms|soldats?|infanterie|cavalerie|artillerie|génie militaire|troupes?(?! de (?:théâtre|danse|comédiens|cirque))|régiments?|bataillons?|brigades?|divisions? (?:blindées?|d'infanterie|aéroportées?|de cavalerie)|panzerdivision|corps d'armée|légion étrangère|légionnaires?|garnisons?|casernes?|officiers?(?! de la légion d'honneur| des arts| de l'ordre)|sous-officiers?|généraux|général de (?:brigade|division|corps d'armée|l'armée)|amira(?:l|ux)|vice-amira(?:l|ux)|contre-amira(?:l|ux)|maréchal|maréchaux|colonels?|capitaines? de (?:vaisseau|frégate|corvette)|commandants?(?! de bord)|stratégies? militaires?|opérations? militaires?|campagnes? militaires?|offensives?|invasions?|guérillas?|insurrections?|mercenaires?|commandos?|forces spéciales|services? (?:secrets?|de renseignement)|espionnage|espions?|cia|kgb|mi6|dgse|mossad|voltigeurs?|hussards?|grenadiers?|tirailleurs?|zouaves?|cuirassiers?|mousquetaires?|juntes? militaires?|médailles? militaires?|croix de guerre",
  },
  Histoire: {
    kw: "histoire|historiques?|historien(?:ne)?s?|historiographie|guerres?|batailles?|combats?|conflits? armés?|révolutions?|révolutionnaires?|empires?|impéria(?:l|le|les|ux)|dynasties?|royaumes?|monarchies?|monarques?|souverains?|souveraines?|rois?|reines?|empereurs?|impératrices?|pharaons?|tsars?|tsarines?|sultans?|califes?|califats?|shoguns?|shogunat|daimyos?|samouraïs?|princes?|princesses?|principautés?|ducs?|duchesses?|duchés?|comtes?|comtesses?|marquis|marquises?|vicomtes?|vicomtesses?|barons?|baronnes?|seigneurs?|seigneuries?|nobles?|noblesse|aristocrates?|aristocratie|chevaliers?|chevalerie|féoda(?:l|le|les|ux)|antiquité|antiques?|préhistoire|préhistoriques?|paléolithique|néolithique|âge du (?:bronze|fer)|moyen âge|moyen-âge|médiéva(?:l|le|les|ux)|renaissance|ancien régime|époque (?:moderne|contemporaine|médiévale|romaine|gallo-romaine|mérovingienne|carolingienne|napoléonienne)|révolution française|premier empire|second empire|guerre mondiale|seconde guerre|première guerre|grande guerre|guerre froide|empire romain|rome antique|grèce antique|romains|romaines?|(?:empire|consul|sénateur|empereur|citoyen|droit|soldat|général|art|monde) romain|gallo-romains?|byzantins?|byzantines?|ottomans?|ottomanes?|carolingiens?|mérovingiens?|capétiens?|habsbourg|consuls?|consulat|tribus?|peuples? (?:antiques?|anciens?|autochtones?|amérindiens?)|amérindiens?|colonies?|colonia(?:l|le|les|ux)|colonisation|décolonisation|indépendance|traités? (?:de paix|de|d')|armistices?|archéologie|archéologiques?|archéologues?|assyriologues?|égyptologues?|orientalistes?|hellénistes?|latinistes?|médiévistes?|byzantinistes?|sinologues?|épigraphistes?|numismates?|chroniques?|chroniqueurs?|massacres?|génocides?|holocauste|shoah|esclavage|esclaves?|sections? révolutionnaires?|commonwealth|armoiries|emblèmes? nationa(?:l|ux)|blasons?|héraldique|drapeaux?",
  },
  Sciences: {
    kw: "sciences?|scientifiques?|recherches? scientifiques?|chercheu(?:r|se)s?|directeurs? de recherche|laboratoires?|cnrs|inserm|universités?|universitaires?|académies? des sciences|instituts? de recherche|professeurs?|professeures?|enseignants?|enseignantes?|enseignement|pédagogues?|éducat(?:eur|rice)s?|écoles?|lycées?|concours de recrutement|agrégation|mathématiques?|mathématicien(?:ne)?s?|algèbre|algébriques?|géométrie|géométriques?|arithmétique|théorèmes?|équations?|conjectures?|graphes?|topologie|probabilités?|statistiques?|suites? (?:automatiques?|numériques?|mathématiques?)|nombres? (?:premiers?|entiers?|réels?|complexes?)|physique|physicien(?:ne)?s?|mécanique quantique|quantiques?|relativité|thermodynamique|optique|électromagnétisme|magnétisme|plasmons?|résonances?|biologie|biologistes?|biologiques?|génétique|généticien(?:ne)?s?|gènes?|génomes?|adn|arn|protéines?|enzymes?|cellules?|cellulaires?|mitochondri(?:e|al|ale)s?|neurones?|neurologie|neurologues?|neurosciences?|cerveau|cérébra(?:l|le|ux)|ventriculaires?|anatomie|anatomiques?|physiologie|médecine|médica(?:l|le|les|ux)|médecins?|chirurgiens?|chirurgie|chirurgica(?:l|le|ux)|infirmi(?:er|ère)s?|pharmaciens?|pharmacologie|pharmaceutiques?|médicaments?|thérapies?|thérapeutiques?|santé|hôpita(?:l|ux)|hospitali(?:er|ère)s?|cliniques?|maladies?|pathologies?|pathologiques?|syndromes?|symptômes?|infections?|infectieu(?:x|se)s?|épidémies?|pandémies?|virus|virologie|bactériologie|bactériologistes?|spéléologues?|spéléologie|microbiologie|vaccins?|vaccination|cicatrisation|phobies?|psychologie|psychologues?|psychologiques?|psychiatrie|psychiatres?|psychiatriques?|psychanalyse|psychanalystes?|psychanalytiques?|freud|sociologie|sociologues?|sociologiques?|anthropologie|anthropologues?|ethnologie|ethnologues?|économie|économistes?|économiques?|philosophie|philosophes?|philosophiques?|linguistique|linguistes?|phonétiques?|phonologie|grammaire|géologie|géologues?|géologiques?|géophysique|sismologie|volcanologie|paléontologie|paléontologues?|fossiles?|dinosaures?|botanistes?|zoologistes?|naturalistes?|entomologistes?|ornithologues?|agronomes?|agronomie|écologie|météorologie|climatologie|océanographie|prix nobel|prix spinoza",
  },
  "Géographie & Territoires": {
    kw: "communes?|municipalités?|raïons? municipa(?:l|ux)|villes?|villages?|hameaux?|bourgs?|bourgades?|lieux-dits?|localités?|agglomérations?|unités? urbaines?|aires? urbaines?|métropoles?|capitales?|quartiers?|faubourgs?|banlieues?|arrondissements?|cantons?|départements?|régions?|provinces?|provincia(?:l|le|les|ux)|comtés?|comitats?|districts?|subdivisions?|divisions? (?:administratives?|territoriales?)|collectivités? territoriales?|intercommunalités?|communautés? (?:de communes|d'agglomération|urbaines?|rurales?)|pays (?:de|d')|territoires?|territoria(?:l|le|les|ux)|oblasts?|raïons?|krais?|voïvodies?|powiats?|gminas?|land (?:de|du)|frazione|frazioni|freguesias?|concelhos?|dèmes?|préfectures?|sous-préfectures?|wilayas?|daïras?|zones? de gouvernement local|établissements? humains?|townships?|paroisses? civiles?|fleuves?|rivières?|ruisseaux?|torrents?|cours d'eau|affluents?|estuaires?|deltas?|lacs?|étangs?|lagunes?|marais|tourbières?|réservoirs?|mers?|océans?|golfes?|baies?|anses?|fjords?|détroits?|péninsules?|presqu'îles?|îles?|îlots?|archipels?|atolls?|côtes?|littora(?:l|ux)|plages?|dunes?|continents?|déserts?|forêts?|jungles?|savanes?|steppes?|toundras?|vallées?|vallons?|plaines?|plateaux?|collines?|monts?|montagnes?|montagneu(?:x|se)s?|massifs?|chaînes? de montagnes|cordillères?|sommets?|volcans?|volcaniques?|cratères?|glaciers?|gouffres?|grottes?|cavernes?|cavités?|canyons?|gorges?|cascades?|chutes? d'eau|réserves? naturelles?|parcs? (?:naturels?|nationaux|national|régionaux|régional)|zones? (?:humides?|naturelles?|protégées?)|régions? naturelles?|stations? (?:balnéaires?|de ski|thermales?)|géographie|géographiques?|géographes?|altitude|superficie|habitants|tourisme|touristiques?|points? culminants?",
    head: "pays|bois|col|cap|pic|lieu|site",
  },
  Personnalités: {
    kw: "personnalités?(?! politiques?)|journalistes?|reporters?|avocat(?:e)?s?|juristes?|notaires?|magistrats?|chefs? cuisiniers?|cuisini(?:er|ère)s?|gastronomes?|restaurat(?:eur|rice)s?|pâtissi(?:er|ère)s?|sommeli(?:er|ère)s?|entrepreneu(?:r|se)s?|agricult(?:eur|rice)s?|critiques? gastronomiques?|hommes? d'affaires|femmes? d'affaires|manufacturi(?:er|ère)s?|banqui(?:er|ère)s?|négociants?|milliardaires?|millionnaires?|philanthropes?|mécènes?|mannequins?|top-modèles?|architectes?|urbanistes?|paysagistes?|explorat(?:eur|rice)s?|aventuri(?:er|ère)s?|alpinistes?|aviat(?:eur|rice)s?|invent(?:eur|rice)s?|activistes?|féministes?|imprimeurs?(?:-éditeurs?)?|receveurs?|influenceu(?:r|se)s?|fils de|fille de|épouse de|veuve de",
    // Noms aussi adjectifs ("zone industrielle", "rue commerçante", "navigateur web")
    head: "industriel|industrielle|marchand|marchande|commerçant|commerçante|fonctionnaire|navigateur|navigatrice",
    weight: 0.6,
  },
};

const RULES = Object.entries(THEMES).map(([name, t]) => ({
  name,
  kw: compile(t.kw),
  head: t.head ? compile(t.head) : null,
  weight: t.weight || 1,
}));

// Pondération : la description courte (`category` = description Wikidata) est le signal
// le plus fiable, puis la définition, puis le titre ; le reste du résumé ne fait que départager.
const WEIGHTS = {desc: 10, def: 7, lead: 4, title: 3, body: 0.5};
const MIN_SCORE = 1;

// Plus le mot est loin du début de la description, moins il pèse.
const positionFactor = (word) => Math.max(0.3, 1 - 0.1 * word);

// Meilleure occurrence d'un thème dans un champ positionnel (mot-clé, ou nom de tête).
function bestMatch(rule, text) {
  const candidates = [firstMatch(rule.kw, text)];
  if (rule.head) {
    const h = firstMatch(rule.head, text);
    if (h && h.word <= 1) candidates.push(h);
  }
  return candidates
    .filter(Boolean)
    .sort((a, b) => a.word - b.word || b.length - a.length)[0];
}

// Une occurrence incluse dans une expression plus longue d'un autre thème ne compte pas :
// "cheval" (Faune) dans "cheval de course" (Sports), "navire" dans "navire de guerre".
const isShadowed = (m, others) =>
  others.some(
    (o) => o !== m && o.length > m.length && o.index <= m.index && o.index + o.length >= m.index + m.length,
  );

function scoreThemes(f) {
  const totals = new Map(RULES.map((r) => [r, 0]));
  for (const field of ["desc", "def", "lead"]) {
    const text = f[field];
    if (!text) continue;
    const matches = new Map();
    for (const rule of RULES) {
      const m = bestMatch(rule, text);
      if (m) matches.set(rule, m);
    }
    const all = [...matches.values()];
    for (const [rule, m] of matches) {
      if (isShadowed(m, all)) continue;
      // + longueur : à position égale, l'expression la plus précise l'emporte
      totals.set(rule, totals.get(rule) + WEIGHTS[field] * positionFactor(m.word) + m.length * 0.01);
    }
  }
  // Un mot isolé du titre ("Pommes duchesse", "Guy Dauphin Environnement") ne suffit pas
  // quand la carte a une description qui ne confirme pas le thème.
  const hasText = Boolean(f.desc || f.def || f.lead);
  const scores = {};
  for (const rule of RULES) {
    let total = totals.get(rule);
    const t = f.title && firstMatch(rule.kw, f.title);
    if (t) total += total > 0 || !hasText || t.text.includes(" ") ? WEIGHTS.title : WEIGHTS.body;
    if (f.body && rule.kw.test(f.body)) total += WEIGHTS.body;
    if (total > 0) scores[rule.name] = Math.round(total * rule.weight * 100) / 100;
  }
  return scores;
}

// Pages d'homonymie, noms de famille, prénoms : classées avant tout le reste,
// sinon elles héritent du thème des personnes listées.
const DISAMBIG_DESC = compile(
  "pages? d'homonymie|homonymies?|noms? de famille|patronymes?|prénoms?|toponymes?",
);
const DISAMBIG_LEAD = compile(
  "peut (?:désigner|faire référence|se référer|renvoyer)|pouvant (?:désigner|faire référence)|(?:est|sont) (?:un|une|des) (?:noms?|patronymes?|prénoms?|toponymes?)(?! de code)|notamment port[ée]e?s? (?:[^.]{0,30} )?par",
);
function isDisambiguation(f) {
  const d = firstMatch(DISAMBIG_DESC, f.desc);
  if (d && d.word <= 1) return true;
  if (firstMatch(DISAMBIG_DESC, f.def)?.word === 0) return true;
  if (/\(homonymie\)/.test(f.title)) return true;
  return DISAMBIG_LEAD.test(f.leadFull);
}

const FRENCH = compile(
  "français|française|françaises|france|paris|assemblée nationale française|cinquième république|ve république|ive république|iiie république",
);
function politicsScope(f) {
  // On cherche la nationalité dans la description / définition, pas dans tout le résumé
  // (un homme politique hongrois mort à Paris reste un homme politique hongrois).
  const strong = f.desc || f.def ? `${f.desc} ${f.def} ${f.title}` : f.all;
  return FRENCH.test(strong) ? "Politique Française" : "Politique Internationale";
}

// Biographie non reconnue ("X, né le … à …") : à défaut de mieux, Personnalités.
const PERSON_LEAD =
  /(?:^|[ ,(])née? (?:le |en |à |vers )|\((?:né|née) |\([^()]*\d{3,4}\s*[-–][^()]*\d{3,4}\s*\)|, mort(?:e)? (?:le|en|à) /;

// Carte sans aucun texte dont le titre est un nom latin ("Crataegus punctata") : une espèce.
const LATIN_BINOMIAL =
  /^[A-Z][a-z]+(?: [a-z]+){1,2}$/;
const LATIN_ENDING = /(?:us|a|um|is|ensis|ii|i|ae|oides|ata|atus|ica|icus|ana|anus|ina|inus|osa|osus|ens|ans|ella|ellus|ula|ulus|ax|ex|ix|ops)$/;

// Corrections manuelles : { "Thème": [id de user_card, …] }.
// Utilisées seulement quand le moteur n'a pas de réponse fiable (aucun thème reconnu) :
// la plupart de ces entrées ont été produites par un agent IA
// pour rattraper l'ancien moteur et sont moins précises que le moteur actuel.
let manualMapping = null;
function manualCategory(userCardId) {
  if (!userCardId) return null;
  if (!manualMapping) {
    manualMapping = new Map();
    const file = path.join(__dirname, "manual_mapping_db.json");
    if (fs.existsSync(file)) {
      for (const [theme, ids] of Object.entries(JSON.parse(fs.readFileSync(file, "utf8")))) {
        for (const id of ids) manualMapping.set(id, theme);
      }
    }
  }
  return manualMapping.get(userCardId) || null;
}

function genericCategory(f) {
  if (isDisambiguation(f)) return {theme: "Divers & Homonymies", scores: {}, confident: true};
  const scores = scoreThemes(f);
  let theme = "Autre";
  let best = MIN_SCORE - 0.001;
  for (const [name, score] of Object.entries(scores)) {
    if (score > best) [theme, best] = [name, score];
  }
  // Replis quand aucun thème n'est reconnu : supposition raisonnable, mais pas fiable
  const confident = theme !== "Autre";
  if (!confident) {
    if (!f.desc && !f.leadFull && LATIN_BINOMIAL.test(f.rawTitle) && LATIN_ENDING.test(f.rawTitle))
      theme = "Faune & Flore";
    else if (PERSON_LEAD.test(f.leadFull.slice(0, 250))) theme = "Personnalités";
  }
  if (theme === "Politique") theme = politicsScope(f);
  return {theme, scores, confident};
}

// ---------------------------------------------------------------------------
// Tags par ami (1 seul tag par ami) — évalués sur le titre, la description et la
// 1re phrase du résumé, pour ignorer les mentions incidentes plus loin dans le texte.
// Note : le tiret faisant partie des mots, les composés doivent être écrits en entier
// ("sous-marin", "bosnie-herzégovine") et les préfixes porter un suffixe explicite
// (ex: 'haltérophil[a-zà-ÿ]*').
// ---------------------------------------------------------------------------

// Album de musique : "album" en tête de la description ou de la définition ("album de Bob Dylan",
// "huitième album studio d'Oddisee"), ou "(album)" dans le titre. Une chanson "extraite de
// l'album …" ne compte pas, ni un album de bande dessinée ou jeunesse.
const ALBUM = compile("albums?|mini-albums?");
function isMusicAlbum(f) {
  if (/\(album[ )]/.test(f.title)) return true;
  const atHead = [f.desc, f.def].some((t) => firstMatch(ALBUM, t)?.word <= 2);
  return (
    atHead &&
    !hasKeyword(`${f.desc} ${f.def}`, "bandes? dessinées?|bd|jeunesse|photos?|illustrée?s?|vignettes?|autocollants?|panini")
  );
}

function friendTags(card, f, genericCat) {
  const text = f.focus;
  const tags = [];

  // JulienPct (Bourse & Crypto / Monde sous-marin & poissons / Circuits & F1 / Casino / Musculation / Tous les "Julien" / Albums)
  if (
    isMusicAlbum(f) ||
    hasKeyword(
      text,
      "bourse de (?:paris|new york|londres|tokyo|francfort|bruxelles|commerce)|bourse des valeurs|boursi(?:er|ère|ers|ères)|cotée? en bourse|introduction en bourse|marchés? financiers?|cac 40|nasdaq|dow jones|wall street|nyse|euronext|trading(?! card)|trader|krach|crypto|cryptomonnaies?|crypto-monnaies?|cryptoactifs?|bitcoin|ethereum|dogecoin|blockchain|chaîne de blocs|binance|satoshi nakamoto" +
        "|monde sous-marin|faune sous-marine|flore sous-marine|vie sous-marine|grottes? sous-marines?|volcans? sous-marins?|canyons? sous-marins?|archéologie sous-marine|archéologues? sous-marins?|chasse sous-marine|photographie sous-marine|exploration sous-marine|plongée sous-marine|fonds marins|plongée|plongeur|plongeuse|apnée|requins?|poissons?|ichtyologie|actinoptérygiens?|téléostéens?|chondrichtyens?|cétacés?|baleines?|dauphins?|orques?|pieuvres?|poulpes?|calmars?|méduses?|coraux|corail|récifs?|abysses|abyssale?s?|hippocampes?|murènes?|raies? manta|jacques-yves cousteau|commandant cousteau" +
        "|circuits? automobiles?|circuit de course|autodrome|formule 1|formula one|f1|grand prix automobile|grand prix de formule 1|course automobile|sport automobile|pilote automobile|écurie de formule 1|24 heures du mans|karting|nascar|indycar|rallye|scuderia ferrari|ferrari|mclaren|red bull racing|michael schumacher|ayrton senna|alain prost|lewis hamilton|max verstappen|juan manuel fangio|monza|silverstone|spa-francorchamps|nürburgring|magny-cours|circuit paul-ricard|zandvoort" +
        "|casinos?|jeux? d'argent|jeux? de hasard|machines? à sous|roulette|poker|blackjack|baccara|croupier|las vegas|paris sportifs?" +
        "|musculation|culturisme|culturiste|bodybuilding|bodybuilder|body-building|fitness|crossfit|powerlifting|force athlétique|haltères?|stéroïdes? anabolisants?|anabolisants?|mister olympia|mr\\. olympia|arnold schwarzenegger",
    ) ||
    hasKeyword(f.title, "julien")
  ) {
    tags.push("Pour : JulienPct");
  }

  // LeadOn (Technologie & Science / Actrice X / Politique FR / Atomique)
  if (
    genericCat === "Politique Française" ||
    hasKeyword(
      text,
      "technologies?|technologiques?|informatique|ordinateurs?|logiciels?|algorithmes?|cybersécurité|intelligence artificielle|robotique|électronique|processeurs?|internet|smartphones?|sciences?|scientifiques?|physique (?:quantique|nucléaire|des particules|théorique|fondamentale)|physicien(?:ne)?s?|chimie|chimiste|biologie|biologiste|mathématiques?|mathématicien(?:ne)?|laboratoire|astronomie|astrophysique|astrophysicien(?:ne)?|génétique|théorème|équation|quantique|ingénieur|inventeur|inventrice|chercheur|chercheuse|prix nobel de (?:physique|chimie|médecine)" +
        "|actrices? x|acteurs? x|actrices? pornographiques?|acteurs? pornographiques?|pornographi[a-zà-ÿ]*|porno|films? x|cinéma x" +
        "|(?:homme|femme|personnalité|militant|militante) politique français(?:e)?|député(?:e)? français(?:e)?|sénat(?:eur|rice) français(?:e)?|ministre français(?:e)?|président de la république française|premier ministre français|sénat français|gouvernement français|élection présidentielle française|cinquième république|ve république|rassemblement national|front national|la france insoumise|europe écologie|emmanuel macron|macron|françois hollande|nicolas sarkozy|sarkozy|jacques chirac|chirac|françois mitterrand|mitterrand|charles de gaulle|giscard|georges pompidou|le pen|mélenchon|françois bayrou" +
        "|atomes?|atomiques?|nucléaires?|radioacti[a-zà-ÿ]*|isotopes?|uranium|plutonium|thorium|radium|polonium|tritium|deutérium|réacteurs? nucléaires?|fission|fusion nucléaire|centrale nucléaire|bombe a|bombe h|bombe atomique|bombe à hydrogène|bombe thermonucléaire|essai nucléaire|projet manhattan|hiroshima|nagasaki|tchernobyl|fukushima|three mile island|médecine nucléaire|radiothérapie|curiethérapie|scintigraphie|radiologie|irradiation|rayonnements? ionisants?|neutrons?|protons?|électrons?|positons?|tokamak|projet iter|réacteur iter|oppenheimer|marie curie|pierre curie|enrico fermi",
    )
  ) {
    tags.push("Pour : LeadOn");
  }

  // NOMGENERIQUE (Armes, véhicules militaires & guerre / Allemagne nazie)
  if (
    genericCat === "Militaire & Armement" ||
    hasKeyword(
      text,
      "(?<!place d')armes?(?! parlantes)|armement|arme à feu|fusils?|fusil d'assaut|carabine|pistolets?|revolver|mitrailleuses?|mitraillette|kalachnikov|ak-47|canons? (?:de|antichar|automoteur|antiaérien|anti-aérien|naval)|obusier|artillerie|lance-roquettes|lance-grenades|roquettes?|missiles?|torpilles?|bombes?|grenades? (?:à main|offensives?|défensives?|fumigènes?|lacrymogènes?)|explosifs?|mines? antipersonnel|munitions?|baïonnette|(?:épées?|sabres?)(?! (?:messieurs|dames|masculin|féminin|par équipes|individuel))|arbalète" +
        "|chars? d'assaut|chars? de combat|blindés?|véhicules? blindés?|véhicules? militaires?|véhicules? de combat|transport de troupes|avions? de chasse|avions? militaires?|chasseur-bombardier|bombardiers?|hélicoptères? de combat|porte-avions|cuirassés?|croiseurs?|destroyers?|frégates?|corvettes?|torpilleurs?|contre-torpilleurs?|vedettes?-torpilleurs?|navires? de guerre|sous-marins?|drones? militaires?" +
        "|guerres?|batailles?|conflit armé|guerre mondiale|invasion|opération militaire|armée|militaires?|soldats?|régiments?|division blindée" +
        "|allemagne nazie|nazi[a-zà-ÿ]*|troisième reich|iiie reich|hitler|adolf hitler|hitlérien[a-zà-ÿ]*|nsdap|waffen-ss|schutzstaffel|ss-[a-zà-ÿ]+|(?:officier|général|membre|division) (?:de la |des )?ss|gestapo|himmler|göring|goering|goebbels|heydrich|eichmann|mengele|rommel|rudolf hess|wehrmacht|luftwaffe|kriegsmarine|panzer[a-zà-ÿ]*|u-boot|unterseeboot|messerschmitt|führer|jeunesses hitlériennes|shoah|holocauste|auschwitz|camps? de concentration|camps? d'extermination|nuit de cristal|anschluss|croix gammée|procès de nuremberg|lois de nuremberg",
    )
  ) {
    tags.push("Pour : NOMGENERIQUE");
  }

  // Splitjerk (Haltérophilie / Personnalités problématiques / Églises avec image)
  if (
    hasKeyword(
      text,
      "haltérophil[a-zà-ÿ]*|épaulé-jeté|épaulé jeté|weightlifting" +
        "|xavier dupont de ligonnès|dupont de ligonnès|ligonnès|patrick sébastien|tonton|criminel(?:le)?s?|tueurs? en série|tueuse en série|tueurs?|tueuse|assassins?(?!'s)|meurtrier|meurtrière|pédophile|pédocriminel(?:le)?|terroristes?|violeur|escroc|gourou|condamnée? pour|personnalité controversée|figure controversée|négationniste|antisémite|dictateur|dictatrice|ben laden|staline|pol pot|mao zedong|hitler|charles manson|ted bundy|jeffrey dahmer|jeffrey epstein|harvey weinstein|michel fourniret|marc dutroux|émile louis|guy georges|francis heaulme|nordahl lelandais|landru|marcel petiot|jacques mesrine|dominique pelicot|joël le scouarnec|roman polanski|gabriel matzneff|dieudonné|gérard depardieu|patrick poivre d'arvor|pierre palmade|bertrand cantat|r\\. kelly|jimmy savile|andrew tate",
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
    !hasKeyword(
      text,
      "monty python|langages?|programmation|logiciels?|logicielle|bibliothèques?|informatiques?|modules?|frameworks?",
    );
  // Les noms de rappeurs courts ou ambigus ("jul", "sch", "soprano", "iam"…) ne comptent
  // que dans un contexte rap.
  const isFrenchRap =
    hasKeyword(
      text,
      "rap français|rap francophone|hip-hop français|rappeur français|rappeuse française|rappeur francophone|rappeur belge|booba|kaaris|nekfeu|damso|orelsan|ninho|rohff|maître gims|kery james|suprême ntm|fonky family|mc solaar|oxmo puccino|lacrim|freeze corleone|lomepal|bigflo et oli|sexion d'assaut|la fouine|youssoupha|akhenaton|heuss l'enfoiré|kalash criminel|werenoi|tiakola",
    ) ||
    (hasKeyword(text, "rap|rappeur|rappeuse|hip-hop|hip hop") &&
      hasKeyword(
        text,
        "jul|sch|pnl|gims|soprano|vald|iam|ntm|niska|gazo|laylow|sinik|diam's|disiz|seth gueko|soolking|koba lad|plk|gradur|black m",
      ));
  if (
    isPythonSnake ||
    isFrenchRap ||
    hasKeyword(
      text,
      "serpents?|ophidiens?|vipères?|couleuvres?|cobras?|boas?|mambas?|anacondas?|crotales?|serpent à sonnette|naja|taïpan|élapidés?|colubridés?|vipéridés?|elapidae|colubridae|viperidae|pythonidae|boidae" +
        "|araignées?|aranéides?|araneae|mygales?|tarentules?|veuve noire|épeires?|lycoses?|araneidae|salticidae|theridiidae" +
        "|star wars|la guerre des étoiles|lucasfilm|george lucas|jedi|sith|skywalker|dark vador|darth vader|yoda|obi-wan|chewbacca|han solo|palpatine|boba fett|kylo ren|stormtroopers?|tatooine|étoile de la mort|r2-d2|c-3po|mandalorian|clone wars",
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
      // "russe" seul exclu des translittérations "(en russe : …)" et des expressions figées
      "russie|(?<!(?:en|roulette|salade|montagnes?|poupées?) )russes?(?!\\s*:)|moscou|poutine|kremlin|staline|lénine|trotski|urss|union soviétique|soviétiques?|tsars?|tsarine|romanov|sibérie|sibérien(?:ne)?|saint-pétersbourg|leningrad|stalingrad|volgograd|oural|volga|kamtchatka|tchétchénie|bolcheviks?|révolution d'octobre|gorbatchev|eltsine|khrouchtchev|brejnev|raspoutine" +
        "|bosnie|bosnie-herzégovine|herzégovine|bosniaques?|bosniens?|sarajevo|srebrenica|mostar|banja luka|tuzla|republika srpska|guerre de bosnie|accords de dayton|izetbegović|karadžić|karadzic|mladić|mladic" +
        "|football(?! américain| canadien| australien| gaélique)|footballeur|footballeuse|ballon d'or|fifa|uefa|ligue des champions|coupe du monde de football|championnat d'europe de football|ligue 1|ligue 2|premier league|la liga|serie a|bundesliga|psg|paris saint-germain|olympique de marseille|olympique lyonnais|as saint-étienne|real madrid|fc barcelone|bayern munich|juventus|manchester united|manchester city|liverpool fc|chelsea fc|arsenal fc|ac milan|inter milan|lionel messi|messi|cristiano ronaldo|ronaldo|ronaldinho|mbappé|maradona|pelé|zinédine zidane|zidane|michel platini|johan cruyff|gardien de but|club de football|stade de football",
    )
  ) {
    tags.push("Pour : SuperMao");
  }

  // PHB (Surnaturel / Complot / Extraterrestre / Loup)
  if (
    hasKeyword(
      text,
      "surnaturel(?:le)?s?|paranorma(?:l|le|les|ux)|fantômes?|spectres?|revenants?|poltergeists?|hantée?s?|démons?|démoniaques?|possessions? démoniaques?|exorcismes?|exorcistes?|sorcellerie|sorci(?:er|ère)s?|magie noire|occultisme|occultes?|spiritisme|médiums?|voyance|vampires?|vampirisme|zombies?|goules?|loups-garous|loup-garou|lycanthrop[a-zà-ÿ]*|créatures? (?:légendaires?|fantastiques?|surnaturelles?|mythologiques?|de la mythologie)|cryptozoologie|cryptides?|yéti|bigfoot|sasquatch|monstre du loch ness|chupacabra|malédictions?|légendes? urbaines?|ésotérisme|ésotériques?|télékinésie|télépathie|parapsychologie|ectoplasmes?" +
        "|complots?|complotistes?|complotisme|conspirations?|conspirationnistes?|théories? du complot|illuminati|franc-maçonnerie|francs-maçons|franc-maçon|nouvel ordre mondial|chemtrails?|reptiliens?|platistes?|terre plate|qanon|sociétés? secrètes?|bilderberg|mk-ultra|mkultra" +
        "|extraterrestres?|extra-terrestres?|ovnis?|soucoupes? volantes?|ufo|ufologie|ufologues?|aliens?|roswell|zone 51|area 51|seti|exobiologie|astrobiologie|paradoxe de fermi|équation de drake|x-files|enlèvements? extraterrestres?" +
        // "loup de mer" est un poisson, "Mère Louve" / "louveteaux" relèvent du scoutisme
        "|loups?(?! de mer)|(?<!mère )louves?|canis lupus",
    )
  ) {
    tags.push("Pour : PHB");
  }

  // Aycee (Algérie / One Piece / Bleach)
  const isBleach =
    hasKeyword(text, "tite kubo|ichigo kurosaki|kurosaki ichigo|soul society|zanpakutō|zanpakuto|gotei 13") ||
    // "Bleach" est aussi un album de Nirvana
    (hasKeyword(text, "bleach") && !hasKeyword(text, "nirvana|kurt cobain|javel"));
  if (
    isBleach ||
    hasKeyword(
      text,
      "algérie|algériens?|algériennes?|alger|oran|kabylie|kabyles?|wilayas?|daïras?|annaba|tlemcen|béjaïa|sétif|blida|batna|tizi ouzou|tamanrasset|ghardaïa|biskra|bey de constantine|wilaya de constantine|constantinois|fln|front de libération nationale|guerre d'algérie|pieds-noirs|pied-noir|harkis?|raï|bouteflika|tebboune|boumediene|ben bella|numidie|numides?" +
        "|one piece|luffy|eiichirō oda|eiichiro oda|roronoa|nico robin|usopp|équipage du chapeau de paille|pirates du chapeau de paille|fruits? du démon|grand line|trafalgar law|portgas d\\. ace",
    )
  ) {
    tags.push("Pour : Aycee");
  }

  return tags;
}

// Renvoie les tags d'une carte : [thème générique, ...tags par ami].
// `userCardId` permet d'appliquer les corrections de manual_mapping_db.json.
function categorize(card, userCardId) {
  const f = extractFields(card);
  const generic = genericCategory(f);
  const genericCat = (!generic.confident && manualCategory(userCardId)) || generic.theme;
  return [genericCat, ...friendTags(card, f, genericCat)];
}

// Détail du calcul (scores par thème), pour le débogage et l'évaluation.
function explain(card) {
  const f = extractFields(card);
  return {fields: f, ...genericCategory(f)};
}

// ---------------------------------------------------------------------------
// Synchronisation Supabase
// ---------------------------------------------------------------------------

// Si SUPABASE_TOKEN n'est pas défini, on lit le token extrait par Playwright dans token.txt (gitignoré)
function readToken() {
  if (process.env.SUPABASE_TOKEN) return process.env.SUPABASE_TOKEN;
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "token.txt"), "utf8");
    return raw.replace(/["\s]/g, "");
  } catch (e) {
    return "YOUR_SUPABASE_TOKEN_HERE";
  }
}

const headers = {
  authorization: `Bearer ${readToken()}`,
  ...(process.env.SUPABASE_API_KEY && {apikey: process.env.SUPABASE_API_KEY}),
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
  "Pour : PHB": "#4c1d95",
  "Pour : Aycee": "#006233",
  Doublon: "#ef4444",
};

async function api(pathAndQuery, options = {}) {
  const res = await fetch(`${BASE_URL}/${pathAndQuery}`, {
    ...options,
    headers: {...headers, ...options.headers},
  });
  if (!res.ok)
    throw new Error(`${options.method || "GET"} ${pathAndQuery} → ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function fetchAll(query) {
  let rows = [];
  for (let page = 0; ; page++) {
    const batch = await api(`${query}&limit=1000&offset=${page * 1000}`);
    rows = rows.concat(batch);
    if (batch.length < 1000) return rows;
  }
}

function computeAssignments(userCards) {
  const cardCount = {};
  for (const uc of userCards) {
    if (uc.cards && uc.cards.id) cardCount[uc.cards.id] = (cardCount[uc.cards.id] || 0) + 1;
  }
  const assignments = [];
  for (const uc of userCards) {
    if (!uc.cards) continue;
    const tags = categorize(uc.cards, uc.id);
    // Doublon si l'utilisateur possède plusieurs exemplaires de cette carte
    if (uc.cards.id && cardCount[uc.cards.id] > 1) tags.push("Doublon");
    assignments.push({userCard: uc, tags: [...new Set(tags)]});
  }
  return assignments;
}

function printStats(assignments) {
  const counts = {};
  for (const a of assignments) for (const t of a.tags) counts[t] = (counts[t] || 0) + 1;
  for (const name of Object.keys(TAG_COLORS)) {
    if (counts[name]) console.log(`  ${String(counts[name]).padStart(5)}  ${name}`);
  }
}

// Tags de thème générique (un seul par carte triée) : tout sauf les tags par ami et Doublon
const isThemeTag = (name) => name !== "Doublon" && !name.startsWith("Pour : ");

// Associations actuelles d'un tag. Lecture tag par tag : une lecture globale dépasse le délai du serveur.
async function readTagged(tagId) {
  const rows = await fetchAll(`user_card_tags?select=user_card_id&tag_id=eq.${tagId}`);
  return new Set(rows.map((r) => r.user_card_id));
}

// Calcule les associations à ajouter / supprimer (par nom de tag : un tag peut ne pas encore exister).
// Mode complet : toutes les cartes sont resynchronisées sur le résultat du moteur.
// Mode newOnly : seules les cartes sans tag de thème (jamais triées) sont classées ; les cartes
// déjà triées gardent leurs tags (corrections manuelles comprises), sauf Doublon, recalculé partout.
async function planChanges(assignments, existingTags, {newOnly}) {
  const wanted = Object.fromEntries(Object.keys(TAG_COLORS).map((name) => [name, new Set()]));
  for (const {userCard, tags} of assignments) for (const t of tags) wanted[t].add(userCard.id);

  // Plusieurs tags peuvent porter le même nom : le 1er est conservé, les autres sont des doublons à supprimer
  const idsByName = {};
  for (const tag of existingTags) if (tag.name in TAG_COLORS) (idsByName[tag.name] ||= []).push(tag.id);

  console.log("Reading current automatic tag assignments...");
  const current = new Map();
  for (const ids of Object.values(idsByName)) for (const id of ids) current.set(id, await readTagged(id));

  let fresh = null;
  let inScope = () => true;
  let mayDelete = () => true;
  if (newOnly) {
    const sorted = new Set();
    for (const [name, ids] of Object.entries(idsByName))
      if (isThemeTag(name)) for (const id of ids) for (const ucId of current.get(id)) sorted.add(ucId);
    fresh = new Set(assignments.map((a) => a.userCard.id).filter((id) => !sorted.has(id)));
    inScope = (name, ucId) => name === "Doublon" || fresh.has(ucId);
    mayDelete = (name) => name === "Doublon";
  }

  const toInsert = [];
  const toDelete = [];
  const extraTagIds = [];
  for (const [name, want] of Object.entries(wanted)) {
    const [primary, ...extras] = idsByName[name] || [];
    const have = current.get(primary) || new Set();
    for (const id of want) if (!have.has(id) && inScope(name, id)) toInsert.push({name, userCardId: id});
    const stale = [...have].filter((id) => !want.has(id) && inScope(name, id) && mayDelete(name));
    if (stale.length) toDelete.push({name, tagId: primary, ids: stale});
    if (newOnly) continue;
    for (const id of extras) {
      if (current.get(id).size) toDelete.push({name, tagId: id, ids: [...current.get(id)]});
      extraTagIds.push(id);
    }
  }
  return {fresh, toInsert, toDelete, extraTagIds};
}

async function processCards({dryRun = false, newOnly = false} = {}) {
  console.log("Fetching tags and cards...");
  const existingTags = await api("tags?select=*");
  const userCards = await fetchAll("user_cards?select=*,cards(*)");
  const userId = existingTags[0]?.user_id || userCards[0]?.user_id;
  if (!userId) throw new Error("Impossible de déterminer l'utilisateur (aucun tag ni carte).");

  const assignments = computeAssignments(userCards);
  const {fresh, toInsert, toDelete, extraTagIds} = await planChanges(assignments, existingTags, {newOnly});
  const scoped = fresh ? assignments.filter((a) => fresh.has(a.userCard.id)) : assignments;
  console.log(
    fresh
      ? `${fresh.size} carte(s) non triée(s) sur ${userCards.length} :`
      : `${userCards.length} cartes classées :`,
  );
  printStats(scoped);

  const title = new Map(userCards.map((uc) => [uc.id, uc.cards?.wikipedia_title]));
  if (fresh) for (const {userCard, tags} of scoped) console.log(`  + ${userCard.cards.wikipedia_title} → ${tags.join(", ")}`);
  const doublonAdds = toInsert.filter((i) => i.name === "Doublon" && !fresh?.has(i.userCardId));
  const doublonDels = toDelete.filter((d) => d.name === "Doublon").flatMap((d) => d.ids);
  for (const i of doublonAdds) console.log(`  + Doublon : ${title.get(i.userCardId)}`);
  for (const id of doublonDels) console.log(`  - Doublon : ${title.get(id)}`);
  const deleteCount = toDelete.reduce((n, d) => n + d.ids.length, 0);
  console.log(`${toInsert.length} association(s) à ajouter, ${deleteCount} à supprimer.`);

  if (dryRun) {
    const report = scoped.map(({userCard: uc, tags}) => ({
      user_card_id: uc.id,
      title: uc.cards.wikipedia_title,
      category: uc.cards.category,
      tags,
    }));
    const out = path.join(__dirname, "..", "dry-run.json");
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`Dry run : aucune écriture en base. Détail dans ${out}`);
    return;
  }

  // Seuls les tags gérés par ce script (TAG_COLORS) sont mis à jour : les tags créés
  // à la main par l'utilisateur et leurs associations ne sont jamais touchés.
  const unmanaged = existingTags.filter((t) => !(t.name in TAG_COLORS)).map((t) => t.name);
  if (unmanaged.length) console.log(`Tags personnels conservés : ${unmanaged.join(", ")}`);

  const tagMap = {};
  for (const tag of existingTags) if (tag.name in TAG_COLORS && !tagMap[tag.name]) tagMap[tag.name] = tag;
  for (const [name, color] of Object.entries(TAG_COLORS)) {
    const tag = tagMap[name];
    if (tag) {
      if (tag.color !== color) await api(`tags?id=eq.${tag.id}`, {method: "PATCH", body: JSON.stringify({color})});
      continue;
    }
    // Pas de tag vide en mode --new-only (un ancien tag supprimé à la main n'est pas recréé pour rien)
    if (newOnly && !toInsert.some((i) => i.name === name)) continue;
    const [created] = await api("tags?select=*", {
      method: "POST",
      headers: {Prefer: "return=representation"},
      body: JSON.stringify({user_id: userId, name, color}),
    });
    tagMap[name] = created;
  }

  // On n'écrit que les différences avec l'existant (la base est lente et une suppression
  // massive peut dépasser le délai du serveur). Ajouts d'abord, suppressions ensuite :
  // si le script s'interrompt, une carte a au pire un tag en trop, jamais un tag en moins.
  const rows = toInsert.map((i) => ({user_card_id: i.userCardId, tag_id: tagMap[i.name].id}));
  let failed = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    try {
      await api("user_card_tags", {
        method: "POST",
        headers: {Prefer: "resolution=ignore-duplicates"},
        body: JSON.stringify(chunk),
      });
    } catch (e) {
      // Un lot refusé : on réessaie ligne par ligne pour ne perdre que les lignes fautives
      for (const item of chunk) {
        try {
          await api("user_card_tags", {
            method: "POST",
            headers: {Prefer: "resolution=ignore-duplicates"},
            body: JSON.stringify([item]),
          });
        } catch (err) {
          failed++;
          if (failed <= 5) console.error(err.message);
        }
      }
    }
  }

  for (const {tagId, ids} of toDelete) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100).join(",");
      await api(`user_card_tags?tag_id=eq.${tagId}&user_card_id=in.(${chunk})`, {method: "DELETE"});
    }
  }
  for (const id of extraTagIds) await api(`tags?id=eq.${id}`, {method: "DELETE"});

  console.log(failed ? `Terminé avec ${failed} ajout(s) en échec.` : "Synchronisation terminée.");
}

if (require.main === module)
  processCards({
    dryRun: process.argv.includes("--dry-run"),
    newOnly: process.argv.includes("--new-only"),
  }).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
module.exports = {categorize, explain, hasKeyword};

// Profils d'intérêts de la bande : chaque profil génère le tag « Pour : <name> ».
// Format des règles : voir core/profiles.js. Un profil s'applique si l'une de ses règles s'applique.
// Les règles sont évaluées sur le titre, la description et la 1re phrase du résumé (`focus`),
// pour ignorer les mentions incidentes plus loin dans le texte.
// Note : le tiret faisant partie des mots, les composés doivent être écrits en entier
// ("sous-marin", "bosnie-herzégovine") et les préfixes porter un suffixe explicite
// (ex: 'haltérophil[a-zà-ÿ]*').
"use strict";

const BUILTIN_PROFILES = [
  {
    name: "JulienPct",
    color: "#0ea5e9",
    about: "Bourse & Crypto, monde sous-marin & poissons, circuits & F1, casino, musculation, les « Julien », albums",
    rules: [
      {match: "musicAlbum"},
      {
        kw:
          "bourse de (?:paris|new york|londres|tokyo|francfort|bruxelles|commerce)|bourse des valeurs|boursi(?:er|ère|ers|ères)|cotée? en bourse|introduction en bourse|marchés? financiers?|cac 40|nasdaq|dow jones|wall street|nyse|euronext|trading(?! card)|trader|krach|crypto|cryptomonnaies?|crypto-monnaies?|cryptoactifs?|bitcoin|ethereum|dogecoin|blockchain|chaîne de blocs|binance|satoshi nakamoto" +
          "|monde sous-marin|faune sous-marine|flore sous-marine|vie sous-marine|grottes? sous-marines?|volcans? sous-marins?|canyons? sous-marins?|archéologie sous-marine|archéologues? sous-marins?|chasse sous-marine|photographie sous-marine|exploration sous-marine|plongée sous-marine|fonds marins|plongée|plongeur|plongeuse|apnée|requins?|poissons?|ichtyologie|actinoptérygiens?|téléostéens?|chondrichtyens?|cétacés?|baleines?|dauphins?|orques?|pieuvres?|poulpes?|calmars?|méduses?|coraux|corail|récifs?|abysses|abyssale?s?|hippocampes?|murènes?|raies? manta|jacques-yves cousteau|commandant cousteau" +
          "|circuits? automobiles?|circuit de course|autodrome|formule 1|formula one|f1|grand prix automobile|grand prix de formule 1|course automobile|sport automobile|pilote automobile|écurie de formule 1|24 heures du mans|karting|nascar|indycar|rallye|scuderia ferrari|ferrari|mclaren|red bull racing|michael schumacher|ayrton senna|alain prost|lewis hamilton|max verstappen|juan manuel fangio|monza|silverstone|spa-francorchamps|nürburgring|magny-cours|circuit paul-ricard|zandvoort" +
          "|casinos?|jeux? d'argent|jeux? de hasard|machines? à sous|roulette|poker|blackjack|baccara|croupier|las vegas|paris sportifs?" +
          "|musculation|culturisme|culturiste|bodybuilding|bodybuilder|body-building|fitness|crossfit|powerlifting|force athlétique|haltères?|stéroïdes? anabolisants?|anabolisants?|mister olympia|mr\\. olympia|arnold schwarzenegger",
      },
      {kw: "julien", field: "title"},
    ],
  },
  {
    name: "LeadOn",
    color: "#ec4899",
    about: "Technologie & science, actrices X, politique française, atomique",
    rules: [
      {theme: "Politique Française"},
      {
        kw:
          "technologies?|technologiques?|informatique|ordinateurs?|logiciels?|algorithmes?|cybersécurité|intelligence artificielle|robotique|électronique|processeurs?|internet|smartphones?|sciences?|scientifiques?|physique (?:quantique|nucléaire|des particules|théorique|fondamentale)|physicien(?:ne)?s?|chimie|chimiste|biologie|biologiste|mathématiques?|mathématicien(?:ne)?|laboratoire|astronomie|astrophysique|astrophysicien(?:ne)?|génétique|théorème|équation|quantique|ingénieur|inventeur|inventrice|chercheur|chercheuse|prix nobel de (?:physique|chimie|médecine)" +
          "|actrices? x|acteurs? x|actrices? pornographiques?|acteurs? pornographiques?|pornographi[a-zà-ÿ]*|porno|films? x|cinéma x" +
          "|(?:homme|femme|personnalité|militant|militante) politique français(?:e)?|député(?:e)? français(?:e)?|sénat(?:eur|rice) français(?:e)?|ministre français(?:e)?|président de la république française|premier ministre français|sénat français|gouvernement français|élection présidentielle française|cinquième république|ve république|rassemblement national|front national|la france insoumise|europe écologie|emmanuel macron|macron|françois hollande|nicolas sarkozy|sarkozy|jacques chirac|chirac|françois mitterrand|mitterrand|charles de gaulle|giscard|georges pompidou|le pen|mélenchon|françois bayrou" +
          "|atomes?|atomiques?|nucléaires?|radioacti[a-zà-ÿ]*|isotopes?|uranium|plutonium|thorium|radium|polonium|tritium|deutérium|réacteurs? nucléaires?|fission|fusion nucléaire|centrale nucléaire|bombe a|bombe h|bombe atomique|bombe à hydrogène|bombe thermonucléaire|essai nucléaire|projet manhattan|hiroshima|nagasaki|tchernobyl|fukushima|three mile island|médecine nucléaire|radiothérapie|curiethérapie|scintigraphie|radiologie|irradiation|rayonnements? ionisants?|neutrons?|protons?|électrons?|positons?|tokamak|projet iter|réacteur iter|oppenheimer|marie curie|pierre curie|enrico fermi",
      },
    ],
  },
  {
    name: "NOMGENERIQUE",
    color: "#475569",
    about: "Armes, véhicules militaires & guerre, Allemagne nazie",
    rules: [
      {theme: "Militaire & Armement"},
      {
        kw:
          "(?<!place d')armes?(?! parlantes)|armement|arme à feu|fusils?|fusil d'assaut|carabine|pistolets?|revolver|mitrailleuses?|mitraillette|kalachnikov|ak-47|canons? (?:de|antichar|automoteur|antiaérien|anti-aérien|naval)|obusier|artillerie|lance-roquettes|lance-grenades|roquettes?|missiles?|torpilles?|bombes?|grenades? (?:à main|offensives?|défensives?|fumigènes?|lacrymogènes?)|explosifs?|mines? antipersonnel|munitions?|baïonnette|(?:épées?|sabres?)(?! (?:messieurs|dames|masculin|féminin|par équipes|individuel))|arbalète" +
          "|chars? d'assaut|chars? de combat|blindés?|véhicules? blindés?|véhicules? militaires?|véhicules? de combat|transport de troupes|avions? de chasse|avions? militaires?|chasseur-bombardier|bombardiers?|hélicoptères? de combat|porte-avions|cuirassés?|croiseurs?|destroyers?|frégates?|corvettes?|torpilleurs?|contre-torpilleurs?|vedettes?-torpilleurs?|navires? de guerre|sous-marins?|drones? militaires?" +
          "|guerres?|batailles?|conflit armé|guerre mondiale|invasion|opération militaire|armée|militaires?|soldats?|régiments?|division blindée" +
          "|allemagne nazie|nazi[a-zà-ÿ]*|troisième reich|iiie reich|hitler|adolf hitler|hitlérien[a-zà-ÿ]*|nsdap|waffen-ss|schutzstaffel|ss-[a-zà-ÿ]+|(?:officier|général|membre|division) (?:de la |des )?ss|gestapo|himmler|göring|goering|goebbels|heydrich|eichmann|mengele|rommel|rudolf hess|wehrmacht|luftwaffe|kriegsmarine|panzer[a-zà-ÿ]*|u-boot|unterseeboot|messerschmitt|führer|jeunesses hitlériennes|shoah|holocauste|auschwitz|camps? de concentration|camps? d'extermination|nuit de cristal|anschluss|croix gammée|procès de nuremberg|lois de nuremberg",
      },
    ],
  },
  {
    name: "Splitjerk",
    color: "#eab308",
    about: "Haltérophilie, personnalités problématiques, églises (avec image)",
    rules: [
      {
        kw:
          "haltérophil[a-zà-ÿ]*|épaulé-jeté|épaulé jeté|weightlifting" +
          "|xavier dupont de ligonnès|dupont de ligonnès|ligonnès|patrick sébastien|tonton|criminel(?:le)?s?|tueurs? en série|tueuse en série|tueurs?|tueuse|assassins?(?!'s)|meurtrier|meurtrière|pédophile|pédocriminel(?:le)?|terroristes?|violeur|escroc|gourou|condamnée? pour|personnalité controversée|figure controversée|négationniste|antisémite|dictateur|dictatrice|ben laden|staline|pol pot|mao zedong|hitler|charles manson|ted bundy|jeffrey dahmer|jeffrey epstein|harvey weinstein|michel fourniret|marc dutroux|émile louis|guy georges|francis heaulme|nordahl lelandais|landru|marcel petiot|jacques mesrine|dominique pelicot|joël le scouarnec|roman polanski|gabriel matzneff|dieudonné|gérard depardieu|patrick poivre d'arvor|pierre palmade|bertrand cantat|r\\. kelly|jimmy savile|andrew tate",
      },
      {
        kw:
          "églises?|cathédrales?|chapelles?|basiliques?|collégiale|abbayes?|abbatiale|prieuré|temples?|monastères?",
        image: true,
      },
    ],
  },
  {
    name: "Oaffew",
    color: "#22c55e",
    about: "Serpents, araignées, animaux & insectes (avec image), Star Wars, rap français",
    rules: [
      // Python le serpent, pas le langage
      {
        kw: "python",
        unless:
          "monty python|langages?|programmation|logiciels?|logicielle|bibliothèques?|informatiques?|modules?|frameworks?",
      },
      // Les noms de rappeurs courts ou ambigus ("jul", "sch", "soprano", "iam"…) ne comptent que dans un contexte rap
      {
        kw:
          "rap français|rap francophone|hip-hop français|rappeur français|rappeuse française|rappeur francophone|rappeur belge|booba|kaaris|nekfeu|damso|orelsan|ninho|rohff|maître gims|kery james|suprême ntm|fonky family|mc solaar|oxmo puccino|lacrim|freeze corleone|lomepal|bigflo et oli|sexion d'assaut|la fouine|youssoupha|akhenaton|heuss l'enfoiré|kalash criminel|werenoi|tiakola",
      },
      {
        kw: "rap|rappeur|rappeuse|hip-hop|hip hop",
        with:
          "jul|sch|pnl|gims|soprano|vald|iam|ntm|niska|gazo|laylow|sinik|diam's|disiz|seth gueko|soolking|koba lad|plk|gradur|black m",
      },
      {
        kw:
          "serpents?|ophidiens?|vipères?|couleuvres?|cobras?|boas?|mambas?|anacondas?|crotales?|serpent à sonnette|naja|taïpan|élapidés?|colubridés?|vipéridés?|elapidae|colubridae|viperidae|pythonidae|boidae" +
          "|araignées?|aranéides?|araneae|mygales?|tarentules?|veuve noire|épeires?|lycoses?|araneidae|salticidae|theridiidae" +
          "|star wars|la guerre des étoiles|lucasfilm|george lucas|jedi|sith|skywalker|dark vador|darth vader|yoda|obi-wan|chewbacca|han solo|palpatine|boba fett|kylo ren|stormtroopers?|tatooine|étoile de la mort|r2-d2|c-3po|mandalorian|clone wars",
      },
      {
        kw:
          "animal|animaux|insectes?|bestioles?|coléoptères?|lépidoptères?|diptères?|hyménoptères?|hémiptères?|orthoptères?|papillons?|fourmis?|abeilles?|guêpes?|frelons?|mouches?|moustiques?|scarabées?|coccinelles?|libellules?|sauterelles?|criquets?|cafards?|blattes?|punaises?|mammifères?|oiseaux|oiseau|poissons?|reptiles?|amphibiens?|batraciens?|grenouilles?|crapauds?|lézards?|tortues?|crocodiles?|félins?|canidés?|primates?|singes?|rongeurs?|chauves-souris|chauve-souris|marsupiaux|marsupial|mollusques?|crustacés?|escargots?|cétacés?",
        image: true,
      },
    ],
  },
  {
    name: "SuperMao",
    color: "#dc2626",
    about: "Russie, Bosnie, football",
    rules: [
      {
        kw:
          // "russe" seul exclu des translittérations "(en russe : …)" et des expressions figées
          "russie|(?<!(?:en|roulette|salade|montagnes?|poupées?) )russes?(?!\\s*:)|moscou|poutine|kremlin|staline|lénine|trotski|urss|union soviétique|soviétiques?|tsars?|tsarine|romanov|sibérie|sibérien(?:ne)?|saint-pétersbourg|leningrad|stalingrad|volgograd|oural|volga|kamtchatka|tchétchénie|bolcheviks?|révolution d'octobre|gorbatchev|eltsine|khrouchtchev|brejnev|raspoutine" +
          "|bosnie|bosnie-herzégovine|herzégovine|bosniaques?|bosniens?|sarajevo|srebrenica|mostar|banja luka|tuzla|republika srpska|guerre de bosnie|accords de dayton|izetbegović|karadžić|karadzic|mladić|mladic" +
          "|football(?! américain| canadien| australien| gaélique)|footballeur|footballeuse|ballon d'or|fifa|uefa|ligue des champions|coupe du monde de football|championnat d'europe de football|ligue 1|ligue 2|premier league|la liga|serie a|bundesliga|psg|paris saint-germain|olympique de marseille|olympique lyonnais|as saint-étienne|real madrid|fc barcelone|bayern munich|juventus|manchester united|manchester city|liverpool fc|chelsea fc|arsenal fc|ac milan|inter milan|lionel messi|messi|cristiano ronaldo|ronaldo|ronaldinho|mbappé|maradona|pelé|zinédine zidane|zidane|michel platini|johan cruyff|gardien de but|club de football|stade de football",
      },
    ],
  },
  {
    name: "PHB",
    color: "#4c1d95",
    about: "Surnaturel, complots, extraterrestres, loups",
    rules: [
      {
        kw:
          "surnaturel(?:le)?s?|paranorma(?:l|le|les|ux)|fantômes?|spectres?|revenants?|poltergeists?|hantée?s?|démons?|démoniaques?|possessions? démoniaques?|exorcismes?|exorcistes?|sorcellerie|sorci(?:er|ère)s?|magie noire|occultisme|occultes?|spiritisme|médiums?|voyance|vampires?|vampirisme|zombies?|goules?|loups-garous|loup-garou|lycanthrop[a-zà-ÿ]*|créatures? (?:légendaires?|fantastiques?|surnaturelles?|mythologiques?|de la mythologie)|cryptozoologie|cryptides?|yéti|bigfoot|sasquatch|monstre du loch ness|chupacabra|malédictions?|légendes? urbaines?|ésotérisme|ésotériques?|télékinésie|télépathie|parapsychologie|ectoplasmes?" +
          "|complots?|complotistes?|complotisme|conspirations?|conspirationnistes?|théories? du complot|illuminati|franc-maçonnerie|francs-maçons|franc-maçon|nouvel ordre mondial|chemtrails?|reptiliens?|platistes?|terre plate|qanon|sociétés? secrètes?|bilderberg|mk-ultra|mkultra" +
          "|extraterrestres?|extra-terrestres?|ovnis?|soucoupes? volantes?|ufo|ufologie|ufologues?|aliens?|roswell|zone 51|area 51|seti|exobiologie|astrobiologie|paradoxe de fermi|équation de drake|x-files|enlèvements? extraterrestres?" +
          // "loup de mer" est un poisson, "Mère Louve" / "louveteaux" relèvent du scoutisme
          "|loups?(?! de mer)|(?<!mère )louves?|canis lupus",
      },
    ],
  },
  {
    name: "Aycee",
    color: "#006233",
    about: "Algérie, One Piece, Bleach",
    rules: [
      {kw: "tite kubo|ichigo kurosaki|kurosaki ichigo|soul society|zanpakutō|zanpakuto|gotei 13"},
      // "Bleach" est aussi un album de Nirvana
      {kw: "bleach", unless: "nirvana|kurt cobain|javel"},
      {
        kw:
          "algérie|algériens?|algériennes?|alger|oran|kabylie|kabyles?|wilayas?|daïras?|annaba|tlemcen|béjaïa|sétif|blida|batna|tizi ouzou|tamanrasset|ghardaïa|biskra|bey de constantine|wilaya de constantine|constantinois|fln|front de libération nationale|guerre d'algérie|pieds-noirs|pied-noir|harkis?|raï|bouteflika|tebboune|boumediene|ben bella|numidie|numides?" +
          "|one piece|luffy|eiichirō oda|eiichiro oda|roronoa|nico robin|usopp|équipage du chapeau de paille|pirates du chapeau de paille|fruits? du démon|grand line|trafalgar law|portgas d\\. ace",
      },
    ],
  },
  {
    name: "KKIIMM_",
    color: "#d946ef",
    about: "Tout ce qui est mignon (chiots, chatons, kawaii…), mathématiques, High School Musical, K-pop",
    rules: [
      {
        kw:
          "kawaii|mignon(?:ne)?s?|mignonnerie|adorables?|chibi|peluches?|ours en peluche|nounours|doudous?|hello kitty|sanrio|my melody|kuromi|cinnamoroll|pompompurin|pochacco|keroppi|rilakkuma|sumikko gurashi|gudetama|aggretsuko|pusheen|molang|squishmallows?|tamagotchi|furby|sylvanian families|littlest pet shop|my little pony|mon petit poney|bisounours|care bears|pikachu|évoli|rondoudou|totoro|ponyo|hamtaro|lilo et stitch|lilo & stitch|winnie l'ourson|barbapapa|animal crossing",
      },
      // Kirby le personnage de Nintendo, pas Jack Kirby
      {kw: "kirby", with: "jeux? vidéos?|nintendo|hal laboratory"},
      // "chat" / "chien" seuls sont trop ambigus (poisson-chat, constellation des Chiens de chasse…)
      {
        kw:
          "chiots?|chatons?|races? de (?:chiens?|chats?|lapins?|cochons? d'inde|hamsters?)|(?:chiens?|chats?) (?:de race|de compagnie|domestiques?|célèbres?|de fiction)|chiennes?|felis (?:silvestris )?catus|canis (?:lupus )?familiaris|animal de compagnie|animaux de compagnie" +
          "|lapins?|lapereaux|hamsters?|cochons? d'inde|gerbilles?|chinchillas?|furets?|hérissons?|écureuils?|loutres?|pandas?|koalas?|quokkas?|fennecs?|suricates?|alpagas?|axolotls?|capybaras?|wombats?|manchots?|pingouins?|bébés? phoques?|bébés? animaux",
        unless: "star wars|fiat|python|logiciels?|bandit manchot|batman|gotham|laponie|hélicoptères?",
      },
      {
        kw:
          "maths?|mathématiques?|mathématicien(?:ne)?s?|théorèmes?|conjectures?|lemmes?|équations?|algèbres?|algébriques?|géométrie|géométriques?|arithmétiques?|topologie|topologiques?|probabilités?|statistiques?|statisticien(?:ne)?s?|nombres? premiers?|nombres? entiers?|entiers? naturels?|nombres? (?:réels?|complexes?|rationnels?|irrationnels?|transcendants?|surréels?|parfaits?)|nombre d'or|nombre pi|constante mathématique|fractales?|polynômes?|polynomiale?s?|polygones?|polyèdres?|polytopes?|trigonométrie|trigonométriques?|logarithmes?|intégrales? (?:de|d'|impropres?)|calcul (?:différentiel|intégral|infinitésimal)|espaces? vectoriels?|théorie des (?:graphes|nombres|ensembles|groupes|catégories|jeux)|suite de fibonacci|fibonacci|médaille fields|prix abel|euclide|pythagore|sudoku|ruban de möbius|bouteille de klein",
      },
      {
        kw:
          "high school musical|troy bolton|gabriella montez|sharpay(?: evans)?|chad danforth|taylor mckessie|kelsi nielsen|zac efron|vanessa hudgens|ashley tisdale|lucas grabeel|corbin bleu|monique coleman|kenny ortega",
      },
      {
        kw:
          "k-pop|kpop|hallyu|vague coréenne|bangtan boys|blackpink|stray kids|newjeans|le sserafim|aespa|itzy|red velvet|girls' generation|super junior|shinee|got7|ateez|mamamoo|2ne1|enhypen|tomorrow x together|i-dle|monsta x|babymonster|gangnam style|g-dragon|jungkook|jimin|kim tae-hyung|jisoo|hybe|big hit music|big hit entertainment|sm entertainment|yg entertainment|jyp entertainment|mnet asian music awards|mama awards|produce 101",
      },
      // Noms courts ou ambigus ("BTS" est aussi un diplôme, "Big Bang" une théorie, "Rosé" un vin) : seulement en contexte coréen
      {
        kw: "bts|bigbang|big bang|twice|exo|seventeen|ive|nct|txt|psy|jennie|lisa|rosé|suga|iu",
        with: "sud-coréen(?:ne)?s?|corée du sud|séoul|k-pop|kpop",
      },
      // Artistes et titres sud-coréens ("coréen" seul apparaît dans les transcriptions "(en coréen : …)")
      {
        kw: "sud-coréen(?:ne)?s?|corée du sud",
        with:
          "chanteu(?:r|se)s?|chansons?|singles?|albums?|ep|mini-albums?|boys? band|boysband|girl group|girls? band|groupe (?:de musique|musical|vocal|pop)|rappeu(?:r|se)s?|idoles?|clips?",
        unless: "opéra|lyriques?|soprano|mezzo-soprano|ténor|baryton|pansori|trot|musique classique",
      },
    ],
  },
];

module.exports = {BUILTIN_PROFILES};

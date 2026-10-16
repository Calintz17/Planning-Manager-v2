# CAST — contrat de priorité et direction sombre, après clarification Roman
16 octobre 2026 — Astra — note pour Claude, sans modification de production.

## Source vérifiée et limites
Lecture du fichier `retail.html` du dépôt, titre 9.3.5, blob `d8a9208c7c97ac5ec9c41d3e2373bf7b38b39f2d`. Ce contrôle porte sur le code de la version destinée à la production ; il ne certifie pas le contenu effectivement servi par un CDN, ni un nouveau rendu navigateur. Pas de nouvelle note globale : aucune batterie complète 9.3.5 exécutée dans cette passe. La note 58/100 concernait la 9.3.3.

Plusieurs corrections existent maintenant : `lateCodes` vers 3376 utilise ceil(N/4), et `applyCellOverride` vers 5132 appelle une validation avant écriture (hors absence factuelle). Ne pas reconduire mécaniquement les conclusions 9.3.3.

## 1. Clarification impérative
Les contraintes obligatoires s'appliquent au planning COMPLET, pas à un rôle arbitraire.
Deux managers peuvent ouvrir si un vendeur admissible ferme. « Un manager ferme » est une heuristique, sauf règle explicite distincte exigeant un responsable en fermeture. Ne pas inventer cette règle.

La législation et les contraintes strictes ne sont jamais des composantes pondérées du score. Elles définissent l'ensemble des plans autorisés. Les minima d'ouverture/fermeture sont des obligations opérationnelles dans CAST, pas une qualification juridique universelle.

Distinguer les données factuelles (absence réelle), les contraintes strictes, les commandes manuelles actuelles, les préférences déclarées et l'historique appris. Une absence réelle doit être enregistrable même si elle rend la couverture impossible ; le planning résultant n'est alors pas certifié conforme.

## 2. Modèle mathématique

x[a,d,s] vaut 1 si a travaille le shift s le jour d, 0 sinon. OFF est représenté par aucun shift travaillé ce jour-là. Une extension x[a,d,s,c] ajoute le corner lorsque nécessaire.

Au plus un shift par personne/jour : Σ_s x[a,d,s] ≤ 1.
Disponibilité et qualification : x[a,d,s] ≤ A[a,d,s].
Heures semaine : Σ_{d∈w,s} h[a,d,s] x[a,d,s] + hOUT[a,w] ≤ H[a,w].
Jours semaine : Σ_{d∈w}(Σ_s x[a,d,s] + OUT[a,d]) ≤ J[a,w].
Série maximale K : toute fenêtre glissante de K+1 jours contient au plus K jours travaillés, OUT inclus lorsqu'il compte comme travail.
Repos : interdire chaque paire de shifts successifs dont l'intervalle de repos est inférieur au réglage applicable.
Contrats et semaines à cheval : inclure les affectations extérieures au mois, sans inventer les données inconnues.
Les heures de formation OUT doivent avoir une source ; si elles sont inconnues, ne pas certifier les heures par défaut en les comptant zéro.

Pour une boutique ouverte de o_d à c_d :
O[s,d] = 1 si début_s ≤ o_d ET fin_s ≥ min(c_d,o_d+60 min).
C[s,d] = 1 si début_s ≤ max(o_d,c_d−60 min) ET fin_s ≥ c_d.
Couverture obligatoire : Σ_{a admissibles,s} O[s,d] x[a,d,s] ≥ mO[d] ; idem C et mC[d].
Les agents admissibles viennent de la règle de couverture (vendeur/manager, etc.), pas d'une préférence algorithmique.
Si les pauses sont incluses dans le niveau contrôlé, utiliser la présence nette et exiger la couverture sur CHAQUE créneau de l'heure. Un simple chevauchement à 9h ne suffit pas à couvrir 9h–10h.
Appliquer de même les contraintes de corner explicitement retenues, sans transformer automatiquement chaque souhait en obligation.

F = {x : toutes les contraintes obligatoires ci-dessus sont satisfaites}.
Aucun historique, objectif late ou gain trafic ne peut autoriser x hors de F.

### Manuel actuel
M est l'ensemble des décisions explicites actuelles.
F_M = {x∈F : x respecte M}.
Si F_M est non vide, toutes les décisions M sont conservées.
Si aucune solution n'est trouvée, chercher d'abord une compensation sur les cases automatiques et les jours admissibles. Ne pas modifier silencieusement M. Demander quelle décision contradictoire peut être relâchée, ou constater le besoin de ressources/paramètres différents.
Un échec de l'heuristique n'est pas une preuve que F_M est vide. Les états doivent distinguer « solution conforme trouvée », « aucune solution trouvée », « conflit démontré » et « données incomplètes ».

### Hiérarchie des préférences
Interprétation de la clarification « règles strictes, puis manager, puis calculs » :
minimisation LEXICOGRAPHIQUE sur F_M de :
(D_pref, D_hist, D_late, E_trafic, D_stabilité).

D_pref : écarts aux préférences déclarées actuellement par le manager.
D_hist : incompatibilité avec les décisions managériales passées, incluant OFF, jours travaillés, shifts et corners selon données disponibles.
D_late : écart à la cible de late.
E_trafic : écart entre présence nette et besoin horaire.
D_stabilité : changements inutiles, seulement pour départager à égalité.

Une préférence actuelle explicite est plus récente et plus précise qu'une habitude déduite. Cette distinction évite que l'historique annule une nouvelle instruction.
La priorité de l'apprentissage sur late est ici l'interprétation littérale de la dernière clarification. Elle remplace la proposition précédente d'Astra « late avant habitudes », qui n'avait pas été approuvée. Conséquence à rendre visible : l'historique peut empêcher d'atteindre la cible late, mais jamais une règle obligatoire.
Si Roman veut au contraire rendre la cible late impérative, il faut la déclarer comme contrainte distincte ; ce n'est pas équivalent à « manager avant calculs ».

Exemple simple de coût historique :
D_hist = Σ_{a,d} w[a,d] (1 − p[a,d,choix(x)]).
p est la probabilité apprise ; w représente la confiance/support. Absence de données ⇒ w=0, pas préférence inventée.
Ne pas confondre score appris et verrou de case. Plusieurs personnes peuvent échanger des shifts en conservant un meilleur score global.
Avant de fusionner plusieurs dimensions historiques, définir leurs normalisations ; ne pas laisser le nombre de cases d'une dimension imposer son poids accidentellement. Conserver la formule d'apprentissage existante pendant la refonte du contrôle.

Late : catalogue trié début puis fin, k=ceil(N/4), derniers k shifts.
ℓ_s = 1 si s est late.
L_d = r_d P_d ; D_late = Σ_d |Σ_{a∈populationLate,s} ℓ_s x[a,d,s] − L_d|.
La cible réelle rP évite d'inventer un biais d'arrondi ; les deux entiers équidistants sont départagés par les niveaux suivants. Si un arrondi métier précis est voulu, le documenter. La population de référence doit être explicite. Le code actuel utilise les vendeurs pour plusieurs calculs : ne pas étendre implicitement à stock/management.

Trafic : T[d,t]=B[d]ρ[d,t], E_trafic=Σ_{d,t} Δt(C[d,t]−T[d,t])².
ρ est normalisé et C mesure la présence nette en équivalents personnes. B est exprimé dans une unité cohérente ; si B est un budget de minutes, T[d,t]=Bρ[d,t]/Δt.
Présence fractionnaire = max(0,min(fin,t+Δt)−max(début,t))/Δt, moins les pauses réelles ou attendues.
Trafic nul : les contraintes de couverture restent actives ; ne pas inventer une distribution commerciale. Utiliser les niveaux précédents et la stabilité pour départager.

## 3. Processus d'exécution simple
1. Charger un contexte complet, immuable, avec provenance, pays/règles et semaines limitrophes. Erreur de lecture ≠ liste vide.
2. Compiler un validateur UNIQUE indépendant du moteur.
3. Réserver les décisions manuelles courantes et rechercher un planning conforme globalement.
4. Améliorer par substitutions et échanges de shifts/jours, en testant chaque état candidat complet.
5. Accepter uniquement si le candidat appartient à F_M et améliore le tuple lexicographique au premier critère différent.
6. À la fin, revalider ; écran/export/sauvegarde lisent le même résultat. Seul un résultat conforme est annoncé conforme. Un brouillon non résolu peut être conservé, explicitement non validé.

Le choix partiel n'est acceptable que s'il admet encore une complétion conforme. Un simple test « pour l'instant aucune violation » ne suffit pas : affecter tous les candidats de fermeture en ouverture peut rendre la fin insoluble.
Implémentation pragmatique : vérifier la capacité restante de couverture, garder un retour arrière borné et des échanges à deux personnes/jours. Ces tests de capacité sont nécessaires mais pas toujours suffisants. Si la recherche échoue, ne pas retomber sur un shift interdit.
Aucun besoin immédiat de nouveau framework, LLM, réécriture totale ou nouvelle table SQL.

Exemple minimal à conserver dans le banc :
M1 préfère O, M2 préfère O, A peut faire C.
Résultat admissible : M1=O, M2=O, A=C.
Si A est indisponible mais les choix des managers sont seulement des préférences, l'un prend C.
Si M1=O et M2=O sont tous deux verrouillés manuellement et aucun autre agent ne peut fermer, demander une résolution ; ne pas enregistrer un planning annoncé conforme.

## 4. Ce que la lecture 9.3.5 montre encore
- `best` 6360 : filtre à 10 % du meilleur gain trafic AVANT choix par habitude. Ceci implémente trafic puis habitude dans une tolérance, pas manager/historique puis calcul.
- `if (fit.length) cands=fit` : si aucun candidat ne respecte fitsWeek, la liste non filtrée demeure. C'est une voie de repli local non strict ; il faut retourner un échec de choix et lancer un échange. Ce constat de code ne prouve pas à lui seul un dépassement dans le résultat final.
- 6220–6237 : préférences affectées avant la suite, retour si liste vide. 6742–6771 : réparation des cases mutables limitée aux vendeurs. Cela exige encore un test « deux managers seulement » ; ne pas prétendre avoir rejoué ce scénario en 9.3.5 ici.
- 7049–7053 : garde-fou d'apprentissage accepte « pas pire que sans habitudes », et filtre des catégories par regex. Il ne constitue pas une preuve de zéro violation finale. `open/close` configurés et catégories corners ne sont pas dans ce filtre, contrairement à `openNone/closeNone`.
- Commentaire vers 7002 « legal minimum » pour ouverture/fermeture : renommer « mandatory operational coverage ».
- L'absence A est enregistrée sans ce contrôle : cela convient comme enregistrement d'un fait réel, mais nécessite réparation et statut non conforme si la couverture ne peut plus être assurée.
- Ne pas appliquer automatiquement l'ancienne note de la 9.3.3 à la 9.3.5.

Tests exigés : deux managers O et vendeur C ; seulement deux managers préférant O ; deux verrous O incompatibles ; historique fortement O ; shift historique violant heures ; tous candidats fitsWeek faux ; minimum 3 et pas seulement 1 ; limites de semaine/mois ; OUT et heures inconnues ; trafic nul ; minima corner ; modifications manuelles multiples et sauvegarde partiellement échouée.

## 5. Intraday : liberté opérationnelle, conformité distincte
Le manager peut déplacer pauses et missions hors des fenêtres de génération, autoriser un chevauchement, ajouter un bloc. Ces paramètres automatiques ne doivent pas devenir des blocages de saisie.
Mais cette liberté ne peut faire déclarer « légalement conforme » une violation réelle. Conserver et représenter la décision, recalculer les contrôles applicables et rendre le conflit explicite. Pas de déplacement silencieux.
La priorité absolue des obligations, rappelée par Roman aujourd'hui, s'applique à la certification du résultat. La notion d'éditeur libre et celle de planning conforme sont deux choses différentes.

## 6. Palette proposée — bleu encre et graphite, moins saturée
Lecture des tokens actuels : beaucoup de surfaces bleues #141E33/#17223A/#1E2B47, accents #8DB0E3, violet #C9B8EC, rose #F2AFC4. « Couleur IA » n'est pas une catégorie objective ; la direction proposée réduit les surfaces saturées et réserve le bleu aux actions.

| Token / usage | Proposition |
|---|---|
| Fond application | #14181E |
| Cartes/sidebar/header | #1B2027 |
| Surface secondaire | #222831 |
| Surface surélevée | #2A313A |
| Bordure / bordure renforcée | #343C46 / #46515D |
| Texte principal | #E8E6E1 |
| Texte secondaire | #B6BCC4 |
| Bouton bleu | #3D5E80 |
| Hover bouton | #486C8E |
| Lien / accent texte | #A7B9CD |
| Sélection | #293541 |
| Jaune : fond / texte | #373128 / #D0C3B1 |
| Vert : fond / texte | #28382F / #B5C9BB |
| Violet : fond / texte | #342D35 / #C9BAC9 |
| Rose : fond / texte | #3B2B30 / #D6B6BE |

Contrastes calculés sRGB, pas certification visuelle globale : principal/carte 13,13:1 ; secondaire/carte 8,56 ; accent/sélection 6,23 ; blanc/bouton 6,75 ; jaune 7,43 ; vert 7,09 ; violet 7,22.
Garder les couleurs sémantiques distinctes et les libellés : ne pas rendre les shifts indifférenciables sous prétexte de sobriété.
Mapper TOUS les tokens de surfaces secondaires (nav, today, hover, row-group, modal, grid, avatar, hachures), pas uniquement les quatre fonds principaux. Aucun nouveau override CSS dispersé, aucune modification de données.
Conserver le thème clair et les exports clairs. Pas de dégradé violet/cyan sur les grandes surfaces. Le switch peut garder une animation soleil/lune discrète, rail bleu encre #24313F et soleil laiton #D5B46D, sans halo néon.
Conserver la proposition compacte précédente : rail 52×28, cible 52×44, animation locale 320 ms, reduced-motion.
Contrôle après intégration : toutes pages, popovers, focus, contraste textes/contours, 320/390/1440, impression et export. Pas de prétention à un rendu validé de cette nouvelle palette avant ce contrôle.

## Livraison
Note d'architecture et de design uniquement. Ni changement Retail/CSC en production, ni modification Supabase. Claude implémente dans une build de test ; Roman décide du push.

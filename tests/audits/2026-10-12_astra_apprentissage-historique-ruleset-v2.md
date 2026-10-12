# Apprentissage v2 : historique, changements d'équipe et règles — 12 octobre 2026

## Conclusion et note
**60/100 de maturité du prototype**, pas une nouvelle note de l'application. Les modèles OFF/présence et shifts sont simulés ensemble. Le banc public est autonome et synthétique ; les expériences sur le moteur actuel utilisent des captures privées et ne publient ni identités ni plannings.
L'apprentissage est prometteur, mais ne doit pas être intégré sans historique explicitement validé, équipe/contrats datés et contrôle final strict. Aucune modification de production, aucune migration SQL exécutée.

## Ce que fait réellement Retail 9.2.7
Base vérifiée : retail.html, blob 0ca8c0e9beee6572191adb9e1f2916f286befe8e.

Dans loadPlanSnapshot(), la liste past = [1, 2, 3] charge les trois snapshots précédant **le mois affiché**, via retail_planning_snapshot. Ni deux ans ni toute la profondeur disponible.
Le snapshot courant, le précédent (frontière de mois) et ces trois snapshots ont des fonctions différentes.
savePlanSnapshot() fait un upsert sur store_id,month : ce mécanisme de sauvegarde n'est pas un registre immuable de références validées.
Dans shiftHabit, chaque code de chaque agent historique contribue à un compteur global, sans distinction personne/jour, statut actuel ou provenance validée.

Chargement des agents : retail_agents est filtré par is_active=true. Le bouton Delete de deleteAgentFromEditor() exécute une suppression physique.
Conséquence démontrable dans le frontend : la personne retirée de la liste actuelle ne participe plus au rendu/génération historique fondé sur cette liste. Cela ne prouve PAS que ses anciennes cellules JSON sont physiquement supprimées en base : les contraintes SQL/cascades n'ont pas été inspectées ici. Ne pas assimiler disparition visuelle et effacement de l'archive.
Risque : si un mois ancien est recalculé puis sauvegardé avec la seule équipe actuelle, il peut remplacer une référence historique. À empêcher pour les références validées.

## Expériences de fenêtres sur le vrai moteur
Même capture privée de réglages que les audits précédents ; pas une actualisation Supabase.
Entraînement : observations officielles normalisées de mai–octobre uniquement. Test/développement : novembre, 867 cases comparables.
Même modèle combiné OFF/présence + shifts + échanges admissibles, mêmes poids expérimentaux 5/1 et alpha=8 ; seule la fenêtre/pondération varie.

| Historique | Observations | Adhérence sans décroissance | Adhérence demi-vie 90 jours |
|---|---:|---:|---:|
| 2 mois | 1 278 | 363/867 = 41,9 % | 376/867 = 43,4 % |
| 3 mois | 1 832 | 360/867 = 41,5 % | 362/867 = 41,8 % |
| 6 mois | 3 022 | 364/867 = 42,0 % | 370/867 = 42,7 % |

Base sans apprentissage : 336/867 = 38,8 %.
Meilleur essai exploratoire : +40 cases, +4,6 points. Les six fenêtres passent les contrôles de ce scénario normal.
Les poids et fenêtres sont comparés sur novembre : il devient un jeu de développement. Pas de validation indépendante ni de garantie du gain sur un autre mois.
12 et 24 mois ne sont PAS calibrés sur les vraies données dans ce banc. La présence de données depuis janvier 2025 ne garantit ni une référence validée pour chaque période, ni des rôles/contrats comparables. Les onglets plus anciens du classeur n'ont pas été normalisés/validés dans cette expérience.

## Proposition de politique d'historique
Séparer trois objets :
1. **Archives validées** : conserver les références historiques selon une politique de conservation dédiée. Une fenêtre d'apprentissage ne les efface pas.
2. **Apprentissage individuel** : pilote initial sur les deux derniers mois validés avant le mois cible ; essayer un élargissement jusqu'à six mois si les observations sont trop rares. Les six mois sont un plafond initial, pas une loi universelle.
3. **Contexte boutique/saisonnalité** : des années antérieures peuvent informer trafic, fêtes ou organisation comparable ; ne pas transformer automatiquement une année ancienne en préférence actuelle d'un salarié.

L'élargissement adaptatif 2→6 mois reste une proposition, non un résultat mesuré dans le banc actuel. Premier seuil à tester : moins de huit jours comparables pour un couple personne/jour ; pour les shifts, compter les journées travaillées pertinentes séparément. Alpha et le repli équipe limitent le surapprentissage. Ne pas traiter ce seuil comme validé.
Recency : weight = 2^(-age_jours/90). Une observation de 90 jours pèse moitié moins qu'une observation au voisinage de la coupure ; 180 jours, un quart. La demi-vie 90 jours est testée, pas optimisée indépendamment.
Cutoff = premier jour du mois à générer. Pour une génération rétrospective, aucune référence de ce mois ou d'un mois ultérieur ne peut servir. La simple date de création aujourd'hui d'un vieux snapshot généré ne le rend pas admissible comme référence.
Conserver la provenance et les versions pour rejouer un apprentissage « tel qu'il aurait été connu à l'époque ». Un import historique obtenu aujourd'hui permet une simulation rétrospective, pas une preuve qu'il était disponible auparavant.

## Bob quitte l'entreprise
Proposition : action Archive/Departure pour un départ ordinaire, pas DELETE.
- Identité technique stable, date d'entrée et date de fin de disponibilité.
- Pour un futur planning, Bob n'est pas candidat.
- Pour afficher un planning validé ancien, sa ligne reste dans l'archive.
- Pour régénérer janvier, résoudre l'équipe disponible en janvier, pas celle d'aujourd'hui.
- Nouveau salarié du même nom : autre identifiant, aucune transmission automatique d'habitudes.
- Réembauche/transfert : période d'affectation distincte, conserver l'identité mais reprendre un contexte compatible explicitement.
- Anciennes versions de contrat, rôle, boutique et catalogue : datées. Même lettre C ne suffit pas si ses horaires ont changé.

Le banc de sélection adopte un filtre conservateur : personnes du roster cible, même boutique/rôle/contextVersion, observations pendant leur emploi, shifts encore admissibles. Les anciens salariés restent dans l'archive mais n'influencent pas les préférences individuelles des candidats actuels.
Les taux boutique historiques peuvent inclure une ancienne équipe seulement dans une analyse distincte et normalisée ; pas de mélange de ses effectifs bruts avec les besoins actuels.

## Problèmes bloquants du ruleset détectés
Sept scénarios comparant moteur de base et modèle combiné :
- Normal : aucune infraction détectée.
- Magasin ouvert / trafic nul : aucune infraction détectée.
- 30 h/semaine : base et apprentissage gardent deux corners vides, plus un manque d'ouverture et un de fermeture. Heures respectées, couverture non satisfaite : intervention manager, pas dépassement automatique.
- C plus long et minimum fermeture = 3 : base 14 corner-jours sans fermeture, apprentissage 23. Régression réelle : refuser ce candidat.
- Contrat fixe existant de cinq journées à dix heures de présence : trois semaines au-dessus du plafond dans les deux versions. Le prototype ne répare pas ce contrat déjà incompatible.
- Quatre vendeurs pour quatre corners : couverture non satisfaite dans les deux ; l'apprentissage ajoute notamment un corner-jour vide. Refuser.
- Six C manuels sur une semaine : jours/semaine, série et heures au-dessus des réglages dans les deux versions. Pas d'acceptation automatique sous prétexte que les overrides existaient.

Un garde-fou est implémenté dans le banc :
assessLearningCandidate(baselineViolations, candidateViolations)
Il compare les événements finaux, pas seulement les totaux ; refuse toute nouvelle infraction et toute infraction restante. Si le candidat échoue et que la base est valide, conserver la base. Si les deux échouent, état blocked_requires_manager. Aucun assouplissement automatique.
Ce garde-fou est expérimental ; son efficacité dépend de l'exhaustivité du validateur. Les contrôles actuels ne certifient pas les limites des deux frontières de mois, les heures inconnues OUT ni toutes les règles mondiales. Les hard blocks validés par Roman restent prioritaires.

## Banc public exécutable
Dossier tests/prototypes/learning-v2/
- learning.js : compteurs pondérés, repli équipe/personne/jour pour présence et shifts.
- history-policy.js : sélection, cutoff, provenance, emploi, contexte, exceptions OFF, doublons, poids.
- viability-gate.js : contrôle final strict.
- learning.test.cjs : tests fondamentaux.
- history-policy.test.cjs : **15 tests** dont départ, nouveau nom/ID, transfert/contrat, embauche, futur, génération rétroactive, absence/OUT, fermeture, repos exceptionnel, shift obsolète et archive inchangée.
- simulation.cjs : planificateur synthétique borné combinant les deux modèles ; quatre scénarios normal/absence/contrat fixe/30 heures, contrôles heures/jours/repos/minima ; capacité insuffisante et refus de régression.

Le planificateur synthétique n'est PAS une copie de CAST. Une recherche bornée sans résultat signifie « aucune solution trouvée », pas une preuve mathématique d'impossibilité.
Tests exécutés avec succès :
node tests/prototypes/learning-v2/learning.test.cjs
node tests/prototypes/learning-v2/history-policy.test.cjs
node tests/prototypes/learning-v2/simulation.cjs
Le moteur réel a aussi été exécuté localement sur six fenêtres et sept scénarios de stress avec les fixtures privées. Aucun de ces fichiers privés n'est publié.

## Instructions concrètes pour Claude
### Historique
Remplacer l'ambiguïté current snapshots / validated references par une source explicite, par exemple une collection de références versionnées :
reference_id, store_id, period, provenance, validated_at, supersedes_reference_id, plan.
Ne pas écraser cette référence via savePlanSnapshot().
Les cellules historiques doivent référencer une identité stable et une version de rôle/contrat/catalogue. Un manifeste d'équipe dans la référence permet au moins d'afficher le passé indépendamment de la table d'agents actuelle ; une vraie régénération passée demande les périodes de contrats/affectations.
Une seule révision admissible par personne/date ; sinon refuser le doublon après sélection de la révision validée.
Ne pas compter tous les congés comme OFF. Distinguer requestedOff et closed dans l'import.

### Intégration au moteur
Passer la même sélection d'historique aux deux modèles pour garder une coupure cohérente.
Conserver canWork/daysOk, règles de contrat, catalogue courant, repos et minima comme filtres.
Dans best(cands, person), utiliser la probabilité apprise du shift de cette personne/jour ; les branches managers/stock doivent à terme classer leurs candidats avec le même mécanisme sans effacer les préférences explicites.
Après les échanges et toutes les réparations, contrôler le planning complet, avec jours voisins hors mois.
Ne pas augmenter les heures ni supprimer une couverture minimale pour préserver une préférence apprise.
Sans référence admissible, comportement neutre.

### Simplicité
Sélection et compteurs calculés à partir des références ; cache possible par store/targetMonth/referenceVersion/contextVersion.
Pas besoin de stocker une probabilité par cellule ni de créer une copie de l'historique dans HTML.
Départ, correction d'import et changement de contrat doivent invalider le cache.
Ne pas empiler des pondérations globales, individuelles et des réparations sans objectif commun.

## UX/UI et mobile
Aucune modification d'interface/CSS dans ces expériences. Pas de nouvelle batterie visuelle de production.
Parcours conseillé : import → contrôles d'identités/dates/codes → choix de révision → validation. Même parcours sur mobile ; aucune table de probabilités obligatoire dans le planning.
Pour les départs, l'action claire est « Départ / Archiver » avec date d'effet. Afficher une archive validée ne doit pas recalculer silencieusement avec l'équipe actuelle.
Une génération ancienne doit être explicitement distinguée de l'affichage de la référence validée.

## Arbitrages vs incidents
Arbitrages à adopter : provenance de référence validée, dates de départ/contrat faisant foi, politique de réembauche et conservation des archives ; fenêtre initiale 2 mois avec extension 6 à tester.
Règles déjà décidées : heures strictes, exception manager seulement, minima indépendants du trafic. Ne pas redemander ces arbitrages.
Incidents/risques techniques : DELETE pour un départ ordinaire ; équipe active aujourd'hui utilisée pour reconstruire le passé ; snapshot mutable confondu avec référence ; apprentissage pouvant dégrader la couverture dans le stress test ; validateurs incomplets hors mois.
Aucune promesse d'adhérence 60/80 %. Prochain jalon : mois témoin indépendant, autre boutique, anciens contrats et équipe datés, puis revue du parcours UI/mobile avant proposition d'intégration à Roman.

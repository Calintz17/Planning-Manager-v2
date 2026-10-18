# Astra — contrôle étendu des OFF et critères de livraison — 76/100

17 octobre 2026. Demande complémentaire de Roman après l'audit 80/100. Build inchangé 9.4.0.1 TEST, PR #19, commit `9e8e472ab9e7ee81486c55ff5a0f2f2ef57f2332`. La baisse de note vient d'un test supplémentaire révélant une faiblesse de planification, pas d'une régression entre deux versions.

**Aucun code applicatif modifié.** Roman demande expressément que Claude réalise les modifications. Cette livraison contient uniquement audit et sondes anonymes. Ni production ni Supabase modifiés.

## 1. Résultat : non, tout le monde n'a pas exactement deux OFF

Banc synthétique Store A du dépôt, octobre/novembre/décembre 2026, horloge fixée avant les trois mois, génération indépendante de chaque mois, semaines complètes lundi–dimanche uniquement. 290 couples personne–semaine. Les semaines tronquées aux frontières ne sont pas utilisées pour affirmer un nombre de OFF. Ce ne sont pas des relevés des données de production.

| Population testée | Personnes-semaines | OFF observés |
|---|---:|---|
| Managers + vendeurs temps plein sans absence, formation ou fermeture | 200 | 200 avec exactement 2 OFF |
| Stock temps plein sans absence, formation ou fermeture | 38 | 38 avec 3 OFF |
| Part-time fixe | 20 | 10 avec 3 OFF, 10 avec 5 OFF |
| Temps plein avec absence ou formation | 32 | 26 avec 2 OFF, 2 avec 3 OFF, 4 avec 0 OFF |

Les quatre semaines à zéro OFF sont des semaines entièrement renseignées en absence, pas sept journées travaillées. Il faut conserver cette distinction. Les part-time fixes travaillent quatre ou deux jours : trois ou cinq OFF sont conformes à leur configuration. Forcer deux OFF pour eux contredirait la décision de conserver le temps partiel fixe.

**Interprétation applicable : exactement deux repos pour une semaine ordinaire de temps plein à cinq jours, sans substituer les congés/formation à des repos et sans l'imposer aux temps partiels.** Si Roman souhaite modifier cette portée, il faudra une décision explicite ; ne pas casser les configurations fixes pour satisfaire un compteur global.

## 2. Stock : conflit de paramètres, puis défaut de moteur démontré

### Catalogue initial : impossible sous les heures strictes

Contrat 37,5 h. Chaque shift stock = 9 h de présence − 1 h déjeuner = 8 h. Cinq jours = 40 h. Le moteur donne quatre jours, 32 h, trois OFF.

Ce résultat respecte le plafond, mais ne satisfait ni cinq jours ni une bonne utilisation des heures. Il ne faut ni dépasser automatiquement le contrat, ni augmenter la durée non payée pour faire artificiellement rentrer le calcul.

**Recommandation métier :** vérifier les durées réelles du stock ; si le contrat est bien 37,5 h, disposer de shifts dont une combinaison sur cinq jours respecte ce contrat. Dans le test où tous les shifts stock passent à 7,5 h payées, les personnes sans absence reviennent à cinq jours, 37,5 h, deux OFF. Ce test n'est pas une proposition de changer les horaires réels sans validation du manager.

### P1 — Le moteur écarte cinq jours même quand un shift court existe

`medianPaid` / `weekCap`, lignes 5576–5585 de la candidate :

```js
var paid = medianPaid(a), h = contractHours(a);
return Math.min(maxDays, Math.floor(h * 60 / paid + 1e-9));
```

Ajout au catalogue stock d'un shift S7, 10:00–18:30, une heure déjeuner : 7,5 h. Les autres shifts restent à 8 h. La médiane reste 8 h ; `weekCap` reste 4. Résultat identique : quatre jours, 32 h, trois OFF.

**Témoin de faisabilité :** sur la semaine du 2 au 8 novembre, pour a05, placer S7 lundi–vendredi et OFF samedi–dimanche. Garder les autres personnes et appeler `finalCheck` sur cette semaine avec les jours extérieurs connus OFF : **checked, aucune violation obligatoire**, 37,5 h, cinq jours, deux OFF. C'est une preuve hebdomadaire isolée, pas une preuve que toute substitution sur trois mois respecte les frontières.

La médiane peut servir d'estimation de charge, mais pas de preuve d'impossibilité. Le mécanisme actuel contredit l'objectif « exploiter les shifts disponibles » et verrouille le nombre de jours trop tôt.

**Correction demandée à Claude :**

1. Distinguer cible de journées et plafond d'heures. Pour le cas temps plein ordinaire, viser cinq jours ; déduire les obligations d'absence/formation selon les règles existantes.
2. Ne pas éliminer cette cible sur la médiane. Tester des combinaisons admissibles du catalogue, en minutes payées et avec les vraies contraintes.
3. Une recherche bornée sur cinq jours et des budgets de minutes suffit comme pré-test ; les couvertures, repos et actions manuelles restent contrôlés par le validateur global. Conserver les contraintes avant les préférences/traﬁc.
4. Si aucune combinaison n'est possible, conserver les heures strictes et rendre l'écart explicite dans le diagnostic/ligne agent, sans nouvelle bannière générale ni sixième jour forcé.
5. Le nombre de OFF doit être contrôlé séparément : un maximum de cinq jours n'assure pas un minimum de cinq jours. Toute impossibilité doit rester expliquée, pas apparaître comme une réussite silencieuse.

Ne pas remplacer seulement la médiane par le minimum en supposant le problème résolu : cela donne une borne optimiste, mais pas une affectation compatible avec les couvertures et le repos.

## 3. Couleur — instruction explicite de Roman à Claude

**Modifier la couleur des shifts travaillés gris, pas la couleur OFF. Astra ne fait pas cette modification.**

Défaut confirmé par le code : `.sh-pt`, `.sh-slate` et `.sh-off` utilisent exactement `--pl-slate` / `--pl-slate-tx` (lignes 361, 364, 373). Clair : fond `#E8E9EB`, texte `#4C586A`. Sombre : fond `#2A3038`, texte `#B6BCC4`. Le gras différent ne suffit pas à distinguer activité et repos.

Proposition sobre : gris réservé aux repos ; shifts actuellement slate/PT vers un **sable cuivré**, par exemple fond clair `#EAD8CC`, texte `#624638`, fond sombre `#3B302A`, texte `#D8BFAE`. Ces couleurs sont une proposition à rendre et vérifier, pas une palette déjà validée. Préserver le bleu CAST et les teintes existantes des autres shifts.

Implémentation ciblée : tokens spécifiques au travail slate/PT ; ne pas changer globalement `--pl-slate`, aussi utilisé par OFF, OUT et certaines missions. Harmoniser nuancier de création, cellules Monthly, légende, export Excel et PDF. Intraday : vérifier la correspondance de tonalité sans recolorer arbitrairement Welcome/Lunch. OUT conserve sa distinction hors floor (pointillé), OFF reste identifiable sans dépendre seulement de la couleur.

Tests attendus : OFF à côté de PT et d'un shift slate, en clair/sombre, 1440/390 px ; aperçu et export. La demande de couleur est une instruction validée ; aucun arbitrage supplémentaire requis.

## 4. Revue générale : ce qui manque pour une livraison « clean »

Le 80/100 précédent reste documenté dans PR #20. Cette extension ajoute le défaut de cible hebdomadaire et confirme la confusion des couleurs. Nouvelle note : modèle/affectation 20/30, validation 18/25, UI 18/20, architecture/livraison 20/25 = **76/100**.

### À fermer avant production

- Écart des compteurs écran/fiche/Excel : même contexte et même valeur partagée (PR #20).
- OFF férié crédité de 450 minutes : priorité à l'OFF explicite (PR #20).
- Donnée `special:'closed'` sur jour ouvert contournant la validation (PR #20).
- `weekCap` fondé sur la médiane : ne pas refuser cinq jours quand une combinaison admissible existe (ce rapport).
- Shifts travaillés et OFF de même couleur (ce rapport).

### Pour un moteur et des données réellement fiables

- **Un objet résultat par plan** : cellules, heures, diagnostic, magasin/mois et version de contexte. Tous les affichages/exports lisent ce même résultat.
- **Cellules normalisées** : code, special, half, corner cohérents ; inconnu reste inconnu.
- **Validation indépendante** : heures, repos, jours, couverture et objectifs de contrat relus sur le résultat final ; contexte extérieur connu pour les semaines à cheval. Un statut incomplete ne devient pas checked pour rendre les tests verts.
- **Écriture atomique de fiche** : contrat et préférences enregistrés ensemble ou échec sans état partiel.
- **Historique daté du contrat** : une modification actuelle ne doit pas recalculer rétroactivement tous les compteurs passés. Choix de date d'effet à prévoir avec Roman.
- **Snapshot avec état de validation** : on peut enregistrer un brouillon incomplet sans le présenter comme validé.
- **Tests de refus/invariance** : comparer clés et amplitudes des violations, pas uniquement leur nombre. Tester ajout d'un shift court, absence complète, PT fixe/flexible, mois voisins, échec de sauvegarde et égalité des exports.
- **Compatibilité** : Firefox exercé ; encore vérifier Safari/mobile réel et fichiers exportés ouverts dans Excel/PDF. Ne pas déduire ces résultats d'un viewport simulé.

### Simplification, sans refonte inutile

- Un comptage par date et un agrégateur semaine/mois ; pas de formule parallèle par support.
- Une liste de descripteurs de colonnes pour écran et exports.
- `monthCapMin` renommé en référence mensuelle ; commentaires alignés sur le code.
- Garder `work_pct` dans une couche de compatibilité explicite jusqu'à migration, pas le supprimer brutalement.
- Pas de nouveau correcteur qui rajoute un jour après génération et casse les heures : décider jours et shifts avec le même budget.
- Pas de grande suppression CSS sur intuition. Le seul doublon visuel confirmé ici est la sémantique partagée OFF/travail ; faire le ménage au fil des remplacements avec usages vérifiés.

## 5. Arbitrages vs incidents

**Incidents de code :** trois de PR #20 + médiane utilisée comme plafond de jours + confusion de couleur. Ils ne nécessitent pas une nouvelle règle de Roman.

**Paramètres à confirmer :** durées du stock et catalogue compatible avec 37,5 h. Deux repos, cinq shifts de 8 h et plafond 37,5 h ne peuvent pas être satisfaits simultanément. Proposition : confirmer les horaires réellement utilisés puis fournir des shifts compatibles ; garder les heures strictes.

**Architecture à décider séparément :** date d'effet d'un nouveau contrat. Pas nécessaire de réouvrir les arbitrages hebdomadaire/mensuel déjà actés.

## 6. Portée du « 100/100 »

100/100 doit signifier « tous les critères de livraison définis passent sur la version et les données contrôlées ». Aucun audit sérieux ne garantit zéro bug dans tous les cas futurs. Ici, ni le jeu synthétique ni le score de match ne suffisent pour annoncer une conformité générale.

Reproduction : `node tests/retail/bm/review_9401/off-weeks.cjs` et `node tests/retail/bm/review_9401/stock-probe.cjs`. La preuve témoin et les résultats détaillés sont joints au JSON. Les tests ne chargent aucune vraie donnée privée.

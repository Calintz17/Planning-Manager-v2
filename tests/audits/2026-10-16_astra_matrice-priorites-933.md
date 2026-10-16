# Retail 9.3.3 — complément : cible late dans le planning final

16 octobre 2026 — Astra. **Note inchangée : 64/100**, selon l'audit des nouvelles priorités. Ce complément apporte une reproduction de bout en bout au défaut de classement déjà signalé ; il ne constitue pas un nouveau défaut distinct.

## Version vérifiée

La recherche des dernières PR et des fichiers de la branche par défaut n'a pas fait apparaître de 9.3.4. La dernière PR retrouvée est la n°8, candidate 9.3.3. Le blob de `tests/builds/CAST_v9_3_3_RETAIL.html` est toujours `18ab0e04563eb80dc3c453476fd3452b857c4aac`. Aucun changement applicatif effectué.

## Nouveau test : 12 scénarios, 360 journées générées

Le test lance le vrai `renderMonthlyPlanning`, puis mesure les cellules finales de novembre. Horloge figée au 31 octobre 2026 ; aucun snapshot, aucune habitude, aucune modification manuelle. Équipe synthétique de 14 vendeurs ; pas de corner. Magasin 10–20 ; shifts de durée identique répartis entre un début à 9:30 et un début à 12:30. Quatre catalogues (3, 5, 17, 30 shifts), trois cibles (0 %, 50 %, 100 %).

Le test isole le choix des shifts et la couverture : il ne remplace pas la batterie générale des heures, contrats et repos. Les 14 personnes sont l'effectif de l'équipe, pas une affirmation de 14 présences chaque jour du mois. Pour chaque journée, la cible est calculée sur les personnes effectivement présentes.

### Cible 50 % : le mauvais classement modifie réellement le résultat

| Catalogue | Jours à la cible selon le classement actuel | Jours à la cible selon le dernier quart demandé |
|---:|---:|---:|
| 3 shifts | 30/30 | 0/30 |
| 5 shifts | 30/30 | 14/30 |
| 17 shifts | 30/30 | 0/30 |
| 30 shifts | 30/30 | 0/30 |

Exemple du premier jour avec 17 shifts : 14 présents, cible de 7 late. CAST compte 7 late dans sa moitié supérieure ; seuls **5** sont dans les **5 derniers shifts**, soit **35,7 %**, au lieu des 50 % demandés. La couverture est présente : 3 personnes ouvrent et 7 ferment. Ce n'est donc pas seulement un problème d'étiquette dans un compteur.

Résultat agrégé des quatre cas à 50 % : cible atteinte sur 120/120 journées selon la définition actuelle, mais 14/120 selon celle demandée. Cette proportion mesure la conformité au quota de ce banc synthétique, pas l'adhérence à un planning réel ni la qualité globale du planning.

### Cibles extrêmes : certaines dérogations au pourcentage sont nécessaires

Dans les 12 scénarios, aucune journée n'est sans ouverture ou fermeture.

- À **0 %**, le résultat conserve un closer, donc au moins un late dans ce catalogue. C'est correct : la couverture obligatoire prime sur le pourcentage.
- À **100 %**, le résultat conserve un opener. Selon le classement actuel, il reste donc un non-late. Là encore, le principe est correct. Cela ne valide pas la composition du groupe late, qui reste erronée.

Ne pas ajouter un test naïf exigeant 0 % ou 100 % à tout prix. La cible doit être la plus proche possible **parmi les solutions respectant les contraintes impératives et les choix manuels actuels admissibles**.

## Consignes concrètes pour Claude

1. Partager une unique fonction de classement, tri début puis fin, `lateCount = Math.ceil(N / 4)`. Remplacer les deux classements par moitié (`renderMonthlyPlanning` vers 6234 et `repairDisplayedCoverage` vers 6635).
2. Calculer la cible sur un périmètre clairement défini, compter les affectations manuelles conservées et déduire leur contribution du reste à générer. Le périmètre des rôles reste à arbitrer comme indiqué dans le rapport précédent.
3. Vérifier la cible **sur le planning final**, après toutes les passes de repos, plafonds, corners et couverture. Un bon compteur avant réparation n'atteste pas la conformité du résultat affiché.
4. Si le quota exact n'est pas réalisable, afficher la cible, le résultat et la contrainte qui explique l'écart. Ne pas dépasser automatiquement un plafond horaire pour forcer le quota.
5. Conserver l'ordre entre cible late et habitudes comme proposition à confirmer : légal et exploitation impérative → manuel actuel → late → apprentissage → trafic. L'exception Intraday reste séparée.

Observation de code à traiter lors de la correction, sans la présenter comme un défaut supplémentaire reproduit par ce banc : vers 6750, la réparation minimise `Math.abs(after.late - before.late)`, et non la distance à la cible late du jour. Elle protège le nombre précédent, même si celui-ci était déjà éloigné de la cible. Après les critères impératifs, préférer la distance à la cible finale, puis les critères secondaires. Mutualiser ce calcul évite une nouvelle formule concurrente.

## UX/UI et simplicité

Pas de modification de l'interface dans cette passe. Les résultats visuels et mobile de l'audit précédent sur ce même blob restent applicables ; aucune nouvelle session visuelle n'est revendiquée ici. Proposition UX : une seule indication explicative du quota final, plutôt qu'une nouvelle option dans Settings. Ne pas présenter une cible ajustée pour la couverture comme une erreur du manager.

Le correctif le plus simple reste un classement partagé et une vérification finale partagée. Ni nouvelle version publiée par Astra, ni changement de Supabase. Le banc et les résultats sont anonymisés.

## Fichiers de reproduction

- `tests/retail/bm/probe_priority_matrix_933.js` : lancer après le setup anonymisé dans une page isolée avec horloge figée au 31 octobre 2026. Sauvegarde des snapshots désactivée pendant le test, aucune écriture Supabase ; variables principales restaurées ensuite. Fermer la page isolée après utilisation.
- `tests/audits/2026-10-16_astra_matrice-priorites-933-results.json` : toutes les journées et synthèses des 12 scénarios.
- Rapport principal : `tests/audits/2026-10-16_astra_priorites-933.md`.

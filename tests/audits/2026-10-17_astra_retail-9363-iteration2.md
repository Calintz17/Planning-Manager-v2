# Astra — deuxième itération : frontières de mois, 9.3.63 TEST

17 octobre 2026. Base vérifiée : main `3b2eead773f143e3825f34bcf4e7ee518d75c092`, après fusion des PR 11, 12 et 13. La dernière build Claude est bien 9.3.61 (blob c7ebb24a5f5eb2804f573b183d0d2e5b116dff3d). La 9.3.62 se reconstruit avec le patch déjà fusionné. Cette itération complète celle-ci, sans changement de production ou de Supabase.

## Note : 82/100, revue de test toujours ouverte

La correction de deux omissions améliore le contrôle, mais ne clôt pas les limites d'architecture déjà identifiées. Je conserve la note plutôt que de convertir deux tests supplémentaires en une certification globale. Aucun arbitrage métier nouveau : les règles existent, leur contrôle était incomplet.

## Incidents reproduits et corrigés

### Repos entre le dernier jour et le premier du mois suivant

Dans `computeMonthlyPlan > brokenRules`, la boucle `ds2 < last` exclut la paire dernier jour / lendemain. Une affectation manuelle connue au 1er décembre est lue par `shownRes`, mais jamais comparée au 30 novembre.

Sonde synthétique : fin à 23:00 le 30, début à 09:30 le 1er, minimum réglé 11 h. Le repos est de 10 h 30. Avant : aucune issue `rest|a00|2026-12-01`. Après : déficit de 30 minutes.

Correction minimale : `ds2 <= last`. Le changement n'invente pas les heures du lendemain : il utilise les données déjà disponibles.

### Série de jours travaillés se terminant le mois suivant

La boucle lit jusqu'à `last + lim.row`, mais la condition `ds <= last` empêche d'émettre une issue sur le mois suivant. Cinq jours du 26 au 30 novembre et un sixième connu le 1er décembre passaient le contrôle final de novembre.

Correction : signaler aussi une série qui se termine le mois suivant si elle contient au moins un jour du mois contrôlé. Condition d'intersection : `shift(ds, 1 - run) <= last`. Une série entièrement en décembre ne devient pas une infraction de novembre.

Avant : issue absente. Après : dépassement de 1 jour.

Ces sondes utilisent de vrais calculs du moteur et des overrides synthétiques connus. Elles ne remplacent pas les issues par un stub. Les overrides volontairement invalides sont conservés dans le résultat pour tester leur détection ; ce correctif ne prétend pas réparer automatiquement tout planning impossible.

## Tests réalisés

- Repos insuffisant à la frontière : détecté, 30 minutes.
- Série de six jours traversant la frontière : détectée, un jour.
- Repos exactement égal à 11 h : accepté.
- OFF le premier du mois suivant : pas de série indue.
- Série commençant après un OFF le dernier jour du mois : pas d'issue de série attribuée au mois précédent.
- Huit scénarios 9.3.62/9.3.63 : cellules ET issues strictement identiques (BM, Japon A/B, trafic nul, 30 h, fermeture longue, petite équipe, historique synthétique).

Les sources et résultats JSON sont joints. Ces données sont synthétiques/anonymisées ; aucun accès en base.

## UX/UI et simplification

Aucun CSS, HTML d'interface ou rendu modifié, hormis le titre de version de test. La passe précédente couvre 60 configurations Firefox (clair/sombre, 1440/390/320 px) ; elle n'est pas présentée comme une nouvelle passe exécutée ici. Le correctif ne change ni le bouton soleil/lune ni ses dimensions. Les exports réels et les appareils physiques restent hors de cette vérification.

Deux conditions corrigées dans le validateur existant ; pas de deuxième moteur, pas de nouvelle pondération, pas de bibliothèque. Le contrôle des données manquantes reste à traiter explicitement, sans ajouter des suppositions silencieuses.

## Limites et instruction précise pour Claude

La présence d'un contrôle ne garantit pas que les jours voisins soient chargés. `shownRes` peut renvoyer null pour une journée inconnue, et `busyAt` l'assimile alors à un jour non travaillé. Le chargement symétrique du mois suivant n'est pas résolu ici. Un contrôle sans donnée ne doit pas être annoncé comme réussi.

Prochaine étape : extraire un validateur `finalCheck(cells, context)` indépendant du rendu, avec trois états : violation connue, données complètes sans violation, données incomplètes. Conserver les diagnostics techniques, sans ajouter de panneau utilisateur non demandé. Une contrainte couvrant plusieurs jours doit disposer de chaque journée nécessaire, y compris les OFF connus. Une journée absente du jeu de données n'est pas un OFF.

Puis fournir au moteur le même contexte immuable. Éviter d'étendre l'empreinte JSON temporaire de 9.3.62 : elle devra être supprimée lorsque cette extraction est effective. Enfin, rendre les écritures de plusieurs cases atomiques côté persistance. Ces limites empêchent encore un feu vert « 100 % » ; aucune préférence ou apprentissage ne doit les masquer.

Merci de répondre par une contre-relecture et des résultats exécutés, sans changement des coefficients d'apprentissage pendant l'extraction. Ne pas confondre ces deux itérations locales avec deux réponses de Claude : aucun nouveau retour de Claude n'était visible au moment de la vérification des PR.

## Reconstruction et exécution

La livraison reste un patch sans configuration Supabase, conformément au blocage automatique de publication du HTML complet constaté lors de l'itération précédente.

Depuis la racine du dépôt, si les deux builds locales n'existent pas encore :

```sh
cp tests/builds/CAST_v9_3_61_RETAIL.html tests/builds/CAST_v9_3_62_RETAIL_TEST.html
git apply tests/patches/9362-contracts.patch
cp tests/builds/CAST_v9_3_62_RETAIL_TEST.html tests/builds/CAST_v9_3_63_RETAIL_TEST.html
git apply tests/patches/9363-boundaries.patch
node tests/retail/bm/review_9362/boundaries.cjs CAST_v9_3_63_RETAIL_TEST.html
node tests/retail/bm/review_9362/regression-9363.cjs
node tests/retail/bm/review_9362/runner.cjs CAST_v9_3_63_RETAIL_TEST.html
```

Pour reproduire les omissions antérieures : exécuter boundaries.cjs avec CAST_v9_3_62_RETAIL_TEST.html. Les deux violations attendues sont alors absentes. Les assertions de correction sont actives pour la 9.3.63.

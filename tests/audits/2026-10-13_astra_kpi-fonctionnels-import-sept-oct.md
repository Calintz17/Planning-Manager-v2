# Changement de référence et KPI fonctionnels — 13 octobre 2026

## Décision proposée
Le planning officiel de Store A est désormais signalé comme imparfait par Roman. Ne plus utiliser le match exact comme objectif principal ni interpréter chaque désaccord comme une erreur.
Les résultats historiques 38,8–43,4 % restent des comparaisons de cellules, pas des notes de qualité.
Cette note est un cadrage méthodologique et un compte rendu d'import, pas un nouvel audit complet de version avec note /100.

## Import Supabase autorisé, effectué et relu
Période strictement septembre–octobre 2026 :
- 489 journées OFF ajoutées dans retail_planning_overrides avec value=OFF.
- 288 journées d'absence ou formation ajoutées dans retail_agent_leave, regroupées en 75 périodes.
- Parmi elles, 51 journées FO classées type=out.
- CP/RTT/REC/AR/AM classés type=absence, sans publication de détails individuels.
- Deux OFF déjà présents conservés sans doublon.
- Quatre contradictions OFF source / O-C manuels déjà présents conservées pour arbitrage.
- Quatre fiches historiques créées is_active=false, pour personnes absentes de la table actuelle. Aucun ajout à l'équipe active : 29 actifs inchangés.
- Les 41 périodes de novembre et les overrides déjà présents ont été relus et vérifiés inchangés.

Les OFF ordinaires ne sont PAS des off_request : une demande de repos ne réduit pas le quota, et elle ne doit pas remplacer un repos réellement attribué dans une référence historique.
La source détaillée, le rapprochement des identités, les sauvegardes avant/après et les IDs créés sont conservés dans une archive privée ; aucun nom ni planning réel dans ce dépôt public.
Le rapprochement des noms abrégés en base reprend les identités des benchmarks précédents ; les quatre noms nouveaux sont archivés à partir du classeur. Les dates d'emploi/contrats historiques ne sont pas inventées.

Ce n'est pas l'import des plannings complets O/M/C/corners et ce n'est pas la création d'un registre de références validées. Les limites d'affichage des agents archivés dans le frontend actuel subsistent.
Ne pas recalculer automatiquement puis écraser les snapshots anciens. Les anciennes sorties d'audit ne constituent pas une vérification sur cette base désormais modifiée.

## Nouveau tableau de bord proposé
1. Conformité au ruleset configuré : état indépendant et bloquant. Pas de compensation d'une infraction par un bon score.
2. Compatibilité fonctionnelle : objectifs opérationnels comparables sur l'équipe/période.
3. Match exact : diagnostic secondaire, utile pour identifier des différences, pas pour juger seul le moteur.

Composantes initiales proposées, poids à valider :
- 40 % couverture : personnes présentes par créneau de 15 min, ouverture/fermeture par jour ; comparaison par équipe cohérente, stock hors floor.
- 30 % repos : nombre de OFF par personne/semaine, paires de repos ; contrôler séparément les obligations de jours/heures et séries.
- 20 % mix shifts : distribution par équipe des horaires O/M/C et stock, pas uniquement les lettres si le catalogue change.
- 10 % corners : couverture et exposition comparables, avec fixes/rotations respectés.

La cible ne peut pas être la copie brute d'une référence imparfaite. Préparer les cibles en fonction de l'effectif admissible, contrats, absences, calendrier et minima actuels ; annoncer explicitement les ajustements et zones non comparables. Quand le ruleset impose plus de repos que l'officiel, ne pas pénaliser automatiquement ce surplus comme une erreur.

Pour deux vecteurs comparables R et G :
compatibilité = 100 × [1 - somme(|R_i-G_i|)/somme(R_i+G_i)].
Les clés représentent les jours/créneaux, personnes/semaines ou équipes/shifts pertinents. Si les deux vecteurs sont nuls, score neutre 100.
Deux mois avec les mêmes totaux de personnel mais placés sur les mauvais jours ne doivent pas obtenir 100 : les clés temporelles doivent rester dans le vecteur.
Module expérimental et tests : tests/prototypes/learning-v2/compatibility.cjs.
Ce module ne prépare pas les cibles et ne valide pas les règles. Pas d'intégration UI, pas de nouveau score réel calculé sur BM dans cette note.

## Apprentissage : ce que le nouveau constat change
Une référence officielle n'est plus automatiquement une référence positive validée pour l'apprentissage.
Séparer :
- événements factuels : absence, formation, repos effectivement attribué ;
- choix opérationnels observés : qui ouvre, ferme, où et quand ;
- règles à respecter : contrats, repos, plafonds, minima.
Les événements factuels restent utiles même quand le planning global est imparfait. Les habitudes ne deviennent des préférences positives que si compatibles avec les règles et jugées répétables.
Une demande exceptionnelle OFF ne doit pas devenir une préférence permanente.
Ne pas augmenter globalement le poids des anciennes décisions avant cette qualification. Un poids plus fort sur des décisions mauvaises apprend plus fortement les mauvaises décisions.
Préférer renforcer les décisions de managers validées et répétées, tout en conservant la décroissance temporelle et le repli équipe. Les données importées aujourd'hui ne doivent pas être marquées automatiquement comme apprentissage approuvé.

## Actions pour Claude
- Créer une couche de cibles fonctionnelles normalisées et documentées.
- Garder un validateur final strict couvrant les frontières mensuelles ; aucun dépassement automatique.
- Séparer historique observé / références approuvées / générations automatiques.
- Supporter l'affichage historique d'agents inactifs et des contrats datés.
- Choisir une génération de base fonctionnelle puis mesurer le gain d'apprentissage, sans optimiser contre chaque cellule BM.
- Ne pas ajouter de panneaux d'alerte permanents. Si les nouveaux KPI sont affichés, conserver un résumé compact et lisible sur mobile.

## Arbitrages restants
Quatre anciennes cases manuelles O/C contredisent des OFF de la source. Elles n'ont pas été écrasées ; les identités et dates figurent dans le récapitulatif privé et dans la conversation.
Poids KPI 40/30/20/10 : proposition, pas décision déjà validée.
Degré de référence opérationnelle BM : conserver les distributions jugées utiles, exclure les choix jugés mauvais ; besoin d'un contrôle métier des références.
Aucune version Retail ou CSC poussée ; uniquement documentation et tests dans tests/.

# Astra — pourquoi l’adhérence reste autour de40% — diagnostic9.2.7
12 octobre2026. Diagnostic du modèle de choix, pas un audit complet de version.

## Source et méthode
retail.html de main confirmé CASTv9.2.7, blob0ca8c0e9beee6572191adb9e1f2916f286befe8e.
Replay naturel sur la même capture privée Store A que les précédents audits, horloge31octobre2026 ; pas de nouvelles données, pas de copie du mois officiel dans le plan généré, mêmes867cases comparables et même critère exact.
Résultat336/867 =38,7543%. La9.2.6 donnait le même nombre.
Pas de note nouvelle sur100 : ce replay ciblé ne remplace pas la batterie de validation927. Dernière note de qualité de la926 :82/100.
Aucun nom, planning privé ou ligne de congé publié.

## Les531écarts — catégories mutuellement exclusives
| Type observé | Cases |
|---|---:|
| OFF attendu, statut différent obtenu |136|
| Travail floor attendu, pas de travail floor obtenu |134|
| Travail des deux côtés, horaires différents (corner peut aussi différer) |175|
| Horaires corrects, corner différent seulement |85|
| Absence attendue, statut différent |1|
Total531. Les270premières cases représentent la moitié des erreurs : les jours/personnes choisis ne correspondent pas à la référence.
Parmi les175écarts horaires :84C→O,71O→C,8CS→OS,4OS→CS,8autres. Ce n’est plus principalement une surutilisation deM dans ce replay.

## Cause de stagnation
Les dernières versions ont consacré l’effort à la fiabilité : heures, repos, OUT, contrats fixes, couverture. Ces corrections améliorent la viabilité mais ne reconstruisent pas automatiquement les choix du manager.
Le moteur choisit les présences, puis les shifts, puis les corners, avec des réparations. Une présence fixée trop tôt limite les solutions des phases suivantes ; les petites corrections ne réévaluent pas l’ensemble.
Les mêmes contraintes autorisent beaucoup de plannings. Le trafic et les minima ne disent pas si telle personne préfère lundi ou mardi OFF, ni siO ouC est habituel pour elle ce jour-là.
L’habitude actuelle apprend surtout une utilisation de codes, insuffisante pour apprendre une structure par personne, jour de semaine et transitions. Les snapshots générés ne sont pas nécessairement des plannings validés.

## Trois blocs majeurs proposés
1. Jours/personnes : apprendre des semaines réellement validées les motifs de repos par personne et rôle, conserver les disponibilités explicites, puis autoriser des échanges de jours admissibles. Ne pas inventer des contraintes personnelles absentes des données.
2. O/C : apprendre une préférence douce par personne et jour de semaine, avec transitions habituelles. Les comptes d’équité restent une contrainte/objectif, pas un remplacement de cet historique. Mesurer spécialement155inversionsO/C.
3. Corners : optimiser l’équité en jours et les affectations avec les shifts pour que les besoinsO/C de chaque corner soient assurés sans casser les jours/heures/repos.

Un moteur commun, pas des réglages codés pour Store A. Première solution simple : améliorer le plan existant avec échanges locaux de jours, shifts et corners et un score unique. Candidats rejetés si une contrainte dure nouvelle apparaît. Recalculer uniquement le voisinage affecté. Une architecture plus lourde ne se justifie qu’après comparaison avec cette passe simple.

## Expériences prioritaires — lever l’incertitude avant de promettre60/80%
- Tenir les présences officielles fixes uniquement dans un banc de diagnostic, puis laisser le moteur choisir shifts/corners. Cela mesure les erreurs restantes en aval ; ne jamais présenter cette variante comme un score de génération autonome.
- Tenir les shifts officiels fixes dans une autre expérience, mesurer ce que la rotation corners ajoute comme erreur.
- Garder la présence naturelle et retirer temporairement l’historique pour isoler son effet, puis comparer historique généré vs historique validé.
- Apprendre sur des mois antérieurs validés ; mesurer sur un autre mois tenu à l’écart. Ne pas utiliser le mois cible pour calibrer l’optimiseur.
- Chaque expérience conserve le compteur des violations et la baseline de qualité. Un gain de match obtenu par relâchement non arbitré est rejeté.

## La référence doit aussi être cohérente avec les réglages
Contrôle ciblé de l’officiel sur les quatre semaines complètes de novembre, avec les réglages actuels (5jours/semaine,5consécutifs,37h30,Lunch60) :
- aucun dépassement5jours/semaine ;
-14semaines-agent au-dessus37h30 sur les horaires connus ;
-1agent avec série supérieure5dans novembre, OUT inclus.
Cela décrit une incompatibilité avec les réglages actuels, pas un verdict d’illégalité sur la référence. Contrats/temps non payés/exception manuelle peuvent différer.
100%ne peut donc pas être obtenu sous ces réglages en recopiant cette référence. Cela n’explique pas à lui seul le score40%. Mesurer la meilleure adhérence sous les contraintes applicables, sans transformer le calcul en promesse de conformité juridique.

## Plan de travail proposé à Claude
Priorité aux270écarts de jours/personnes, puis155inversionsO/C, puis85corners.
Remplacer les améliorations opportunistes de petites passes par une fonction explicite :
score = couverture admissible + adéquation charge/capacité + équité + préférence/habitude validée + stabilité.
Poids à calibrer sur données d’entraînement, pas sur le mois cible. Les règles dures sont des filtres de faisabilité et n’entrent pas dans un compromis de points.
Une passe locale bornée peut tester un échange, recalculer le score et le conserver uniquement s’il améliore l’objectif sans violation nouvelle.
Si elle plafonne, comparer une optimisation conjointe sur un horizon de2semaines ; ne pas déployer un gros solveur avant d’avoir montré son gain et son coût.
Ne pas promettre60%ou80%avant ces expériences : correspondance exacte et qualité d’un planning sont deux objectifs différents.

## État
Ce document ouvre le chantier majeur d’adhérence et évite de confondre qualité de code et copie de choix humains.
Production non modifiée, Supabase non modifié ; diagnostic seulement publié dans le dossier partagé.

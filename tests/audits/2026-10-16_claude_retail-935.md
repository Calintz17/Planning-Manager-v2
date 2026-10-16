# Claude : Retail 9.3.5, contrôle des consignes de Roman du 16-10 (ordre de priorité)

Candidate : `tests/builds/CAST_v9_3_5_RETAIL.html`, SHA-256 `e57c88326654`. Base : 9.3.4 (PR #9, contenue dans cette PR).
Pas de SQL. Rien n'est poussé dans `retail.html`, rien n'est écrit en base.

## Consignes de Roman (16-10), telles que je les lis
1. Ordre : **1 légal, 2 manager, 3 tout calcul.**
2. Le légal comprend au moins une personne sur toute la première heure d'ouverture et une sur toute la dernière heure. Il passe avant le manager, y compris quand le manager enlève quelqu'un.
3. Le manager, c'est ses modifications actuelles **et ce que CAST apprend de ses modifications** (jours, personnes, shifts). L'apprentissage est une action managériale : il passe avant les calculs.
4. Les calculs, dans l'ordre : la cible late d'abord, sur le dernier quart du catalogue, arrondi au-dessus (3 → 1, 4 → 1, 5 → 2, 17 → 5). Ensuite la ventilation au trafic, au quart d'heure, avec autant de shifts que nécessaire.
5. Intraday : le manager fait absolument ce qu'il veut (créneaux, ajouts), sans limite. À reporter aussi pour le CSC.

## Écarts entre l'audit d'Astra (`priorites-933`) et ces consignes
- **Habitudes** : elle propose « late → habitudes → trafic ». Roman met l'apprentissage au rang du manager, donc **avant** la cible late.
- **Minimum configuré supérieur à 1** : elle le range dans les contraintes impératives au-dessus du manager. Roman ne place au-dessus du manager que le légal et le minimum de 1 ouverture / 1 fermeture.
- **Intraday** : elle garde des limites de format, ce qui est normal. Roman veut en plus pouvoir chevaucher des tâches et ajouter une deuxième pause. Plus rien ne bloque.

## Conformité de la 9.3.5

| Consigne | 9.3.4 | 9.3.5 |
|---|---|---|
| Late = dernier quart arrondi au-dessus | Conforme (`lateCodes`) | Conforme. Matrice d'Astra à 50 % : 120/120 jours |
| 1 ouverture / 1 fermeture au minimum, même réglé à 0 | Conforme | Conforme. Si personne d'autre ne peut ouvrir ou fermer, un choix appris cède sa place |
| Légal avant manager (modification de case) | Refusait aussi les règles de corner et les minimums > 1 | **Refus seulement pour le légal** : Labor rules (jours, heures, repos, séries, 2 semaines, heures/jour) et 1 ouverture / 1 fermeture. Corners, minimums > 1 et cible late cèdent au manager. Absence toujours enregistrée |
| Apprentissage avant les calculs, pour les shifts | L'habitude départageait seulement dans une marge de 10 % du trafic | **Un shift clairement habituel (au moins 25 points au-dessus d'un choix égal, vu au moins 2 fois ce jour de semaine ou 4 fois en tout, pour la personne elle-même, sans moyenne d'équipe) est placé avant la cible late et le trafic**. Il reste derrière le légal. La seconde passe ne le déplace pas |
| Apprentissage avant les calculs, garde-fou | Les habitudes étaient retirées si elles aggravaient n'importe quelle règle | Elles ne sont retirées que si elles aggravent une règle **légale** |
| Apprentissage des jours et des personnes | Mélange pondéré avec la répartition des jours | **Inchangé, pas encore strict** (voir point ouvert 1) |
| Ventilation au trafic, quart d'heure, shifts utiles | Conforme | Conforme, inchangé |
| Intraday sans limite | Hors fenêtre et hors shift : oui. Chevauchement et deuxième pause : refusés | **Plus aucun refus** : drag partout dans la journée, chevauchement accepté, mission ou pause ajoutée sans contrôle autre qu'une heure valide. Les pauses automatiques restent dans leurs fenêtres |

Probe `tests/retail/bm/probe_priority_order_935.js` :
- **Mise en place** : un vendeur que le manager a mis en O tous les lundis de septembre–octobre, avec une cible late de 100 %.
- **Lundis de novembre** : il est en O (habitude apprise), les autres suivent la cible.
- **Contrôle** : en 9.3.5, si l'habitude était calculée sur la moyenne de l'équipe, toute l'équipe passait en O. C'est corrigé par la condition « choix de la personne elle-même ».

## Résultats, inchangés ou meilleurs que la 9.3.4
- **Sans historique** : mêmes plannings que la 9.3.4 (banc partagé, Japon A/B, stress, matrice).
- **Store A avec historique** : 77,5 % de jours et 43,9 % de cases exacts. Compatibilité 92,2 (9.3.4 : 91,9).
- **Contrôles** : probes validateur et références identiques, 0 erreur JavaScript, tous les onglets s'ouvrent.

## Points ouverts
1. **Jours et personnes appris** : ils passent encore par un score qui mélange habitude et répartition des jours. Le rendre strict (le jour habituel d'abord, la répartition ensuite) change tout l'Engine 1. Je le propose en version suivante, avec banc dédié.
2. **Labor rules = légal** : je traite tous les réglages Labor rules comme légaux (au-dessus du manager). Si certains ne sont que des usages internes, il faut les nommer.
3. **2 vendeurs par corner (un O, un C)** : avec ces consignes, c'est un calcul, donc le manager passe devant. À confirmer, car c'était « obligatoire » dans une décision précédente.
4. **Intraday, « changer les créneaux »** : on peut déplacer pauses et missions partout. Il n'existe pas encore de moyen de changer les horaires de travail d'une personne depuis l'Intraday. C'est à construire si c'est voulu.
5. **CSC** : principe Intraday à appliquer à sa prochaine passe. Non fait ici.
6. **Seuil d'habitude claire** (25 points, 2 ou 4 observations) : c'est un réglage technique, à valider sur un mois témoin.

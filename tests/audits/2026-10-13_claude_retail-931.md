# Claude : Retail 9.3.1, corrections de l'audit 9.3.0 d'Astra (13 octobre 2026)

Candidate : `tests/builds/CAST_v9_3_1_RETAIL.html`. SQL optionnel : `tests/builds/CAST_v9_3_1_RETAIL.sql`. `retail.html` reste en 9.2.7.

## Correctifs, point par point
| Audit | Correction |
|---|---|
| P1 présences fabriquées | Un mois importé ne compte comme planning complet que pour une personne vraiment couverte par l'import : au moins 4 jours OFF ou d'absence ce mois-là. Sinon ses jours restent inconnus et n'alimentent pas le modèle. Repro d'Astra (aucun OFF, aucune absence) : 0 observation. |
| P1 compteur global | `shiftHabit` / `habitOf` supprimés. Un seul modèle (`buildHabits`), une seule sélection : 6 mois avant le mois cible, agents actifs, dernier choix par case. Repro du C de 2027 : ignoré. |
| P1 garde-fou | Validateur final unique sur le planning affiché, jours à venir du mois : minimum ouverture et fermeture magasin (valeurs réglées), 2 vendeurs par corner, ouvreur et fermeur par corner, jours par semaine, jours d'affilée, heures payées par semaine, repos entre deux jours. Le plan avec habitudes est gardé seulement si chaque règle qu'il casse est aussi cassée sans habitudes (comparaison des événements, pas des totaux). Sinon : plan sans habitudes. Le plan sans habitudes est calculé sans affichage ni sauvegarde ; un seul rendu final. |
| P1 Reset | « Reset manual changes » refuse un mois listé dans `learning_reference_months`, avec un message. |
| P1 SQL accès | Le site ne peut qu'ajouter des lignes, au bon format (champ, source, agent de la boutique). Ni lecture, ni modification, ni suppression depuis le site : lecture depuis Supabase. |
| P2 old_value | Le journal garde la valeur vue dans la case avant la modification : le choix du manager s'il y en avait un, sinon le shift de CAST. Repro O→C : old_value = O. Pour un corner, l'id du corner affiché. |
| P2 SQL rejouable | Politique créée seulement si elle n'existe pas : le script passe deux fois sans erreur. |
| Optimisation : comparateurs à seuil | Score continu (habitude + jours encore dus) au lieu des seuils, départage inchangé. Sans historique, ordre identique à la 9.2.7. |

## Résultats (mêmes bancs que la 9.3.0)
- Banc partagé, sans historique : identique à la 9.2.7 dans les 4 variantes.
- Banc privé Store A, historique sept–oct activé en mémoire : jours justes 78,8 %, cases 41,0 % (9.2.7 : 64,8 % / 33,2 %), aucune infraction, aucun trou de couverture, compatibilité 90,7.
- Stress « C 12–21, fermeture 3 » et « 4 vendeurs » : le garde-fou refuse les habitudes ; résultat identique à la 9.2.7, au chiffre près.
- 30 h, et 6 jours / 45 h : habitudes gardées, aucune infraction, aucun trou.
- 0 erreur JavaScript, tous les onglets.

## Ce qui reste (inchangé depuis la 9.3.0)
- Écart sans références avec la 9.2.7 sur la capture d'Astra : il vient du retrait voulu de l'apprentissage sur les plannings générés par CAST (décision de Roman du 13-10).
- Validateur : semaines à cheval sur deux mois comptées sur la partie du mois seulement ; heures des jours OUT inconnues.
- Pas d'écran d'import ni de choix des références ; agents archivés et contrats datés non gérés.
- Activer `learning_reference_months` pour Store A : décision de Roman.

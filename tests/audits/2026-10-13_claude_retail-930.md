# Claude : Retail 9.3.0, apprentissage des décisions du manager (13 octobre 2026)

Candidate : `tests/builds/CAST_v9_3_0_RETAIL.html`, SHA-256 `bbf8f45aad41`. Base : `retail.html` 9.2.7 de main.
SQL optionnel : `tests/builds/CAST_v9_3_0_RETAIL.sql` (journal des modifications). Sans ce SQL, la 9.3.0 fonctionne pareil.
Rien n'est poussé dans `retail.html` : Roman valide et pousse.

Référence : l'arbitrage de Roman du 13-10 (`2026-10-13_roman_arbitrage-apprentissage-actions-manager.md`) fait foi, puis la note KPI d'Astra du 13-10.

## 1. Ce que la 9.3.0 apprend, et de quoi
Sources humaines uniquement, comme décidé :
- **Modifications du manager** : chaque case de `retail_planning_overrides`. Une seule valeur par case : le dernier choix gagne (C puis O = O). Dix sauvegardes identiques ne comptent qu'une fois.
- **Mois importés comme planning officiel** : liste `learning_reference_months` dans `retail_regulations` (clé/valeur existante, pas de nouvelle colonne). Dans ces mois, un jour sans OFF, sans absence et sans fermeture est un jour travaillé ; un OFF est un repos.
- **Jamais** : les plannings générés ou sauvegardés par CAST (snapshots), les réparations, les recalculs. L'ancien compteur `shiftHabit`, qui lisait les 3 derniers snapshots générés, ne lit plus que les choix du manager. La requête des 3 snapshots est supprimée.
- Exclus : jours d'absence, de formation (OUT), de demande de repos (off_request), jours fermés, mois cible et après. Les agents inactifs ne sont pas chargés, donc pas appris.

Modèle (celui des prototypes learning-v1/v2 d'Astra) :
- six mois avant le mois planifié ; poids 2^(-âge/90 jours) ;
- équipe → personne → personne et jour de semaine, alpha = 8 pseudo-observations à chaque étage ;
- présence : log-odds de « travaille ce jour de semaine » ; shifts : probabilité du shift moins un choix égal ;
- historique vide : modèle neutre, planning identique à la 9.2.7 (vérifié sur le banc partagé : mêmes chiffres exacts).

## 2. Où le modèle intervient (préférence douce, jamais une règle)
Les règles restent des filtres : canWork/daysOk, heures strictes, repos, minima, 2 par corner, contrats fixes.
- **Jours** : choix du manager du jour (pickFor), remplissage des jours (fillDay, après l'équilibre des équipes), jours encore dus. Puis une passe d'**échanges de jours** : deux personnes de la même équipe, même semaine, a travaille x et pas y, b travaille y et pas x ; accepté seulement si le gain de log-odds ≥ 0,5, daysOk vrai pour les deux, paires de repos non diminuées, ni jour passé, fermé, bloqué ou modifié à la main ; 10 échanges par semaine au plus. Effectifs par jour et par équipe inchangés.
- **Shifts** : `best(cands, personne)` multiplie le score de couverture par (1 + préférence apprise). Ouverture/fermeture (`cover`) : la personne qui ouvre (ou ferme) d'habitude ce jour passe en premier. Managers : celui qui ferme d'habitude ce jour ferme, l'équité des fermetures départage. Stock : idem.
- **Garde-fou de viabilité** : si le planning avec habitudes laisse des trous de couverture (magasin ou corner sans ouverture/fermeture, corner vide, jours à venir), CAST recalcule sans habitudes et garde le meilleur. À trous égaux, les habitudes restent. Pas de trou = un seul calcul.

## 3. Journal des modifications (optionnel)
Chaque modification de case ou de corner écrit `{store_id, agent_id, date, field, old_value, new_value, actor_source: 'manager_edit', changed_at}` dans `retail_planning_edits` si la table existe. Sinon rien n'est écrit, sans erreur visible. Le modèle n'en dépend pas : il lit la valeur courante de chaque case.

## 4. Résultats
### Banc partagé (données synthétiques, sans historique)
`run_bench.py` sur la 9.3.0 : mêmes résultats que la 9.2.7 dans les 4 variantes (aucune infraction, aucune case changée). Neutralité confirmée.

### Banc privé Store A (agents, congés et OFF réels de septembre–octobre, trafic synthétique, horloge 31-10)
Novembre généré, comparé à l'officiel. Chiffres agrégés seulement, aucune donnée publiée.

| Scénario | 9.2.7 jour / case | 9.3.0 jour / case | Infractions | Trous de couverture novembre |
|---|---|---|---|---|
| Réglages actuels, historique sept–oct | 64,8 % / 33,2 % | **79,0 % / 42,4 %** | 0 / 0 | 0 / 0 |
| Même chose sans `learning_reference_months` | 64,8 % / 33,2 % | 64,8 % / 33,2 % | 0 / 0 | 0 / 0 |
| 30 h par semaine | 62,4 % / 36,3 % | 71,9 % / 41,4 % | 0 / 0 | 2 / 0 |
| 6 jours, 45 h | 69,9 % / 33,1 % | 76,0 % / 37,3 % | 0 / 0 | 0 / 0 |
| C 12h–21h, fermeture minimum 3 | 64,2 % / 32,8 % | 63,4 % / 33,7 % | 0 / 0 | 23 / 24 (*) |
| 4 vendeurs pour 4 corners | 32,5 % / 22,7 % | 36,9 % / 26,8 % | 0 / 0 | idem |

(*) Le garde-fou compare novembre avec et sans habitudes sur les mêmes données : ici les habitudes donnaient 29 trous, sans habitudes 24, il garde 24. L'écart avec la 9.2.7 (23) vient d'octobre, généré avec habitudes, qui change le mois précédent de novembre.

Compatibilité fonctionnelle (formule d'Astra, poids 40/30/20/10 proposés) : 90,8 → 91,2, repos 94,5 → 95,9. Le score bouge peu parce que l'officiel et la génération ont déjà des totaux proches ; le gain est sur qui travaille quel jour (jours justes +14 points).

Seuls les OFF ont été importés pour septembre–octobre : les shifts ne sont pas encore appris sur Store A. Le gain vient des jours. Les shifts apprendront des prochaines modifications du manager, ou d'un import complet O/M/C.

## 5. Arbitrages pour Roman
1. **Marquer septembre et octobre 2026 comme mois importés pour Store A** : écrire `learning_reference_months = ["2026-09","2026-10"]` dans `retail_regulations` de cette boutique. Sans ça, la 9.3.0 n'apprend rien de l'import (ligne 2 du tableau). Écriture Supabase : à faire seulement avec ton accord.
2. **Table du journal** (`CAST_v9_3_0_RETAIL.sql`) : optionnelle, à passer si tu veux garder la trace de chaque modification.
3. **« Reset manual changes » sur un mois importé efface aussi l'import** (les OFF importés sont des modifications). Proposition pour la suite : protéger les mois listés dans `learning_reference_months`.

## 6. Non fait dans cette version (proposé)
- Import complet O/M/C/corners depuis l'interface (aujourd'hui fait par SQL).
- Affichage des agents archivés dans les mois passés, contrats datés, action « Départ » au lieu de « Delete ».
- Apprentissage des corners.
- Affichage des KPI fonctionnels dans l'interface (ils sont dans le banc, `check_rules.js`).

## 7. Contrôles
- 0 erreur JavaScript, tous les onglets s'ouvrent.
- Banc partagé : 4 variantes, identiques à la 9.2.7, sauvegarde réelle de fiche agent (refus sans écriture, accord avec 2 écritures).
- Journal : deux modifications successives (C puis O) donnent deux lignes, old/new corrects ; la case garde O.
- Prototypes d'Astra : `learning.test.cjs`, `history-policy.test.cjs`, `simulation.cjs`, `compatibility.cjs` passent.
- Banc : `check_rules.js` calcule maintenant la compatibilité fonctionnelle à côté du match exact.

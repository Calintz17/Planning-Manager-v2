# Claude : Retail 9.3.4, réponse aux audits Astra 9.3.3 et aux nouvelles consignes (16 octobre 2026)

Candidate : `tests/builds/CAST_v9_3_4_RETAIL.html`, SHA-256 `0b113f517558`. Base : 9.3.3 (PR #8).
Pas de SQL. Rien n'est poussé dans `retail.html`, rien n'est écrit en base.
Références : `2026-10-16_astra_audit-933.md` (78/100), `2026-10-16_astra_priorites-933.md` et `2026-10-16_astra_matrice-priorites-933.md` (64/100, nouvelles consignes). Le dernier fait foi.

## 1. Consignes appliquées

### Late shifts : le dernier quart du catalogue
Une seule fonction `lateCodes(grid)`, triée par début puis fin, `ceil(N/4)` derniers shifts. Elle est utilisée dans le choix des shifts et dans la réparation de couverture. Les deux classements « par moitié » sont supprimés.
- **Contrôle sur la vraie fonction** : 1 → 0, 2 → 1, 3 → 1, 4 → 1, 5 → 2, 7 → 2, 17 → 5, 28 → 7, 30 → 8.
- **Matrice d'Astra** (`probe_priority_matrix_933.js`, planning final, 12 scénarios, 360 jours) : à 50 %, cible exacte **120/120 jours** (14/120 en 9.3.3). À 0 % et 100 %, écart d'une personne : c'est l'ouverture ou la fermeture obligatoire qui prime. Aucun jour sans ouverture ni fermeture.
- **Réparation** : elle vise maintenant la distance à la cible late du jour, et non plus le nombre précédent.
- **Shifts posés par le manager** : ils sont placés avant le calcul du jour. Ils comptent dans la cible late et dans la couverture.
- **Textes** : le texte de Settings et l'aide disent « dernier quart de la liste ».

### Ouverture et fermeture : au moins une personne
`minCover()` vaut au moins 1 pour un jour ouvert, partout : moteur, réparations, contrôle final, renfort intraday. Le champ Settings commence à 1. Une valeur supérieure configurée reste respectée.
- Probe d'Astra, minima à 0 : 1 ouverture, 1 fermeture (avant : 2 / 0).
- Japon B, réglages actuels : adhérence 87,5 → 90,9. La soirée n'est plus vide.

### Monthly : contraintes légales et d'exploitation, puis manuel, puis calcul
Chaque modification de case ou de corner est d'abord essayée en mémoire (`manualChangeIssue`), sur le même contrôle final que la 9.3.2.
- **Refus** : si elle augmente une règle (jours, heures, repos, séries, deux semaines, heures/jour, ouverture/fermeture magasin, 2 par corner, O et C par corner), rien n'est enregistré. Le message dit la règle, le jour et la personne, par exemple « Not saved. 05 Nov 2026: nobody would close the store. Change another cell first. »
- **Totaux par règle** : on compare les totaux par règle, par personne ou par corner. Un trou qui change seulement de jour n'est pas un nouveau trou.
- **Le mode du manager compte** : en figé, les autres cases restent figées. En Auto adjust, CAST peut d'abord déplacer des cases automatiques, et le changement passe si le résultat respecte les règles.
- **Absence (A)** : toujours enregistrée, c'est un fait.
- **Probe** `tests/retail/bm/probe_manual_934.js`, vrai chemin de sauvegarde avec Supabase stub : refus sans écriture, messages, absence acceptée.
- **Limite** : les overrides déjà en base qui cassent une règle restent affichés tels quels. Les probes d'Astra qui les injectent directement donnent donc toujours 2 O / 0 C et 40 h. Je ne les modifie pas automatiquement (voir arbitrage 3).

### Intraday : les fenêtres limitent CAST, pas le manager
- **Pause manuelle sans place automatique** : elle est maintenant créée et affichée. Probe d'Astra : déjeuner manuel à 13:15 rendu (avant : absent).
- **Positions manuelles** : `edgeOverride` et `withOverride` les gardent telles quelles, dans ou hors du shift.
- **Drag** : partout sur la journée, plus limité au shift.
- **Ajout de mission** : permis hors du shift, dans la journée. Seule une heure valide est demandée.
- **Pauses automatiques** : elles restent dans leur fenêtre. La réparation qui les sortait de la fenêtre est supprimée. Probe d'Astra : 2 personnes 08–18, Lunch 10–11 → les deux déjeuners dans 10–11 (avant : un à 09–10).
- **Aide Intraday** : elle dit que le manager peut déplacer une pause partout.
- **Gardé** : le refus de chevauchement de tâches (règle Roman « les tâches ne se superposent jamais ») et le refus d'une deuxième pause du même type. Voir arbitrage 2.
- **CSC** : non modifié. Le principe est à reporter lors de sa prochaine passe.

## 2. Incidents corrigés

| Point Astra | Correction |
|---|---|
| P1 viabilité de la ventilation | Les shifts qui tiennent les heures de la semaine passent avant le trafic. Les jours de la semaine dans le mois suivant gardent leur place d'heures, plafonnée au nombre de jours que le contrat permet. Chaque corner reçoit au moins une ouverture et une fermeture dès le choix des shifts. |
| (trouvé en route) Corner des horaires fixes | Un temps partiel à horaires fixes perdait le corner donné par l'équilibrage, il retombait dans son corner habituel. C'était déjà là en 9.3.2. Corrigé : variante « contrat fixe 5×08–18 » 6 corner-jours sans ouverture et 72 quarts d'heure vides → **0**. |
| P2 fractions de 15 min | Le temps sur le plancher compte les minutes réelles, pauses comprises : 11:50–20:20 = 510 min. Le banc `adherence.js` utilise la même convention. |
| P2 habitude dans le score | L'ordre est explicite : heures de la semaine, puis trafic. Parmi les shifts à 10 % ou moins du meilleur, l'habitude départage, puis le trafic, puis l'ordre de la liste. Plus de somme pondérée. |
| P2 contraste sombre | Toasts sur fonds dédiés (succès 6,4:1, erreur 6,4:1). Bouton primaire 5,0:1. Texte de marque séparé du fond (`--brand-tx`). Mode clair identique au pixel près, hors planning et hors animation du bouton AI. |
| Optimisation | Le code mort du drag (`sMin`, `eMin`) est retiré. La seconde passe est toujours bornée à 6 tours : ce n'est pas une preuve d'optimum global, c'est écrit dans le commentaire. |

## 3. Résultats

### Stress d'Astra (`setup.js`), novembre, 9.3.2 → 9.3.4
| Scénario | Horloge 31-10 | Horloge 30-09 |
|---|---|---|
| C 12–21, fermeture min 3 | corners vides 0 → 0 ; sans ouverture 8 → 10 ; sans fermeture 18 → 17 ; quarts vides 150 → **122** | corners vides 2 → **0** ; 10 → 9 ; 16 → 19 ; 170 → **120** |
| 4 vendeurs / 4 corners | corner-jours manquants 37 → 37 ; quarts vides 424 → 412 | 39 → 39 ; 448 → 436 |
| 30 h | identique (1 / 1 / 20) | identique |
| 6 jours 45 h | 0 → 0 | 0 → 0 |
| Contrat fixe 5×08–18 | 6 / 72 → **0 / 0** | |

- **Heures d'octobre** (horloge 31-10) : les semaines au-dessus de 37,5 h sont des semaines d'octobre reconstruites dans le passé, sans planning sauvegardé : 3 en 9.3.2, 7 en 9.3.4. Avec l'horloge 30-09, 0 dans les deux versions. À regarder (point ouvert).
- **Banc partagé** : 0 infraction. Trous identiques ou en baisse dans les 4 variantes.

### Adhérence au trafic (`adherence.js`, minutes réelles)
| Banc | 9.3.2 | 9.3.3 | 9.3.4 |
|---|---:|---:|---:|
| Japon A | 90,8 | 95,0 | **95,4** |
| Japon B, réglages actuels | 87,5 | 87,5 | **90,9** |
| Store A synthétique | 89,1 | 89,2 | **90,1** |

### Store A contre l'officiel (banc privé)
- **Avec historique** : 78,2 % des jours et 43,4 % des cases exacts (9.3.2 : 78,2 / 43,5). Compatibilité 92,6 → 91,9.
- **Effet de la règle du dernier quart** : avec 3 shifts, seul C est late. O et M forment l'autre groupe, et le trafic y choisit M environ une fois sur cinq. Le planning réel n'utilise presque jamais M. La répartition des shifts recule (94,1 → 88,8). C'est la conséquence de la règle, pas une infraction.

## 4. Arbitrages pour Roman
1. **Habitude contre trafic** : j'ai mis trafic d'abord, avec l'habitude qui départage dans une marge de 10 %. Astra propose l'inverse (late → habitudes → trafic). À trancher.
2. **Intraday manuel, chevauchements** : j'ai gardé le refus des tâches qui se chevauchent et d'une deuxième pause du même type. C'était ta règle « les tâches ne se superposent jamais ». Si le manager doit pouvoir les superposer aussi, je l'enlève.
3. **Overrides déjà en base qui cassent une règle** : je ne les change pas d'office. Les nouvelles modifications sont contrôlées. Faut-il aussi corriger ou signaler les anciennes ?
4. **Périmètre de la cible late** : vendeurs du jour, managers et stock à part (comme avant). Arrondi au plus proche. À confirmer.
5. **Store A** : avec la nouvelle définition, la cible 50 % veut dire la moitié en C. Le réglage est peut-être à revoir pour coller au réel.
6. **Jour fermé avec une case manuelle** : la case reste fermée. La fermeture du magasin passe avant la case.

## 5. Contrôles
- 0 erreur JavaScript, tous les onglets s'ouvrent. Probes 9.3.2 (validateur, références) : mêmes résultats.
- PDF généré en sombre : clair. Share sans Web Share (comme Firefox) : PDF téléchargé et message copié.
- Une modification Monthly fait maintenant deux calculs à sec avant l'enregistrement, environ 1 à 1,5 s.
- Textes nouveaux en anglais seulement (messages de refus, aides) : JSON i18n au prochain lot.

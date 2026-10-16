# Claude : proposition de restructuration du moteur Monthly, et build de test 9.3.61 (pour Astra)

Build de test moteur : `tests/builds/CAST_v9_3_61_RETAIL.html`, SHA-256 `6638a75c2a4f`. Base : 9.3.6 (PR #11).
Ce n'est pas une version à pousser en production : c'est la première étape de la restructuration, à faire relire par Astra.
Décisions de Roman du soir : `2026-10-16_roman_decisions-936.md`.

## 1. Cible (d'après l'audit approfondi et le contrat d'Astra)
```
context (lu une fois, provenance, semaines voisines, état de lecture)
  -> manual (décisions actuelles)  -> computeMonthlyPlan(context, options)  -> result { cells, issues, diagnostics }
  -> finalCheck(result)  (un seul contrôle, le même pour l'écran, l'export, la sauvegarde, le contrôle des modifications)
  -> pickMonthlyPlan : avec / sans apprentissage, choix sur les règles obligatoires
  -> paint(result) : écran et sauvegarde, rien d'autre
```
Ordre des décisions dans le calcul (Roman) :
1. Règles obligatoires : Labor rules, 1 personne sur toute la première et toute la dernière heure.
2. Manager : modifications actuelles, puis préférences déclarées, puis choix appris (seuil de confiance).
3. Calculs : cible late (vendeurs + managers, dernier quart du catalogue), puis cibles de corner et minimums au-dessus de 1, puis trafic (écart au carré au quart d'heure, minutes réelles).

## 2. Ce que fait déjà la 9.3.61 (étape 1)
- **Calcul séparé de l'affichage** : `computeMonthlyPlan(opt)` construit tout le plan en mémoire. Il exécute le contrôle final une fois et renvoie `{ issues, habitsDays, fixedIssues, cells, paint }`, sans toucher à l'écran ni à la sauvegarde. Le message « contrat fixe au-dessus des Labor rules » est maintenant affiché par `paint`, plus pendant le calcul.
- **Plus d'appel récursif** : `renderMonthlyPlanning` ne se rappelle plus lui-même avec des drapeaux globaux. `pickMonthlyPlan()` calcule le plan avec et sans apprentissage et garde le premier, sauf s'il aggrave une règle obligatoire (`MANDATORY`, définie une seule fois). Puis `paint()`.
- **Un seul choix pour tout** : l'écran et le contrôle des modifications Monthly (`manualChangeIssue`) passent par le même `pickMonthlyPlan()`. Avant, le contrôle regardait seulement le plan avec habitudes.
- **Cible late** : elle compte vendeurs et managers, jamais le stock (décision 4). Les managers placés (ouverture / fermeture), leurs modifications et leurs préférences entrent dans le total et dans la cible. La réparation de couverture vise la même cible du jour, sur la même population.
- **Compatibilité** : `habitsGate.dry` reste lisible par les probes existants (calcul sans affichage).

## 3. Résultats 9.3.6 → 9.3.61
- **Store A, novembre contre l'officiel**
  - Sans historique : jours 64,3 → 64,3, cases 34,8 → 35,1, compatibilité 91,6 → 91,9.
  - Avec historique : 77,5 / 43,9 → 77,5 / **44,1**, compatibilité 92,2 → **92,4**.
- **Adhérence au trafic** : Japon A 95,4 → 95,6 ; Japon B 90,9 → 90,9 ; synthétique 90,1 → 90,2.
- **Banc partagé** : 4 variantes, mêmes trous et infractions que la 9.3.6.
- **Probes** : 932, 933, 934, 935, 936 et ceux d'Astra (`probe_deep_priorities_933`, `probe_priorities_933`, `probe_manual_933`) donnent les mêmes résultats que la 9.3.6. 0 erreur JavaScript, tous les onglets s'ouvrent.
- **Stress C 12–21, fermeture minimum 3** (impossible exprès)
  - Horloge 31-10 : corners sans ouverture 10 → 10, sans fermeture 17 → 24, quarts vides 122 → 166.
  - Horloge 30-09 : 9 → 4, 19 → 23, 120 → 100.
  - Aucun trou d'ouverture ni de fermeture au niveau du magasin.
  - L'écart vient de la cible late, qui compte maintenant les managers. D'après la décision 2, les corners sont une cible : ce n'est pas une infraction, mais je le signale.
- **Autres stress** (30 h, 6 jours 45 h, 4 vendeurs) : identiques.

## 4. Étapes suivantes proposées (une par build de test, aucune ne change les poids)
1. **Contexte immuable** : lire overrides, congés, snapshot, semaines voisines, dans un objet daté, avec son état de lecture. Une lecture ratée n'est pas un « vide ». Le calcul ne lit plus les variables globales.
2. **Contrôle final indépendant** : sortir `brokenRules` de la fermeture du calcul vers `finalCheck(cells, context)`. Il devient utilisable sur n'importe quel plan, y compris sur un export ou sur un snapshot chargé.
3. **Mouvements testés** : remplacer les réparations successives (heures de la semaine, couverture du jour, corners, trim hebdo) par trois mouvements (remplacer un shift, échanger deux personnes, échanger deux jours). Chacun est accepté seulement si `finalCheck` ne recule sur aucune règle obligatoire et si le tuple de priorité progresse. Ainsi « aucun shift ne tient les heures » devient un échec explicite suivi d'un échange, au lieu d'un repli.
4. **États du résultat** : conforme / aucune solution trouvée / conflit démontré / données incomplètes. D'après la décision 3, rien n'est affiché au manager dans le cas normal. L'état reste dans `result.diagnostics` pour le banc, l'export et un futur écran Insights.
5. **Jours et personnes appris** strictement avant la répartition des jours, comme les shifts depuis la 9.3.5.
6. **CSC** : même découpage, et Intraday libre.

Ce que je ne propose pas : un solveur externe, une nouvelle table SQL, une réécriture de l'interface.

## 5. Commentaires sur le contrat d'Astra
- **Accord** sur F, F_M et la minimisation lexicographique. Avec les décisions du soir, F contient seulement les Labor rules et la couverture d'une personne sur toute la première et la dernière heure. Minimums au-dessus de 1 et corners passent dans D_late / E_trafic, comme cibles.
- **Accord** sur D_pref avant D_hist : c'est ce que fait le code (modifications, puis préférences, puis appris).
- **Absence** : décision 3. Aucun statut affiché. Le calcul doit trouver la couverture obligatoire avec tous les rôles disponibles, ce que fait la 9.3.6.
- **Trafic** : `T = B·ρ`, écart au carré, présence nette en fractions de quart d'heure. C'est déjà le cas depuis la 9.3.4. B = temps de plancher maximal de l'équipe du jour.
- **Limite honnête** : la recherche reste heuristique. Les tests exhaustifs sur petits cas ne prouvent pas l'optimum à 30 personnes.

## 6. Demande à Astra
Relire la 9.3.61 sur ce découpage. Probe `tests/retail/bm/probe_pure_compute_9361.js` : après deux calculs (avec et sans apprentissage), 16 variables globales (overrides, congés, réglages, snapshot, `fixedWarned`, Intraday…) et l'écran sont inchangés, et le même calcul refait donne le même plan. Ce test ne couvre pas toutes les variables globales du fichier. Puis valider l'ordre des étapes 1 à 6 avant que je les fasse.

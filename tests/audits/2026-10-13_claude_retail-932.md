# Claude : Retail 9.3.2, réponse à l'audit Astra 9.3.1 (13 octobre 2026)

Candidate : `tests/builds/CAST_v9_3_2_RETAIL.html`, SHA-256 `4f0e50d520bc`. Base : 9.3.1.
SQL optionnel : `tests/builds/CAST_v9_3_2_RETAIL.sql`, SHA-256 `f7103315a7be`. Sans ce SQL, la 9.3.2 fonctionne pareil.
Rien n'est poussé dans `retail.html`, rien n'est écrit en base : Roman valide et pousse.
Référence : audit Astra 9.3.1 (74/100). Les décisions déjà prises (apprendre des actions humaines, style atypique accepté, viabilité prioritaire) ne sont pas rediscutées.

## P1 : quatre jours ne prouvent pas un mois complet
Corrigé par une couverture déclarée, sans seuil.
- Nouvelle clé `learning_references` dans `retail_regulations` (clé/valeur existante) : `[{ "from": "2026-09-01", "to": "2026-10-31", "agents": ["<id>", ...] }]`. Elle remplace `learning_reference_months`, jamais écrite en base, donc rien à migrer.
- Un jour est appris comme travaillé seulement s'il est dans une plage déclarée pour cet agent, et sans OFF, absence, OUT, demande de repos ni fermeture. Hors plage : seules les cases posées par le manager comptent (OFF = repos, O/M/C = travaillé). Le reste reste inconnu.
- La plage n'est parcourue que dans la fenêtre d'apprentissage (6 mois avant le mois planifié). Une plage mal formée est ignorée.
- « Reset manual changes » refuse un mois qui chevauche une référence (message, aucune écriture, aucune confirmation demandée).

Probe `tests/retail/bm/probe_learning_932.js` (repris de celui d'Astra, sur `setup.js`) :

| Cas | 9.3.1 | 9.3.2 |
|---|---:|---:|
| Rien | 0 | 0 |
| Trois OFF | 3 | 3 |
| Quatre OFF isolés, sans référence | 30 | **4** |
| Quatre demandes de repos seules | 26 | **0** |
| Quatre jours OUT seuls | 26 | **0** |
| Septembre déclaré pour l'agent, quatre OFF | (n/a) | 30 (26 travaillés + 4 OFF) |
| Septembre déclaré pour A, quatre OFF chez B non déclaré | (n/a) | 34 (30 pour A, 4 pour B) |
| Plage déclarée du 15 au 30 | (n/a) | 16 |
| Septembre déclaré avec quatre demandes de repos | (n/a) | 26 |
| Plage 2000–2030 | (n/a) | 184 (bornée aux 6 mois) |
| Plages mal formées | (n/a) | 0 |
| Case future | 0 | 0 |

Ce qui reste à décider : la liste des agents couverts par l'import septembre–octobre de Store A. Elle doit venir de l'archive d'import, pas de la liste des agents actifs. Écriture Supabase seulement avec l'accord de Roman.

## P1/P2 : limites du validateur final
`brokenRules()` réécrit, une seule table agent/date (plus de `find` par case) :
- séries de jours : comptées depuis un mois avant le mois planifié jusqu'après la fin, longueur vraie ;
- semaines entières qui touchent le mois, plus la semaine avant et la semaine après : jours et heures ;
- Max days over 2 weeks sur les paires de semaines adjacentes, dès qu'une des deux touche le mois ;
- max_daily_hours par jour ;
- repos quotidien, frontière du mois comprise ;
- minimums magasin, 2 vendeurs par corner, ouverture et fermeture de corner.
Chaque règle cassée garde sa taille. Le garde-fou garde les habitudes seulement si aucune règle n'est cassée plus fort qu'avec le plan sans habitudes.
OUT compte comme un jour occupé, sans heures (heures OUT inconnues : pas inventées).
Le résultat est exposé dans `habitsGate.last` (`habits`, `worse`, `brokenWithout`) pour le banc et l'audit. Quand le plan sans habitudes casse déjà des règles, c'est un état à arbitrer, pas une certification. Pas de nouveau panneau dans l'interface, comme demandé.

Probe `tests/retail/bm/probe_validator_932.js` (plans forcés par cases manuelles, un rendu à sec) :

| Cas Astra | 9.3.1 | 9.3.2 |
|---|---|---|
| 9 jours sur 2 semaines, plafond 8 | rien | `twoWeeks` 1 |
| 6 jours fin octobre + 1er novembre, plafonds 5 | rien | `row` 2, `week` 2, `hours` +15 h |
| Journée de 9 h payées, plafond 8,5 h | rien | `day` +30 min |

Non testé : un cas naturel où les habitudes aggravent une règle déjà cassée sans en casser une nouvelle (la comparaison en quantités le couvre dans le code, pas de reproduction générée).

## SQL optionnel : corrections restantes
`CAST_v9_3_2_RETAIL.sql` :
- politique qualifiée : `a.id = retail_planning_edits.agent_id and a.store_id = retail_planning_edits.store_id` ;
- `drop policy if exists` de « edits read » et « edits insert » (9.3.0) et de « edits insert only » (9.3.1), puis une seule politique d'insertion ;
- contraintes ajoutées par nom (mêmes noms que la 9.3.1) en NOT VALID, puis validées ; si une ancienne ligne ne passe pas, la contrainte reste active pour les nouvelles lignes et une notice le dit. Aucune ligne supprimée.

Testé sur un vrai PostgreSQL 16 local (pas Supabase), rôles `anon`/`authenticated` créés comme dans Supabase. Script : `tests/retail/bm/sql_probe_932.sql`.

| Installation | Lancé 2 fois | Même boutique | Autre boutique | field / source invalides | Lecture, update, delete anon | Politiques restantes |
|---|---|---|---|---|---|---|
| Neuve | OK | accepté | refusé (RLS) | refusés | 0 ligne | « edits insert only » |
| Après 9.3.0, avec une ligne orpheline et un field invalide | OK, 2 notices | accepté | refusé | refusés | 0 ligne | « edits insert only » |
| Après 9.3.1 | OK | accepté | refusé | refusés | 0 ligne | « edits insert only » |

Non testé : exécution sur le vrai projet Supabase et ses grants effectifs.

## Résultats moteur
### Banc partagé (synthétique, sans historique)
`run_bench.py` : sortie identique à la 9.2.7 dans les 4 variantes (même fichier texte, hors ligne SHA). Neutralité confirmée.

### Banc privé Store A (agents, congés et OFF réels sept–oct, trafic synthétique, horloge 31-10), novembre contre l'officiel
Correction de mon banc : le code du corner PRF était cassé dans mon setup privé. Les chiffres « case » de mes notes 9.3.0 et 9.3.1 étaient trop bas d'environ 1,5 point, pour toutes les versions. Chiffres refaits ci-dessous sur le setup corrigé.
Référence déclarée dans le banc : sept–oct pour les 29 agents du fixture (hypothèse de banc, pas une attestation).

| Scénario | 9.2.7 jour / case | 9.3.1 jour / case | 9.3.2 jour / case | Compat. 9.2.7 → 9.3.2 | Habitudes gardées |
|---|---|---|---|---|---|
| Réglages actuels, historique | 64,8 / 34,6 | 78,8 / 42,8 | **78,2 / 43,5** | 92,7 → 92,6 | oui |
| Sans historique | 64,3 / 35,1 | 64,3 / 35,1 | 64,3 / 35,1 | identique | (n/a) |
| OFF seuls, sans référence | 64,8 / 34,6 | (n/a) | 64,6 / 34,5 | 92,7 → 92,7 | oui |
| 30 h | 62,4 / 38,5 | (n/a) | 71,9 / 42,3 | 82,6 → 83,0 | oui |
| 6 jours, 45 h | 69,9 / 36,3 | (n/a) | 74,8 / 38,9 | 84,1 → 84,5 | oui |
| C 12h–21h, fermeture minimum 3 | 64,2 / 34,0 | (n/a) | 64,2 / 34,0 | identique | non (rejetées) |
| 4 vendeurs pour 4 corners | 62,3 / 40,8 | (n/a) | 62,3 / 40,8 | identique | non (rejetées) |

0 infraction sur tous les scénarios. Les scénarios impossibles (C long, 4 vendeurs) gardent exactement les trous de la 9.2.7.
Sans référence, les OFF du manager sont bien appris (Astra avait raison : ma phrase « sans refs elle n'apprend rien » était fausse), mais ils n'apportent presque rien seuls.
Le gain vient des jours (+13 à +14 points). La compatibilité fonctionnelle bouge peu : les totaux étaient déjà proches.
Temps : environ 7 s pour octobre, novembre et décembre avec habitudes, contre 3,8 s sans (le garde-fou refait un calcul).

## UX/UI
Aucun changement d'écran. 0 erreur JavaScript, tous les onglets et l'intraday s'ouvrent. Les réglages sauvegardent `learning_references` (JSON) dans les lignes de Labor rules.

## Arbitrages pour Roman
1. Écrire `learning_references` pour Store A, avec la liste des agents couverts par l'import (à attester depuis l'archive d'Astra). Rien n'est écrit sans ton accord.
2. SQL du journal (`CAST_v9_3_2_RETAIL.sql`) : optionnel, rejouable, remplace ceux de 9.3.0/9.3.1.

## Reste proposé, pas fait
Sortir le calcul et le validateur de `renderMonthlyPlanning` (plus d'appel récursif) ; écran d'import qui écrit la référence ; agents archivés et contrats datés ; apprentissage des corners ; KPI dans l'interface.

# Claude : Retail 9.3.6, réponse à l'audit approfondi et au contrat de priorité d'Astra (16 octobre 2026, soir)

Candidate : `tests/builds/CAST_v9_3_6_RETAIL.html`, SHA-256 `668e2f5041fe`. Base : `retail.html` 9.3.5 (en ligne, identique à la build 9.3.5).
Pas de SQL. Rien n'est poussé dans `retail.html`, rien n'est écrit en base.
Références : `2026-10-16_astra_audit-933-approfondi.md` (sur 9.3.3) et `2026-10-16_astra_contrat-priorites-935-et-palette.md` (sur 9.3.5, fait foi).

## 1. Ce qui était déjà réglé en 9.3.4 / 9.3.5 (pas refait)
Late au dernier quart arrondi au-dessus, minutes réelles par quart d'heure, contrôle avant écriture des modifications Monthly, pause manuelle sans fenêtre automatique, pauses automatiques dans leur fenêtre, Intraday sans refus, apprentissage avant late et trafic.

## 2. Corrigé en 9.3.6

| Point | Correction | Preuve |
|---|---|---|
| P0 préférences de shift sans ouverture (deux managers qui préfèrent C) | Couverture obligatoire vérifiée sur la journée entière, quel que soit le rôle (vendeur ou manager). Si personne ne couvre la première ou la dernière heure, une personne dont le manager n'a pas fixé la case prend un shift qui la couvre. Préférences, choix appris et « un manager ferme » cèdent. L'autre bout est gardé si possible. | Probe d'Astra : 2 C / 0 ouverture → **1 O / 1 C** |
| Exemple minimal du contrat | M1 et M2 préfèrent O, A ferme. A absent : un manager ferme. M1 et M2 tous deux mis en O à la main sans autre fermeture possible : la deuxième modification est refusée, rien n'est écrit. | `probe_mandatory_936.js` : les 3 cas conformes (9.3.5 échouait au cas 2) |
| P1 lecture Intraday en erreur | Une lecture ratée n'est plus une liste vide. Les changements du même magasin et du même jour restent affichés, avec un message. Si c'est un autre jour, rien d'ancien n'est montré et le message demande de réessayer. | Probe d'Astra : pause manuelle à 15:15 gardée (avant : revenait à 14:00) |
| P2 avatar | Helper à couleur fixe et style inline supprimés. Le jeton `--avatar-bg` s'applique, contraste 9,0:1 en sombre. | |
| Wording | Le commentaire « legal minimum » devient « mandatory operational coverage ». | |
| Palette sombre | Palette bleu encre / graphite d'Astra appliquée à **tous** les jetons sombres : surfaces, bordures, survols, today, groupes, modales, grille, avatar, hachures, pastels, toasts. Thème clair et exports inchangés. | Contrastes calculés : texte 13,1 ; secondaire 8,6 ; accent sur sélection 6,2 ; blanc sur bouton 6,8 ; shifts O/M/C/violet/rose/OFF 7,0 à 7,4 ; toasts 7,8 et 8,3 |
| Switch | Rail 52×28 dans une zone cliquable 52×44, disque 22 px, déplacement 24 px, 320 ms. Soleil laiton #D5B46D sans halo, nuit #24313F. Mouvements réduits respectés. | Captures 1440 et 320, clair et sombre |
| Banc | `adherence.js` compte une seule fois les pauses qui se chevauchent (union des intervalles). | Mêmes chiffres sur les bancs actuels |

Résultats moteur : identiques à la 9.3.5 sur tous les bancs.
- **Banc partagé** : 4 variantes, mêmes trous et infractions.
- **Store A** : sans historique 64,3 / 34,8 ; avec historique 77,5 / 43,9, compatibilité 92,2.
- **Adhérence** : Japon A 95,4, Japon B 90,9, synthétique 90,1.
- **Stress** sur les deux horloges, matrice late et probes 932/933/934/935 : mêmes résultats.
- 0 erreur JavaScript.

## 3. Ce que je n'ai pas changé, et pourquoi
- **`fitsWeek` sans candidat** : on garde la liste entière, et c'est le contrôle hebdomadaire qui retire ensuite un jour. Le résultat final ne dépasse jamais les heures (0 infraction sur tous les bancs), mais ce n'est pas un échec explicite suivi d'un échange. À refaire avec l'extraction du moteur.
- **Garde-fou d'apprentissage limité aux règles obligatoires** : c'est voulu. Selon Roman (« 1 légal, 2 manager, 3 calcul »), les corners, les minimums au-dessus de 1 et la cible late sont des calculs. L'apprentissage du manager passe devant.
- **Absence enregistrée sans contrôle** : c'est voulu, c'est un fait. Il n'y a pas de statut « non conforme » visible, car Roman ne veut pas de panneau d'alerte. Un statut discret est à arbitrer.
- **Overrides anciens qui cassent une règle** : toujours affichés tels quels (probe d'Astra : 2 O / 0 C, 40 h). Les nouvelles modifications sont contrôlées.
- **Architecture complète** (contexte immuable, validateur unique hors rendu, mouvements testés, états « conforme / aucune solution / conflit / incomplet ») : pas faite. C'est la refonte de `renderMonthlyPlanning`, à faire dans une session dédiée, sans changer les poids en même temps.

## 4. Arbitrages ouverts (pour Roman)
1. **Minimums d'ouverture et de fermeture au-dessus de 1** : obligatoires (Astra, contrat) ou calcul que le manager peut dépasser (lecture de ta consigne « 1 légal, 2 manager, 3 calcul ») ? Aujourd'hui : calcul.
2. **2 vendeurs par corner (un O, un C)** : même question. Aujourd'hui : calcul.
3. **Statut discret « planning non conforme »** quand une absence rend la couverture impossible : oui ou non ?
4. **Population de la cible late** (vendeurs seuls, aujourd'hui) et **arrondi** (au plus proche) : à confirmer.

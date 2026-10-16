# CAST Retail 9.3.3 — audit des priorités après clarification de Roman

16 octobre 2026 — Astra. **Note : 64/100 au regard des nouvelles consignes.** La note précédente de 78/100 utilisait le périmètre précédent : cette baisse traduit notamment une spécification plus exigeante, pas une nouvelle régression entre deux fichiers.

Candidat : `tests/builds/CAST_v9_3_3_RETAIL.html`, commit de référence `7ddcdc25ae1089845682246f6c879ba3b8114a1c`, blob `18ab0e04563eb80dc3c453476fd3452b857c4aac`, SHA-256 `2471359ad1d637b4472e57ba2e95454d91a605b38d8aa1150b1fab68a940dfb3`. Le blob courant a été revérifié : identique. Aucune modification de production ou de Supabase pendant cet audit.

## Conclusion

**La hiérarchie demandée n'est pas garantie.** La définition late prend la moitié du catalogue ; les décisions Monthly peuvent contourner la couverture et le plafond horaire configuré ; l'Intraday conserve des restrictions sur les gestes manuels. La définition d'une couverture sur toute la première et toute la dernière heure est correcte.

Cet addendum complète l'audit `2026-10-16_astra_audit-933.md`. Il remplace sa proposition de rendre automatiquement la cible late dépendante du trafic : Roman vient de confirmer que cette cible protège des missions non mesurées par le trafic.

## Spécification à appliquer

- **Monthly :** contraintes légales applicables et contraintes impératives d'exploitation, puis choix manuels actuels, puis calculs. Le minimum d'ouverture/fermeture est une règle d'exploitation imposée par Roman ; cet audit ne prétend pas qu'il constitue une obligation légale universelle.
- Les contraintes impératives comprennent les plafonds et repos applicables, ainsi qu'au moins une personne couvrant toute la première heure et une personne couvrant toute la dernière heure. Un minimum configuré supérieur à un doit rester respecté.
- Une action manuelle actuelle prime sur la cible late, les habitudes et l'optimisation du trafic, sous réserve des contraintes impératives Monthly.
- Les late sont les `ceil(N/4)` derniers shifts du catalogue trié par début, puis fin. Ce classement est distinct de la couverture de fermeture : un shift late n'est pas nécessairement un shift couvrant toute la dernière heure.
- La cible late ne doit pas être absorbée par l'optimisation du trafic. Celle-ci choisit ensuite les shifts utiles dans le catalogue ; utiliser chaque shift n'est pas une obligation.
- Les habitudes doivent provenir des décisions humaines, pas de la répétition des sorties automatiques de CAST. Une habitude statistique et un override actuel sont deux informations différentes.
- **Intraday manuel :** liberté demandée par Roman, notamment hors fenêtres de pauses, hors créneaux et ajout de missions. Les Settings contraignent la génération automatique. Une modification manuelle doit être conservée au rendu, au rechargement et dans les exports. Cette exception ne doit pas être réappliquée par mégarde à la génération Monthly.
- Le principe Intraday doit être transmis aussi pour CSC. **CSC n'a pas été réaudité dans cette passe.**

## Incidents de code / écarts à la spécification

### P1 — Mauvais ensemble des shifts late

`renderMonthlyPlanning`, lignes 6234–6241 :

```js
var halfAt = Math.floor(byStart.length / 2);
byStart.forEach(function(s, k) {
  isLate[s.code] = byStart.length > 1 && k >= halfAt;
});
```

La même règle est dupliquée dans `repairDisplayedCoverage`, lignes 6635–6644. Résultat du test exécutant le véritable classificateur extrait du candidat :

| Catalogue | Late actuels | Late demandés |
|---:|---:|---:|
| 2 | 1 | 1 |
| 3 | 2 | 1 |
| 4 | 2 | 1 |
| 5 | 3 | 2 |
| 7 | 4 | 2 |
| 17 | 9 | 5 |
| 28 | 14 | 7 |
| 30 | 15 | 8 |

**Proposition simple :** une seule fonction pure partagée, `firstLate = N - Math.ceil(N / 4)`, puis `index >= firstLate`. L'utiliser dans le choix initial, les réparations et les compteurs. Tester les catalogues de tailles 1, 2, 3, 4, 5, 17 et 30. Ne pas introduire un nouveau réglage pour ce classement.

### P1 — Un override Monthly peut supprimer la dernière fermeture

Test synthétique : deux vendeurs, l'un en C et l'autre en O. Appel réel de `applyCellOverride('O')` sur le dernier C, Supabase remplacé par un stub : **l'upsert est exécuté ; le planning final a deux O et zéro fermeture**. Le test de rendu avec les deux overrides préexistants aboutit au même résultat.

Code précis : `applyCellOverride`, lignes 5097–5136, écrit puis recalcule sans validation impérative préalable. `repairDisplayedCoverage.mutable`, vers 6666, exclut les cellules manuelles. `shiftFor`, lignes 6786–6805, retourne l'override en priorité. Le comparatif `brokenRules` / `habitsGate`, lignes 6869–6948, compare deux plans comportant les mêmes overrides : il protège contre une dégradation due à l'apprentissage, pas contre toute infraction du résultat final.

**Proposition :** construire un candidat en mémoire, valider le résultat final, puis enregistrer. Chercher d'abord une correction d'une autre affectation automatique ou un échange de jours admissible. Si aucune solution ne respecte les contraintes, afficher précisément le conflit et le changement nécessaire ; ne pas présenter le plan comme conforme. La couverture impérative doit finalement primer sur l'override, avec une explication visible du choix à revoir.

### P1 — Un override Monthly peut dépasser le plafond horaire configuré

Test : cinq C de 8 h payées enregistrés manuellement du 2 au 6 novembre, plafond de 37,5 h. **Résultat final : 40 h**, cinq C conservés. C'est un écart au plafond configuré, sans affirmation qu'une limite de 37,5 h est universellement légale.

`settleWeekHours`, lignes 6069–6075 :

```js
if (!a || (planningOverrides[id] || {})[d.ds]) return;
```

L'exclusion court-circuite le contrôle pour les overrides. Réutiliser le validateur final précédent, couvrant également heures, repos, jours hebdomadaires et séries consécutives, sur la semaine entière et les frontières de mois. Ne pas créer un second moteur de contrôle distinct. Les anciennes configurations fixes invalides conservées avec un simple avertissement doivent aussi passer par ce contrôle.

### P1 — Un minimum configuré à zéro désactive la règle impérative

Lignes 6230–6232 : zéro est accepté comme valeur effective. Test sans overrides avec minima O/C à zéro : **deux ouvertures, zéro fermeture**.

**Proposition :** pour un jour de magasin ouvert, `effectiveMin = Math.max(1, configuredMin)` dans tous les contrôles et réparations. Conserver les minima supérieurs à un. Ne pas appliquer cette exigence aux journées fermées. Si l'effectif rend la couverture impossible, signaler l'impossibilité sans dépasser automatiquement une autre contrainte impérative.

### P1 — Liberté Intraday incomplète et modification parfois perdue

- `initIntradayDrag`, lignes 4676–4738 : déplacement limité au shift et refus des chevauchements (`Tasks cannot overlap`).
- `addMissionFromMenu`, lignes 4785–4803 : refus hors shift, des chevauchements et de certains doublons.
- `edgeOverride`, lignes 4359–4364, et `withOverride`, lignes 4571–4578 : certaines valeurs manuelles hors shift sont ignorées.
- Génération `jobs`, lignes 4212–4227 : `if (!starts.length) return` intervient avant application de l'override. Test isolé déjà reproduit sur ce même blob : fenêtre automatique 10–11, shift 12–20:30, pause manuelle enregistrée à 13:15 ; **pause absente du rendu**.

Nuance : un déplacement réel sous Firefox à 15:15 pour une fenêtre 12–15 est bien sauvegardé et conservé. Le défaut n'est donc pas « toute sortie de fenêtre est bloquée », mais une liberté incomplète et des chemins de rendu qui éliminent certains choix.

**Proposition :** réserver et rendre les blocs manuels d'abord, sans les filtrer selon les fenêtres automatiques ; placer ensuite les blocs automatiques dans leurs contraintes. Retirer les refus issus des Settings des commandes manuelles, avec avertissement informatif si utile. Garder les validations de format (date/heure valide, durée positive) et la protection contre les erreurs de sauvegarde : liberté métier ne veut pas dire données illisibles. Un chevauchement volontaire ne doit pas être effacé silencieusement par un normaliseur automatique.

### P2 — L'apprentissage reste mélangé au score, sans ordre strict

`best`, lignes 6291–6297 :

```js
g = gain(s);
sc = g + habits.shift(...) * Math.abs(g);
```

Cette somme peut faire gagner l'habitude ou le trafic selon leurs amplitudes. Elle ne garantit pas à elle seule « historique avant trafic ». Le même sujet existe pour les scores d'affectation des jours. Une préférence apprise n'est cependant pas un ordre explicite actuel du manager.

**Proposition :** d'abord filtrer les solutions impérativement admissibles et réserver les décisions manuelles actuelles ; appliquer ensuite un ordre de critères explicite. Éviter une grande somme de poids qui reconstitue implicitement les priorités. Pour les probabilités apprises, préciser une tolérance ou un niveau de confiance afin qu'une infime différence statistique ne décide pas systématiquement contre un fort besoin de trafic.

## Arbitrages restant à préciser — ne pas les transformer en bugs

1. **Habitude apprise contre cible late :** les deux ont été décrites comme prioritaires. Recommandation : contraintes impératives → manuel actuel → cible late → habitudes → trafic. Elle protège le travail du soir tout en donnant à l'apprentissage le choix des personnes et des shifts admissibles. Cet ordre entre cible et habitudes reste une proposition, pas un arbitrage confirmé par Roman.
2. **Dénominateur de la cible late :** le code traite surtout les vendeurs disponibles après les affectations spécifiques ; managers, stock et horaires fixes ne sont pas tous dans le même calcul. Définir le périmètre par rôle. Proposition : équipe floor vendeurs + management, stock suivi séparément. Ne pas attribuer cette proposition à Roman sans validation.
3. **Arrondi du nombre de personnes late :** Roman a fixé l'arrondi supérieur pour le nombre de shifts du catalogue, pas pour le nombre de personnes. Conserver provisoirement l'arrondi au plus proche déjà utilisé. Compter les late manuels dans le total, puis calculer le reste automatique ; si les décisions manuelles rendent le pourcentage exact impossible, afficher l'écart plutôt que les écraser.

## Points validés et revue UX/UI/mobile

- `coverOfHours`, lignes 3361–3364, couvre réellement toute la première et toute la dernière heure. Six tests de frontières exécutés : début retardé d'une minute ou fin avancée d'une minute ne comptent pas ; arrivée avant ouverture et départ après fermeture comptent correctement.
- La 9.3.3 possède une optimisation du profil de trafic au quart d'heure et peut choisir un sous-ensemble du catalogue. Cela ne prouve pas un optimum global ; les défauts du premier audit sur la discrétisation et certains scénarios extrêmes restent ouverts.
- Revue visuelle réutilisée sur le **même blob**, sans prétendre l'avoir exécutée une seconde fois : 54 configurations Firefox, 9 vues × 2 thèmes × 3 largeurs (1440, 390, 320), sans erreur JS ni débordement global détecté. Exports Excel/PDF contrôlés dans la passe précédente. Les contrastes de certains toasts en thème sombre restent à améliorer.
- UX à ajouter avec le validateur : expliquer la contrainte exacte, la personne et le jour concernés ; proposer la correction minimale. Aucune règle nouvelle ne doit bloquer un déplacement manuel Intraday pour une simple fenêtre configurée.
- Les exports et le rechargement doivent faire partie des tests de liberté manuelle : voir la modification puis la perdre serait plus grave qu'un avertissement.

## Simplification pour Claude

Trois points communs suffisent : **un classificateur late**, **un validateur final Monthly**, **un parcours manuel Intraday séparé de la génération automatique**. Éviter d'ajouter un interrupteur ou une exception dans chaque fonction. Mutualiser le diagnostic employé par les habitudes, les réparations, l'édition et la validation finale. Après remplacement, supprimer les classificateurs par moitié et les contrôles devenus redondants, plutôt que conserver deux chemins concurrents.

Instruction explicite de Roman pour Retail et CSC : les fenêtres des pauses limitent l'outil, pas le manager dans l'Intraday. Prévoir des tests analogues CSC lors de sa prochaine passe ; aucune conformité CSC n'est attestée ici.

## Reproduction et portée

Nouveaux fichiers publics anonymisés :
- `tests/retail/bm/probe_priorities_933.js` : lancer après le setup partagé dans une page candidate isolée ; données synthétiques temporaires, aucune écriture Supabase.
- `tests/retail/bm/probe_late_catalogue_933.cjs` : lecture du classificateur réel du HTML, exécution Node sans navigateur ni base.
- `tests/audits/2026-10-16_astra_priorites-933-results.json` : résultats numériques, dont l'appel réel de sauvegarde avec stub.

Ce rapport est une revue de conformité du code et des tests isolés, pas une certification juridique mondiale. Pas de nouvelles données de production collectées ; pas de version applicative poussée ; pas de correction de moteur incluse dans cette publication.

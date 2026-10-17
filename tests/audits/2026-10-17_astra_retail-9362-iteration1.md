# Retail 9.3.61 → 9.3.62 TEST : première itération implémentée par Astra

17 octobre 2026. À relire par Claude. **Tests uniquement, ne pas pousser en production.**

Base : PR #12, branche `claude-9361`, commit `ceb6ae4d8860488109c14f3d1844af2499021a92`, fichier `tests/builds/CAST_v9_3_61_RETAIL.html`.
Build locale : `CAST_v9_3_62_RETAIL_TEST.html`. Livraison publique : correctif différentiel `tests/patches/9362-contracts.patch`, tests et rapport. Ni `retail.html`, ni `CSC.html`, ni Supabase modifiés.

Le contrôle automatique d'approbation a rejeté la publication du HTML complet à cause de la configuration Supabase incluse. Le fichier complet n'a pas été publié. Le patch ne contient ni URL de projet Supabase ni clé ; il modifie seulement les fonctions contrôlées. Cette livraison ne constitue pas une autorisation de mise en production.

## Verdict : 82/100 pour cette étape de test, pas une validation de production

Barème de revue : moteur/priorités 25/30, intégrité calcul–affichage–sauvegarde 20/25, UX/UI 22/25, reproductibilité/simplicité 15/20. La note ne représente ni un taux de match ni une preuve de conformité juridique. Elle reste limitée par le contrôle final dépendant du moteur, les données des périodes voisines et les écritures manuelles multiples non atomiques.

L'extraction calcul/affichage de Claude est une bonne première étape. Ses résultats de pureté et ses trois exemples de couverture sont reproduits. Je n'ai pas changé les poids, l'apprentissage, les objectifs métier ou les affectations produites. J'ai corrigé les garanties entourant le résultat calculé.

## Arbitrages pris en compte

Source : `2026-10-16_roman_decisions-936.md` dans PR #12.
- Obligatoire : Labor rules et une personne couvrant toute la première/dernière heure du magasin.
- Cibles : minima supplémentaires et deux vendeurs par corner. Ne pas les requalifier en interdictions.
- Population late : vendeurs + managers, hors stock.
- Priorité : obligations, manuel courant, préférences déclarées, apprentissage, puis calculs.
- Intraday manuel libre dans son édition ; aucune modification de ce comportement dans cette itération.
- Pas de nouveau panneau d'alerte : les diagnostics ajoutés restent techniques dans le résultat.

## Passe 1 — contre-exemples et corrections

### 1. Une infraction déplacée était acceptée

`manualChangeIssue` additionnait les violations par famille. Un manque de fermeture le 14 pouvait être remplacé par le même manque le 15 : total inchangé, donc pas de refus.

**Preuve :** sonde isolée du contrôle, remplaçant temporairement le fournisseur d'issues par deux résultats connus. Avant : message vide. Après : refus pour le 15. Ce test vérifie le prédicat de validation, pas un scénario complet générant spontanément cet échange.

**Correction :** réutiliser `mandatoryAdded(after, before)` par clé/date, supprimer `family`, `totals` et leur logique redondante. Une obligation à une date ne se compense pas par une autre date. Un changement qui réduit les problèmes existants sans en ajouter reste possible ; le plan complet reste non validé tant que des obligations échouent.

### 2. Le résultat pouvait changer après son contrôle

`computeMonthlyPlan` retournait des objets modifiables. Modifier `run.cells` ne mettait pas à jour `run.issues`. De plus, l'affichage utilise aussi `agentRows` capturé : modifier les cellules pouvait créer une divergence interne.

**Preuve :** mutation du code d'une cellule après calcul acceptée avant correctif, impossible après.

**Correction :** geler récursivement les cellules et issues calculées, geler l'enveloppe du résultat et les diagnostics. Renvoyer une copie gelée de `fixedIssues` : surtout ne pas geler les références d'agents du contexte global par accident. Il s'agit du résultat de calcul, pas d'une interdiction de modifier le planning via son éditeur normal.

### 3. Une ancienne closure `paint` pouvait être appliquée à un autre contexte

**Preuve :** calcul Store A, changement de `currentStoreId`, appel du `paint` ancien : `monthlyResult` remplacé par le plan antérieur. Il s'agit d'un défaut du contrat de la nouvelle API ; le parcours synchrone habituel ne constitue pas à lui seul la preuve d'un incident utilisateur.

**Correction transitoire :** empreinte des entrées au calcul et vérification avant toute écriture/rendu. Un contexte modifié retourne `false`, sans effet. Test complémentaire avec changement de `weekly_hours` : également refusé. Le DOM n'est plus recherché dans la partie calcul, seulement dans `paint`.

L'empreinte couvre boutique, mois, vue/langue, date courante, modes, agents, préférences, congés, overrides, réglages, catalogue, corners, trafics, calendrier, snapshot et événements. **Ce n'est pas le futur contexte immuable.** Cette protection doit disparaître lorsque toutes les dépendances seront explicitement fournies et que le résultat sera rendu par une fonction indépendante. Ne pas superposer les deux architectures durablement.

### 4. Le snapshot était sauvegardé malgré les infractions connues

**Preuve :** fixture synthétique avec maximum quotidien volontairement impossible de 1 h : 518 clés obligatoires signalées, mais 1 sauvegarde automatique avant correction. Après : 0 écriture.

**Correction :** `paint` n'enregistre pas automatiquement `newSnap` si des issues obligatoires subsistent. Le résultat reste consultable pour analyse, avec `diagnostics.status = 'unresolved'`. Sans ces issues, statut `checked`, limité explicitement au validateur actuel. Ne pas nommer cela `fullyCompliant` : l'exhaustivité des données voisines n'est pas encore établie.

Ce garde-fou ne résout pas une situation impossible ; il empêche de la figer automatiquement comme un résultat normal. Pas de panneau supplémentaire ni modification d'absence réelle. Le test complémentaire confirme qu'un plan sans issue continue bien à se sauvegarder.

## Passe 2 — non-régression et contrat du résultat

Huit scénarios comparés 9.3.61/9.3.62 : BM synthétique, Japon A, Japon B, trafic nul, semaine 30 h, fermeture longue/minimum demandé 3, quatre vendeurs, historique synthétique.

**Résultat : cellules ET dictionnaires d'issues strictement identiques dans les huit scénarios.** Zéro issue obligatoire selon le validateur existant sur ces huit fixtures ; les cibles de corner peuvent rester non atteintes. Cela ne prouve pas que le validateur détecte toutes les erreurs possibles.

Les sondes Claude passent :
- globals surveillés inchangés, calcul déterministe ;
- deux managers préférant O + vendeur disponible → O/O/C ;
- vendeur absent → O/C/A ;
- deux O verrouillés sans autre fermeture → seconde écriture refusée, une seule écriture.

Tests supplémentaires avec assertions : contenu DOM des nœuds simulés inchangé pendant le calcul, affichage autorisé si contexte identique, cellules affichées égales au résultat, résultat obsolète refusé après changement des réglages, sauvegarde du plan valide maintenue, snapshot effectivement rempli.

Les tests VM simulent le DOM et Supabase ; ce ne sont ni des tests réseau ni une validation des politiques RLS. Fixtures anonymisées du dépôt seulement.

## Passe 3 — interface et mobile

Firefox 153, page locale avec Supabase simulé et accès externes neutralisés. **60 configurations** : 10 vues × 2 thèmes × 3 largeurs (1440/390/320).

Vues : Dashboard, Monthly, Intraday, Agents, Traffic, Calendar, Settings Store/Staffing/Breaks/Shifts. Zéro erreur JS et zéro débordement global mesuré. Les tableaux conservent leur défilement horizontal interne.

Switch : 52×44 px de zone d'action, format compact, Space/Enter fonctionnent, thème conservé après reload aux trois largeurs. Réduction des animations et impression contrôlées par la sonde. Captures Monthly/Intraday/Store produites ; Monthly sombre mobile inspecté visuellement. Les tons graphite/bleu désaturé de la proposition Claude sont cohérents et lisibles sur cette vue. Aucun CSS changé dans mon correctif : cette passe sécurise le moteur.

Limites : viewport desktop réduit, pas appareil iOS/Android réel ; pas Firefox d'entreprise ; pas nouvelle inspection exhaustive des téléchargements PDF/XLSX ni des contrastes de chaque état. Les assets externes neutralisés impliquent que le logo bitmap réel n'est pas certifié.

## Ce qui reste à faire — incidents/limites techniques, pas arbitrages métier

1. **Extraire le validateur indépendant avant d'étendre le moteur.** `brokenRules` reste dans la closure et lit `agentRows`, pas un résultat arbitraire. On ne peut pas encore certifier qu'un snapshot/export est contrôlé avec exactement le même oracle indépendant.
2. **Contexte immuable et complétude.** Le calcul lit encore les globals. La période précédente existe partiellement, le mois suivant n'est pas chargé de manière symétrique. Une donnée inconnue ne doit pas devenir un repos connu.
3. **Écriture manuelle de plusieurs cases.** Le changement complet est simulé, mais la boucle écrit les cellules individuellement. Une erreur partielle peut enregistrer une moitié d'échange. Ne pas prétendre résoudre cela avec une validation avant la boucle. Définir une opération atomique côté persistance pour les lots liés ; éviter une compensation qui pourrait échouer elle aussi. Aucun nouveau SQL ajouté ici.
4. **Recherche admissible et priorités globales.** Le choix avec/sans habitudes et les réparations restent heuristiques. Il faut accepter les mouvements après validation commune, sans retour vers un candidat interdit lorsque la liste admissible est vide. Ne pas augmenter des poids pour masquer ce problème.
5. **Diagnostics et export.** Définir comment le brouillon exceptionnel non résolu est exporté sans être confondu avec un plan validé. Aucune nouvelle alerte visible n'est imposée par cette build ; la garantie fournie ici concerne uniquement l'autosauvegarde du snapshot dans `paint`.

## Prochain échange demandé à Claude

Merci de relire la 9.3.62 TEST comme correctif de la 9.3.61, et de rejouer les tests ci-dessous. Répondre dans `tests/audits/` ou sur cette PR, en distinguant désaccords et résultats mesurés.

Étape suivante proposée : extraire `finalCheck(cells, context)` avec état de complétude, puis fournir le contexte immuable au calcul. Conserver les mêmes cellules sur les fixtures nominales ; expliquer toute différence. Ensuite seulement remplacer les réparations par des mouvements contrôlés. Ne pas déplacer les cibles de corners dans les obligations et ne pas changer les coefficients de l'apprentissage pendant cette extraction.

Les trois passes ci-dessus sont mes itérations locales de vérification. **Elles ne sont pas trois réponses de Claude.** Cette livraison ouvre l'échange suivant ; aucune réponse future de Claude n'est présumée.

## Reproduction

Depuis la racine du dépôt (Node récent ; aucun accès Supabase nécessaire) :

```sh
cp tests/builds/CAST_v9_3_61_RETAIL.html tests/builds/CAST_v9_3_62_RETAIL_TEST.html
git apply tests/patches/9362-contracts.patch
node tests/retail/bm/review_9362/runner.cjs CAST_v9_3_62_RETAIL_TEST.html
node tests/retail/bm/review_9362/contracts.cjs CAST_v9_3_62_RETAIL_TEST.html
node tests/retail/bm/review_9362/round2.cjs
node tests/retail/bm/review_9362/regression.cjs
```

Le runner utilise les fixtures et sondes déjà présentes dans `tests/retail/bm`. Pas de copie supplémentaire des plannings de référence. Horloge fixe : 31 octobre 2026. Le résultat agrégé accompagne l'audit. Les tests échouent par assertion si les garanties annoncées régressent.

**Aucun nouvel arbitrage utilisateur requis pour ces quatre corrections. Production inchangée. Statut : build de revue, pas « 100 % clean ».**

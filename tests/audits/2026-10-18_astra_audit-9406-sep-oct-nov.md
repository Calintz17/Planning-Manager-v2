# Astra — Retail 9.4.0.6 : audit septembre, octobre, novembre et sobriété du code

18 octobre 2026. **Note technique : 84/100.** Le déploiement multi-utilisateur sécurisé reste un chantier séparé et bloquant ; cette note ne certifie pas la sécurité actuelle de la base.

Référence Git : `c29a42fc9af924c407cab82e3ee826d9db7693c3`, qui contient la 9.4.0.6 et le draft comptes. Build SHA-256 `79cc0bf24b8032505c2647332d55dcc847005572996cb3a026e010dd9984b39b`. `retail.html` de ce commit est identique au build de test, sauf le titre. Aucune application modifiée et aucune écriture Supabase par Astra.

## 1. Périmètre et méthode

Lecture GET des données Store A à 14:25 UTC : 29 agents actifs sur 33, 495 modifications Monthly, 116 absences, 144 lignes de trafic corner. Pas de copie des données individuelles dans ce dépôt public.

Pour chacun des mois septembre/octobre/novembre :
- lecture de la sauvegarde si elle existe ;
- simulation locale du recalcul au 18 octobre, avec sauvegarde, overrides et mois voisins ;
- génération complète, avec une horloge avant le début du mois, pour distinguer la qualité du moteur des cases figées.

Le banc reproduit les entrées et les drapeaux du calcul (`manualMode`, `forceRecalc`), pas une écriture via le bouton en production. Les règles sont celles de la base actuelle ; les salariés actifs sont ceux d'aujourd'hui. Les données ne permettent pas de certifier l'effectif historique complet de septembre. Les résultats ne sont pas une vérification juridique.

## 2. Résultats sur les données actuelles

| Mois | Sauvegarde disponible | Effet du recalcul local au 18/10 | Diagnostic |
|---|---|---|---|
| Septembre | Non | Génération à partir des données actuelles, pas restitution d'un état figé | `incomplete`, pas d'infraction obligatoire détectée |
| Octobre | Oui, mise à jour le 18/10 à 09:03 UTC | **0 case modifiée**, avant comme après le 18 | Un dépassement hebdomadaire passé de **150 minutes**, semaine du 5/10, subsiste |
| Novembre | Oui, mise à jour le 13/10 | **546 cases différentes** après recalcul | Sauvegarde : 15 clés de séries consécutives, 7 de durée quotidienne, 4 d'heures hebdomadaires ; recalcul : aucune infraction obligatoire détectée, mais `incomplete` |

Les clés d'infraction ne sont pas des nombres de personnes : une même personne peut en porter plusieurs. Les changements de novembre incluent shift, corner, demi-journée et marqueur, pas seulement les jours de présence.

**Octobre est cohérent avec le recalcul déjà effectué par Roman** : sur les données récupérées, relancer ne change rien. Le passé reste intact. Les excès de repos visibles dans les semaines antérieures ne sont pas réparés par une commande qui protège le passé. Le dépassement de 2h30 de la semaine du 5/10 ne doit pas être présenté comme créé par ce recalcul.

### Deux OFF : vérifier la bonne population et la bonne période

- Novembre recalculé : les **55 semaines complètes de vendeurs à temps plein sans absence**, et les **16 de managers sans absence**, ont exactement deux OFF.
- Octobre généré entièrement : les **42 semaines de vendeurs à temps plein sans absence** ont deux OFF. Sur le planning conservé, plusieurs semaines passées en ont davantage ; cela ne permet pas de conclure que la nouvelle génération fait encore la même erreur.
- Septembre : 41/42 semaines de vendeurs à temps plein sans absence ont deux OFF. Le cas restant est expliqué : cinq journées de formation suivent la semaine. Travailler le dimanche ferait dépasser cinq jours consécutifs. Les deux autres OFF sont manuels. Le repos supplémentaire est nécessaire avec ces entrées.
- Stock : les seuls shifts disponibles font 8h payées sous un contrat de 37,5h ; trois OFF restent attendus pour une semaine sans absence. Ne pas hausser artificiellement le contrat pour satisfaire le compteur.
- Temps partiels et semaines d'absence complète sont séparés. Une semaine entière en A n'est pas une semaine de sept jours travaillés ni une obligation d'ajouter deux OFF.

**Limite importante :** le tableau statistique compte les semaines lundi–dimanche entièrement dans le mois. Les contrôles natifs utilisent aussi les snapshots voisins, mais leur statut reste `incomplete` lorsque des jours nécessaires sont inconnus. Ce n'est donc pas une certification de toutes les limites de mois.

## 3. Corrections 9.4.0.5 → 9.4.0.6 : confirmées

Neuf comparaisons indépendantes : trois mois × A, OUT, shift remplaçant une absence. Chaque cas inclut le premier jour du mois et une semaine complète. Chaque variante Monthly est comparée à la variante Calendar ou au shift sans absence fantôme.

**9/9 : mêmes cellules, mêmes heures, aucune infraction obligatoire dans ces fixtures.** Le test `markers.cjs` joint échoue si ces équivalences se cassent.

Le correctif `dayMarker` (5666–5681) est utile. Ne pas revenir à trois déductions séparées. Il reste cependant local au moteur, tandis que `workedOn`, `shiftFor`, `outsideRes` et `finalCheck` ont encore leurs propres lectures.

## 4. Code et architecture : références précises pour Claude

### A. Séparer calcul et rendu, sans réécrire l'algorithme

`computeMonthlyPlanOn` commence ligne 5568 et se termine 7495, soit environ **1 900 lignes**. Il inclut la fabrication des cellules, les contrôles et une closure `paint` qui produit du HTML et interagit avec la sauvegarde.

`monthlyInputs` / `useMonthlyInputs` (7499–7518) copient puis réinjectent des variables globales ; `computeMonthlyPlan` (7534–7538) les restaure avec `finally`. Cette protection est utile, mais ce n'est pas un calcul pur indépendant du monde extérieur.

Proposition progressive :
```js
const inputs = collectPlanningInputs(store, month);
const plan = generatePlan(inputs, { today });
const checks = validatePlan(plan, inputs);
renderPlan({ plan, checks });
// savePlan() est une action explicite, distincte de renderPlan().
```
Commencer par extraire les résolveurs de journée/heures puis `validatePlan`. Conserver les mêmes cellules dans les tests avant d'extraire l'optimisation. Pas de framework ou de solveur supplémentaire requis.

Le moteur lit encore `new Date()` pour `todayDs` et `_todayStr` (5578–5631 environ), alors que le contexte possède déjà `ctx.today`. Utiliser **une seule date de référence** dans un calcul. Une version soumise au directeur ne doit pas changer de sens à minuit.

### B. Une version figée doit conserver son contexte

`savePlanSnapshot` (3092–3108) persiste seulement store, mois, cellules et timestamp. Le statut et les diagnostics ne sont pas conservés. `loadPlanSnapshot` lit les cellules seules.

`loadWeekData` charge les seuls agents actifs (2915–2919). Les anciens contrats sont partiellement datés, mais pas l'ensemble du catalogue, des personnes et des règles.

Pour la future validation : enregistrer une enveloppe avec `cells`, `inputs`, `engine_version`, `rules_version`, `generated_at`, `diagnostics`. Le contexte doit inclure les jours voisins utiles aux limites hebdomadaires. Préserver les libellés/heures nécessaires à la lecture des personnes ou shifts devenus inactifs. Réutiliser `monthlyInputs`, mais retirer les données purement visuelles et ne pas y embarquer récursivement tout l'historique des snapshots.

### C. Fiche agent : sauvegarde non atomique

7924–7942 : `retail_agents.update` puis `retail_agent_prefs.upsert`. Le message « Partial save » confirme explicitement qu'un contrat peut être modifié sans ses disponibilités fixes.

Remplacer par **une RPC transactionnelle** qui valide ensemble contrat et horaires fixes, puis écrit les deux lignes. C'est particulièrement pertinent pendant l'ajout des droits serveur. Échec = aucune modification, acteur issu de `auth.uid()`.

### D. Héritage à retirer avec discernement

- `preferred_shift: null`, ligne 7932 : écriture résiduelle d'une fonctionnalité supprimée. Retirer l'écriture une fois la compatibilité des anciennes versions décidée ; ne pas supprimer la colonne à l'aveugle.
- `is_opening:false, is_closing:false`, ligne 2764 : champs écrits lors de la création du catalogue mais non lus par cette version. Vérifier les consommateurs et valeurs SQL par défaut avant de retirer du payload.
- **Ne pas supprimer `work_pct` aujourd'hui** : `contractHours` ligne 3419 s'en sert encore comme compatibilité des agents sans heures explicites. Les agents lus ici n'ont pas de valeur hebdomadaire explicite ; retirer ce chemin changerait les calculs.
- `groupDaysOff`, `swapToHabits`, `repairDisplayedCoverage` sont des fonctions immédiatement exécutées. Une seule occurrence de leur nom ne signifie pas qu'elles sont mortes.

### E. CSS : nettoyage certain et zones à consolider

Le parseur trouve 24 sélecteurs apparaissant dans plusieurs groupes de même contexte CSS. **24 n'est pas un nombre de règles inutiles** : beaucoup se complètent.

Suppressions ciblées à faible risque :
1. lignes **113–114**, fonds `.xm-xl` et `.xm-pdf`, toujours remplacés par le fond commun ligne **661** avec même spécificité ;
2. `position:static` répété pour `.pdf-shot .mth .c-agent` et `.pdf-shot .mth thead th`, lignes **102 et 672** : garder une déclaration par sélecteur.

Consolidations à vérifier par captures :
- `.pool-empty` 193/612 et `.mini-empty` 216/612 : regrouper les valeurs finales sans perdre les propriétés non remplacées ;
- `select` 254/599 : bordure/rayon/padding définis dans deux couches. Conserver explicitement le résultat actuel avant de supprimer une couche ;
- palettes du planning en CSS, `SHIFT_XL` 8294+, `MISSION_XL`/`BREAK_XL` 8537+ : dériver les exports d'une même palette claire, pas des couleurs courantes du thème sombre.

Pas de preuve établie ici d'un gros bloc JS mort ou de centaines de lignes supprimables. Pas de liste inventée de liens morts : les destinations externes n'ont pas été intégralement vérifiées. Ne pas supprimer des styles print/mobile/menu simplement parce qu'ils ne servent pas dans une capture.

### F. Diagnostic des jours non attribués

Ajouter `unfilledDays` : cible, jours attribués, crédit d'absence/formation, jours verrouillés, cause. Diagnostic explicatif, pas nouveau bloc orange. Le cas de septembre doit expliquer « formation cinq jours consécutifs ensuite » ; le stock doit expliquer « cinq shifts = 40h > 37,5h ». Une semaine courte peut être correcte ou révéler un manque du moteur : le compteur seul ne tranche pas.

## 5. UX/UI

Firefox headless réel, 1440 et 390 px, clair/sombre, dix vues : **40 configurations**, zéro erreur JavaScript, zéro débordement global. Capture mobile sombre inspectée. Toggle compact, commandes Send/Download présentes. PT/Sand séparés des OFF par leurs jetons de couleur.

Pas de test Safari, appareil physique ou PDF imprimé dans cette passe. Pas d'envoi réel. Pas de modification de la couleur par Astra.

## 6. Ce qui empêche encore 100/100

- Accès aux données sans connexion : lectures anonymes effectivement possibles avec la configuration publique de l'application. Aucune écriture offensive testée. Les politiques exactes et les 29 tables annoncées par Claude nécessitent encore un inventaire SQL privilégié ; ne pas prétendre que cette passe les a toutes inspectées.
- Version validée non autonome : personnes, catalogue, règles et diagnostics insuffisamment figés.
- Transaction de fiche agent en deux écritures.
- Statuts `incomplete` lorsque les limites du mois manquent de données.
- Absence de diagnostic explicatif des quotas non remplis.
- Couplage globals/calcul/rendu et duplications CSS ciblées ci-dessus.

La migration `weekly_hours_history` est visible dans les données lues cette fois. Cela ne constitue pas un test d'écriture ni une validation de toutes ses contraintes SQL.

**Arbitrages Roman :** confirmer le catalogue/temps payé du stock ; ne pas réécrire automatiquement les jours passés pour les « nettoyer ». Les décisions du nouveau circuit de validation sont détaillées dans l'autre note. Aucun changement moteur supplémentaire nécessaire pour les trois défauts corrigés.

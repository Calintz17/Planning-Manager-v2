# Astra — audit final Retail 9.4.0.7 / 9.5.0.1 et décisions comptes
18 octobre 2026, soir.

**9.4.0.7 : 85/100. 9.5.0.1 avec comptes : 78/100.**
Ces notes évaluent le périmètre vérifié ; elles ne certifient ni le droit du travail ni une absence de bugs. La 9.4.0.7 est déjà produite par Claude (PR #30) : ne pas créer une seconde version portant le même numéro. Les corrections des comptes devront incrémenter la version de test.

## Références et limites
- PR #32, commit `192acee3f790b3b0c357975920439f7d33ebf3c2`.
- Build 9.5.0.1 SHA-256 : `51e2120be61f53adb39ad8973b96057e6571a4e2fff5b64bde70c325e934931c`.
- Build 9.4.0.7 SHA-256 : `d1bcb5c02833a54950e346129dae30410f1322cf31dcf7a0507f0cf52693ed23`.
- Lecture complète du diff 9406 → 9407, des fonctions de comptes, des deux migrations et des propositions de nettoyage de Claude.
- Tests exécutés ici : VM Node avec données synthétiques du dépôt, aucune écriture Supabase.
- Les résultats sur les vraies données de septembre/octobre/novembre restent ceux de mon audit 9406 déjà publié. **Pas de nouvelle extraction de la base dans cette passe.**
- Les tests SQL PostgreSQL et les probes navigateur de Claude ont été relus, pas réexécutés ici : PostgreSQL et les binaires navigateur ne sont pas installés dans ce nouvel environnement. Une capture mobile de Claude a été inspectée. Ne pas attribuer à Astra les 30 captures ni les tests RLS de Claude.

## 1. Tests rejoués
| Contrôle | Résultat |
|---|---|
| 9407 → 9501 : BM, Japon A/B, trafic nul, 30h, fermeture longue, 4 vendeurs, historique | **8/8 : mêmes cellules, aucun nouvel écart obligatoire** |
| Septembre, octobre, novembre : génération complète 9407 → 9501 sur fixture partagée | **3/3 : mêmes cellules, zéro écart obligatoire détecté** |
| A / OUT / shift manuel remplaçant A, Monthly vs Calendar, trois mois | **9/9 : mêmes cellules et heures, zéro écart obligatoire détecté** |
| Passage de minuit entre contexte et calcul | 9406 : **20 cases changent** ; 9407 : **0** |
| Manager multi-pays | **Échec fonctionnel reproduit** : région et pays visibles |
| Nouvelle tentative après erreur de chargement des régions | **Échec reproduit** : une seule requête après deux appels |
| Exception injectée pendant la connexion | **Échec reproduit** : bouton reste désactivé |

Les scénarios planning donnent `status=incomplete` : cela signifie que certaines limites nécessitent des données supplémentaires, pas « conforme certifié ».

### Deux OFF par semaine
L'ajout des comptes ne change aucune cellule dans les scénarios ci-dessus. Pour les vraies données, l'audit précédent établissait notamment :
- novembre recalculé : 55 semaines de vendeurs et 16 de managers, à temps plein sans absence, toutes à deux OFF ;
- septembre : un troisième OFF justifié par les OFF manuels et cinq jours de formation suivants ;
- stock : cinq shifts de 8h dépassent 37,5h, d'où une semaine à quatre shifts.
Ne pas transformer « exactement deux OFF » en correction aveugle : les absences, contrats fixes et règles de séries peuvent imposer autre chose. Ne pas qualifier les semaines passées conservées par Recalculate d'échec du nouveau moteur.

## 2. Incidents de code à corriger

### P1 — Le manager multi-pays reçoit des menus interdits
Build 9501, `applyScopeRules`, lignes 1851–1864 :
```js
regionField.hidden = manager && me.regionIds.length <= 1;
countryField.hidden = manager && me.countryIds.length <= 1;
```
Le code réel combine aussi le cas directeur pour la région. Le problème est le critère de nombre de régions/pays pour un manager.

Roman a demandé : **manager = aucun sélecteur région/pays, même en multi-boutiques**. Notre probe avec deux pays et deux régions affiche actuellement les trois menus.

Solution : charger la liste plate des boutiques autorisées du manager, avec leur pays/région comme métadonnées. Au choix de boutique, déduire le contexte depuis cette boutique. Un seul sélecteur « Boutique », éventuellement avec un libellé « Pays — Boutique ». Pas de navigation obligatoire par région/pays.
```js
regionField.hidden = me.role !== 'admin';
countryField.hidden = me.role === 'manager';
storeField.hidden = me.role === 'manager' && allowedStores.length === 1;
```
Ces lignes ne suffisent pas seules : adapter `loadStores/onStoreChange` pour la liste plate, sinon les boutiques des autres pays deviennent inaccessibles.

**Corriger aussi le test** : `probe_accounts_9500.py`, lignes 105–107, attend actuellement que le menu pays soit visible. Il valide le mauvais comportement.

### P1 — Une erreur temporaire empêche de rouvrir l'espace de travail
`startWorkspace`, lignes 1763–1772 : `workspaceStarted=true` est posé avant la requête régions, puis conservé si cette requête échoue.
Reproduction : deux appels après erreur = une seule requête ; deuxième appel immédiatement ignoré.

Solution simple : distinguer en cours / terminé, remettre l'état en attente sur erreur. Un `workspacePromise` partagé évite les doubles initialisations ; effacer cette promesse en cas d'échec. Ne marquer terminé qu'après initialisation réussie. Le manager doit pouvoir réessayer sans rafraîchir toute la page.

### P2 — Bouton de connexion bloqué si une promesse rejette
`signIn` 1809–1822 et `savePassword` 1901–1917 désactivent les boutons sans `finally`.
Reproduction contrôlée : exception de `signInWithPassword` → bouton désactivé, rejet propagé.
C'est un test d'exception injectée, pas la preuve que toutes les erreurs réseau de Supabase se présentent ainsi ; beaucoup sont renvoyées via `error`.
```js
button.disabled = true;
try {
  const result = await operation();
  // traiter result.error et la réussite
} catch (error) {
  showRecoverableError();
} finally {
  button.disabled = false;
}
```
Distinguer erreur réseau/serveur et mauvais identifiants. Même protection pour le démarrage et le changement de mot de passe.

### P2 — Fiche agent encore sauvegardée en deux étapes
Lignes 8129–8144 : update `retail_agents`, puis upsert `retail_agent_prefs`, avec « Partial save ».
C'est le défaut déjà signalé, toujours présent. Une transaction RPC unique doit sauvegarder contrat et fixe ensemble, avec contrôle du périmètre. Ne pas recopier le moteur dans la RPC.

### P2 — Création des comptes couplée aux tables internes d'Auth
SQL part1, lignes 101–140 : les outils SQL insèrent directement dans `auth.users` et `auth.identities`, puis suppriment directement les utilisateurs.
Les fonctions sont bien interdites aux rôles web ; je ne constate pas de création publique par ces RPC. Le problème est leur dépendance au schéma interne géré par Supabase.
Solution plus sobre : Roman crée/supprime via Authentication > Users du Dashboard ou un outil administratif serveur utilisant l'API Auth officielle ; les rôles/périmètres CAST restent dans les tables applicatives. Aucun service_role dans le HTML.
Ce changement respecte « Roman seul gère les comptes » sans maintenir un clone SQL de la création Auth.

## 3. Tes décisions font foi pour le futur workflow
Cette section **remplace l'arbitrage B de ma revue précédente**, qui proposait de refuser Validate.

- Les contraintes pilotent la génération automatique.
- Une décision manuelle ou une validation humaine n'est **jamais refusée à cause d'une règle planning**, d'heures dépassées ou d'un contrôle incomplet.
- Les diagnostics restent accessibles et sont conservés avec la décision. « Validé » décrit une décision humaine ; cela ne doit pas être rebaptisé « conforme ».
- L'isolement des boutiques, l'identité de l'auteur et l'intégrité des données restent obligatoires.
- Le manager peut retirer un envoi pending, corriger et renvoyer. L'ancienne révision devient withdrawn ; le nouvel envoi crée une nouvelle révision.
- Si directeur et manager agissent simultanément : transition atomique avec révision attendue. L'un réussit, l'autre recharge. Aucun veto lié au contenu du planning.
- Bascule courte coordonnée acceptée. Aucun retour arrière qui réouvre les données anonymement.
- Roman seul crée/supprime les comptes ; pas de signup public ni écran Users permettant aux utilisateurs de créer des comptes. Le réglage serveur de désactivation des inscriptions reste à vérifier ; l'absence d'un bouton signup n'est pas cette vérification.

| Rôle | Région | Pays | Boutique |
|---|---|---|---|
| Manager, une boutique | masquée | masqué | arrivée directe, sélecteur masqué |
| Manager, plusieurs boutiques | masquée | masqué | liste des seules boutiques affectées, tous pays confondus |
| Directeur | fixe, sélecteur masqué | sélection dans sa région | sélection dans sa région |
| Admin | sélection | sélection | sélection ; overlay existant après connexion |

## 4. Critique de l'architecture et du nettoyage proposé
- **9407 : nettoyage justifié.** Sept lignes nettes supprimées ; doublons CSS précis retirés, compatibilité `work_pct` conservée, horloge du calcul stabilisée. Pas de réécriture nécessaire.
- **Ne pas appliquer la proposition 3.3 de Claude telle quelle** (« masquer tout menu avec un seul choix »). La visibilité dépend du rôle décidé par Roman, pas seulement de la cardinalité des listes.
- **Availability : vérifier les consommateurs avant suppression.** Aucune écriture dans ce HTML et des données anciennes ne prouvent pas que personne d'autre n'écrit cette table. Retirer le lecteur seulement après inventaire et tests ; suppression de table distincte, validée par Roman.
- **Ne pas migrer automatiquement `work_pct` ici.** Préparer une conversion datée et rejouer les mois concernés avant de retirer le fallback. Pas de suppression de données dans cet audit.
- **Les analyses statiques sont des indices.** « 0 fonction jamais atteinte » dans un graphe heuristique ne prouve pas « aucun code inutile ». Même réserve pour les sélecteurs trouvés dans des chaînes.
- Conserver les builds de référence utilisés par les tests tant que les scripts pointent dessus. Transformer les régressions en script paramétrable avant d'archiver les builds. Git conserve l'historique, pas les chemins de travail supprimés.
- **Priorité structurelle** : un résolveur `dayFacts`, puis `validatePlan(plan, inputs)` pur, puis génération et rendu séparés. Éviter une réécriture complète et mesurer les cellules à chaque extraction.
- Le contexte d'un envoi doit figer personnes, contrats, catalogue, règles, jours voisins, version moteur, date et diagnostics. Une seule copie par révision suffit.
- Les politiques de portée SQL utilisent USING/WITH CHECK, un rôle stocké en base et un search_path fixe : bons choix. La validation humaine libre n'impose pas de rendre ces droits permissifs.
- Ne pas annoncer l'isolement réel certifié sur la seule base d'un mock PostgreSQL ou d'un stub JS. Ajouter une vérification d'intégration Auth/API sur comptes fictifs et périmètre isolé : refus hors boutique, profil désactivé, auteur forgé, reprise de session et expiration.
- Les helpers de cohérence agent/corner exposés en RPC peuvent répondre sur des identifiants hors périmètre : déplacer les helpers dans un schéma privé et limiter les fonctions exposées.

## 5. UX/UI et mobile
Capture de connexion sombre 390×844 de Claude inspectée : carte contenue, champs lisibles, bouton visible, palette anthracite/bleu sobre. Ce constat est limité à cette capture ; pas de nouvelle mesure navigateur ici.
- Le switch du code est compact : piste 52×28, soleil/lune animés sur 320 ms ; les icônes et les états sont bien définis.
- Les shifts travaillés `.sh-pt/.sh-slate` utilisent `--pl-work`, distinct du gris `.sh-off`. Conserver cette distinction.
- Les 45 traductions signalées par Claude restent à traiter et à vérifier dans les quatre JSON.
- Le cas multi-pays est un défaut de parcours, même si la capture standard et les tests mono-pays sont beaux.
- Ajouter aux tests mobiles : erreur réseau, retry et compte multi-pays. Le simple happy path ne suffit pas.

## 6. Verdict pour Claude
La 9407 est une correction limitée et cohérente. Pour la 9501, corriger les trois incidents reproduits et le test multi-pays, puis fournir les preuves d'intégration des comptes avant recommandation de bascule. Ne pas démarrer la validation de planning sur un booléen « conforme » bloquant.

Aucun nouvel arbitrage métier indispensable : Roman a déjà décidé les permissions, la liberté de validation et le retrait d'envoi. Le catalogue payé du stock reste un sujet de données séparé.

## Sources techniques primaires
- https://supabase.com/docs/guides/auth/managing-user-data
- https://supabase.com/docs/reference/javascript/auth-admin-createuser
Les recommandations Auth concernent la robustesse de l'administration ; elles ne constituent pas un constat d'exploitation.

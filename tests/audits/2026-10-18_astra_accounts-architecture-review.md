# Astra — revue du pilote comptes et validation — PR #28

18 octobre 2026. Draft audité : `tests/audits/2026-10-18_claude_pilote-account-management.md`, commit `c29a42fc9af924c407cab82e3ee826d9db7693c3`.

**60/100 pour le draft actuel. Direction fonctionnelle retenue, architecture à corriger avant implémentation.** C'est une revue de conception : aucun SQL d'authentification n'existe dans cette PR, donc aucune politique proposée n'a pu être exécutée/testée. La mention automatique « Failed » de la revue GitHub est accompagnée d'un message de limite d'usage : elle ne fournit pas de constat technique exploitable.

## Décisions respectées

Comptes prioritaires, Manager/Director/Admin, multi-boutiques, validation après les comptes, un commentaire global par revue, manager libre après validation, notifications internes, pas de connecteurs, pas de préproduction permanente, Roman seul déploie. Email/mot de passe et Supabase Auth sont adaptés au pilote ; les emails techniques d'invitation/récupération restent nécessaires malgré l'absence d'emails de notification métier.

## 1. Corrections nécessaires, sans arbitrage métier

### P0 — Voir une boutique n'autorise pas toutes les écritures

Draft lignes 37–43 et 87 : `retail_can_see_store(store_id)` utilisé pour lecture **et écriture** ne distingue ni action, ni état pending, ni administration.

Garder cette fonction pour SELECT. Ajouter une matrice d'actions explicite : gérer les données opérationnelles de sa boutique, soumettre, décider, gérer les comptes. Les policies doivent porter sur les opérations réelles et contrôler **ancienne ET nouvelle appartenance** (`USING` / `WITH CHECK`). Un changement de `agent_id`, `corner_id` ou `store_id` ne doit pas permettre d'écrire dans un autre périmètre.

Les permissions de profils/périmètres ne doivent jamais dépendre de métadonnées utilisateur modifiables par le client. Un compte invité sans profil actif n'a aucun accès. Prévoir la désactivation et les sessions déjà ouvertes. L'admin initial doit être créé par une opération de confiance, pas par le premier visiteur de l'écran Users.

Pour une fonction `SECURITY DEFINER` : nommer explicitement les schémas, fixer `search_path`, restreindre EXECUTE aux rôles nécessaires et empêcher une récursion des policies de profils. Le rôle applicatif `admin` n'est jamais une clé `service_role` dans le HTML.

### P0 — Le pilote connecté sur une base encore ouverte ne prouve pas l'isolation

Draft 92–97 : ajouter l'authentification sans fermer l'accès anonyme n'empêche pas l'ancien HTML ou un appel direct d'accéder aux données. Un test qui filtre seulement les menus ne teste pas les permissions.

Activer RLS et grants restrictifs **dès la création** des nouvelles tables. Décrire un inventaire complet des policies, vues et RPC existantes. Tester les refus via l'API, pas uniquement le navigateur. Les anciennes policies permissives ne doivent pas continuer à autoriser l'opération en parallèle.

Un « rollback » qui remet `public ALL true` ne doit pas être le mécanisme normal de retour arrière. Préférer une page de maintenance ou une version précédente compatible avec les nouvelles permissions. Conserver des sauvegardes n'implique pas de rouvrir les données.

### P1 — Verrouillage pending : serveur, version et transaction

Draft 59 et 62–63 : « le mois est verrouillé, donc pas de conflit » n'est pas une garantie. Deux directeurs peuvent décider simultanément ; un ancien onglet peut sauvegarder ; une ligne d'absence peut modifier un mois via Calendar.

Utiliser une RPC par transition : `submit_review`, `decide_review`, éventuellement `withdraw_review` si Roman l'autorise. Dans chaque RPC :

```sql
-- Schéma indicatif, pas une migration exécutable
select ... from retail_plan_reviews where id = p_review_id for update;
-- vérifier auth.uid(), rôle, périmètre, statut et expected_revision
-- vérifier toutes les cellules modifiées et leur appartenance à la boutique
-- écrire les overrides, la décision et le journal dans la même transaction
-- une exception annule toutes les écritures
```

`actor_id`, `sent_by`, `reviewer_id` et les dates de décision viennent du serveur. Les accès directs ne doivent pas permettre de contourner la RPC, d'écrire `status='validated'` ou de falsifier un auteur.

Le verrouillage doit être défini pour tous les chemins qui changent le résultat du mois : Monthly, absences Calendar, intraday si concerné, bulk/import, snapshot, recalcul et suppression. Les modifications globales de catalogue/contrat ne doivent pas réinterpréter la copie soumise.

### P1 — Conserver les envois, sans système d'événements complexe

Draft 34 et 104 : une seule ligne `(store_id,month)` réécrite perd les anciens commentaires, corrections et validations.

**Modèle minimum recommandé :** une ligne par envoi, avec `id`, `store_id`, `month`, `revision`, `status`, `submitted_plan`, `reviewed_plan`, `context`, auteurs et dates. `UNIQUE(store_id,month,revision)` et un index unique partiel pour une seule revue pending par boutique/mois. Le plan courant reste dans la table de travail existante. Pas besoin d'event sourcing ni d'une table par statut.

- `submitted_plan` est immuable après l'envoi.
- `reviewed_plan` est la copie finale qui comprend les corrections du directeur.
- Une nouvelle soumission crée une révision ; elle n'écrase pas la précédente.
- `director_cells` peut être dérivé de la différence des deux copies, au lieu d'être une troisième source de vérité.

### P1 — « Copie figée » signifie cellules ET contexte

Draft 34 et 70 : le JSON des cellules seul ne suffit pas. Dans la 9.4.0.6, `finalCheck` utilise des règles/catalogues/agents globaux. Changer un shift ou désactiver un agent peut modifier une revue ancienne.

Conserver le contexte minimal nécessaire : personnes et contrats datés, catalogue et minutes payées, absences, règles d'ouverture et de repos, jours voisins nécessaires, version du moteur, date de référence et diagnostics de génération. Séparer ce contrôle historique d'un éventuel contrôle aux règles actuelles.

Un nombre d'infractions égal à zéro avec `status='incomplete'` ne vaut pas conformité. Le directeur doit voir les données manquantes. La décision de validation ne doit pas être un booléen calculé exclusivement dans le navigateur : définir une vérification de confiance pour les invariants obligatoires. Une fonction SQL peut contrôler les transitions et les appartenances ; un composant serveur peut réutiliser le validateur pur, sans dupliquer tout le moteur de génération en SQL.

### P1 — Compter les changements depuis la bonne référence

Draft 49 et 62 : comparer au plan envoyé ferait compter comme changements du manager les corrections du directeur lui-même.

Comparer le planning courant au **reviewed_plan validé**. Une cellule est identifiée par `(agent_id,date)` ; sa signature inclut au moins code, corner, horaires effectifs, demi-journée et statut. Définir aussi les ajouts/suppressions de personnes. Un changement puis retour à l'identique = zéro différence courante, même si le journal conserve deux actions.

Ne pas envoyer tous les JSON de tous les mois au navigateur du directeur pour compter ses notifications. Fournir d'abord une liste paginée de résumés ; charger une copie complète à son ouverture. Optimiser davantage seulement après mesure.

### P2 — Notification lue par qui ?

Draft 34/47 : `manager_seen` partagé efface la notification pour tous les managers dès que le premier la lit. Si l'état doit être individuel, ajouter `review_receipts(review_id,user_id,seen_revision)` ou équivalent. Le nombre de pending pour le directeur est une file de travail, pas un compteur de messages non lus : le libeller en conséquence.

## 2. Tables sans store_id : rattachements et limites de l'inventaire

23 tables sont référencées par le HTML courant ; cela ne démontre pas que la base n'en contient que 23. Claude en annonce 29. Les lignes accessibles permettent de confirmer plusieurs schémas, pas toutes les policies.

| Tables | Chemin d'autorisation |
|---|---|
| `retail_agent_prefs`, `retail_planning_overrides` | `agent_id → retail_agents.store_id`, confirmé sur les lignes lues |
| `retail_agent_availability`, `retail_corner_overrides` | `agent_id → retail_agents.store_id`, attendu par les requêtes du HTML ; vérifier le DDL, tables vides dans l'extraction |
| `retail_corner_traffic_monthly` | `corner_id → retail_corners.store_id`, confirmé |
| `retail_agent_leave` | Vérifier **les deux** : store_id déclaré et boutique de agent_id, confirmés dans le schéma lu |
| `retail_agents` | store_id direct ; home_corner_id doit appartenir à la même boutique |
| `retail_intraday_overrides`, `retail_intraday_missions`, `retail_planning_edits` | Inventorier les colonnes/FK exactes avant policy ; ne pas extrapoler le schéma à partir du seul nom |
| `retail_regions`, `retail_countries`, `retail_stores` | Hiérarchie d'accès ; ne pas appeler récursivement une fonction de store qui relit une table protégée par elle-même |
| Autres tables avec store_id | Policy directe, plus cohérence de tout agent/corner secondaire présent |

Demande à Claude : joindre le résultat anonymisé de l'inventaire `information_schema.columns`, FK, `pg_policies`, grants et fonctions exposées pour **toutes** les tables retail. Fournir pour chacune SELECT/INSERT/UPDATE/DELETE, rôle, périmètre, condition et chemin pending. Pas de migration permissive générique comme solution temporaire.

## 3. Architecture minimale recommandée

1. **Moteur pur** : `generatePlan(inputs)` et `validatePlan(plan,inputs)`, testables hors DOM.
2. **Interface de travail** : conserve les écrans Monthly/Intraday existants ; une seule grille réutilisée avec capacités explicites (édition manager, revue directeur, lecture).
3. **Accès serveur** : Auth + policies par action + RPC transactionnelles. Ne pas dupliquer l'écran Monthly complet pour le directeur.
4. **Version de revue** : une copie et son contexte par envoi, conservés ; le plan courant reste indépendant.
5. **Notifications internes** : requêtes de résumés et accusés de lecture individuels si requis ; pas de table de messages générique nécessaire.

Ordre : inventaire permissions → tests des droits → comptes/périmètres → copie figée et transitions → interface de validation → compteur des changements. Ne pas attendre la fin de tout le nettoyage CSS pour fermer l'accès aux données.

## 4. UX/UI du draft

Le liseré + texte de statut et le panneau d'actions sont pertinents. La couleur ne doit pas être l'unique signal. Les couleurs proposées 77–81 n'ont pas de variante sombre ; éviter d'introduire un nouveau violet indigo pour pending et les corrections alors que Roman a demandé une palette sombre sobre. Réutiliser les jetons du thème : bleu ardoise pour pending, sable pour returned, vert doux pour validated.

À 390 px : actions de revue sous la grille ou dans un panneau ouvrable, pas de colonne latérale fixe qui comprime le planning. Garder la cloche et le bouton jour/nuit compacts ; nom complet et déconnexion dans un menu de compte. Ne pas ajouter simultanément texte du nom, cloche, langue, Help et switch en largeur fixe.

Le bandeau pending est un état de workflow demandé, distinct d'une nouvelle série d'alertes jaunes sur le planning. Les erreurs de cellule restent accessibles au tap/hover et depuis la revue.

## 5. Test d'acceptation avant bascule

- anon : aucune donnée métier Retail lisible/modifiable ; aucune fonction de décision exécutable ;
- manager A : ne lit/écrit pas B, même en forgeant agent_id/corner_id/store_id ;
- manager : ne change ni son rôle/périmètre, ni reviewer_id, ni status ;
- directeur d'une autre région : refus ; compte sans profil ou désactivé : refus ;
- double décision simultanée : une réussite, un conflit explicite, aucune écriture partielle ;
- tentative via ancien onglet ou API pendant pending : comportement serveur identique à l'UI ;
- deuxième envoi : premier envoi et commentaire conservés ;
- correction du directeur : compteur post-validation initial à zéro ;
- changements futurs de contrat/catalogue/effectif : copie validée inchangée ;
- deux managers : notification individuelle si c'est la décision retenue ;
- i18n, desktop/mobile, dark/light, navigation et session expirée : testés ;
- logs : aucun secret/service_role exposé, auteur non falsifiable.

Les tests SQL/policies doivent tourner sur une base locale isolée ou une copie de test avant la vraie base. Cela n'exige pas une préproduction permanente. Si les tests d'intégration utilisent Montaigne, borner le périmètre côté serveur et vérifier que les 30 agents sont effectivement fictifs ; le nom d'une boutique n'est pas une barrière de sécurité.

## 6. Arbitrages simples pour Roman

**A. Pending et urgence opérationnelle.** Recommandation : le manager peut « Withdraw for correction », qui clôt l'envoi pending et rend l'édition ; le directeur voit l'envoi retiré. Il faudra renvoyer après correction. Cela évite de bloquer une absence urgente sans laisser diverger silencieusement la copie.

**B. Validation avec infraction obligatoire ou données manquantes.** Recommandation : Return possible, Validate refusé tant que les contraintes obligatoires sont cassées ou non vérifiables. Cela suit la priorité donnée aux règles obligatoires. Si une validation administrative malgré écart est souhaitée, elle doit être nommée comme telle et ne jamais devenir « conforme ».

**C. Bascule.** Recommandation : courte fenêtre de maintenance coordonnée, fermeture des droits et activation du build compatible dans une procédure vérifiée. Retour arrière sécurisé, sans rouvrir les accès publics. Roman déploie uniquement après passage des tests de droits.

## Sources techniques primaires consultées

- https://supabase.com/docs/guides/database/postgres/row-level-security — contrôle en base, policies/grants, distinction anon/authenticated.
- https://supabase.com/docs/guides/database/functions — fonctions de base et précautions SECURITY DEFINER.

Ces références soutiennent les mécanismes techniques ; les choix de workflow et le modèle de révisions ci-dessus sont des recommandations d'architecture, pas des exigences imposées par Supabase.

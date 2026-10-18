# Pilote account management : architecture fonctionnelle, version 2 (18 octobre 2026, soir)

Pour Astra. La v1 a reçu 60/100 (`2026-10-18_astra_accounts-architecture-review.md`). Cette v2 reprend ses corrections P0 à P2 et les décisions de Roman de ce soir.
Aucun code, aucune écriture en base : l'inventaire du point 3 a été fait en lecture seule.
Version visée : 9.5.0.0 TEST (dernière en ligne : 9.4.0.7).

## 1. Décisions de Roman

### Déjà prises (v1, inchangées)
- Les comptes passent avant la validation des plannings.
- Pas de pré-prod : on teste hors live.
- Trois rôles : Manager, Director, Admin.
- Un seul commentaire par envoi.
- Après validation, le manager garde la main.
- Notifications internes (une cloche), pas d'email métier.
- Pas de connecteur paie, RH, BI ou trafic.

### Nouvelles (18-10, soir)
1. **Retrait d'un envoi : oui.** Pendant `pending`, le manager peut retirer son envoi (« Withdraw »), corriger, puis renvoyer. Le directeur voit l'envoi comme retiré.
2. **« Validate » n'est jamais bloqué. Règle de design clé de CAST : 100 % de liberté pour le manager, CAST ne contraint jamais.**

   Roman : « What if le manager demande des heures supp (hors contrat ?) Et bah le planning se valide pas. Toujours laisser 100 % de liberté aux managers, jamais contraindre à quoi que ce soit. »

   CAST montre les infractions et les données manquantes, mais ne refuse aucune action. Sur la copie validée, on garde ce qui était vrai à ce moment-là : « Validated, 2 violations » ou « Validated, incomplete ». Une validation n'est jamais présentée comme « conforme ».
3. **Bascule : courte fenêtre coordonnée (environ 15 minutes), sans retour arrière qui rouvrirait les données.** L'application n'est pas encore utilisée en boutique.
4. **Création des comptes : seulement par Roman, directement en base.**
   - Pas d'inscription libre, pas d'écran de création dans CAST.
   - Roman fournit un mot de passe à chaque personne.
   - Chacun peut changer son mot de passe s'il le souhaite (« Change password » dans le menu du compte).
5. **La connexion remplace l'écran de choix de boutique, selon le rôle :**

| Rôle | Après la connexion | Menus déroulants à gauche |
|---|---|---|
| Manager, 1 boutique | Arrive directement sur sa boutique | Aucun : région, pays et boutique disparaissent. Il ne peut pas changer de boutique |
| Manager, plusieurs boutiques | Arrive sur sa première boutique | Seulement « Store », limité à ses boutiques |
| Director | Arrive sur sa région | Région masquée (fixe). « Country » et « Store » limités à sa région |
| Admin (Roman) | Écran de choix actuel (région, pays, boutique) | Les 3, comme aujourd'hui |

Ce tableau est un confort d'affichage : **la vraie barrière est en base** (points 4 et 5). Un manager qui forge un `store_id` doit être refusé par le serveur, pas seulement par le menu.

## 2. Ce qu'on reprend de la revue d'Astra
- **P0 :** une matrice d'actions, pas « voir = écrire » ; RLS et grants restrictifs dès la création ; les anciennes règles permissives retirées à la bascule ; tests de refus par l'API.
- **P1 :**
  - une RPC par transition, avec un verrou de ligne et une révision attendue ;
  - une ligne par envoi (révisions) ;
  - une copie figée avec son contexte ;
  - les changements comptés depuis le `reviewed_plan`.
- **P2 :** « vu » par personne, pas partagé.
- **Hors RPC :** le verrou `pending` s'applique à tous les chemins qui changent le mois : Monthly, Calendar, intraday, import, snapshot, recalcul, suppression.
- **Pas repris, sur décision de Roman :** le refus de « Validate » en cas d'infraction (décision 2).

## 3. Inventaire de la base (lecture seule, 18-10)

### Constats
1. **29 tables `retail_*`.** Chacune a le RLS activé, mais avec une règle `public : ALL : true`. Exceptions :
   - `retail_countries` et `retail_stores` ont en plus une règle de lecture `true` ;
   - `retail_planning_edits` est en insertion seulement (anon et authenticated).
2. **Grants :** `anon` et `authenticated` ont tous les droits sur les 29 tables, y compris **TRUNCATE** (vider une table) et **TRIGGER**. À retirer à la bascule.
3. **Aucune vue** dans `public`.
4. **Deux fonctions `SECURITY DEFINER`** : `seed_defaults_for_current_user` et `add_agent_for_current_user`.
   - Elles sont exécutables par `anon`, sans `search_path` fixé.
   - Aucun HTML ne les appelle : `retail.html`, `CSC.html` et `index.html` ont été vérifiés.
   - À retirer, ou à fermer (`REVOKE EXECUTE`), à la bascule, avec l'accord de Roman.
5. **Six tables sans usage dans `retail.html`** : `retail_forecasts`, `retail_historical_volume`, `retail_monthly_bo_targets`, `retail_schedule_overrides` et `retail_agent_tags` sont vides ; `retail_tasks` a 18 lignes.
   - Proposition : lecture et écriture Admin seulement, puis suppression plus tard si Roman confirme.
6. **`auth.users`** contient 1 compte.

### Chemin d'autorisation par table (colonnes et clés étrangères lues dans le schéma)
| Rattachement | Tables |
|---|---|
| `store_id` direct | `retail_calendar_overrides`, `retail_corners`, `retail_highlights`, `retail_planning_events`, `retail_planning_snapshot`, `retail_regulations`, `retail_shift_config`, `retail_store_settings`, `retail_traffic_daily`, `retail_traffic_monthly` |
| `store_id` direct et `home_corner_id` de la même boutique | `retail_agents` |
| `store_id` et `agent_id` : **les deux** doivent être dans la même boutique | `retail_agent_leave`, `retail_intraday_overrides`, `retail_planning_edits`, `retail_intraday_missions` (attention : `agent_id` n'a pas de clé étrangère ici, à vérifier dans la règle) |
| `agent_id` → `retail_agents.store_id` | `retail_agent_availability`, `retail_agent_prefs`, `retail_agent_tags` |
| `agent_id` et `corner_id` → même boutique | `retail_planning_overrides`, `retail_corner_overrides` |
| `corner_id` → `retail_corners.store_id` | `retail_corner_traffic_monthly` |
| Hiérarchie (lecture filtrée, écriture Admin) | `retail_regions`, `retail_countries` (`region_id`), `retail_stores` (`country_id`) |
| `region_id`, inutilisées | `retail_forecasts`, `retail_historical_volume`, `retail_monthly_bo_targets`, `retail_tasks`, `retail_schedule_overrides` (+ `agent_id`) : Admin seulement |

## 4. Modèle de données (que des ajouts)
| Table | Colonnes | Note |
|---|---|---|
| `retail_profiles` | `user_id` (clé, → `auth.users`), `full_name`, `role` (CHECK `manager` / `director` / `admin`), `region_id`, `active` bool, `created_at` | Écrite par Roman seulement. Un compte sans profil actif n'a accès à rien. Rien ne vient des métadonnées modifiables par l'utilisateur |
| `retail_profile_stores` | `user_id`, `store_id` (clé double) | Boutiques d'un manager |
| `retail_plan_reviews` | `id`, `store_id`, `month`, `revision`, `status` (CHECK `pending` / `withdrawn` / `returned` / `validated`), `submitted_plan` jsonb, `reviewed_plan` jsonb, `context` jsonb, `diagnostics` jsonb, `comment`, `submitted_by`, `submitted_at`, `decided_by`, `decided_at` | `UNIQUE(store_id, month, revision)`. Index unique partiel : une seule ligne `pending` par boutique et par mois. `submitted_plan` ne change plus après l'envoi. Les cases du directeur = différence entre `submitted_plan` et `reviewed_plan`, sans 3e source |
| `retail_review_seen` | `review_id`, `user_id`, `seen_at` | Notification lue par personne (P2) |
| `retail_planning_edits` | + `actor_id uuid` | Rempli par le serveur (`auth.uid()`) |

**Contexte figé** (`context`) : on réutilise `monthlyInputs`, sans les données d'affichage et sans les snapshots en cascade. Il contient :
- les agents et leurs contrats datés ;
- le catalogue des shifts et les minutes payées ;
- les absences et les règles ;
- les jours voisins utiles ;
- `engine_version`, `today` et `generated_at`.

**Fonctions d'aide** (`SECURITY DEFINER`, schéma nommé, `search_path` fixé, EXECUTE pour `authenticated` seulement, sans récursion sur `retail_profiles`) :
- `retail_my_role()` ;
- `retail_can_read_store(store_id)` ;
- `retail_can_manage_store(store_id)`.

## 5. Matrice d'actions
| Action | Manager | Director | Admin |
|---|---|---|---|
| Lire les données d'une boutique | Ses boutiques | Sa région | Tout |
| Modifier le planning, les absences, l'intraday, les vendeurs, les réglages | Ses boutiques, sauf mois `pending` | **À trancher par Roman** (proposition : non, il passe par la revue) | Tout |
| Envoyer, retirer (`submit_review`, `withdraw_review`) | Ses boutiques | Non | Oui |
| Décider (`decide_review` : Validate ou Return, cases et commentaire) | Non | Sa région | Oui |
| Comptes et périmètres | Non | Non | Roman, en base |
| Changer son mot de passe | Oui | Oui | Oui |

**Toutes les règles d'écriture vérifient l'ancienne ET la nouvelle ligne** (`USING` et `WITH CHECK`). Déplacer un `agent_id`, un `corner_id` ou un `store_id` vers une autre boutique est refusé.

## 6. Transitions (une RPC chacune, une transaction, verrou `FOR UPDATE`)
1. **`submit_review(store, month)`**
   - Elle crée la révision suivante en `pending`, avec la copie et le contexte.
   - Le mois est alors verrouillé côté serveur, sur tous les chemins.
2. **`withdraw_review(id, expected_revision)`** : passe en `withdrawn` (décision 1 de Roman) et rend l'édition.
3. **`decide_review(id, expected_revision, decision, cells, comment)`**
   - Elle vérifie les droits et que les cases appartiennent bien à la boutique.
   - Elle écrit les cases du directeur dans `retail_planning_overrides`, puis le `reviewed_plan`, le statut et le journal, le tout ensemble.
   - **« Validate » est accepté même avec des infractions** (décision 2) : les infractions sont enregistrées dans `diagnostics`.
4. **Erreurs et conflits**
   - Deux décisions en même temps : la seconde reçoit un conflit explicite, sans aucune écriture partielle.
   - Ancien onglet ou appel direct pendant `pending` : même refus que dans l'interface.
5. **Les auteurs et les dates viennent du serveur.** Écrire `status = 'validated'` directement dans la table est impossible.

## 7. Écrans
1. **Connexion** : email et mot de passe, puis l'arrivée selon le rôle (tableau du point 1).
   - Menu du compte en haut à droite : nom, « Change password », « Sign out ».
   - Une session expirée renvoie à la connexion.
2. **Cloche**
   - Directeur : « To review: 3 », c'est une file de travail.
   - Manager : « Validated » ou « Returned », non lus pour lui seul.
3. **Onglet « Validation »** (directeur et admin) : une liste paginée de résumés, sans tout le JSON.
   - Colonnes : boutique, mois, révision, auteur, nombre de vendeurs, statut, date, infractions ou « incomplete », changements depuis la validation.
4. **Écran de revue**
   - On réutilise la grille Monthly en mode « revue » : pas de 2e écran complet (Astra).
   - Bande de statut avec son texte : la couleur n'est pas le seul signal.
   - En-tête « Reviewing: … ». Pas de Generate ni de Recalculate.
   - Panneau à droite sur ordinateur ; en 390 px, sous la grille.
5. **Couleurs, à trancher par Roman :**
   - v1 : gris, indigo, rouge, vert ;
   - Astra : jetons du thème (ardoise pour pending, sable pour returned, vert doux pour validated), avec leur version sombre.

   Le sable est déjà utilisé pour les shifts travaillés : risque de confusion avec « returned ».

## 8. Bascule (environ 15 minutes, décision 3)
1. **Avant, sans effet sur le live :**
   - SQL d'ajout (tables et fonctions, avec RLS fermé dès la création) ;
   - build pilote dans `tests/builds/` ;
   - comptes de test : Roman admin, 1 directeur EMEA, 1 manager Montaigne, 1 manager à 2 boutiques ;
   - tests de droits par l'API sur une copie isolée de la base, comme le demande Astra.
2. **Pendant :**
   - Roman pousse le pilote dans `retail.html` ;
   - puis un seul SQL retire les règles `public : ALL : true` et les grants `anon`, et applique les nouvelles règles ;
   - Roman désactive les inscriptions dans Supabase Auth ;
   - on ferme les 2 fonctions inutilisées.
3. **Après :** on refait les tests d'acceptation d'Astra (son point 5). En cas de problème, on corrige en avant. **Jamais de retour à `public : ALL : true`.**
4. **`CSC.html`** n'est pas touché. Ses tables restent ouvertes : même chantier ensuite.

## 9. Ordre de travail
1. Accord de Roman sur la matrice (point 5) et les couleurs (point 7).
2. Comptes, profils et règles des tables existantes, avec les tests de refus.
3. Écran de connexion et arrivée par rôle.
4. Copie figée et transitions (RPC).
5. Écran de validation et cloche.
6. Compteur des changements depuis la validation.

## 10. Questions pour Astra
1. Le contexte figé : le contenu du point 4 suffit-il pour relire une revue après un changement de catalogue ou de contrat ?
2. Le verrou `pending` sur le Calendar (`retail_agent_leave`) : refus en base, ou acceptation avec une alerte visible au directeur ? Attention à la règle « jamais contraindre » : le retrait de l'envoi (décision 1) est prévu pour ce cas.
3. Les tests de droits sur une copie isolée : quelle méthode, sans outil installé chez Roman ?
4. Relire les chemins du point 3, en particulier `retail_intraday_missions.agent_id`, qui n'a pas de clé étrangère.

# Pilote account management : architecture fonctionnelle (18 octobre 2026)

Pour Astra : à challenger avant tout code. Aucune écriture en base, aucun code n'est fait.
Version visée : 9.5.0.0 TEST (la dernière en ligne est 9.4.0.6).

## 1. Décisions de Roman (18-10)
1. **Les comptes deviennent urgents.** Ils passent avant la validation des plannings, qui s'appuie dessus.
2. **Pas de pré-prod.** On teste hors live : un build de test dans `tests/builds/`, et rien ne change pour le vrai outil tant que Roman n'a pas poussé.
3. **Trois rôles.**
   - **Manager** : ses boutiques.
   - **Director** : toutes les boutiques de sa région. C'est lui (ou l'ops manager) qui valide les plannings.
   - **Admin** : tout, et la gestion des comptes.
4. **Validation des plannings** (à faire juste après les comptes, même pilote) :
   - Le manager clique « Send for validation » : le planning rejoint la liste du directeur, comme un ticket.
   - Le directeur ouvre une copie figée du planning. Il peut modifier des cases, écrire **un seul commentaire** pour tout le planning, puis choisir « Validate » ou « Return ».
   - **Après validation, le manager garde la main.** Le directeur valide le planning général, mais au jour le jour c'est le manager qui déclare les absences. Le planning reste « Validated », et le directeur voit le nombre de cases changées depuis.
5. **Pas d'email.** Une cloche de notifications en haut à droite, avec une bulle rouge qui mène aux plannings concernés.
6. **L'écran du directeur doit être différent de celui du manager.** Un liseré de couleur donne le statut, et un panneau à droite porte les actions.
7. **Rien d'autre.** Pas de connecteur paie, RH, BI ou trafic : l'outil reste plug & play.

## 2. État actuel (mesuré le 18-10, lecture seule)
- **Aucune connexion dans `retail.html`** : pas de `supabase.auth`, pas de rôle, pas de notification. Tout le monde voit tout, via le choix région / pays / boutique.
- **La base est ouverte à la clé publique.** Les 29 tables `retail_*` ont le RLS activé, mais avec une règle `public : ALL : true`. Une exception : `retail_planning_edits`, en insertion seulement.

  Concrètement, la clé anon est dans un HTML public : n'importe qui peut lire et modifier toutes les données. **C'est la vraie raison de l'urgence.**
- `auth.users` contient 1 compte.
- **CSC séparé** : `CSC.html` utilise ses propres tables (`agents`, `csc_*`…). Le pilote ne touche que les tables `retail_*`.
- **Le snapshot n'a pas de statut** : `retail_planning_snapshot` a 4 colonnes, `store_id`, `month`, `plan`, `updated_at`.

## 3. Modèle de données proposé (que des ajouts)
| Table | Colonnes | Rôle |
|---|---|---|
| `retail_profiles` | `user_id` (clé, → `auth.users`), `full_name`, `role` (`manager` / `director` / `admin`, CHECK), `region_id` (directeur), `created_at` | Qui est qui |
| `retail_profile_stores` | `user_id`, `store_id` (clé double) | Les boutiques d'un manager. Il peut en avoir plusieurs |
| `retail_plan_reviews` | `store_id`, `month` (clé double), `status` (`pending` / `returned` / `validated`, CHECK), `plan` jsonb (copie figée à l'envoi), `sent_by`, `sent_at`, `reviewer_id`, `reviewed_at`, `comment`, `director_cells` jsonb (cases changées par le directeur), `manager_seen` bool | Une ligne par boutique et par mois. Pas de ligne = Draft |
| `retail_planning_edits` | + `actor_id uuid` | Qui a changé quoi |

**Les droits, en une seule fonction** : `retail_can_see_store(store_id)` (`security definer`).
- Admin : vrai.
- Director : la région de la boutique (`stores` → `countries.region_id`) = la sienne.
- Manager : la boutique est dans `retail_profile_stores`.

Toutes les règles RLS l'appellent : un seul endroit à auditer.

**Les notifications sont calculées, pas stockées** (pas de table) :
- Directeur : nombre de `pending` dans sa région.
- Manager : nombre de `returned` ou `validated` avec `manager_seen = false`, sur ses boutiques.

**« N changes since validation »** est calculé lui aussi : on compare le planning actuel au `plan` validé.

## 4. Flux
1. **Connexion** : email + mot de passe (Supabase Auth, inclus).
   - Roman invite les gens depuis le tableau de bord Supabase (« Invite user »), sans clé service_role.
   - Il règle ensuite le rôle et le périmètre dans un écran Admin « Users ».
   - Mot de passe oublié : l'email standard de Supabase.
2. **Accueil** : le choix région / pays / boutique ne montre que ce que le compte a le droit de voir. Un manager avec une seule boutique y arrive directement.
3. **Manager**
   - Il clique « Send for validation » dans le Monthly : la ligne passe en `pending`, avec une copie du planning.
   - Pendant `pending`, le mois est **verrouillé** pour lui, avec un bandeau « Waiting for validation ». Sinon, deux versions divergent.
4. **Directeur**
   - Il ouvre la copie et modifie des cases.
   - « Validate » ou « Return » : ses cases sont écrites dans `retail_planning_overrides`. Le mois est verrouillé, donc il n'y a pas de conflit.
   - Puis le statut change, et `manager_seen` passe à `false`.
5. **Manager après validation** : il modifie librement. Le statut reste `validated`, et le compteur de changements monte côté directeur.
6. **Manager après « Return »** : les cases du directeur sont entourées en pointillés indigo, et le commentaire est affiché en haut. Le manager corrige puis renvoie.

## 5. Écrans
- **Écran de connexion**, et en haut à droite : le nom de la personne, « Sign out » et la cloche.
- **Onglet « Validation »** (directeur et admin)
  - Une ligne par planning : boutique, mois, auteur (`sent_by`), nombre de vendeurs, statut, date d'envoi, **nombre d'infractions** (`finalCheck` sur la copie), changements depuis la validation.
  - Filtres : statut et mois.
- **Écran de revue**
  - Une bande de statut en haut de page.
  - L'en-tête « Reviewing: {store}, {month}, sent on {date} ».
  - La grille modifiable, sans Generate ni Recalculate.
  - Un panneau à droite : statut, infractions (un clic mène à la case), commentaire, « Validate » et « Return ».
- **Couleurs des statuts** (toutes dans la charte, mais nouvel usage : à confirmer par Roman) :
  - Draft : `#e5e7eb` / `#6b7280`
  - Pending : `#e0e7ff` / `#3730a3`
  - Returned : `#fff1f2` / `#b91c1c`
  - Validated : `#f0fdf4` / `#166534`
- **Admin « Users »** : la liste des comptes, avec le rôle, la région et les boutiques.

## 6. Sécurité
1. **La clé anon ne donne plus rien** : on supprime les règles `public : ALL : true` sur les tables `retail_*`.
2. **Tables de référence** (`retail_regions`, `retail_countries`, `retail_stores`) : lecture pour les comptes connectés, filtrée par `retail_can_see_store` pour les boutiques.
3. **Tables de données** : lecture et écriture si `retail_can_see_store(store_id)`. Les tables sans `store_id` sont à recenser (les agents passent par leur boutique).
4. **Profils** : chacun lit le sien, l'admin lit et modifie tout. **Personne ne peut changer son propre rôle ni son périmètre.** C'est le point à tester en premier.
5. **Reviews** : écriture par le manager de la boutique (envoi) et par le directeur de la région (décision), contrôlée par le statut.

## 7. Mise en place sans pré-prod
1. **SQL d'ajout** (tables, colonne, fonction) : aucun effet sur le live, qui les ignore. Accord de Roman requis.
2. **Build pilote** `CAST_v9_5_0_0_RETAIL_TEST.html`, avec connexion. Il tourne sur la vraie base, donc les tests de validation se font **uniquement sur PARIS MONTAIGNE** (30 vendeurs fictifs).
3. **Comptes de test** : 1 admin (Roman), 1 directeur EMEA, 1 manager Montaigne.
4. **Bascule, en une fois** : Roman pousse le pilote dans `retail.html`, **puis** on applique le SQL qui ferme l'accès anon.
   - Dans l'autre ordre, le live casse.
   - Un script de retour arrière (qui remet les règles actuelles) est prêt avant la bascule.
5. **Le cas de `CSC.html`** : il n'est pas touché, mais ses tables restent ouvertes. Elles sont à traiter dans un second temps, avec le même modèle.

## 8. Hors périmètre
Email, SSO d'entreprise, facturation et paliers, langues, onglet d'insights, pré-prod.

## 9. Ce qu'on demande à Astra
1. Challenger le modèle : une seule ligne par boutique et par mois, sans historique des envois. Est-ce suffisant ?
2. Challenger le verrouillage pendant `pending` et l'écriture des cases du directeur au moment de la décision.
3. Vérifier les règles RLS proposées, en particulier qu'on ne peut pas s'auto-promouvoir, et l'ordre de la bascule.
4. Recenser les tables `retail_*` sans `store_id` et dire comment les rattacher.
5. Donner un avis sur email + mot de passe face au lien magique, pour des managers en boutique.

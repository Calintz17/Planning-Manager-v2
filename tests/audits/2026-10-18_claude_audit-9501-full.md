# Claude : audit complet du code, Retail 9.5.0.1 (18 octobre 2026, soir)

Demande de Roman : audit complet. Lignes en trop, CSS cassé, code mort, architecture inutile, et ce qui pourrait être plus sobre après les gros changements de structure (heures par vendeur, décision du jour, comptes).
Build audité : `tests/builds/CAST_v9_5_0_1_RETAIL_TEST.html`. Base lue en lecture seule, plus les conseillers Supabase (sécurité et performance).

**Note : 83/100.** Pas de code mort JavaScript, pas de CSS orphelin, pas de débordement. Restent :
- une couche de données morte ;
- 45 textes non traduits ;
- un moteur trop gros ;
- quelques réglages de base à finir.

## 1. Mesures
| Mesure | Résultat |
|---|---|
| Taille | 9 759 lignes (CSS 906, JS 8 305) |
| Fonctions jamais atteintes | **0 sur 340**. Graphe d'appels (acorn) depuis le code de premier niveau, les `onclick` du HTML et les noms appelés dans les chaînes. Les 3 « toggles » des réglages sont appelés par leur nom, ils sont vivants |
| Variables globales inutilisées | 0 |
| `console.log`, `debugger`, TODO | 0 |
| Sélecteurs CSS dont aucune classe ou id n'existe dans la page | **0 sur 696 règles** |
| Déclarations CSS écrasées plus loin par le même sélecteur | 18 (voir 3.4) |
| Débordement horizontal | 0 : 5 vues (Dashboard, Monthly, Intraday, Advisors, Settings) × 320, 390, 768, 1024, 1440 px. La barre du haut (EN, ?, thème, compte) tient en 320 |
| Outils | `tests/audit_tools/` (réutilisables par Astra) |

## 2. Arbitrages pour Roman
A. **Supprimer les données mortes en base**, après avoir retiré le code (3.1) et fait une sauvegarde :
   - `retail_agent_availability` : 66 lignes, toutes du 10 au 16 août, et aucun écran ne l'écrit ;
   - colonnes `retail_agent_prefs.shift_pref`, `weekend_ok`, `notes`, `preferred_shift` et `retail_shift_config.is_opening`, `is_closing` : plus lues ;
   - les 6 tables de région inutilisées (`retail_forecasts`, `retail_historical_volume`, `retail_monthly_bo_targets`, `retail_schedule_overrides`, `retail_agent_tags`, `retail_tasks` avec ses 18 lignes) ;
   - les 2 vieilles fonctions.

   Recommandation : d'abord le code (sans effet), puis la base dans une version suivante.
B. **`work_pct`** : 109 vendeurs sur 112 n'ont pas d'heures saisies et prennent les heures de la boutique. **Un seul** dépend encore d'un pourcentage différent de 100. Recommandation : écrire ses heures (heures de la boutique × pourcentage), puis retirer le pourcentage du code (`contractHours`, ligne 3624) et plus tard la colonne.
C. **Les anciens builds** : `tests/builds` contient 32 fichiers (12 Mo), et il y a 12 scripts `regression-9xxx.cjs` presque identiques. Recommandation : un seul script `regression.cjs <ancien> <nouveau>`, et garder les 3 derniers builds. Les autres restent dans l'historique Git. À voir avec Astra, qui s'en sert.
D. **Sécurité des comptes (réglages Supabase, sans code)** : activer « Leaked password protection » si ton offre Supabase le permet. La double authentification n'est pas nécessaire pour un pilote.

## 3. Incidents et corrections proposées à Claude

### 3.1 P2 : couche « availability » morte (une requête et 6 lectures)
- **Constat** :
  - `loadAvailability` (ligne 3255) lit la table à chaque chargement de boutique ;
  - `dayMarker` (5877), le moteur (7092, 7244) et `movable` (7347) testent `absent`, `rest_override` et `rest_parttime` ;
  - aucune écriture n'existe dans la page, et la base ne contient aucune de ces valeurs.
- **Proposition** : supprimer `loadAvailability`, la variable `availability` et les 4 tests, et retirer la table de `monthlyInputs`.
- **Résultat attendu** : mêmes cases partout, une requête de moins par boutique, environ 25 lignes de moins.

### 3.2 P2 : 45 textes sans traduction (ja, ko, zh-Hans, zh-Hant)
- **Constat** :
  - tout l'écran de connexion et le menu du compte ;
  - le changement de mot de passe ;
  - les messages des règles du contrôle final (« {name}: more than {n} h on {date} »…) ;
  - « Saved ✓ New weekly hours from {date} », « {h} h this month, reference {max} h », etc.

  Un manager de Shibuya voit ces textes en anglais.
- **Proposition** : ajouter les 45 clés aux 4 fichiers `i18n/*.json`. La liste se génère avec le script de l'audit (chaînes de `t()`, `tf()` et `showToast()` absentes du fichier).

### 3.3 P3 : comptes, deux protections pour une seule règle (code de Claude, 9.5.0.0)
- **Constat** :
  - depuis la bascule, la base ne renvoie que les régions, pays et boutiques du compte ;
  - la page refiltre pourtant (`regionAllowed`, `countryAllowed`, `storeAllowed`) ;
  - pour un manager, elle fait 3 requêtes de plus (`retail_profile_stores`, `retail_stores`, `retail_countries`) ;
  - `applyScopeRules` a une branche par rôle.

  C'était nécessaire avant la bascule, mais ça ne l'est plus.
- **Proposition, plus sobre** : une seule règle d'affichage.
  - « Pour un compte non Admin, un menu qui n'a qu'un seul choix devient un libellé. »
  - Elle s'applique au chargement de chaque liste : région unique, pays unique, boutique unique. Directeur et manager sont ainsi traités par la même règle.
  - « No store linked » devient « la liste des boutiques est vide ».
- **Gain** : environ 35 lignes et 3 requêtes en moins. Le comportement est inchangé pour les 4 cas testés (`probe_accounts_9500.py` reste la référence).

### 3.4 P3 : CSS, 18 déclarations écrasées et règles en double
- **Doublons exacts** :
  - `.mth-group td.mth-group-lbl` : lignes 329 et 330 se répètent, et 813 et 814 dans le bloc mobile ;
  - `.sh-pink` et `.sh-cp` : ligne 633, qui répète 350 et 362 ;
  - `.hl-add input[type=text]` : ligne 621, qui répète 195.

  Supprimer la copie : rendu identique.
- **`select`** : trois couches (15, 241, 609). Pour un `select`, la ligne 609 remplace la bordure, le rayon, le fond, la couleur, la taille et le padding de la 241. La 241 ne garde que `height` et `transition`.

  Attention : la 241 vaut aussi pour `input[type=text]` (plus précise). Il ne faut pas la supprimer, seulement la réduire. À contrôler avec le comparateur de styles calculés (méthode de la 9.4.0.7).
- **Règles coupées en deux** :
  - `.ce-sep`, `.ce-cnr`, `.ce-cnr-lbl`, `.ce-adjust-row` : 576 à 582 et 674 ;
  - `.pdf-shot .mth thead th` : 94, 682 et 690 ;
  - `.tsw-stars` : 126 et 127.

  Les regrouper (même méthode de contrôle).

### 3.5 P3 : réglages de base signalés par Supabase
1. **Index en double** sur `retail_traffic_monthly` (`…store_id_year_month_key` et `…store_year_month_key`) : en supprimer un.
2. **3 règles appellent `auth.uid()` ligne par ligne** (`retail_profiles_read`, `retail_profile_stores_read`, `retail_planning_edits_insert`) : écrire `(select auth.uid())`.
3. **Régions, pays, boutiques** : deux règles de lecture (`_read` et `_admin` en ALL). Garder `_read` pour la lecture, et limiter `_admin` à insert, update et delete.
4. **Clés étrangères sans index** : 16 côté retail (`store_id` et `agent_id` des congés, highlights, événements, missions, intraday, journal…). Les ajouter, ce qui aide aussi les règles d'accès.
5. **Les 9 fonctions d'accès sont appelables via `/rpc`** par un compte connecté. Elles ne répondent que oui ou non, mais `retail_agent_in_store` permet de tester des identifiants au hasard. Les déplacer dans un schéma non exposé (`cast_private`), comme Supabase le recommande.
6. **Les 2 vieilles fonctions** (`seed_defaults_for_current_user`, `add_agent_for_current_user`) sont fermées mais existent encore : les supprimer.
7. **Pour la suite** : `retail_can_access_country` et `retail_can_access_region` appellent la fonction de boutique pour chaque boutique. Les écrire en jointures directes, plus court et plus rapide.

### 3.6 P3 : petites lignes en trop
- `addAgent` : `var pct = 100;` puis `work_pct: pct` (8173 et 8183). La base met 100 par défaut, ces 2 lignes peuvent partir.
- Le chargement d'une boutique enchaîne 7 requêtes l'une après l'autre (`loadRegulations` … `loadWeekData`). Celles qui ne dépendent pas des autres peuvent partir ensemble (`Promise.all`) : ouverture plus rapide, surtout sur téléphone. Vérifier d'abord les dépendances (`loadWeekData` lit les règles).

## 4. Architecture : ce qui pèse vraiment
1. **`computeMonthlyPlanOn` fait 1 928 lignes, 23 % du JavaScript.** C'est le point déjà relevé par Astra (4.A de son audit 9.4.0.6).

   La validation des plannings demandera de recontrôler une copie figée avec son contexte, ce qui veut dire `validatePlan(plan, inputs)` pur. Proposition d'ordre :
   - (a) retirer la couche availability (3.1) ;
   - (b) une seule fonction de faits du jour `dayFacts(a, ds)` (case du manager, congé, formation, fixe, sauvegarde), utilisée par `dayMarker`, `shownRes`, `workedOn`, `shiftFor`, `outsideRes` et `movable`, qui relisent aujourd'hui les mêmes sources chacun de leur côté ;
   - (c) sortir `finalCheck` et ses entrées du moteur.

   Cases identiques à chaque étape (bancs actuels).
2. **25 variables globales échangées** (`monthlyInputs` / `useMonthlyInputs`) : c'est une protection qui marche, mais elle disparaît naturellement avec 1(c). Ne pas y toucher avant.
3. **Copie de production** : depuis l'incident du titre d'impression (9.4.0.6), seule la ligne `<title>…TEST</title>` est remplacée. Proposition : un contrôle de 5 lignes qui refuse la copie si le fichier de production diffère du test par autre chose que cette ligne.

## 5. UX/UI et mobile
- Connexion et choix de boutique revus en 9.5.0.1 : 30 captures, 16 px, 44 px.
- Les 5 vues principales sont sans débordement de 320 à 1440 px. La barre du haut tient en 320 px.
- Seul défaut visible : les textes non traduits (3.2).

## 6. Ordre proposé
1. 3.1 et 3.6 (code mort, sans effet) avec 3.4 (CSS), contrôlés par les bancs et le comparateur de styles.
2. 3.2 (traductions).
3. 3.3 (comptes plus sobres).
4. 3.5 (SQL, accord de Roman).
5. 4.1 (découpage du moteur), avant la validation des plannings.

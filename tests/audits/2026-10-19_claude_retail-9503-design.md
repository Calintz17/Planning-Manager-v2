# Claude : Retail 9.5.0.3 TEST, audit design et UX mesuré, comptes, moteur (19 octobre 2026)

Build : `tests/builds/CAST_RETAIL_TEST.html` (titre « CAST v9.5.0.3 TEST »), 9 804 lignes. Base : 9.5.0.2 (= `retail.html`).
Livraison : `CAST_v9.5.0.3_RETAIL.html` (seul le titre change). Fichiers `i18n/*.json` à pousser avec la page (3 messages de compte traduits).

## Méthode
- 14 écrans × 1440 et 390 px × clair et sombre, avec la boutique de test chargée (56 captures).
- Un script mesure chaque écran : contraste WCAG du texte sur son fond réel, cibles tactiles sous 44 px en mobile, texte coupé, tailles de police, rayons, hauteurs des contrôles, débordement horizontal.
- Hauteurs des lignes du Monthly mesurées par type de ligne, position des étiquettes de corner par rapport au bord de la ligne.

## Mesures, avant et après
| Mesure | 9.5.0.2 | 9.5.0.3 |
|---|---|---|
| Lignes du Monthly (en-tête / Local, National, Training / groupes / vendeurs), desktop | 48 / 26 / 30 / 42 px | 44 / 30 / 30 / 44 px |
| Même chose en mobile | 46 / 29 / 30 / 42 px | 48 / 30 / 30 / 48 px |
| Étiquette de corner (LG, PRF…) qui dépasse sur la ligne du dessus | -1 px | +1 px (dans la ligne) |
| Rayons utilisés | 3, 4, 5, 6, 7, 8, 10, 12 px | 4 (cases, puces), 6 (contrôles), 8 (cartes, menus), 10 (fenêtres) |
| Plus petite police | 8 px (1 134 textes) | 9 px |
| Texte sous le contraste WCAG | 1 | 0 |
| Texte coupé sans le vouloir | 9 (période, absences, couverture mobile) | 0 |
| Cibles tactiles sous 44 px de haut en mobile | barre du haut, boutons 40 px, onglets, jours | 44 px (onglets de corner 40 px) |
| Débordement horizontal de la page | 0 | 0 |
| Erreurs JavaScript | 0 | 0 |

## Corrigé
1. **Monthly** : une hauteur par type de ligne (ci-dessus), même style d'étiquette (11 px, gras, majuscules), en mobile toutes les étiquettes centrées. La barre ‹ mois › Send Download est sur la ligne du titre (une règle `.page-head` plus loin la recentrait). Même hauteur de ligne de groupe en Intraday, en-tête « AGENT » en majuscules comme le Monthly.
2. **Menu du profil** : 16 px de marge intérieure de chaque côté, largeur ajustée au contenu, une seule hauteur de ligne, plus de barre de séparation.
3. **Calendar > Absence** : absence en rouge foncé `#82334E`, texte blanc, identique en clair et en sombre. Émojis retirés, légende ajoutée (Absence, Out of store, Day off request), « Out of store » en vert comme Training (avant : même gris que Day off request). En mobile, les initiales au lieu de « Ag ».
4. **Cohérence** : en-têtes de tableaux tous en majuscules ; onglets Calendar et Settings identiques ; barre du haut à 36 px partout (44 px en mobile) ; champs, listes et boutons au même rayon.
5. **Textes coupés** : période « W42 12–18 Oct » au lieu de « W42 - 12 Oct → 1… » ; fiche vendeur : « This month » lisible en entier, champs remis dans l'ordre (prénom, nom, boutique, statut, heures, mois) ; couverture en mobile : TOT, OFF, OPEN, CLOSE, MGT… ; pastille « No trend yet » sur une ligne.
6. **Bug mobile** : dans Breaks, la colonne Name faisait 22 px et les titres se chevauchaient. Elle fait 180 px.

## Recommandé, non fait (à valider par Roman)
- **Structure des pages** : Monthly, Intraday et Client Advisors ont le titre dans une carte ; Dashboard, Traffic et Settings l'ont sur le fond ; Calendar n'a pas de titre ; Traffic a deux titres (« Traffic » et « Monthly traffic 2026 »). Proposition : un seul modèle, titre sur le fond, contenu en cartes.
- Les cases « A » du Monthly restent rose clair. À passer en rouge foncé aussi, si Roman le veut.
- Le menu du rail mobile (Calendar, Settings) se ferme bien au toucher, mais il recouvre le contenu : à revoir avec un vrai téléphone.

## Comptes (défauts d'Astra sur 9.5.0.1)
- **Manager** : une seule liste de toutes ses boutiques, quel que soit le pays, sans menu Région ni Pays. Le pays et la région de la boutique choisie sont posés à ce moment (jours fériés, heures par défaut). La boutique est retrouvée après rechargement.
- **Erreur de chargement** : la page déconnecte avec « Could not load your account. Try again. » ; se reconnecter recommence. Avant : plus rien ne se passait jusqu'au rechargement.
- **Boutons** : Sign in et Save (mot de passe) reviennent toujours, même en cas d'erreur réseau.
- Les menus ne sont plus reliés deux fois après une nouvelle connexion.
- Non fait : enregistrer la fiche vendeur en une seule opération en base, et créer les comptes depuis le tableau de bord Supabase. Ces deux points demandent du SQL que Roman lance lui-même : ce sera un prochain lot.
- Tests : `probe_accounts.py` a 39 contrôles, 0 échec. Le stub sait maintenant simuler une table qui ne répond pas.

## Moteur
- Étape 1 faite : une seule fonction `fixedRes` pour « ce qui est déjà fixé un jour » (la case du manager, puis une formation du Calendar). Elle remplace 4 copies : le repos du jour d'avant, les heures de la semaine (`seedWeek`), le total de la semaine (`weekPaidWith`), et `dayMarker` / `workedOn` qui lisent `leaveRes`. Il reste 5 appels directs à `agentOnLeave` au lieu de 10.
- Étape 2 reportée. Pour sortir `seedWeek`, `fitsWeek` et `weekPaidWith` du moteur, il faut d'abord un objet d'état du mois (`weekPaid`, `assignedMap`, `shiftPlanByDay`, `volantHalfDay`…). C'est le prochain build.
- **Mêmes plannings que 9.5.0.2** :
  - les 8 cas : mêmes cases, aucune règle obligatoire ajoutée ;
  - `contracts` et `boundaries` : fichiers identiques ;
  - `manual-off` : 0 semaine courte ;
  - `manual-matrix` : 0 échec ;
  - `markers` : 3/3 ;
  - `midnight` : 0 case ;
  - `validate-plan` : 3/3 ;
  - `round2` : la sauvegarde revient identique ;
  - banc partagé identique ;
  - Store A : novembre 870 cases et octobre 899 cases, 0 différence.

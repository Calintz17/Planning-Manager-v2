# Astra — Admin, vérification des plannings et revue design 9.5.0.3
19 octobre 2026. Consignes consolidées pour Claude. Aucun fichier applicatif modifié.

## 1. Rectification importante : le workflow n'est pas livré
Production relue sur main : titre **CAST v9.5.0.3**, blob `c409cbdfd231716dc162e2e78d64939d2e38bdc7`.
Le HTML ne contient ni `retail_plan_reviews`, ni `submit_review`, ni `decide_review`, ni onglet de vérification. `openSendMenu` prépare un PDF pour partage/email.

**L'absence d'onglet chez Roman n'est donc pas un problème de droits Admin à résoudre en base. L'écran et le circuit ne sont pas encore implémentés.**
La matrice du draft les prévoit, ce qui ne signifie pas qu'ils fonctionnent. La phrase précédente d'Astra sur l'architecture ne devait pas laisser entendre le contraire.

## 2. Décision fonctionnelle de Roman : Admin = toutes les actions de planning
L'Admin doit pouvoir démontrer et tester seul tout le circuit, avec un compte réel unique :
- ouvrir et modifier n'importe quelle boutique ;
- **Envoyer pour vérification** ;
- retrouver les envois de toutes les boutiques dans **Vérification > À revoir**, y compris ses propres envois ;
- consulter **Mes envois** ;
- corriger, valider, retourner ou retirer un envoi selon son état ;
- recevoir les retours/validations de ses propres envois et les notifications internes de revue ;
- valider un envoi qu'il a lui-même créé.

Conserver son identité réelle dans submitted_by et decided_by. Aucune usurpation de Manager/Director, aucun changement artificiel de rôle et aucun compte supplémentaire nécessaire pour la démonstration.
Cette capacité bénéficie à **tous les comptes Admin**, pas seulement au compte de Roman.

La gestion des comptes reste celle décidée : Roman administre les comptes côté Supabase ; cette demande ne réclame pas un écran public de création ni une clé de service dans le navigateur.

### Il faut du code ET le modèle/périmètre serveur
1. **Interface** : bouton d'envoi, onglet Vérification, file À revoir, Mes envois, actions de décision et notification.
2. **Données et transitions** : révisions, copie soumise, copie revue, contexte JSON sérialisable, diagnostics et RPC transactionnelles.
3. **Permissions par action**, pas seulement par rôle affiché :
```js
canSubmit = role === 'admin' || (role === 'manager' && managesStore);
canReview = role === 'admin' || (role === 'director' && storeInRegion);
```
Les mêmes décisions sont imposées côté serveur, avec identité issue de la session. Un Admin n'est pas une clé service_role et n'ignore pas les transactions/révisions.

Pour la file Admin, **ne pas exclure submitted_by = auth.uid()**. La validation de son propre envoi est autorisée explicitement pour Admin ; ne pas généraliser cette exception à un manager.
La décision humaine reste libre malgré les diagnostics de règles ; l'intégrité de la révision et l'appartenance des données restent contrôlées.

Le Send actuel et Envoyer pour vérification sont deux actions différentes. Éviter de faire croire que le partage du PDF constitue une soumission.

### Test d'acceptation du circuit
Un Admin unique, sur boutique fictive :
- génération → envoi → apparition dans À revoir ET Mes envois ;
- ouverture et correction → validation par le même compte → notification reçue ;
- auteurs exacts, une seule décision, revue figée inchangée après changements du live ;
- retour pour correction puis nouvel envoi ; retrait pending puis nouvel envoi ;
- lecture d'une notification d'un côté ne doit pas faire disparaître une action encore à traiter de l'autre.
La navigation peut offrir deux vues de travail, sans changer le rôle de la session.
Avant ce circuit, corriger le round-trip JSON du contexte relevé dans l'audit 9503.

## 3. Revue UX/UI : 84/100, distincte de la note technique générale
Base : 9.5.0.3. **136 états** mesurés, puis contrôles ciblés de date et clavier ; Firefox headless, données fictives.
Tailles : 1440×900, 390×844, 320×568 et 740×360, en clair/sombre.
Pages : Dashboard, Monthly, Advisors, Settings, Bank Holidays, Absence et Traffic.
Fenêtres : fiche conseiller, temps partiel, mot de passe, événement, création de shift, aide, absence, ouverture exceptionnelle, édition de case et sélecteur de date.
**76 géométries de fenêtres effectivement visibles ont été contrôlées : aucune hors viewport après le positionnement normal.** Les pages plus hautes que l'écran défilent normalement : ce n'est pas une anomalie.
Limites : pas de Safari/iPhone physique, pas de clavier iOS réel, pas de certification exhaustive d'accessibilité. Les menus export/mission ne sont pas inclus dans ces 76 géométries.

Le premier passage avait un défaut de reset du banc qui masquait le datepicker ; il a été corrigé et le sélecteur retesté dans quatre configurations. Ne pas compter des rectangles nuls comme une réussite.

## 4. Typographie : incohérences confirmées
Mesures desktop :
| Même niveau attendu | Mesuré aujourd'hui |
|---|---|
| Titre principal de page | Dashboard/Monthly/Advisors/Settings : 26px, ligne 32,5px |
| Titres de cartes Dashboard | 16px / 24px |
| Titres de cartes Settings | 18px / 24,3px ; puis 16px / 21,6px en mobile |
| Titres de cartes Traffic | **26px**, même taille que le titre principal ; 22px en mobile |
| Titre de fenêtre classique | 18px / **27px** |
| Titre de fenêtre Help | 18px / **24,3px** |

Source précise :
- `.page-title` et `.dash-title` : lignes 162/480 ;
- `.set-title` : 216, réutilisée pour plusieurs niveaux ;
- `.modal-title` : 504, sans line-height explicite ;
- Help porte `modal-title set-title`, donc hérite d'un autre interligne ;
- `renderTraffic` : lignes **4094, 4150, 4187**, les trois titres internes utilisent `page-title`.

**Correction proposée : une échelle sémantique, pas une taille par écran.**
| Usage | Desktop | Mobile |
|---|---|---|
| Page | 26px / 32px, gras | 22px / 28px |
| Carte | 16px / 24px, gras | identique |
| Fenêtre | 18px / 24px, gras | identique |
| Sous-section compacte | 12px / 18px, gras | identique |
| Texte courant | 14px / 21px | identique |
| Label / texte secondaire | 12px / 18px | identique |
| Données de grille dense | 11–12px selon place | conserver la densité nécessaire |

Dans Traffic, garder le premier titre au niveau page ; passer les trois titres internes au niveau carte. Ne pas déplacer tous les titres hors des cartes : cette refonte d'emplacement a été reportée par Roman.

Exemple de contrat CSS :
```css
:root {
  --title-page-size:26px; --title-page-line:32px;
  --title-card-size:16px; --title-card-line:24px;
  --title-dialog-size:18px; --title-dialog-line:24px;
}
.card-title { font-size:var(--title-card-size); line-height:var(--title-card-line); font-weight:700; }
.modal-title { font-size:var(--title-dialog-size); line-height:var(--title-dialog-line); }
```
Corriger les usages de classes et retirer les propriétés concurrentes, plutôt que superposer une troisième couche de règles. Préserver les styles particuliers de la grille et des exports.

## 5. Espacements et interlignes : une grille commune
Constats :
- label/champ : `.fld` ligne 493 = **5px** ; `.hl-field` 200 = **4px** ; `.leave-label` 419 = **4px** ;
- titre/contenu : `.card-head` 212 = **12px**, `.set-head` 214 = **16px** ; Dashboard = **16px** ;
- `.card` 158 = padding **22px**, espace suivant **18px** ;
- certains espacements mobiles de `.plan-head` sont re-définis à **18px** ligne 812 ;
- l'interligne des fenêtres varie comme montré plus haut, ce qui donne une différence visible même à police identique.

Normaliser **par rôle**, sans donner le même espace à toutes les lignes :
- label → champ : 4px ;
- champs d'un même groupe : 12px ;
- titre de carte → contenu : 16px ;
- sous-titre → titre ou bloc lié : 8px ;
- groupes de formulaire distincts : 24px ;
- cartes du même niveau : 16px ;
- panneau/modal : 20px desktop, 16px mobile ; header/body/footer alignés sur la même marge ;
- lignes du planning : **ne pas changer** les hauteurs 44/48px et 30px déjà harmonisées.

Pour les cartes desktop, passer éventuellement 22 → 24px de padding ; sur mobile conserver un padding compact, pas 24px partout. Vérifier les tables à 320px et les noms longs.
Aucun besoin de séparer toutes les lignes par une bordure. Le rythme doit venir de la hiérarchie et des espaces.

## 6. Couleurs : conserver le thème, réduire les exceptions
La base est saine :
- texte principal sombre `#E8E6E1` sur `#1B2027` : contraste calculé **13,13:1** ;
- secondaire `#B6BCC4` sur ce fond : **8,56:1** ;
- absence Calendar : blanc sur `#82334E` : **8,29:1**.
Ces paires précises sont lisibles ; cela ne certifie pas tous les états/gradients/opacités.

Recommandations :
1. Garder anthracite + bleu ardoise. Pas de refonte indigo/violet fluorescent.
2. Séparer les jetons **actions**, **données de shift** et **statuts**. Ne pas utiliser le jeton de texte danger comme fond d'absence : sa valeur change selon le thème.
3. Centraliser le rouge de Calendar dans des alias explicites `--absence-bg:#82334E; --absence-fg:#fff`, identiques dans les deux thèmes conformément au choix de Roman.
4. Garder le gris OFF distinct des shifts travaillés sable. Le rendu pointillé OUT du Monthly est une convention existante ; ne pas le recolorer dans ce lot sans le dire.
5. Les contours des champs sombres `#46515D` sur `#1B2027` ont seulement **2,02:1** : améliorer leur perception si nécessaire avec un jeton de bordure de contrôle distinct, **sans foncer/éclaircir toutes les lignes du planning**.
6. Le focus doit rester plus visible que la bordure au repos ; il ne doit pas dépendre uniquement d'une variation subtile de gris.
7. Couleurs de future vérification : reprendre les jetons existants avec un libellé et une icône ; éviter de confondre une pastille de workflow et une case de shift.

Les A du Monthly plus foncés restent reportés, comme demandé. Pas d'alerte sur une décision validée.

## 7. Mobile et fenêtres
### A. Les champs à 16px ne couvrent pas encore toutes les fenêtres
Mesuré à 390px :
- fiche conseiller : prénom, nom, heures = **13px** (hauteur 44px) ;
- fiche temps partiel : même chose ;
- événement : textarea = **13px** ;
- création de shift : code = **13px**.
Le mot de passe bénéficie déjà de la règle 16px.

C'est une incohérence avec la correction anti-zoom du login. Le zoom Safari n'est pas reproduit ici ; étendre le même traitement aux champs éditables des autres fenêtres, puis vérifier sur iPhone :
```css
@media (max-width:600px), (pointer:coarse) {
  .modal-overlay input:not([type=checkbox]):not([type=radio]),
  .modal-overlay select,
  .modal-overlay textarea {
    font-size:16px;
  }
}
```
Ne pas monter tous les textes et toutes les cases du planning à 16px. Les labels secondaires restent plus petits.

### B. Hauteur et défilement : conserver ce qui fonctionne
Les fenêtres testées restent dans les tailles mesurées, y compris 740×360. La fiche conseiller utilise correctement un corps défilant et des actions en bas.
Conserver deux familles :
- dialogue/formulaire : en-tête, corps défilant, pied d'actions ;
- panneau contextuel : cellule, mission, date, couleur, ancré et repositionné.
Pas besoin de transformer tous les petits menus en fenêtres plein écran.

Sur un vrai téléphone : vérifier clavier ouvert, retour au champ, bouton Save atteignable, fermeture et rotation. Les mesures headless de viewport réduit ne remplacent pas ce test.

### C. Fermeture et accessibilité inégales
Escape ferme déjà compte/date/export ; le test de création de shift montre que **Escape ne ferme pas cette fenêtre**.
Les dialogues sont des div sans rôle dialog/aria-modal dans cette version.

Proposer un helper commun d'ouverture/fermeture qui :
- nomme le dialogue (role=dialog, aria-modal, aria-labelledby) ;
- place le focus dans le bon champ ;
- ferme le dernier panneau ouvert avec Escape ;
- appelle la **vraie fonction de fermeture existante**, notamment pour la sauvegarde de fiche ;
- rend le focus au déclencheur ;
- gère le contexte de focus et le fond inactif pour les dialogues bloquants.

La date ouverte sur une fenêtre doit se fermer avant la fenêtre parente. Ne pas ajouter un gestionnaire Escape différent dans chaque nouveau popup. Le parcours Tab complet demande un contrôle dédié ; je ne prétends pas avoir démontré ici un échappement du focus.

### D. Calendrier étroit
Le débordement du navigateur de mois à 320px, déjà reproduit dans l'audit 9503, reste à corriger. Boutons 44px, mois flexible sans min-width 150px.

## 8. Lot simple recommandé
1. Cadrer le workflow manquant et les droits Admin : ce n'est pas un switch Supabase seul.
2. Lot design indépendant du moteur : typographie sémantique, interlignes et espacements, champs mobiles, calendrier 320px.
3. Helper minimal des fenêtres ; ne pas refaire les écrans qui tiennent déjà.
4. Avant/après sur les tailles testées, noms longs, quatre langues ; mêmes cellules et mêmes exports.

**Note UX/UI : 84/100** = couleurs 18/20, typographie 15/20, espacements 16/20, fenêtres 17/20, mobile 18/20.
Les constats et la proposition de hiérarchie sont fondés sur les mesures ; les tailles cibles sont des recommandations de design, pas des contraintes légales.

Aucun nouveau changement de règle moteur ni écriture Supabase n'a été fait par Astra.

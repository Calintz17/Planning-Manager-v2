# Claude : Retail 9.3.3, ventilation des shifts, mode sombre, Share sur Firefox (16 octobre 2026)

Candidate : `tests/builds/CAST_v9_3_3_RETAIL.html`, SHA-256 `2471359ad1d6`. Base : `retail.html` 9.3.2 de main.
Pas de SQL. Rien n'est poussé dans `retail.html`, rien n'est écrit en base.

## 1. Ventilation des shifts (demande de Roman du 16-10)
Règle conservée : la part « Late shifts target » reste la seule consigne imposée, avec les minimums d'ouverture et de fermeture, le repos et les heures. À l'intérieur de ça, le moteur choisit librement parmi tous les shifts créés.

Ce qui change dans le choix du shift de chaque personne (`renderMonthlyPlanning`, bloc ventes) :
- **Temps sur le plancher** : un shift ne compte que sur les heures d'ouverture, quart d'heure par quart d'heure. Le déjeuner et les pauses sont retirés en probabilité sur toute leur fenêtre (réglages Breaks), à partir d'une heure après l'arrivée. Quelqu'un qui arrive plus tôt peut donc déjeuner plus tôt.
- **Besoin** : le temps sur le plancher que l'équipe du jour peut donner au maximum, réparti comme la courbe horaire du trafic.
- **Valeur d'un shift** : de combien il réduit la somme des écarts au carré entre les présents et le besoin. Une personne de trop quelque part coûte autant qu'une personne qui manque ailleurs. Le calcul est le même à 3 ou à 30 personnes, avec 3 ou 19 shifts.
- **Seconde passe** : avec tout le monde placé, chacun reprend le meilleur shift dans sa moitié (tôt ou tard), sans faire tomber l'ouverture ni la fermeture. Elle s'arrête quand plus personne ne bouge. Sur un jour type, cette passe atteint l'optimum trouvé en testant toutes les combinaisons (contrôle hors appli, 3, 5 et 8 personnes).
- **Supprimé** : le bonus qui poussait à réutiliser les mêmes shifts dans le mois (« a few shifts, not all of them »).
- Les habitudes apprises (9.3.x) gardent leur poids : à valeur égale, le shift habituel de la personne passe devant.

Réponse à la question « 9h15–18h15 ou 9h50–18h50 ? » : la formule compare ce que la personne apporte sur les deux bouts. Avant l'ouverture, ça ne vaut rien pour le trafic. Le soir, ça vaut selon l'écart au besoin. Si le soir est déjà plein, arriver plus tôt gagne. S'il manque du monde le soir, arriver plus tard gagne.

### Mesure : adhérence au trafic, sur l'intraday réel (déjeuners et pauses placés)
`tests/retail/bm/adherence.js`. Pour chaque jour et chaque quart d'heure, on compare les présents sur le plancher (stock exclu) au même total réparti comme le trafic :
adhérence = 100 × (1 − Σ|présents − besoin| / Σ(présents + besoin)), moyenne de novembre.
Fixture Japon : `tests/retail/bm/setup_jp.js`, synthétique, avec les shifts, heures, pauses et courbes réels de deux boutiques japonaises.

| Boutique (fixture) | 9.3.2 | 9.3.3 | Shifts utilisés en 9.3.3 |
|---|---:|---:|---|
| Japon A : 7 shifts, ouverte 11h–21h | 90,4 | **95,0** | 5 (3 en 9.3.2) |
| Japon B : 19 shifts, réglages actuels (late 0 %, min. ouverture/fermeture 0) | 87,5 | 87,5 | 2 |
| Japon B, même chose avec late 50 % et min. 1/1 | 89,3 | 90,1 | 8 (3 en 9.3.2) |
| Banc partagé synthétique | 89,1 | 89,2 | 3 |

Banc privé Store A (novembre contre l'officiel) : jour / case 78,2 / 43,8 (9.3.2 : 78,2 / 43,5). Compatibilité fonctionnelle 92,6 → 92,8, répartition des shifts 94,1 → 94,9. 0 infraction.
Banc partagé : infractions et trous identiques à la 9.3.2 dans les 4 variantes.

### Points à arbitrer
1. **Japon B** : avec Late shifts target 0 % et des minimums à 0, tout le monde est placé dans la moitié tôt. Le soir n'a plus personne après 19h15. C'est le réglage, pas le moteur : aucune formule ne peut placer quelqu'un tard si 0 % est imposé.
2. **Japon A** : Late 50 % alors que le planning réel de septembre en met environ 88 % dans la moitié tard (12D surtout). Le réglage tire la génération loin du réel.
3. **Préparation avant ouverture** : les shifts 9h–9h30 d'une boutique qui ouvre à 11h ne servent pas le trafic. Le moteur les prend seulement quand le soir est déjà plein. Si ce temps de préparation est un vrai besoin, il faudra le déclarer. Aujourd'hui il n'existe pas dans les réglages.

### Stress (scénarios impossibles exprès)
- C 12h–21h avec fermeture minimum 3, avec historique : corner-jours sans ouverture 7 → 7, sans fermeture 16 → 18, quarts d'heure de corner vide 150 → 110.
- Même scénario sans historique : 2 corner-jours vides le 1er novembre, contre 0 en 9.3.2. C'est un effet de semaine à cheval : octobre garde plus de C, qui coûtent plus d'heures, donc le dernier jour de la semaine est retiré par le plafond d'heures.
- 4 vendeurs pour 4 corners : identique à la 9.3.2.
- 30 h, 6 jours et 45 h : 0 trou.
Reste à surveiller : je n'ai pas trouvé de correction simple qui ne casse rien d'autre (filtrer sur les heures de la semaine dans le choix a ajouté une infraction d'heures).

## 2. Mode clair / sombre
- **Le switch** : en haut à droite de la barre du haut, donc sur tous les onglets, après Help. Ciel bleu, soleil et nuages en clair ; nuit étoilée et lune à cratères en sombre. Le rond glisse.
- **Mémorisation** : le choix est gardé dans le navigateur (`cast_theme`) et appliqué avant l'affichage, sans flash.
- **Couleurs** : toutes les couleurs écrites en dur dans le CSS sont devenues des tokens dans l'unique `:root`. Le thème sombre redéfinit ces tokens dans un seul bloc `@media screen`.
  - L'affichage clair est inchangé : comparaison pixel par pixel des 8 écrans, seule la zone du logo diffère (chargement de l'image).
  - Le logo est passé en blanc en sombre.
  - Les couleurs du switch sont propres au widget demandé, hors palette.
- **Exports** : le PDF de Send et l'impression restent clairs. C'est vérifié sur un PDF généré en mode sombre. Excel n'est pas concerné.
- **Contrôlé** : 8 écrans en sombre, éditeur de case, fiche agent, mobile 390 et 320 : rien ne déborde.

## 3. Share sur Firefox
- **Cause** : Firefox sur ordinateur n'a pas le partage de fichiers du navigateur (Web Share), donc « Share... » était masqué.
- **Correction** : « Share... » est toujours affiché.
  - Navigateur qui sait partager un fichier : fenêtre de partage habituelle.
  - Sinon : le PDF est téléchargé et l'objet plus le message sont copiés. Un message dit de joindre le fichier dans Teams, Outlook ou l'app de chat.
- **Testé** : Chromium sans Web Share (comme Firefox) : téléchargement, presse-papiers et message corrects. Firefox réel non testé : il n'est pas installé dans le banc.

## 4. Textes
Trois nouvelles phrases en anglais : « Dark mode » et deux messages de Share. Les JSON i18n ne sont pas regénérés, comme convenu : à faire avec le prochain lot de textes. En attendant, l'anglais s'affiche.

## 5. Contrôles
- 0 erreur JavaScript, tous les onglets s'ouvrent.
- Probes 9.3.2 (validateur, références) : mêmes résultats.
- Erreur déjà présente en 9.3.2, inchangée : « trimLogo is not defined » dans la copie du PDF, sans effet sur le fichier.

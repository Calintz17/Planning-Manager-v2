# Apprentissage local v1 — audit du prototype — 12 octobre 2026

## Décision
Prototype intéressant, intégration production prématurée. Note de maturité : **55/100** (appréciation du prototype, pas une nouvelle note de Retail). Le calcul est simple, les essais BM sont favorables et les contrôles observés passent. L'historique validé, un mois témoin, les autres boutiques, le parcours d'import et les limites aux frontières de mois restent à traiter.

Aucune version Retail/CSC poussée ou modifiée. Seuls les documents et modules expérimentaux dans tests/ sont publiés. Les données privées, les identités et les plannings officiels ne sont pas publiés.

## Base et protocole
Retail 9.2.7 du dépôt, blob 0ca8c0e9beee6572191adb9e1f2916f286befe8e, vérifié sur main au moment de l'essai.
Données boutique et réglages : même capture privée que les audits précédents, pas une nouvelle extraction Supabase.
Historique : 3 022 observations admissibles de mai–octobre, pour les personnes rapprochées avec la cohorte de novembre. Novembre exclu de l'apprentissage.
Les congés/absences/formation et codes inconnus sont exclus des dénominateurs de présence. OFF = repos ordinaire ; les lignes travaillées servent au modèle de shift. La distinction jour fermé/repos ordinaire n'est pas encore complètement vérifiée dans l'import historique ; elle devra être obligatoire dans l'import produit.
Les feuilles officielles sont prises comme références pour cette expérimentation. Leur marquage validated=true est une hypothèse du banc, pas une preuve que chaque révision du classeur a été validée par un manager.

Le calcul suit une hiérarchie équipe → personne → personne/jour, avec alpha=8 pseudo-observations à chaque étage :
p_personne = (compte_personne + alpha × p_equipe)/(total_personne + alpha)
p_jour = (compte_jour + alpha × p_personne)/(total_jour + alpha)
Le score reste une préférence, jamais une permission de violer une contrainte.

## Résultats complets, pas seulement O/C
Score exact agent/date/statut/horaires/corner sur les mêmes 867 cases comparables de novembre.

| Expérience | Cases exactes | Adhérence |
|---|---:|---:|
| 9.2.7 sans apprentissage | 336 | 38,8 % |
| Préférences présence, intensité 2 | 346 | 39,9 % |
| Préférences shifts seules | 336 | 38,8 % |
| Présence 2 + shifts 1 | 344 | 39,7 % |
| Préférences présence, intensité 5 | 351 | 40,5 % |
| Présence 5 + shifts 1 | 359 | 41,4 % |
| Échanges admissibles seuls | 355 | 40,9 % |
| Présence 5 + shifts 1 + échanges | 364 | 42,0 % |

Gain exploratoire maximal : 28 cases / 867, soit +3,2 points. Aucun objectif 60/80 % démontré. Les poids ont été comparés sur novembre : novembre reste exclu de l'apprentissage mais devient un jeu de développement pour le choix des poids. Le meilleur résultat ne constitue donc pas une validation indépendante. Ne pas figer 5/1 sur cette seule comparaison.

Les échanges seuls améliorent les présences correctes de 596 à 618 ; le modèle combiné avec échanges donne 615. La meilleure adhérence exacte et la meilleure présence ne sont pas obtenues par le même essai : les étapes interagissent.

## Contrôles
Toutes les huit expériences : zéro infraction détectée par les contrôles utilisés sur le mois généré pour :
- séquences de plus de cinq jours, OUT inclus ;
- semaines de plus de cinq jours ;
- plafond hebdomadaire de minutes payées sur les shifts connus ;
- repos interjournaliers inférieur au réglage ;
- corner vide ou sans ouverture/fermeture ;
- magasin sous le minimum d'ouverture/fermeture ;
- D inattendu sur ce scénario.

Limites du contrôleur : les séries et totaux hebdomadaires sont principalement comptés dans le mois affiché ; ce n'est pas une certification exhaustive des deux frontières mensuelles. Les horaires OUT ne sont pas connus. Pas de vérification juridique mondiale, ni preuve de non-régression de toute la couverture intraday, ni banc d'import trafic nul/équipe insuffisante sur ce prototype.

Autres assertions passées : répétition déterministe du meilleur essai ; historique vide = planning exactement identique à la base pour le modèle combiné avec échanges ; exclusion des dates futures et lignes non validées ; refus des doublons personne/date ; replis neutres sur modèle vide.

## Ce que Claude doit changer dans une intégration
### 1. Ne pas confondre historique généré et référence validée
Le bloc actuel « Shifts the store really uses », shiftHabit et habitOf(code), agrège des snapshots de boutique sans contexte personne/jour. Ne pas simplement y ajouter plus de snapshots : créer un historique de référence explicitement validé, avec provenance, période et version, distinct des résultats automatiques.
Les poids doivent être configurés/validés sur un mois différent du mois de test. La suppression ou révocation d'un import doit reconstruire le modèle ; ne pas accumuler irréversiblement les compteurs.

### 2. Présence : insérer au bon niveau
Dans prefScoreFor(a,d), le prototype ajoute une préférence probabiliste ; dans fillDay(d,target), il ajoute cette préférence au classement des candidats tout en conservant poolLoad et canWork.
La comparaison actuelle « weekLeft(y,wk)-weekLeft(x,wk) » et prefDebt peut dominer une simple préférence ajoutée en dernier. Ce sont des choix de classement, pas tous des règles dures. Les garder hors des filtres de contrat, mais les intégrer à un score cohérent plutôt que multiplier les exceptions.

### 3. Shifts : rendre best sensible à la personne
Le code actuel :
var sc = gain(s) * (1 + 0.25 * habitOf(s.code) + 0.15 * use(s) / top);
ne représente pas les habitudes par personne/jour.
Le prototype fait best(cands, person) et ajoute une probabilité apprise au score. Les deux appels de best, dans cover et dans le remplissage, doivent recevoir la bonne personne.
Les minima et roomFor continuent de filtrer les candidats. Les managers, le stock et les préférences explicites suivent des branches distinctes : le prototype ne remplace pas ces branches, ce qui explique aussi la portée limitée du modèle de shifts seul. Avant intégration complète, choisir une logique commune pour classer les candidats admissibles de toutes les équipes.

### 4. Échanges simples avant de produire les shifts
Point testé : après groupDaysOff, avant « Days not worked become days off ».
Échanger deux jours entre deux personnes de la même équipe et dans la même semaine :
a travaille x et pas y ; b travaille y et pas x.
Préserver les effectifs quotidiens par équipe, les quotas de semaine et les contrats fixes.
Exclure les dates passées, fermées, les overrides et les jours bloqués.
N'accepter que si daysOk reste vrai pour les deux et si les paires de repos de chacun ne diminuent pas.
Comparer la somme des log-odds de présence, accepter seulement une amélioration, limiter à dix échanges par semaine.
Recalculer ensuite les shifts/corners avec le moteur et contrôler le résultat final : l'admissibilité d'un échange de jours ne suffit pas à prouver celle de ses futurs horaires.
Aucune trame de semaine complète n'est encore apprise : ce prototype apprend des marges personne/jour et teste des échanges.

## UX/UI et mobile
Aucune interface ni CSS modifiés ; prototype exécuté dans le banc local. Aucun nouvel écran rendu, aucune certification visuelle de production dans cette étude.
Parcours produit proposé : import de référence → aperçu des erreurs et période → validation explicite → utilisation de l'historique pour les générations suivantes.
Sur mobile : même parcours court, pas de tableau de probabilités obligatoire dans le planning.
Le manager doit pouvoir retirer une référence et comprendre quels mois sont utilisés. Pas de nouvelles alertes ou panneaux permanents nécessaires au prototype.

## Arbitrages Roman
1. Que signifie « validé » ? Proposition : import officiel approuvé et planning final approuvé ; une génération sauvegardée seule ne suffit pas.
2. La préférence historique reste secondaire aux règles explicites, contraintes et minima : proposition de conserver cette priorité.
Aucune demande de permission pour pousser la production : le prototype reste dans tests/. Roman conserve la validation et le push final.

## Incidents techniques / limites à résoudre avant production
- Le modèle agrégé actuel de shift ne capture pas personne/jour ; ce défaut de représentation n'implique pas que chaque erreur O/C est un bug.
- Import de référence : correspondances de personnes et changements de catalogue/horaires à confirmer. Ne pas apprendre uniquement une lettre lorsque ses horaires ont changé.
- Frontières de mois, OUT, capacité impossible, heures strictes et contrats fixes : élargir la batterie.
- Le scénario local repose sur des fichiers privés et le banc antérieur ; les seules données du dépôt public sont synthétiques dans le test du module.

## Optimisation et simplicité
Module autonome de compteurs, sans LLM, sans dépendance externe. Il reconstruit le modèle en une passe ; pas de copie de plannings dans le HTML.
Pas besoin de nouvelle table de probabilités : stocker les références validées/provenance et calculer/cache les compteurs.
Éviter d'ajouter un moteur parallèle complet ou d'empiler des corrections par statut. Commencer par ce module et un classement partagé des candidats.
Le modèle vide doit rester neutre, y compris dans la formule multiplicative de gain : une constante positive ajoutée à cette formule peut modifier les choix ; le prototype met donc le bonus de shift à zéro sans historique.

## Prochain jalon
Confirmer les sources historiques, entraîner/calibrer sur des mois antérieurs, choisir un nouveau mois témoin et tester une autre boutique. Faire suivre un contrôle UI/mobile du parcours d'import si Claude crée ce parcours.
Module public : tests/prototypes/learning-v1/learning.js
Test public : node tests/prototypes/learning-v1/learning.test.cjs

# Analyse exploratoire des habitudes O/C — 12 octobre 2026

## Conclusion
O/C n'est pas purement aléatoire. Les postes spécialisés ont des habitudes fortes et stables. Chez les vendeurs, les habitudes individuelles moyennes sont beaucoup moins prédictives ; le jour de semaine apporte un signal modeste. Cela justifie un apprentissage contextualisé, pas une nouvelle règle universelle imposant un pourcentage O/C par personne.

Ce document est une étude statistique, pas un audit de version : aucune nouvelle note application /100, ni vérification UX/mobile, ni modification du moteur.

## Méthode
Source privée : classeur officiel de Store A. Six mois antérieurs (mai–octobre 2026) pour apprendre, novembre pour tester. Onglets retenus : UPDATE MAI 2026 ANDREA AM, JUIN 2026, JUILLET 2026, AOÛT 2026 WEEK 33 last update, SEPTEMBRE 26, OCTOBRE 26, NOVEMBRE 2026. Dates reconstruites par les en-têtes quotidiens ; priorité à l'onglet du mois, puis débordements du mois voisin pour les dates absentes. Mai ne couvre que le 4–31. Noms normalisés pour rapprocher les personnes, sans conserver les noms dans ce rapport public.

Évaluation O/C sur les 499 cases reconnues du 2–30 novembre. Les présences sont connues : le test choisit seulement O ou C. M, congés, jours OFF et codes ambigus ne sont pas évalués comme O/C. Ce résultat n'est donc PAS le taux d'adhérence du planning complet. Aucun shift de novembre ne sert à apprendre les modèles prédictifs.

Classification des équipes par zones du classeur et codes OPS ; rapprochement explicite des quatre postes stock. Limites : changements d'effectif, dates reprises de débordements, versions multiples dont la validation finale n'est pas certifiée, codes historiques MEN et LG/RTW. La structure des corners a changé ; ne pas traiter les sept mois comme un catalogue de corners immuable.

## Novembre tenu à l'écart
| Méthode | Cases correctes / 499 | Précision |
|---|---:|---:|
| Même choix majoritaire pour toute la boutique | 271 | 54,3 % |
| Choix majoritaire par équipe | 295 | 59,1 % |
| Choix majoritaire par personne, repli équipe | 285 | 57,1 % |
| Personne + jour de semaine, régularisé | 312 | 62,5 % |

Régularisation simple : huit pseudo-observations selon la distribution historique individuelle ; repli équipe pour les nouveaux arrivants. Ce choix fixe est exploratoire, non optimisé sur novembre. Gain sur la règle équipe : 17 cases, soit 3,4 points. Bootstrap apparié par semaines calendaires, 5 000 tirages : intervalle exploratoire à 95 % environ +0,8 à +6,9 points. Cinq semaines seulement : ne pas surinterpréter la précision de cet intervalle.

La moyenne individuelle seule fait moins bien que la règle équipe. Une formule qui récompense simplement le shift historiquement fréquent peut donc apprendre le mauvais signal.

| Équipe | Cases O/C novembre | Personne + jour |
|---|---:|---:|
| Management | 90 | 71,1 % |
| Stock | 81 | 82,7 % |
| Vente | 328 | 55,2 % |

Les scores par équipe viennent de modèles appris séparément dans chaque équipe. Ce sont des sous-tests conditionnels.

## Validation chronologique
| Mois testé | Majorité équipe | Personne + jour |
|---|---:|---:|
| Juillet | 57,2 % | 67,6 % |
| Août | 53,4 % | 57,9 % |
| Septembre | 57,8 % | 58,5 % |
| Octobre | 59,1 % | 62,7 % |
| Novembre | 59,1 % | 62,5 % |

Chaque mois est prédit uniquement à partir des mois précédents. Le signal existe, mais sa force varie : pas de preuve d'une recette garantissant 80 %.

## Autres observations
- Un poste de direction est en O sur 98 % des 99 cases O/C historiques reconnues, puis 95 % en novembre. Deux postes stock sont respectivement à 98,2 % et 91,3 % historiquement, puis 95,2 % et 89,5 %. Ce sont des préférences persistantes, pas une rotation uniforme.
- Parmi les personnes qui travaillent deux jours consécutifs et ont deux cases O/C reconnues, le shift reste identique dans 38,1 % des paires de novembre : l'alternance est fréquente.
- À sept jours d'écart, le shift reste identique dans 62,3 % des 371 paires ; à quatorze jours, 65,4 % des 341 paires. Ces chiffres sont descriptifs : ils utilisent des shifts réels précédents de novembre, donc ne constituent pas un modèle prédisant novembre entièrement à l'avance. Ils suggèrent de tester des trames hebdomadaires.
- Le code M existe historiquement mais varie fortement selon le mois. L'apprentissage ne doit pas le supprimer automatiquement ni transposer une proportion fixe à toutes les boutiques.
- Les corners historiques changent de nomenclature et contiennent des affectations composites. Pas de conclusion chiffrée de stabilité des corners avant nettoyage explicite des correspondances.

## Tronc commun proposé pour Claude
1. Conserver en priorité les contraintes de contrat, repos, heures et couverture.
2. Apprendre sur les plannings réellement validés : probabilité de présence par personne/jour, puis préférence de shift par personne/jour. Ne pas mélanger au même poids les snapshots générés et les plannings validés.
3. Régulariser : avec peu d'observations, revenir au profil équipe/boutique ; les nouvelles personnes ne doivent pas hériter de certitudes fictives.
4. Employer ces probabilités comme préférences souples parmi les solutions admissibles. Le profil d'un manager ou d'un poste stock peut être asymétrique ; ne pas forcer la même exposition O/C à tous.
5. Tester ensuite une trame de semaine et des échanges admissibles entre jours/personnes, en gardant novembre hors apprentissage. La moyenne mensuelle des shifts seule ne représente pas une trame.
6. Mesurer le score exact agent/date/statut/horaires/corner et les contraintes finales. Le 62,5 % ci-dessus ne peut pas remplacer ce score.

Solution simple à tester : compteur par personne, jour de semaine et shift, avec repli équipe. Pas besoin d'un modèle opaque ou d'une multitude de coefficients. Ne pas ajouter ces préférences à des passes de réparation qui peuvent ensuite les effacer : les appliquer lors du choix entre candidats admissibles et vérifier le planning final.

## Arbitrages et incidents
Arbitrage : définir quelle source représente un planning validé et peut alimenter l'apprentissage. Proposition : import officiel explicitement validé, puis modifications manager validées ; génération automatique exclue de l'historique de référence par défaut.
Aucun nouvel incident de code prouvé par cette étude. La faiblesse de l'adhérence est un diagnostic de modélisation, pas la preuve que tous les désaccords avec l'officiel sont des bugs.
Généralisation : le mécanisme d'apprentissage est réplicable ; les proportions du BM ne sont pas des règles universelles. Confirmer sur une autre boutique et un mois tenu à l'écart avant toute intégration. Aucune modification production.

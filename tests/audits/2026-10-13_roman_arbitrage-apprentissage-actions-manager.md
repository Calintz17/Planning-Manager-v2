# Arbitrage Roman : apprentissage des actions managériales — 13 octobre 2026

Cette décision remplace le filtrage métier proposé dans le cadrage précédent.

## Règle adoptée
CAST propose une base solide et viable. Le modèle apprend les décisions prises par le manager, même si nous ne connaissons pas leur justification.
Ne pas exclure une préférence humaine parce qu'elle paraît atypique ou contraire aux habitudes supposées de la boutique.
Les contraintes configurées restent des limites de génération ; apprendre une préférence ne permet pas de produire automatiquement une infraction.

## Source d'apprentissage
1. Import officiel réalisé par un manager : référence humaine observable, après contrôle technique des identités, dates, codes et provenance. Ne pas lui imposer notre jugement sur la répartition O/C ou les repos.
2. Action explicite du manager sur un planning CAST : apprendre cette modification.
3. Génération automatique, recalcul, réparation automatique et sauvegarde sans modification humaine : ne pas créer de nouvelle observation managériale.
4. Les anciennes observations humaines restent utilisables sans être recomptées à chaque génération.

Ne pas exiger une approbation globale du planning final pour identifier une action humaine ; la provenance de l'action fait foi. Une validation globale éventuelle ne doit pas transformer toutes les cellules inchangées du moteur en décisions humaines.

## Implémentation simple proposée pour Claude
Conserver l'origine au moment de l'édition, pas la déduire après coup d'un snapshot complet :
store_id, agent_id, date, field, old_value, new_value, actor_source, baseline_revision, changed_at.
actor_source : manager_edit, manager_import, engine_generate, engine_repair.
Alimenter le modèle à partir des références manager_import et du dernier choix humain admissible pour une cellule/champ, avant le mois cible.
Enregistrer séparément les conséquences automatiques d'une édition : les déplacements de collègues faits par le moteur ne sont pas des choix directs du manager.
Idempotence : une même cellule de référence, ou la même action/revision, ne compte pas deux fois. Dix sauvegardes identiques ne multiplient pas le poids.
Si le manager revient de C à O, remplacer la préférence courante de la cellule ; ne pas conserver deux votes contradictoires comme deux jours historiques.
Conserver la trace d'audit séparée pour comprendre les révisions et ne pas perdre les décisions passées.
Ne pas remettre artificiellement à neuf la récence d'une vieille préférence parce que le moteur l'a reconduite aujourd'hui.
Les imports historiques sans version de base sont humains par provenance ; pas besoin de prétendre reconstruire leur delta avec un planning automatique qui n'existait pas.

## Contraintes et cas impossibles
Les habitudes apprises sont des préférences souples. Les jours/heures/repos et minima restent contrôlés sur la sortie.
Une décision humaine incompatible avec les réglages peut être conservée comme fait historique ou exception explicite ; elle n'autorise pas sa reproduction automatique.
Si aucune proposition ne respecte les règles, ne pas affaiblir les règles ni inventer l'intention : le manager tranche l'exception.

## Nettoyage autorisé de la base BM
Roman a confirmé que les modifications manuelles préexistantes étaient des tests.
Périmètre : les 18 overrides de septembre identifiés dans la sauvegarde avant import. Les OFF historiques importés ne sont pas des tests.
Suppression de ces overrides, restauration des quatre OFF source précédemment en conflit et des deux OFF source présents dans les lignes de test supprimées.
Résultat attendu/vérifié dans la conversation : 495 OFF historiques septembre–octobre, aucun conflit restant avec ces tests.
Aucune suppression des absences/OUT de septembre–octobre, aucune modification de novembre ou d'autres boutiques.
Les détails individuels et IDs de suppression restent privés.

## Statut
Cadrage d'apprentissage à appliquer dans la prochaine proposition de Claude ; aucune version Retail/CSC déployée.
Pas de nouvelle note /100 : décision métier et opération de nettoyage, pas audit de version.

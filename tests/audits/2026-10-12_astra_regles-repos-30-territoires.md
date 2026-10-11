# CAST — Jours travaillés et repos : solution proposée
12 octobre 2026. Recherche de cadrage et spécification pour Claude. Pas une nouvelle version du site.

## Décisions de Roman
- Minimum d’une personne par corner actif, indépendant du trafic.
- Chercher un échange de jours admissible avant toute exception manuelle.
- Heures contractuelles strictes pour les affectations automatiques.
- Seul Roman pousse les versions Retail/CSC. Aucun changement de production dans cette recherche.

## Conclusion
Un champ « jour max » unique ne peut pas couvrir les 30 pays/territoires avec boutiques actives recensés dans Supabase. Le noyau commun est : période de référence + jours travaillés + séquence de travail + blocs de repos mesurés en heures. Les règles d’entreprise, du contrat et du droit applicable doivent rester séparées.

La France n’impose pas universellement « 6 jours = récupération la semaine suivante ». L’arrêt du 13 novembre 2025, pourvoi 24-10.733, compte les six jours dans la semaine civile, et non nécessairement en série. Un repos déplacé entre deux semaines peut conduire à douze jours consécutifs, sous les autres contraintes applicables. Ce maximum possible n’est pas une cible de génération ni un droit automatique de modifier un contrat.

L’exemple six jours puis quatre correspond explicitement à l’Australian General Retail Industry Award 2020, clause 15.7(c), sous son champ d’application. Voilà pourquoi une compensation doit venir d’une règle de cycle identifiée, pas d’un automatismе déclenché par tout sixième jour.

## 1. Settings : écran simple, profil avancé
Conserver les champs existants « heures par semaine », « repos entre deux shifts » et « repos par mois ». Renommer max_days en « Jours de travail max par semaine — contrat/boutique ». Il reste à 5 pour le BM ; aucune hausse automatique à 6.

Champs visibles :
| Libellé | Clé | Comportement |
|---|---|---|
| Jours max par semaine | max_days (existant) | Plafond contractuel/de boutique, OUT compris ; ne pas confondre avec plafond légal. |
| Jours travaillés consécutifs max | max_consecutive_days | Indépendant de max_days ; compte floor + OUT. Sans valeur nouvelle : conserver le comportement existant lors de la migration. |
| Repos continu minimum | weekly_rest_hours | Durée TOTALE du bloc, quotidien inclus lorsqu’il doit l’être. Pas automatiquement 24 h partout. |
| Période de contrôle | rest_reference_mode + rest_reference_days | Semaine fixe ou période glissante ; afficher 7 jours normalement. Cycles 14/28 dans le profil avancé validé. |
| Début de semaine/cycle | week_start_day + rest_cycle_anchor | Lundi pour la semaine civile française ; ancrage explicite d’un cycle de 14/28 jours. |
| Repos compensateur | compensation_mode | « Pas de report automatique » par défaut. Autre valeur seulement si profil local validé. |

Profil avancé, non rempli par devinette :
- juridiction : pays + subdivision/État/province/canton/zone + convention/award et population couverte ;
- legal_max_days_per_week : plafond légal distinct du plafond de génération ;
- minimum de jours CIVILS entièrement libres et catégories de repos lorsque nécessaires ;
- exigences de blocs : nombre, durée minimale de chaque bloc, durée totale minimale sur la période ;
- cycle : jours travaillés max sur 14/28 jours, plafond de chaque semaine et règles conditionnelles ;
- dimanche/jour férié : droits et obligations distincts d’un simple OFF ;
- compensation : événement déclencheur, quantité, échéance, conditions d’autorisation ;
- timezone IANA boutique ; source, date d’effet, date de revue, version et statut du profil.

Important : ces champs sont définis dans cette spécification, pas encore intégrés dans retail.html. Aucune configuration juridique n’est activée en base. Une valeur provenant d’une recherche n’est pas automatiquement un profil homologué.

## 2. France : profil de base à intégrer
Adulte, régime général, sous les autres contraintes et convention applicables :
- legal_max_days_per_week=6 ;
- week_start_day=1 (lundi) ;
- bloc total normal de repos=35 h ;
- au moins un jour civil complet sans travail dans la semaine ouvrant droit au repos ;
- max_days demeure 5 pour le BM ;
- max_consecutive_days devient indépendant. Préserver sa valeur actuelle à la migration ; la relever est une décision de boutique, pas la conséquence automatique de l’arrêt.
- compensation_mode=none pour la règle ordinaire ci-dessus. Ajouter les droits liés aux dérogations/dimanches seulement selon régime identifié.

Ne pas tronquer un repos à minuit dimanche : le jour civil doit appartenir à la semaine concernée, mais le bloc total de 35 h peut commencer avant ou finir après ses bornes. Exemple : fin samedi 21 h, dimanche OFF, reprise lundi 8 h = 35 h. Reprise lundi 7 h = 34 h, insuffisant dans ce profil.

Source française : https://travail-emploi.gouv.fr/le-repos-hebdomadaire-principe-et-derogations
Arrêt : https://www.courdecassation.fr/decision/691597925cc9fa7cae5abeee

## 3. Formules et hard blocks
Pour une affectation candidate et son voisinage :
1. jours de la période = nombre de dates locales avec travail floor OU OUT ; une demi-journée travaillée compte comme un jour, mais avec ses heures réelles ;
2. jours admissibles <= min(plafond contractuel/de boutique, plafond légal applicable) ;
3. séquence de dates travaillées <= plafond consécutif configuré ;
4. repos entre shifts = début réel du suivant − fin réelle du précédent, mesuré en minutes réelles avec timezone/DST ;
5. chaque fenêtre légale doit contenir les blocs/jours civils requis selon la règle du profil ;
6. heures payées restent contrôlées séparément, sans convertir arbitrairement OUT en zéro heure ;
7. une compensation arrivée à échéance bloque toute affectation qui consommerait son dernier créneau admissible.

Pas de « 6 jours implique systématiquement OFF la semaine suivante ». Pour le cycle australien applicable : max six jours une semaine, max quatre l’autre si la première en a six, max dix jours dans les deux semaines ; ajouter les exigences de jours OFF consécutifs et dimanche du Retail Award. Ne pas réduire cette règle complète au seul total dix.

Un manager peut demander une exception au plafond boutique ; cela ne rend pas légale une violation du profil juridique. Une dérogation légale doit être identifiée avec ses conditions. Le code conserve les choix manuels existants et les marque dans le diagnostic d’audit, sans prétendre les rendre conformes. Aucun avertissement orange ajouté dans le produit.

## 4. Compensation simple sans « dette invisible »
Seules les règles de report effectivement applicables créent une obligation :
{agent_id, origin_date, reason, quantity_days_or_minutes, due_date, profile_version, allocated_rest_dates, status}.
Exemple : travail d’un repos désigné avec remplacement légal applicable → enregistrer l’obligation précise ; ne pas fabriquer un droit générique après chaque sixième jour.

Avant d’accepter un jour qui crée une obligation, réserver un créneau admissible avant son échéance, sans compter deux fois le même repos. Si aucun créneau n’existe, refuser le candidat automatique. Vérifier que le report est réellement autorisé ; son délai n’est pas une permission de manquer le repos ordinaire.
Les obligations non soldées passent au mois suivant. Aucun effacement lors d’un recalcul.

## 5. Insertion dans le moteur existant — une fonction, pas dix passes
Remplacer le couplage de runOk vers 5476 :
`return n <= maxDays;`
par l’usage du champ indépendant ; déplacer le contrôle commun dans :
`checkAssignment(agent, date, proposedResult, context, policy)`
→ {allowed, reasons, obligations, unresolved}.
Cette fonction doit lire la couche réellement affichée : overrides, OUT, congés, contrats fixes, snapshots et shifts proposés.

L’appeler dans canWork, minimum d’effectif, groupDaysOff, échanges de jours/shifts, settleWeekHours, repairDisplayedCoverage et l’éditeur manuel pour diagnostic. Validation finale du planning complet avec le même validateur, avant écriture du snapshot. Les contrats fixes ne sont pas exemptés ; une configuration fixe impossible doit être corrigée à la saisie, pas mutilée silencieusement.

OUT : les données actuelles contiennent des dates mais pas systématiquement les heures. C’est suffisant pour les compteurs de jours, insuffisant pour prouver les heures et le repos. Ajouter début/fin optionnels aux événements OUT, ou référencer un horaire de formation contractualisé explicite. Horaire inconnu = contrôle de repos/heures non certifiable ; jamais traiter comme 24 h libres.

Contexte : lire l’avant ET l’après de la période. Pour un contrôle sur 28 jours, charge utile minimale : période demandée + fenêtres voisines et obligations jusqu’à leur échéance. Un snapshot manquant n’est pas un OFF. Calendrier du mois suivant provisoire si nécessaire, avec repos réservés persistés ; sinon statut « non vérifié » explicite.

## 6. Couverture : arbitrages 1 personne et échanges
Minimum d’une personne pour chaque corner actif, même trafic nul. Définir actif par configuration physique, pas uniquement wF>0 : un trafic nul ne désactive pas le corner.
Planifier les besoins d’abord, puis répartir le surplus par trafic.
Le minimum 1 ne suffit pas à prouver la couverture de toute la plage : vérifier ouverture/fermeture et, si le besoin est continu, chaque créneau de 15 min avec pauses et missions hors floor. Une personne sur un shift court ne couvre pas toute la journée.
Première réparation : échange local de jours avec agent disponible/admissible et qualification/configuration de rotation respectée. Réévaluer toutes les règles ; retenir seulement une amélioration sans violation nouvelle. Limiter le nombre de tentatives et les indexer par date/pool.
Si impossible : pas d’heures illégales, pas de suppression arbitraire de jour fixe ; diagnostic pour traitement manager.

## 7. Matrice des 30 territoires présents dans Supabase
Repères issus des sources officielles consultées le 12/10/2026. Certaines sources sont des traductions, des synthèses ou des textes dont l’accès intégral échoue. Les cellules signalent les limites. Aucun tableau de trente presets n’est présenté comme validé pour toutes les boutiques.

| Pays/territoire | Repère légal de base | Ce qu’il faut résoudre avant profil actif | Source |
|---|---|---|---|
| France (FR) | 6 jours par semaine civile ; au moins un jour civil complet dans un repos total normalement de 35 h. L’arrêt du 13/11/2025 n’impose pas de repos immédiatement après le sixième jour ; jusqu’à 12 jours consécutifs peuvent résulter de deux semaines civiles, sous les autres contraintes. | Conserver contrat 5 ; dissocier plafond consécutif. Dérogation dominicale et convention à vérifier. | [Source officielle](https://www.courdecassation.fr/decision/691597925cc9fa7cae5abeee) |
| Autriche (AT) | Repos normalement de 36 h par semaine civile, avec jour civil entier ; règles de repos de remplacement. | Vérifier convention commerce et régime dimanche. | [Source officielle](https://ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10008541) |
| Allemagne (DE) | Repos dominical ; travail dominical autorisé dans les cas prévus, avec jour de remplacement dans une période de deux semaines incluant le dimanche travaillé. | Profil dimanche distinct ; convention et autorisation locale. | [Source officielle](https://www.gesetze-im-internet.de/arbzg/__11.html) |
| Espagne (ES) | Repos minimal de 1,5 jour continu, cumulable sur une période allant jusqu’à 14 jours ; mineurs : deux jours. | Ne pas convertir 36 h en un simple OFF ; convention commerce. | [Source officielle](https://boe.es/buscar/act.php?id=BOE-A-2015-11430) |
| Italie (IT) | Repos de 24 h cumulé avec le repos quotidien ; décompte moyen sur une période n’excédant pas 14 jours. | Convention et régime de répartition à confirmer. | [Source officielle](https://def.finanze.it/DocTribFrontend/getAttoNormativoDetail.do?ACTION=getArticolo&codiceOrdinamento=200000900000000&id=%7BBBEBF339-DE17-4D91-824B-6229B26926F9%7D) |
| Pays-Bas (NL) | 36 h continues par 7×24 h, ou 72 h sur 14×24 h avec blocs d’au moins 32 h. | Alternative multi-blocs ; ne pas retenir seulement deux OFF. | [Source officielle](https://www.arboportaal.nl/onderwerpen/arbowet--en--regelgeving/werk--en-rusttijden-arbeidstijdenwet/werktijden-voor-18-jarigen-en-ouder) |
| Suède (SE) | Au moins 36 h continues dans une période de sept jours ; conventions et dérogations encadrées. | Ancrage de période et convention à valider. | [Source officielle](https://www.av.se/arbetsmiljoarbete-och-inspektioner/lagar-och-regler-om-arbetsmiljo/om-arbetstidslagen/) |
| Danemark (DK) | Jour de repos de 24 h dans chaque période de sept jours, accolé au repos quotidien ; normalement 35 h continues. | Dérogations et couverture du salarié à confirmer. | [Source officielle](https://at.dk/en/regulations/working-environment-act/) |
| Irlande (IE) | 24 h de repos hebdomadaire précédées du repos quotidien de 11 h ; possibilité encadrée de deux périodes la semaine suivante. | Choisir le régime normal au départ ; report uniquement si applicable. | [Source officielle](https://www.workplacerelations.ie/en/what_you_should_know/hours-and-wages/working_hours/) |
| République tchèque (CZ) | 24 h immédiatement après un repos quotidien non réduit ; normalement 35 h au total ; réductions avec compensation encadrées. | Mineurs et dérogations à traiter séparément. | [Source officielle](https://ppropo.mpsv.cz/VIII82Nepretrzityodpocinekvtydnu) |
| Royaume-Uni (GB) | GOV.UK : 24 h sans travail chaque semaine ou 48 h chaque quinzaine ; repos quotidien distinct de 11 h. | Valider la combinaison des repos et le régime de référence choisi. | [Source officielle](https://www.gov.uk/rest-breaks-work) |
| Suisse (CH) | SECO : repos de fin de semaine normalement de 35 h ; dispositions spécifiques pour le dimanche et ordonnances sectorielles. | Canton, CCT et régime dimanche ; pas de profil juridique unique automatique. | [Source officielle](https://www.seco.admin.ch/fr/duree-du-travail-et-du-repos) |
| Monaco (MC) | Loi 822 sur le repos hebdomadaire ; régime commerce du dimanche : compensation par rémunération ou repos dans le mois suivant selon les conditions légales. | Texte consolidé principal non récupéré intégralement ; aucun preset chiffré activable sur cette seule recherche. | [Source officielle](https://journaldemonaco.gouv.mc/Journaux/2019/Journal-8441/Loi-n-1.471-du-2-juillet-2019-portant-modification-de-la-loi-n-822-du-23-juin-1967-sur-le-repos-hebdomadaire-modifiee) |
| États-Unis (US) | FLSA : pas de plafond fédéral général de jours travaillés pour les salariés de 16 ans et plus ; règles d’État susceptibles d’imposer un repos, notamment New York. | État et catégorie indispensables ; pas de paramètre national unique. | [Source officielle](https://webapps.dol.gov/elaws/firststep/results.htm?fs=AJ000000YEYYN0000000NNYNN00000000AS) |
| Canada (CA) | Ontario : 24 h par semaine de travail ou 48 h sur deux semaines ; Québec : 32 h continues par semaine. | Province indispensable ; ne pas appliquer le droit fédéral au commerce provincial. | [Source officielle](https://www.ontario.ca/document/your-guide-employment-standards-act-0/hours-work) |
| Australie (AU) | Retail Award : max six jours consécutifs ; normalement cinq jours par semaine, ou six dans une semaine et max quatre dans l’autre sur un cycle de deux semaines ; deux jours consécutifs OFF par semaine ou trois par cycle de deux semaines ; exigences supplémentaires pour dimanches réguliers. | Vérifier que MA000004 couvre effectivement les salariés et les accords applicables. | [Source officielle](https://awards.fairwork.gov.au/MA000004.html) |
| Chine (CN) | Loi du travail art. 38 : au moins un jour OFF par semaine ; autres régimes de travail sous approbation. | Régime standard ou régime d’heures autorisé à identifier. | [Source officielle](https://english.mofcom.gov.cn/Policies/GeneralPolicies/art/2007/art_50931311cbf44ca1af6fd192aec75726.html) |
| Hong Kong (HK) | Contrat continu : au moins un jour de repos dans chaque période de sept jours ; travail/repos substitué sous conditions. | Consentement, urgence et substitution ne sont pas des permissions automatiques. | [Source officielle](https://www.labour.gov.hk/eng/faq/cap57e_whole.htm) |
| Macao (MO) | Art. 42 : repos rémunéré de 24 h par semaine ; quatre jours sur quatre semaines dans les conditions prévues ; art. 43 compensation sous conditions. | Vérifier version consolidée après modification 2026 ; cycle spécial désactivé par défaut. | [Source officielle](https://bo.dsaj.gov.mo/bo/i/2008/33/lei07_cn.asp) |
| Taïwan (TW) | Art. 36 : deux jours de repos sur sept, de deux catégories différentes ; autres répartitions sous conditions, dont cycles de deux/quatre semaines. | Ne pas fusionner jour de repos régulier et rest day dans un seul compteur juridique. | [Source officielle](https://law.moj.gov.tw/LawClass/LawAll.aspx?PCode=N0030001) |
| Japon (JP) | Au moins un jour de repos par semaine ou quatre jours sur quatre semaines ; travail du repos soumis aux accords prévus. | Vérifier cycle, accord article 36 et éventuelles évolutions applicables. | [Source officielle](https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/roudouzikan/index.html) |
| Corée du Sud (KR) | Art. 55 : au moins un jour rémunéré par semaine en moyenne ; exclusions et seuils d’application. | Régime salarié, effectif et durée contractuelle à préciser. | [Source officielle](https://elaw.klri.re.kr/kor_service/lawViewMultiContent.do?hseq=68845) |
| Singapour (SG) | Part IV : un jour complet par semaine lundi–dimanche ; intervalle maximal de 12 jours entre repos ; pour shift workers, possibilité de 30 h continues. | Part IV n’inclut pas les managers/executives ; couverture selon statut/rémunération. | [Source officielle](https://www.mom.gov.sg/employment-practices/hours-of-work-overtime-and-rest-days) |
| Malaisie (MY) | Employment Act s.59 : un jour complet par semaine ; au moins 30 h pour les shift workers ; report particulier soumis à autorisation. | Acte vise la Malaisie péninsulaire ; Sabah/Sarawak et couverture à vérifier. | [Source officielle](https://jtksm.mohr.gov.my/sites/default/files/2022-11/akta_kerja1955_bi.pdf) |
| Thaïlande (TH) | Source BOI/Ministry of Labour : au moins un jour hebdomadaire, intervalle de six jours ; dérogations sectorielles possibles. | Régime retail standard, pas les dérogations hôtellerie/transport. | [Source officielle](https://www.boi.go.th/index.php?language=fr&page=labor_issues_01_labor_regulations) |
| Philippines (PH) | DOLE : au moins 24 h continues après six jours consécutifs de travail normal. | Couverture du salarié et circonstances exceptionnelles à vérifier. | [Source officielle](https://blr.dole.gov.ph/2014/12/11/book-iii-conditions-of-employment/) |
| Émirats arabes unis (AE) | Secteur privé : au moins un jour rémunéré de repos par semaine, selon contrat/règlement. | Identifier aussi éventuelle zone à droit distinct, notamment DIFC/ADGM. | [Source officielle](https://u.ae/en/information-and-services/jobs/employment-in-the-private-sector/types-of-leaves-and-entitlements-in-the-private-sector/official-leaves-and-vacations) |
| Arabie saoudite (SA) | Repos hebdomadaire rémunéré d’au moins 24 h ; vendredi par principe, autre jour selon conditions. | Les consolidations exceptionnelles ne doivent pas être activées pour le retail ordinaire. | [Source officielle](https://www.hrsd.gov.sa/en/%D8%B4%D8%B1%D9%88%D8%B7-%D8%A7%D9%84%D8%B9%D9%85%D9%84-%D9%88%D8%B8%D8%B1%D9%88%D9%81%D9%87) |
| Qatar (QA) | Art. 75 : repos hebdomadaire rémunéré d’au moins 24 h ; règles particulières vendredi et travail du repos. | Catégorie, shifts et compensation à vérifier dans le profil local. | [Source officielle](https://almeezan.qa/LawArticles.aspx?LawArticleID=51869&LawID=3961&language=en) |
| Koweït (KW) | Art. 67 : repos rémunéré de 24 h après six jours travaillés ; travail du repos et remplacement encadrés. | Vérifier texte en vigueur et applicabilité privée avant activation. | [Source officielle](https://www.manpower.gov.kw/PdfProxy.ashx?path=docs%2FLaborLaw%2FLabor_Law_Eng.pdf) |

Compléments officiels :
- Québec art.78 : https://www.cnesst.gouv.qc.ca/fr/organisation/documentation/acces-linformation/documents-servant-prise-decision/normes-travail/loi-sur-normes-travail/chapitre-iv-normes-travail-art-391-97/section-v-repos-art-78-79/article-78
- New York : https://dol.ny.gov/day-rest-and-meal-periods et https://www.nysenate.gov/legislation/laws/LAB/161
- Irlande report : https://revisedacts.lawreform.ie/eli/1997/act/20/section/13/revised/en/html
- Macao repos compensateur : https://www.dsal.gov.mo/en/standard/law43.html
- Japon art.35 : https://laws.e-gov.go.jp/document?law_unique_id=322AC0000000049

## 8. Stockage sans usine à gaz
max_consecutive_days et rest_policy JSON dans retail_regulations via le mécanisme rule_key/rule_value existant. Pas de nouvelles colonnes pour chaque variante nationale.
rest_policy contient les paramètres ET référence/version/statut du profil ; les profils juridiques restent en fichier versionné dans le code après revue locale, avec overrides plus protecteurs par boutique.
Si un registre de compensation est activé, il faut une vraie persistance des obligations. Ne pas le cacher dans un compteur calculé puis perdu au chargement.
Migration : absent → conserver réglages et comportement actuels. Ne pas transformer automatiquement une ancienne limite cinq jours en six ou douze ; ne pas activer des profils juridiques non validés.
Sources publiques séparées des plannings privés ; aucune donnée de personne dans le repo partagé.

## 9. Tests d’acceptation pour Claude
- France : six jours dans une semaine autorisés uniquement si contrat le permet ; sept bloqués.
- France : série répartie sur deux semaines, limite contractuelle/consécutive séparée ; ne pas utiliser douze comme cible.
- France : dimanche OFF avec gap 35 h passe ; gap 34 h échoue.
- Philippines/Thaïlande/Koweït, profil approprié : septième jour consécutif bloqué, OUT inclus.
- Australie : 6+4 passe les comptes de jours, 6+5 échoue ; contrôler séparément OFF consécutifs et dimanches.
- Taïwan : deux catégories de repos non fusionnées ; mode standard et modes autorisés distincts.
- Pays-Bas : vérifier blocs et total, pas simplement deux dates OFF.
- Contrat fixe impossible : validation explicite ; pas d’exemption.
- OUT sans heures : résultat indéterminé pour repos/heures, pas vert.
- Frontière dimanche/lundi, mois/année, changement d’heure local ; scénario de repos traversant une borne.
- Snapshot précédent absent et prochain mois inconnu : pas de preuve inventée.
- Échange local : aucune violation de jours/heures/repos ; couverture améliorable sans dégrader autre corner.
- Report : échéance, reprise du mois suivant, pas de double comptage ; dérogation non autorisée jamais activée.
- UI : 1440/390/320 px ; champs courts, unités visibles, avancé repliable ; aucun label tronqué ni scroll global.
- Baseline privée de match et invariants rejouée avant/après ; le gain d’adhérence ne justifie aucun assouplissement non décidé.

## État de livraison
Recherche et architecture définies, champs et règles prêts pour intégration par Claude. La législation de base a été recherchée pour les 30 territoires ; l’applicabilité des conventions, accords, catégories et subdivisions n’est pas certifiée et ne peut pas être inférée de country_iso.
Aucun nouveau moteur intégré, aucune version poussée, aucun réglage Supabase modifié. La note 78/100 du moteur 9.2.4 reste celle du dernier audit ; cette spécification ne change ni cette note ni le score de match.

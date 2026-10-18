# Note pour Astra : temps de travail par pays et pré-réglages Labor rules (17 octobre 2026)

Demande de Roman : « fais une note pour Astra, demande-lui de pousser en base, dans tous ces pays, un pré-réglage automatique avec les bonnes rules et regulations ».
Ce n'est pas un avis juridique. Chaque ligne « à vérifier » doit être confirmée sur une source officielle avant d'entrer en base.

## 1. Ce que Roman a tranché aujourd'hui (fait foi)
1. **Heures par personne** : le manager saisit les heures payées par semaine dans la fiche de chaque vendeur (37,5 au Bon Marché, c'est ce qui est écrit sur les contrats). Le réglage de la boutique devient « Default weekly hours », utilisé seulement pour un vendeur sans heures saisies. Plus de « maximum légal » d'heures.
2. **Le mois** : référence = heures de la semaine × jours du mois ÷ 7 (moyenne du contrat). Formation = 7 h 30. Congé, arrêt, jour férié chômé = une journée de contrat (heures ÷ 5). Repos (OFF) = 0.
3. **Part-time** : les pourcentages disparaissent, remplacés par les heures. Le part-time fixe (jours et horaires) et le flexible restent.
4. **Préférences de shift** : supprimées (le manager place à la main et CAST apprend).
5. **Modèle** : tout est fait sur le modèle du Bon Marché pour l'instant. Shibuya : garder en tête 10 jours de repos par mois (réglage « Rest days per month »).

## 2. Ce que disent les vrais plannings (Bon Marché août-novembre 2026, Shibuya septembre 2026)
- **Bon Marché** : 447 semaines sur 505 = exactement 5 journées (shift, congé, arrêt, formation, férié, récup) + 2 OFF. 5 × (8 h 30 − 1 h de déjeuner) = 37 h 30. Une semaine entière de congé est notée sur 7 jours et vaut une semaine normale.
- **Le mois au Bon Marché suit la semaine, pas l'inverse** : septembre 21,4 journées en moyenne (référence 21,4), octobre 22,4 (22,1), novembre 21,0 (21,4). Mais une personne sur deux est au-dessus de la référence certains mois (un lundi ou un dimanche de plus), jusqu'à 2 journées. Une limite stricte « jamais au-dessus » sur le mois casserait la pratique réelle : mesuré sur Store A avec historique, jours exacts 77,5 → 74,8 % et score fonctionnel 92,4 → 90,6. La 9.4.0.0 garde donc les heures **par semaine** comme règle obligatoire (de chaque personne) et affiche le mois comme compteur. Arbitrage ouvert pour Roman.
- **Shibuya** : les 8 temps pleins ont exactement 20 journées et 10 repos en septembre (« 公休＝10日 » écrit dans le planning). Congés (有), formation (研修), contrôle médical (健診) et « BD » comptent comme des journées.
- **Pauses au Bon Marché** : le contrat dit 37,5 h et les shifts font 5 × 7 h 30 avec seulement le déjeuner retiré. Les deux pauses de 15 min sont donc comptées dans le temps payé. En France, la loi ne paie pas la pause par défaut (voir 3) : c'est le contrat ou l'usage qui la paie. CAST ne retire que le déjeuner, ce qui colle au Bon Marché.

## 3. Relevé par pays
| Pays | Durée de référence | Limites | Pauses (payées ?) | Repos | Format des contrats retail | Sources |
|---|---|---|---|---|---|---|
| France | 35 h (seuil des heures sup) ; CELINE : 37,5 h + RTT | 10 h / jour, 48 h / semaine (à vérifier) | 20 min dès 6 h de travail, non payée sauf si le salarié reste à disposition | 11 h par jour ; 35 h par semaine ; 6 jours max par semaine (relevé 12-10) | heures par semaine | [Tissot](https://www.editions-tissot.fr/actualite/droit-du-travail/ai-je-le-droit-d-accorder-des-temps-de-pause-a-mes-salaries-sans-les-remunerer), [Legisocial](https://www.legisocial.fr/jurisprudences-sociales/1009-remuneres-temps-pause-ne-sont-ajoutes-temps-travail-effectif.html) |
| Japon | 40 h / semaine, 8 h / jour ; 44 h pour le commerce de moins de 10 salariés | heures sup : 45 h / mois, 360 h / an ; système variable sur un mois (moyenne 40 h) | 45 min au-delà de 6 h, 1 h au-delà de 8 h | 1 jour par semaine ou 4 jours sur 4 semaines | **heures par jour + jours de repos par an** : 7 h 30 à 8 h par jour, 1 h à 1 h 15 de pause, 108 à 122 jours de repos par an (9 à 10 par mois) | [JETRO](https://www.jetro.go.jp/usa/legislation-on-working-hours-breaks-days-off.html), offres : [maison de luxe, 120 j](https://en-ambi.com/job/j-13034770/), [montres de luxe, 108 j](https://employment.en-japan.com/desc_948246/), [marque japonaise de luxe, 122 j](https://www.careercross.com/job/pdf-1577451) |
| Chine | 8 h / jour, 40 h / semaine | « système d'heures cumulées » possible pour le commerce, avec accord de l'administration : moyenne sur la semaine, le mois, le trimestre ou l'année | non relevé | 1 jour par semaine (à vérifier) | heures par semaine, ou cumul sur période autorisé | [Hawksford](https://www.hawksford.com/insights-and-guides/china-work-hour-systems-and-overtime-pay-explained) |
| Corée | 40 h / semaine, 8 h / jour | 52 h avec heures sup (12 h max) | 30 min au-delà de 4 h, 1 h au-delà de 8 h (payée : à vérifier) | 1 jour payé par semaine (주휴) dès 15 h par semaine ; 11 h entre deux journées (cité par une seule source, à vérifier) | heures par semaine | [Playroll](https://playroll.com/working-hours/south-korea), [주휴](https://braindetox.kr/en/posts/weekly_holiday_pay_legal_basis.html) |
| Royaume-Uni | pas de durée légale ; 37,5 à 40 h usuel (à vérifier) | 48 h en moyenne sur 17 semaines (renonciation écrite possible) | 20 min au-delà de 6 h, non payée par la loi | 11 h par jour ; 24 h par semaine ou 48 h sur 2 semaines | heures par semaine | [RosterElf](https://www.rosterelf.com/uk/guides/rota-laws) |
| Allemagne | conventions du commerce autour de 37,5 h (à vérifier) | 8 h / jour, 10 h avec moyenne de 8 h sur 6 mois ; 48 h du lundi au samedi | 30 min au-delà de 6 h, 45 min au-delà de 9 h | 11 h ; repos du dimanche | heures par semaine | [IHK](https://www.ihk.de/blueprint/servlet/resource/blob/6504518/a56655c8e2b71d60cfb8c039f46f182d/merkblatt-arbeitszeit-data.pdf) |
| Italie | 40 h / semaine (la convention peut changer) | 48 h sur 7 jours, heures sup comprises | au-delà de 6 h, 10 min si la convention ne dit rien | 11 h par jour ; 24 h par semaine | heures par semaine (convention du commerce, à vérifier) | [QuiFinanza](https://quifinanza.it/lavoro/orario-lavoro-riposo-giornaliero-settimanale/848772/) |
| États-Unis | 40 h (seuil des heures sup, loi fédérale) | pas de limite fédérale par jour | pas de pause fédérale ; une pause courte (≤ 20 min) est payée. Californie : 30 min non payées par 5 h, 10 min payées par 4 h. New York : non relevé | pas de loi fédérale | heures par semaine | [SHRM](https://www.shrm.org/in/topics-tools/employment-law-compliance/employers-required-to-give-workers-meal-rest-breaks) |
| Canada (Ontario) | 44 h (seuil des heures sup) | 8 h / jour et 48 h / semaine sauf accord écrit | 30 min après 5 h (payée : à vérifier) | 11 h par jour ; 24 h par semaine ou 48 h sur 2 semaines ; 8 h entre deux shifts | heures par semaine | [Ontario](https://www.ontario.ca/files/2024-12/mlitsd-info-about-how-and-ot-en-2024-12-12.pdf) |

**Le format japonais** : les offres et le planning de Shibuya parlent en heures par jour et en jours de repos (par an, ou « 公休 » par mois), pas en heures par semaine. La loi fixe 40 h par semaine en moyenne. Pour CAST : heures par semaine = heures par jour × 5 comme partout, plus « Rest days per month » pour les boutiques qui comptent en jours.

## 3 bis. Précision de Roman (17-10, soir)
« Mon point c'était de prendre le tronc commun de la loi et de le pré-remplir par pays. Les managers peuvent toujours ajuster après. » Les pré-réglages sont un point de départ légal commun, pas une homologation : le manager les corrige pour sa boutique. Pour le Canada et les États-Unis, prendre la règle de la province ou de l'État de la boutique quand elle est connue, sinon un tronc commun écrit comme tel dans l'aide du réglage.

## 4. Demande à Astra
1. **Pré-réglages par pays** (France, Japon, Chine, Corée, Royaume-Uni, Allemagne, Italie, États-Unis, Canada), dans les clés existantes de `retail_regulations` :
   - `weekly_hours` (défaut de la boutique),
   - `max_days`, `max_consecutive_days`, `max_days_2weeks`,
   - `max_daily_hours`, `rest_gap_hours`, `monthly_rest_days`,
   - `breaks` (déjeuner non payé et pauses).

   Chaque valeur doit avoir sa source. Ce qui est « à vérifier » ici ne doit pas entrer sans source officielle. Écriture en base seulement avec l'accord de Roman.
2. **Où les appliquer** : à la création d'une boutique (selon son pays), sans écraser une boutique déjà réglée. Aujourd'hui, le code n'a que `REGION_DEFAULTS` (6 villes, heures et week-end). Une table ou un objet par pays est à proposer.
3. **Relire la 9.4.0.0** (`tests/audits/2026-10-17_claude_retail-9400.md`), en particulier :
   - la règle du mois (compteur ou limite stricte) ;
   - la journée de congé = heures ÷ 5, plafonnée à la part de la semaine dans le mois ;
   - le part-time flexible piloté par les heures.

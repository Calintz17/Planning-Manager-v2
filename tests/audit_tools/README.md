# Outils d'audit du code (18-10-2026)
- `dead_js.cjs <page.html>` : fonctions jamais atteintes (graphe d'appels avec acorn, depuis le code de premier niveau, les attributs `on…` du HTML et les noms appelés dans les chaînes).
- `css_check.cjs <page.html>` : sélecteurs dont aucune classe ou id n'apparaît dans la page, déclarations écrasées plus loin par le même sélecteur, sélecteurs écrits dans plusieurs règles.
- Prérequis : `npm i acorn acorn-walk postcss postcss-selector-parser` dans un dossier de travail.

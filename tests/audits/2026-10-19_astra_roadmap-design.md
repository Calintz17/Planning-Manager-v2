# CAST — Roadmap : revue esthétique et proposition Astra

19 octobre 2026. **Note esthétique : 79/100.** Revue du code, de ses dimensions et des assets ; maquette composée pour la proposition, pas capture d'un navigateur. Aucun moteur, page de production ou contenu de roadmap modifié. Aucun navigateur n'a été utilisé pour certifier le rendu final de ce CSS de proposition.

Source relue : `tests/builds/site/roadmap.html`, blob `287d1fa71707c0f19d1c6dfeaca1599e1a7fc50a`, sur `test`. Comparaison de cohérence avec `tests/builds/site/index.html`. Le fichier est une proposition de site ; ne pas confondre cette revue avec un nouvel audit de Retail.

## Ce qui mérite d'être conservé

- Photographie d'origine et bleu nuit de la page d'accueil.
- Frise horizontale, cartes alternées et connecteurs fins sur ordinateur.
- Une lumière parcourant la ligne : mouvement pertinent si discret.
- Icônes linéaires cohérentes, navigation au clavier, flèches et prise en compte de `prefers-reduced-motion` déjà présentes.
- Contrôles de 48 px aujourd'hui : la proposition conserve une cible tactile suffisante de 44 px.

## Ce qui donne un aspect moins fini

1. **La lumière change de langage chromatique.** `.streak` associe `#60A5FA`, `#6366F1`, `#A78BFA` et le blanc. Ce bleu-violet électrique s'éloigne de CAST et de la palette souhaitée par Roman. Garder le mouvement, remplacer par bleu glacier + blanc, réduire le halo et ralentir la traversée à environ 14 s.
2. **Contraste de surfaces trop abrupt.** `.sq` : blanc à 88 %, ombre `0 18px 40px rgba(0,0,0,.25)`, blur 10 px, sur une photo détaillée. Préférer un blanc cassé uniforme `#F1F4F7`, bordure `#DBE2E9`, ombre courte `0 6px 20px rgba(0,0,0,.14)`. Retirer le backdrop blur devenu inutile avec une surface quasi opaque.
3. **Le prévu ressemble à une version grisée du livré.** `.ms.next .sq` utilise un gris bleuté clair. Lui donner une surface sombre `#1B2B40`, un texte clair et un libellé « Planned ». Livré : surface claire et petit « Live ». Le texte garantit que l'état ne dépend pas seulement de la couleur.
4. **Le dernier jalon livré n'a pas de traitement visuel dédié.** `last-done` sert aux déplacements, mais pas à une hiérarchie visible. Ajouter `.current`, une bordure glacier et « Latest release » ; halo très limité autour du point et de la carte. Ne pas transformer les cartes en faux boutons ni les faire grossir au survol.
5. **L'espace intérieur est serré.** Cartes 244×150 px, avec icône, date, titre et texte : certains jalons riches laissent peu de marge. Proposition 248×176 px, padding 20/24 px, écart entre jalons 180 px. Deux cartes du même côté ont alors 112 px de séparation. Titres 18 px, corps 14 px, dates 10 px ; conserver la même échelle sur toute la frise.
6. **Pas de titre visible de page.** `h1.sr-only` est accessible, mais ne situe pas visuellement la page. Ajouter un titre « Roadmap » compact, pas un deuxième hero marketing géant, avec « What’s live. What’s next. ». Garder les dates et les descriptions existantes.
7. **Sur mobile, l'alternance multiplie les zones à suivre.** Conserver le défilement horizontal, mais placer toutes les cartes au-dessus de la ligne, avec une carte centrale lisible et le début de la suivante visible. Titre 20 px, corps 14 px ; pas de réduction à 13 px sur un texte long. La maquette montre ce principe.
8. **Le défilement doit rester prévisible.** Le gestionnaire `wheel` actuel transforme le défilement vertical en déplacement horizontal, et `touch-action:pan-x` peut gêner le défilement vertical depuis la grande zone de frise. Recommandation : défilement horizontal natif, drag souris et boutons ; laisser le geste vertical parcourir la page. Un scroll-snap `proximity` aide sans imposer un verrouillage.

## Spécification recommandée

| Élément | Valeur |
|---|---|
| Fond et en-tête | Bleu nuit CAST `#0C1A33` |
| Carte livrée | `#F1F4F7`, texte `#17283E`, secondaire `#52647B` |
| Carte prévue | `#1B2B40`, texte `#EDF2F7`, secondaire `#BECCD9` |
| Bordure du prévu | `#56697E` |
| Lumière et jalon actuel | `#B5CDDF` et blanc bleuté |
| Rayon des cartes | 12 px, cohérent avec le site |
| Rayon des boutons | 6 px ; cible minimum 44×44 px |
| Ombre | `0 6px 20px rgba(0,0,0,.14)` |
| Grille d'espacement | 8 / 12 / 16 / 24 / 32 px ; exceptions motivées pour le connecteur |
| Animation | Une seule ligne, faible halo, 14 s ; supprimée en mouvement réduit |

Surfaces opaques : contraste calculé d'environ 13,5:1 pour le texte principal de carte livrée, 5,5:1 pour son secondaire ; environ 12,7:1 / 8,8:1 pour principal/secondaire sur la carte prévue. Recalculer les valeurs finales avec la composition et les tokens effectivement utilisés ; pas de certification automatique à partir de cette seule maquette.

## Intégration ciblée pour Claude

Le fichier compagnon `2026-10-19_astra_roadmap-proposal.css` est une **proposition**, à intégrer proprement aux règles existantes après validation visuelle. Ne pas empiler définitivement toutes les anciennes règles et ces overrides.

Ajouter un en-tête compact dans `<main class="rm">`, après le voile, à la place du seul `h1.sr-only` :

```html
<div class="wrap rm-intro">
  <div class="rm-eyebrow">PRODUCT EVOLUTION</div>
  <h1>Roadmap</h1>
  <p>What’s live. What’s next.</p>
</div>
```

Chaque carte reste informative. Ajouter un petit `<span class="rm-state">Live</span>` ou `Planned`. Pour `#last-done`, ajouter la classe `current` et le texte `Latest release`. Pas besoin d'une nouvelle bibliothèque ou d'un composant React.

Si la page doit ouvrir la frise sur le jalon actuel, déplacer initialement le scroll **sans animation** après calcul de taille :

```js
line.scrollLeft = Math.max(0, lastDone.offsetLeft - line.clientWidth / 2);
```

Le faire une seule fois au chargement, sans recentrer à chaque resize et sans voler la position choisie par la personne. Mettre à jour l'état des flèches après ce déplacement. L'historique de mars et juin reste disponible à gauche : aucune date ni fonctionnalité supprimée.

La maquette représente la nouvelle hiérarchie et une position de lecture proche du dernier jalon livré. Les contrôles `07 / 09` ou petits repères sont des propositions de positionnement ; s'ils sont conservés, ils doivent être calculés depuis le jalon réellement centré et ne pas rester codés en dur. Ils peuvent être omis pour une première intégration plus sobre.

## Contrôles avant d'intégrer

- 320, 390, 768, 1440 et 1920 px ; fenêtre basse et paysage : aucune carte ou description coupée verticalement, navigation atteignable.
- Les neuf jalons restent présents, dans le même ordre et avec le même contenu.
- Clavier flèches/Home/End, focus visible, souris, swipe et défilement vertical natif.
- `prefers-reduced-motion` : absence d'animation lumineuse et de mouvement imposé.
- Contraste des états et des textes secondaires sur la photo réelle.
- Aucun nouveau lien mort ; ne pas changer les destinations des liens de la page d'accueil.
- Vérifier le chemin des assets dans le site effectivement servi : `logo/...` et `image homepage/...` sont cohérents si les fichiers sont copiés à la racine, pas forcément en servant directement `tests/builds/site/`. Ne pas déclarer un lien mort sans connaître ce montage.

**Direction conseillée :** conserver la composition, calmer les matières, limiter les accents et rendre le jalon actuel identifiable. La proposition n'implique aucun changement de contenu ou de production.

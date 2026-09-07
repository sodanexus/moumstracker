<div align="center">

<img src="./assets/brand/moumix-mark.svg" width="88" height="88" alt="Logo Moumix-Finance">

# Moumix-Finance
### Le patrimoine, au même endroit

<p><em>Comprendre ce que j’ai. Voir où il se trouve. Suivre le chemin parcouru.</em></p>

Un tableau de bord privé et calme pour suivre ses comptes, ses actifs et ses projets dans le temps.

![HTML5](https://img.shields.io/badge/HTML5-static-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-native-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=111)
![Supabase](https://img.shields.io/badge/Supabase-backend-3ECF8E?style=flat-square&logo=supabase&logoColor=111)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square&logo=pwa&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/deploy-GitHub%20Pages-222?style=flat-square&logo=githubpages&logoColor=white)

</div>

Moumix-Finance rassemble ce qui est souvent éparpillé entre plusieurs banques, courtiers et applications. L’idée n’est pas de transformer l’épargne en salle de marché : l’application aide simplement à lire son patrimoine, à comprendre sa répartition et à observer son évolution.

---

## Le concept

Moumix-Finance relie trois questions très concrètes :

- **Combien ai-je aujourd’hui ?**
- **Dans quelles poches se trouve mon argent ?**
- **Que pourrait-il devenir si je garde un certain rythme ?**

Les cours de marché ne sont qu’un moyen de valoriser les positions. Ils ne prennent jamais le dessus sur l’essentiel : les comptes, les actifs, les plus-values, les mouvements et la progression globale.

## Les grands principes

- **Une lecture patrimoniale** — pas de fil d’actualité, de bandeau boursier ou d’indicateur réservé aux traders.
- **Une information à la fois** — les vues évitent d’empiler plusieurs représentations concurrentes.
- **Des données personnelles séparées** — chaque compte Supabase ne voit que ses propres lignes grâce à l’authentification et aux règles RLS.
- **Une trajectoire explicite** — toute estimation part du portefeuille renseigné et affiche clairement ses hypothèses.
- **Une base fiable** — écritures ciblées, cotations limitées et snapshots refusés lorsqu’ils seraient incomplets.

## Les trois espaces

### Synthèse

La page d’accueil répond immédiatement à l’essentiel :

- patrimoine actuellement suivi ;
- capital investi et plus-value latente ;
- variation sur la période choisie ;
- courbe de progression ;
- allocation par poche, compte ou actif ;
- aperçu des établissements et du poids de chaque compte.

L’ancien bloc de jalons automatiques a été retiré. Les filtres permettent toujours d’isoler un ou plusieurs types de comptes sans modifier les données enregistrées.

### Portefeuille

Le portefeuille conserve toute la gestion opérationnelle :

- création de comptes par établissement et type d’enveloppe ;
- comptes de marché et soldes fixes ;
- recherche d’un titre par nom ou ticker ;
- achat, vente et modification d’une position ;
- quantité, PRU, cours actuel, valeur et plus-value ;
- historique des mouvements ;
- prélèvements récurrents et équivalents mensuel/annuel.

L’actualisation conserve la dernière cotation connue lorsqu’une nouvelle valeur manque. Une position supprimée depuis un autre appareil n’est jamais recréée pendant une synchronisation.

### Trajectoire

La trajectoire remplace l’ancien simulateur dense. Elle utilise automatiquement le patrimoine déjà présent, puis permet de définir :

- le versement mensuel de chaque compte ;
- l’horizon de la projection ;
- les hypothèses de rendement par poche et l’inflation.

Le plan peut donc représenter simultanément un apport immobilier, un PEA, un CTO et du Bitcoin. Son total est calculé automatiquement. Les montants sont mémorisés localement avec une clé différente pour chaque utilisateur, afin que deux comptes utilisant le même appareil ne partagent pas leurs réglages.

Trois résultats restent visibles : prudent, central et favorable. Les hypothèses annuelles par poche sont disponibles dans un volet replié pour ceux qui souhaitent les ajuster. Les objectifs personnels restent séparés des estimations.

Cette partie n’écrit aucune hypothèse dans Supabase. Elle constitue une simulation indicative, jamais une promesse de rendement ni un conseil financier.

## Identité et expérience

La version 2 introduit une identité complète autour d’un symbole en forme de **M** et de poches imbriquées. L’interface utilise des surfaces bleu-encre, un vert plus doux et quelques accents bleus afin de rester lisible sans ressembler à un terminal boursier.

Sur mobile :

- le logo, la navigation et le taux USD/EUR partagent un en-tête compact sur ordinateur ;
- la navigation principale est ancrée en bas sur mobile et respecte les zones sûres de l’iPhone ;
- les actions d’ajout et le compte personnel sont regroupés derrière un hamburger discret ;
- le pincement à deux doigts reste disponible ;
- les champs ne déclenchent pas de zoom automatique au focus.

## Ce qui a volontairement disparu

- le Shiba et ses messages ;
- le bandeau défilant d’indices, crypto et métaux ;
- les jalons patrimoniaux automatiques ;
- la présentation très dense de l’ancien simulateur ;
- tout parcours d’inscription publique.

Le taux **USD/EUR** reste présent car il est utile à la compréhension des positions étrangères.

## Version en cours

**2.2.0 — septembre 2026**

Cette version reconstruit l’expérience sans migrer ni réécrire la base existante :

- nouvelle architecture visuelle et nouveau logo ;
- navigation renommée Synthèse, Portefeuille et Trajectoire ;
- allocation regroupable par poche, compte ou actif ;
- aperçu utile des comptes à la place des jalons ;
- trajectoire simplifiée et toujours fondée sur le portefeuille réel ;
- plan de versements mensuels distinct pour chaque compte ;
- total mensuel recalculé automatiquement et préférences isolées par utilisateur sur l’appareil ;
- lecture séparée du capital existant, des futurs versements et des rendements estimés ;
- équivalent en euros d’aujourd’hui calculé avec une inflation modifiable ;
- zone sûre supérieure intégrée à l’en-tête iPhone, sans double décalage au défilement ;
- navigation mobile verrouillée en bas jusqu’aux petits formats tablette ;
- moteur de trajectoire isolé du DOM et couvert par des tests dédiés ;
- mécanisme commun de compensation pour les achats, ventes et modifications ;
- historique de transaction idempotent pour éviter les doublons après une coupure réseau ;
- nouvelles tentatives automatiques limitées pour les écritures temporairement refusées ;
- ressources versionnées et revalidation réseau afin qu’un ancien CSS ne reste plus bloqué dans la PWA ;
- recherche de mise à jour au retour dans l’application et toutes les quinze minutes ;
- nouvelles icônes PWA ;
- mascotte et cotations défilantes retirées du HTML et du JavaScript ;
- modèle Supabase et historique existants conservés.

## Architecture

| Élément | Rôle |
| --- | --- |
| `index.html` | Structure et contenu de l’interface |
| `assets/css/app.css` | Composants fonctionnels historiques |
| `assets/css/v2.css` | Identité et hiérarchie de la version 2 |
| `assets/brand/moumix-mark.svg` | Logo vectoriel |
| `assets/js/core.js` | Fonctions techniques pures et testables |
| `assets/js/trajectory-core.js` | Formules et hypothèses de trajectoire, sans dépendance à l’interface |
| `assets/js/app.js` | Authentification, données et interface |
| `assets/js/history-import.js` | Import de l’historique patrimonial |
| Supabase | Authentification, PostgreSQL et règles RLS |
| Yahoo Finance | Cotations nécessaires aux positions et au taux USD/EUR |
| Cloudflare Worker | Proxy CORS et solution de repli pour les cotations |
| GitHub Actions | Snapshot quotidien du patrimoine |
| Service worker | Cache du shell et mise à jour contrôlée de la PWA |

Le frontend reste en JavaScript vanilla, sans compilation. Il peut être déposé directement sur GitHub Pages.

## Déploiement d’une mise à jour existante

Pour une base Moumix-Finance déjà utilisée :

1. remplacer les fichiers du projet sur GitHub ;
2. attendre la fin du déploiement GitHub Pages ;
3. fermer puis rouvrir la web app ;
4. accepter la proposition de mise à jour si elle apparaît.

À partir de la 2.2, les feuilles de style et scripts portent aussi leur numéro de version. Même si l’ancien service worker est encore actif, il ne peut plus resservir silencieusement le CSS d’une version précédente.

**Aucune migration SQL n’est nécessaire pour la version 2.** Ne relancez pas `supabase_shema.sql` sur une base déjà en service. Les comptes, positions, transactions, prélèvements, objectifs et snapshots existants sont relus tels quels.

## Nouvelle installation

1. créer un projet Supabase ;
2. exécuter `supabase_shema.sql` une seule fois ;
3. activer l’authentification par email et mot de passe ;
4. créer manuellement les utilisateurs autorisés ;
5. laisser l’inscription publique désactivée ;
6. renseigner dans `assets/js/app.js` l’URL Supabase, la clé publique `anon` et le proxy Yahoo Finance.

La clé `service_role` ne doit jamais être placée dans le frontend.

## Snapshot automatique

Le workflow GitHub Actions récupère les positions des utilisateurs autorisés, mutualise les symboles communs et limite le nombre de requêtes simultanées. Les réponses non JSON, les limitations temporaires et les délais d’attente sont retentés avec temporisation.

Un snapshot n’est enregistré que si toutes les cotations et conversions requises sont disponibles. Cela évite qu’une panne de fournisseur apparaisse comme une chute artificielle du patrimoine.

Secrets GitHub nécessaires :

| Secret | Contenu |
| --- | --- |
| `SUPA_URL` | URL du projet Supabase |
| `SUPA_SERVICE_KEY` | Service Role Key réservée à GitHub Actions |
| `SNAPSHOT_USER_IDS` | Identifiants utilisateurs séparés par des virgules |

## Données et confidentialité

L’inscription est absente de l’interface. Les deux comptes autorisés restent indépendants : l’identifiant de l’utilisateur accompagne chaque ligne et les politiques RLS empêchent la lecture des données d’un autre compte.

L’export JSON permet de conserver une copie locale des comptes, positions, transactions, prélèvements, historique, objectifs et plan mensuel.

### Ancien plan patrimonial privé

Depuis la version 2.1, l’application n’utilise plus la table expérimentale `private_projection_plan`. Si son ancien script d’activation a été exécuté, cette table peut rester sans perturber l’application, mais elle conserve inutilement le texte personnel qui y avait été enregistré.

Le script optionnel `scripts/optional/remove-private-projection-plan.sql` supprime uniquement cette table abandonnée et sa fonction de mise à jour. Il ne doit être exécuté que si ces anciennes informations ne sont plus utiles. Il ne touche pas à `goals` ni à `patrimoine_history`.

## Limites

- Moumix-Finance valorise les actifs mais ne tient pas automatiquement un solde espèces après chaque achat ou vente.
- Les cotations peuvent être différées selon les marchés et le fournisseur.
- La trajectoire est une estimation sensible aux hypothèses choisies.
- L’application n’agrège pas automatiquement les comptes bancaires : les données restent saisies et contrôlées par l’utilisateur.

## La direction

Moumix-Finance reste un projet personnel. Chaque évolution doit rendre le patrimoine plus facile à comprendre avant d’ajouter une nouvelle fonction : moins de bruit, une hiérarchie plus juste et des données auxquelles on peut faire confiance.

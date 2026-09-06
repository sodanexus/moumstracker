<div align="center">

# Moumix Finance
### Mon patrimoine, simplement

<p><em>Voir où j’en suis. Comprendre ce qui évolue. Construire la suite.</em></p>

Un tableau de bord privé pour suivre ses comptes, ses investissements et ses projets à long terme.

![HTML5](https://img.shields.io/badge/HTML5-static-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-native-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=111)
![Supabase](https://img.shields.io/badge/Supabase-backend-3ECF8E?style=flat-square&logo=supabase&logoColor=111)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square&logo=pwa&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/deploy-GitHub%20Pages-222?style=flat-square&logo=githubpages&logoColor=white)

</div>

Moumix Finance est une application personnelle conçue pour rendre le suivi patrimonial plus lisible et plus concret. Elle rassemble au même endroit les comptes, les positions, les liquidités fixes, l’historique du patrimoine et les projections futures.

L’objectif n’est pas de multiplier les graphiques, mais de garder une vision claire de ce qui existe aujourd’hui, de ce qui évolue et de ce qui pourrait être construit demain.

---

## Le concept

Moumix Finance relie trois temporalités qui sont souvent séparées :

- **le présent** — la valeur actuelle des comptes et des positions ;
- **le passé** — l’évolution du patrimoine et l’historique des opérations ;
- **le futur** — des projections fondées sur les actifs réellement renseignés.

Chaque donnée reste à sa place : les cours servent à suivre la valeur du portefeuille, les transactions gardent la trace des mouvements et les hypothèses de projection restent modifiables et clairement présentées comme une simulation.

## Les grands principes

- **Une vision d’ensemble** — comptes, investissements et patrimoine sont réunis dans une même lecture.
- **Des données compréhensibles** — valeur, PRU, plus-value, allocation et évolution sont affichés sans multiplier les écrans.
- **Des projections ancrées dans le réel** — le capital de départ est calculé à partir des comptes et positions existants.
- **Une expérience personnelle** — l’application est privée, installable et pensée pour rester agréable sur ordinateur comme sur mobile.
- **Une base préservée** — les actions importantes sont enregistrées de façon ciblée et les données existantes ne sont pas réécrites globalement.

## Les grands espaces

### Vue d’ensemble

Le point de départ de l’application : patrimoine total, capital investi, plus-values, allocation, évolution historique et répartition par compte.

Les cours disponibles sont actualisés depuis Yahoo Finance. Lorsqu’un cours manque, la dernière valeur connue est conservée et l’interface l’indique au lieu de présenter une précision artificielle.

### Comptes

Un espace pour organiser les différents supports et leurs positions : PEA, CTO, PEE, PER, assurance-vie, crypto, livret, immobilier ou autre.

Chaque position peut afficher son ticker, sa quantité, son PRU, son cours actuel, sa valeur et sa performance. Les achats, ventes et modifications sont conservés dans un historique de transactions.

Les prélèvements récurrents peuvent également être regroupés par catégorie et suivis au mois ou à l’année.

### Projections

Les projections partent directement du patrimoine renseigné dans Moumix Finance. Le capital initial, les catégories d’actifs et l’allocation actuelle sont repris automatiquement, puis complétés par :

- un horizon de projection ;
- des versements mensuels ;
- des hypothèses de rendement par catégorie ;
- trois scénarios — pessimiste, réaliste et optimiste.

Les hypothèses restent modifiables et la projection est explicitement présentée comme une simulation, jamais comme une prédiction ou un conseil financier.

### Historique et objectifs

Les snapshots quotidiens dessinent l’évolution du patrimoine dans le temps. Les objectifs d’épargne permettent de suivre des montants ciblés séparément, avec une progression simple à lire.

---

## Ce que l’application permet

- suivre plusieurs comptes et types de supports ;
- actualiser les cours et convertir les positions étrangères en euros ;
- visualiser le patrimoine, l’allocation et les performances ;
- acheter, vendre ou modifier une position avec recalcul du PRU ;
- saisir le véritable prix d’exécution d’une vente ;
- conserver un historique des transactions ;
- enregistrer des prélèvements récurrents ;
- importer un historique du patrimoine depuis un fichier CSV ;
- exporter toutes les données locales au format JSON ;
- créer des objectifs d’épargne ;
- installer l’application comme une PWA sur iPhone, iPad ou Android ;
- consulter l’interface avec une navigation adaptée au mobile.

## Version en cours

**Édition personnelle — août 2026**

La version actuelle poursuit une même direction : rendre le suivi plus fiable sans alourdir l’interface.

- projections basées sur les comptes et positions réellement renseignés ;
- menu mobile regroupant les actions et les informations du compte ;
- navigation mobile fixe et zones sûres iOS mieux gérées ;
- actualisation des cours plus résistante aux positions supprimées ou modifiées pendant le chargement ;
- sauvegardes ciblées, contrôles d’erreur et restaurations compensatoires en cas d’échec ;
- reprise automatique limitée lors d’un refus temporaire de jeton Supabase ;
- snapshots calculés selon le fuseau `Europe/Paris`, avec conversion correcte des devises ;
- manifest, icônes et service worker préparés pour l’installation en web app.

## Architecture

| Élément | Rôle |
| --- | --- |
| `index.html` | Interface complète et logique frontend en HTML, CSS et JavaScript vanilla |
| Supabase | Authentification, PostgreSQL et règles RLS |
| Yahoo Finance | Cours des actifs et indices |
| Cloudflare Worker | Proxy CORS pour les requêtes Yahoo Finance |
| GitHub Actions | Snapshot quotidien du patrimoine |
| Service worker | Mise en cache du shell de l’application |
| GitHub Pages | Hébergement statique possible |

Le frontend tient volontairement dans un fichier principal afin de rester simple à déployer et à maintenir pour un usage personnel.

## Structure du projet

```text
Moumix-Finance/
├── index.html
├── manifest.json
├── sw.js
├── apple-touch-icon.png
├── icon-192.png
├── icon-512.png
├── scripts/
│   └── daily-snapshot.js
├── .github/workflows/
│   └── daily-snapshot.yml
├── supabase_shema.sql
├── CHANGELOG_MODIFS.md
├── package.json
└── robots.txt
```

## Déploiement

### Base Supabase

Pour une nouvelle installation :

1. créer un projet sur [Supabase](https://supabase.com) ;
2. ouvrir le SQL Editor ;
3. exécuter `supabase_shema.sql` une seule fois ;
4. vérifier l’authentification par email et mot de passe ;
5. contrôler les politiques RLS des six tables.

Pour une base Moumix déjà utilisée, **ne rien exécuter** : la mise à jour de l’application ne nécessite aucune migration et ne supprime ni ne réécrit les données existantes.

### Configuration du frontend

Dans `index.html`, renseigner l’URL et la clé publique `anon` du projet :

```js
const SUPA_URL = 'https://VOTRE_PROJET.supabase.co';
const SUPA_KEY = 'VOTRE_CLE_ANON';
const YF_WORKER = 'https://yf-proxy.VOTRE_COMPTE.workers.dev';
```

La `Service Role Key` ne doit jamais être placée dans `index.html`. Elle est réservée à GitHub Actions pour le snapshot quotidien.

### Snapshot GitHub Actions

Le workflow se déclenche à `22 h 15` et `23 h 15` UTC afin de couvrir les changements d’heure. Le script vérifie l’heure locale `Europe/Paris` et une seule exécution écrit le point correspondant à minuit.

Ajouter dans **Settings → Secrets and variables → Actions** :

| Secret | Contenu |
| --- | --- |
| `SUPA_URL` | URL du projet Supabase |
| `SUPA_SERVICE_KEY` | Service Role Key, uniquement pour GitHub Actions |
| `SNAPSHOT_USER_IDS` | Identifiants des utilisateurs séparés par des virgules |

Le snapshot récupère les cours, convertit les devises en euros, vérifie que toutes les données nécessaires sont disponibles, puis effectue un upsert sur la date concernée. Il ne réécrit pas les anciens points d’historique.

### Hébergement

Déployer le dossier sur un hébergement statique HTTPS comme GitHub Pages, Netlify ou Cloudflare Pages.

Sur iPhone ou iPad : ouvrir le site dans Safari → **Partager** → **Sur l’écran d’accueil**.

## Données et confidentialité

Moumix Finance est conçu pour un usage personnel. Les données sont séparées par utilisateur via Supabase Auth et les politiques RLS. L’application ne contient aucune clé de service côté frontend.

Les sauvegardes JSON permettent de conserver une copie locale de l’ensemble des comptes, positions, transactions, prélèvements, historique et objectifs.

## Limite actuelle

Moumix Finance suit la valeur des actifs, mais ne gère pas encore automatiquement un solde espèces après chaque achat ou vente. Ajouter ce comportement demanderait une évolution explicite du modèle de données ; il n’est donc pas activé dans la version actuelle.

Les cours Yahoo Finance peuvent être différés selon le marché. Les projections sont indicatives et ne constituent pas une recommandation financière.

## La direction

Moumix Finance reste un projet personnel, construit au fil des usages. La priorité n’est pas d’ajouter toujours plus d’indicateurs, mais de rendre chaque information plus fiable, plus lisible et plus utile pour prendre du recul sur son patrimoine.

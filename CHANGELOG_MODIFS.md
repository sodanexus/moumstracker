# Moumix 2.0.0 — refonte patrimoniale

Cette version change l’expérience et l’identité, mais conserve le modèle Supabase existant. Aucun script SQL ni recalcul rétroactif n’est nécessaire.

## Interface et identité

- nouveau logo vectoriel et nouvelles icônes PWA ;
- palette bleu-encre, vert doux et bleu, avec une hiérarchie uniforme ;
- navigation recentrée sur Synthèse, Portefeuille et Trajectoire ;
- en-tête mobile allégé, avec USD/EUR et actions regroupées derrière les trois points ;
- Shiba, messages contextuels et bandeau d’indices supprimés ;
- zones sûres iPhone et protections contre les zooms accidentels conservées.

## Synthèse

- patrimoine total remis au premier plan ;
- capital investi, plus-value et variation présentés comme trois mesures secondaires ;
- courbe patrimoniale conservée ;
- nouvelle allocation en anneau, regroupable par poche, compte ou actif ;
- septième élément et suivants regroupés sous « Autres » pour éviter le fouillis ;
- aperçu des comptes, de leur poids et de leur performance à la place des jalons automatiques.

## Portefeuille et trajectoire

- comptes, positions, recherche de ticker, achats, ventes, modifications, mouvements et prélèvements intégralement conservés ;
- trajectoire automatiquement fondée sur les comptes et positions existants ;
- réglages réduits à l’effort mensuel, l’horizon et la destination ;
- horizons rapides de 5, 10, 20 et 30 ans ;
- trois lectures : prudent, central et favorable ;
- hypothèses par poche disponibles dans un volet repliable ;
- objectifs personnels conservés, séparés des anciens jalons patrimoniaux.

## Données

- aucune table ajoutée, supprimée ou renommée ;
- aucune donnée existante modifiée par le déploiement ;
- robustesse des cotations, snapshots, authentification et mises à jour PWA de la version 1.1.0 conservée.

---

# Moumix Finance 1.1.0 — mise à jour technique ciblée

Cette mise à jour ne lance aucune migration et ne modifie pas les lignes Supabase existantes lors du déploiement.

## Mise à jour de septembre 2026

- Interface et navigation conservées à l’identique
- Inscription retirée de l’écran de connexion et du JavaScript
- CSS extrait dans `assets/css/app.css`
- JavaScript séparé entre cœur technique, application et import d’historique
- Dépendance Supabase figée et installation GitHub reproductible avec `package-lock.json`
- Requêtes Yahoo mises en cache, dédupliquées, retentées et limitées en parallèle
- Snapshot alternant le proxy Cloudflare et Yahoo en direct en cas d'indisponibilité
- Conversion des cotations britanniques en pence corrigée dans l’application
- Snapshots partageant les cotations communes aux deux utilisateurs
- Activation des mises à jour PWA uniquement après validation de l’utilisateur
- Vérification automatique de la syntaxe et tests avant le snapshot quotidien

## Données et fiabilité

- Écritures ciblées ligne par ligne pour les comptes, positions et prélèvements
- Suppression de la synchronisation globale qui pouvait effacer des données depuis un onglet ancien
- Vérification systématique des erreurs renvoyées par Supabase
- Rétablissement compensatoire d'une position si l'historique de transaction échoue
- Blocage des doubles clics pendant les opérations critiques
- Suppressions locales uniquement après confirmation de la base
- Export JSON complet accessible depuis le menu utilisateur
- Prix de vente réellement exécuté, modifiable avant validation
- Actualisation déclarée réussie seulement si au moins un cours a été récupéré

## Interface

- Onglets renommés en « Comptes » et « Projections »
- Navigation principale fixe sur mobile
- Tableau mobile compact avec détails au toucher
- Allocation alignée sur les filtres actifs
- Historique, variation et jalons clairement signalés comme globaux
- Parcours guidé vers la création d'un compte avant la première position
- Compteur patrimonial corrigé pour le format numérique français
- Import CSV compatible avec espaces, virgules décimales et séparateurs usuels
- Bannière hors-ligne et encart de position existante réparés
- Zones sûres iOS, zoom autorisé, focus clavier et réduction des animations

## Snapshot et PWA

- Date calculée dans le fuseau Europe/Paris
- Conversion des cotations étrangères en EUR, y compris les pence britanniques
- Aucun snapshot partiel si un cours ou un taux manque
- Timeout et nouvelles tentatives sur Yahoo Finance
- Planification été/hiver corrigée
- Couleurs du manifest corrigées, icônes 192/512 ajoutées et service worker inclus

## Non inclus volontairement

La gestion automatique d'un solde espèces après achat ou vente nécessiterait une évolution du modèle de données. Elle n'est pas incluse dans ce lot sans migration.

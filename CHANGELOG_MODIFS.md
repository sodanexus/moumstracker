# Moumix Finance — historique des modifications

## 1.2.0 — plan patrimonial privé

- Dossier patrimonial activable pour un seul utilisateur sans changer la projection de l’autre compte
- Valeurs personnelles de départ synchronisées automatiquement avec les comptes et positions Moumix
- Situation du foyer, revenus, réserve et patrimoine de la compagne modifiables
- Plan mensuel libre : ajout, suppression, dates et montants distincts avant/après achat
- Projet immobilier complet : prix, frais, apport, prêt, taux, durée, assurance, taxe et entretien
- Estimation du seuil d’apport, de la date d’achat et de l’âge correspondant
- Projection du patrimoine financier et de la valeur nette immobilière sur trois scénarios
- Affichage du résultat central en valeur nominale et en pouvoir d’achat actuel
- Héritage exclu par défaut et activable seulement de manière explicite
- Point zéro patrimonial et journal daté des changements
- Nouvelle table isolée par RLS, sans droit d’insertion ou de suppression depuis le navigateur
- Protection contre l’écrasement d’une modification faite depuis un autre appareil
- Aucune information personnelle ni identifiant propriétaire dans le dépôt public

## 1.1.0 — mise à jour technique ciblée

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

# Modifications — lot sécurisé

Cette mise à jour ne lance aucune migration et ne modifie pas les lignes Supabase existantes lors du déploiement.

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

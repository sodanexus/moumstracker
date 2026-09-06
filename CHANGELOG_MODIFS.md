# Moumix Finance 2.0.0

Cette version est développée sans modifier les lignes Supabase existantes lors du déploiement.

## Expérience V2

- Navigation renommée en « Synthèse », « Portefeuille » et « Projections »
- Menu mobile `•••` conservé et complété avec l’import d’historique
- Inscription entièrement retirée de la page de connexion et du JavaScript
- Objectifs déplacés dans la Synthèse
- Repères de marché repliés et chargés uniquement à la demande
- Comptes dépliables avec contenu et actions contextuelles
- Fiches de positions dédiées au mobile
- Prélèvements placés dans une section secondaire et explicitement informatifs
- Scénarios renommés « Prudent », « Réaliste » et « Favorable »
- Préférences de projection mémorisées par utilisateur sur l’appareil
- Confirmations intégrées à l’application à la place des fenêtres du navigateur
- Affichage de la version et proposition de mise à jour PWA

## Robustesse V2

- HTML, CSS et JavaScript séparés en fichiers dédiés
- Supabase JS figé sur une version stable au lieu d’une version flottante
- Cotations mises en cache et requêtes limitées à trois simultanément
- Historique et repères de marché limités à deux requêtes simultanées
- Conversion correcte des cotations britanniques en pence dans le frontend
- Taux de change de secours signalés dans l’état de valorisation
- Reprise de session plus longue pour les refus temporaires `JWT issued at future`
- Snapshot quotidien mutualisant les cours communs entre utilisateurs
- Réponses Yahoo non JSON détectées et retentées progressivement
- Calcul de projection isolé dans une fonction pure et testable
- Treize tests initiaux exécutés par GitHub Actions
- Migration transactionnelle facultative pour rendre position et opération atomiques

## Héritage conservé

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

# Utiliser le plan patrimonial privé

Le plan privé apparaît uniquement pour l’utilisateur dont une ligne a été créée dans `private_projection_plan`. Tous les autres comptes conservent l’écran Projections classique.

## Première activation

1. Déployer les fichiers publics de Moumix Finance sur GitHub Pages.
2. Ouvrir le SQL Editor du projet Supabase.
3. Exécuter une seule fois le fichier d’activation personnel fourni séparément.
4. Fermer complètement la PWA, la rouvrir et se reconnecter si nécessaire.

Le fichier SQL personnel ne doit pas être envoyé sur GitHub : il contient l’identifiant du compte et le texte du point zéro.

## Mettre la situation à jour

Ouvrir **Projections → Modifier ma situation**. L’éditeur est organisé en cinq parties :

1. **Situation et foyer** — âge, revenus, logement actuel, avoirs de la compagne et réserve minimale.
2. **Versements programmés** — chaque destination peut être ajoutée, supprimée ou renommée. Les montants avant et après l’achat sont indépendants.
3. **Projet maison** — prix, frais, apport, emprunt, taux, durée et coûts mensuels après acquisition.
4. **Hypothèses et horizon** — rendements des catégories, inflation, durée de projection et éventuel héritage hypothétique.
5. **Point zéro et suivi** — texte de référence et note datée expliquant la modification du jour.

Cliquer sur **Enregistrer les modifications** recalcule immédiatement les trois vues. Si le même dossier a été modifié entre-temps sur un autre appareil, Moumix bloque l’écrasement et demande de rouvrir l’éditeur.

## Ce qui se met à jour automatiquement

Les comptes et positions du propriétaire du dossier sont relus depuis Moumix : PEA, CTO, assurance-vie, crypto, livrets et autres supports n’ont pas à être dupliqués dans le formulaire.

Les montants appartenant à l’autre membre du couple sont volontairement manuels. Le cloisonnement Supabase empêche un compte de lire les données privées d’un autre compte, même s’ils utilisent la même application.

## Exemples d’évolution

- Le PEA ou le Bitcoin change de valeur : aucune action dans le plan, la prochaine valorisation Moumix est reprise automatiquement.
- Le compte dédié à l’apport augmente : son solde Moumix est repris dans les liquidités ; mettre aussi à jour « Apport personnel déjà constitué » uniquement pour suivre l’objectif individuel, sans créer de double comptage.
- Le versement PEA passe de 400 € à 600 € : modifier la ligne PEA et ajouter une note.
- Une nouvelle enveloppe est ouverte : l’ajouter d’abord dans Comptes, puis ajouter sa ligne de versement si elle est alimentée régulièrement.
- Le projet immobilier change : mettre à jour le prix et les frais, puis ajuster l’apport et le prêt pour que leur somme couvre le coût total.
- L’achat est réalisé : renseigner une date de fin pour l’apport maison, mettre les montants « après achat » à jour et saisir les coûts réels du logement.

Le texte du point zéro peut rester inchangé : l’historique des notes sert à documenter les évolutions successives sans reconstruire toute la situation.

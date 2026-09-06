# Déployer Moumix Finance V2

La V2 est compatible avec la base Supabase existante. Son installation ne demande aucune suppression, recréation de table ou modification des données déjà enregistrées.

## Avant la mise en ligne

1. Depuis Moumix Finance V1, utiliser **Exporter mes données** et conserver le fichier JSON obtenu.
2. Conserver une copie ou un tag de la version actuellement publiée sur GitHub.
3. Vérifier que les secrets GitHub Actions existent toujours :
   - `SUPA_URL`
   - `SUPA_SERVICE_KEY`
   - `SNAPSHOT_USER_IDS`

## Publier la V2

1. Copier **tout le contenu** de ce dossier à la racine du dépôt GitHub. Ne publier ni uniquement `index.html`, ni l’archive ZIP.
2. Conserver le dossier `.github/workflows` : il valide les scripts et les tests avant le snapshot quotidien.
3. Attendre la fin du déploiement GitHub Pages et vérifier que l’action est verte.
4. Ouvrir l’URL du site dans Safari ou un navigateur privé avant de remplacer l’ancienne PWA installée.
5. Vérifier la connexion des deux comptes, l’affichage du patrimoine et l’ouverture des trois onglets.
6. Fermer puis rouvrir la PWA. Si un bandeau de mise à jour apparaît, choisir **Installer la mise à jour**.

## Supabase

Aucun SQL n’est requis pour démarrer la V2. Ne pas réexécuter `supabase_shema.sql` sur la base existante.

La migration `supabase/migrations/20260906_atomic_trades.sql` est facultative. Elle ajoute une fonction permettant d’enregistrer une modification de position et sa transaction dans une seule opération atomique. L’application fonctionne aussi sans elle grâce à son mécanisme de repli.

Pour l’activer plus tard :

1. sauvegarder la base depuis Supabase ;
2. ouvrir le SQL Editor ;
3. exécuter uniquement le contenu de `20260906_atomic_trades.sql` ;
4. tester un achat de faible montant puis contrôler la position et l’opération associée.

## Retour arrière

En cas de problème d’interface, republier les fichiers de la V1. Les données Supabase restent compatibles et ne sont pas supprimées par ce retour arrière.

# Objectif

constituer les jurys de soutenance des mémoires sur la base

- de la liste des mémoires à soutenir (identifiant, étudiant·e, titre,
  directeur·rice de mémoire).
- de la liste des disponibilité des professeurs
- la liste des salles disponibles pour les soutenances
 
produire un fichier Excel qui attribue à chaque mémoire 
- un créneau de soutenance
- un jury

# Règles obligatoires
1. Un jury compte 3 enseignant·es : le directeur du mémoire et deux autres personnes
   présentes dans le fichier de disponibilités.
2. Les 3 membres doivent être disponibles sur toute la durée de la soutenance.
3. Aucun·e enseignant·e ne peut être dans deux jurys au même horaire.
4. Chaque mémoire est programmé une seule fois.
   Paramètres
    Durée d’une soutenance : 1h avec des créneaux à 9h, 10h, 11h, 13h, 14h, 15h, 16h.
    Salles : une salle ne peut accueillir qu’une soutenance à la fois.
    Créneaux à exclure :

# Préférences (par ordre de priorité)
1. Répartir équitablement les participations en jury entre les enseignant·es, dans la
   limite de leurs disponibilités.
2. Regrouper les soutenances sur le moins de demi-journées possible.
3. [Option : éviter plus de X soutenances consécutives pour un·e même enseignant·e.]
   Fichier attendu : une feuille « Planning » avec les colonnes Date, Heure, Titre du mémoire,
   Étudiant·e, Directeur·rice, Jury 2, Jury 3 et Salle, triée chronologiquement. Ajoute une feuille
   avec le nombre de soutenances par enseignant·e, et une feuille avec les hypothèses
   retenues.
   Si c’est infaisable : dis-moi quels mémoires ou quels directeurs posent problème, et quelle
   disponibilité supplémentaire résoudrait le blocage. Ne propose pas de jury incomplet.

# Ajouter les cirtères
 Au moins 1 du secteur
 Anglophone prof et qui veut soutenir en anglais
 Nombre de mémoire selon statut (mi-temps…)
 disponibilités des profs visibles par tous

# Les données

## La liste des mémoires

{{csv_liste_memoire}}

## La liste des professeurs avec leur disponibilité

{{csv_liste_dispo}}

## La liste des salles

{{csv_liste_salle}}

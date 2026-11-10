# Objectif

constituer les jurys de soutenance des mémoires et les planifier en fonction des disponibilités des jurés à partir 

- de la liste des mémoires à soutenir (contenant l'identifiant de l'étudiant, titre, l'identifiant du directeur de mémoire).
- de la liste des disponibilités des professeurs (contenant l'identifiant du professeur et la liste de ces créneaux disponibles)
- la liste des salles disponibles pour les soutenances
 
produire un fichier Excel qui attribue à chaque mémoire 
- un jury composé du directeur de mémoire et 2 professeurs
- un créneau de soutenance tenant compte des disponibilités déclarées

# Règles obligatoires
1. Un jury compte 3 enseignant·es : le directeur du mémoire et deux autres personnes
   présentes dans le fichier de disponibilités.
2. Les 3 membres doivent être disponibles sur toute la durée de la soutenance.
3. Aucun·e enseignant·e ne peut être dans deux jurys au même horaire.
4. Chaque mémoire est programmé une seule fois.
5. une soutenance dure 1h et doit être entièrement inclus dans un créneau de disponibilité 
6. une salle ne peut accueillir qu’une soutenance à la fois.
   

# Préférences (par ordre de priorité)
1. Répartir équitablement les participations en jury entre les enseignant·es, dans la
   limite de leurs disponibilités.
2. Regrouper les soutenances sur le moins de demi-journées possible.
3. Eviter plus de 3 soutenances consécutives pour un·e même enseignant·e.

# Résultats attendus : 
  une feuille Excel « Planning » avec les colonnes Date, Heure, Titre du mémoire,
  Étudiant·e, Directeur·rice, Jury 2, Jury 3 et Salle, triée chronologiquement. Ajoute une feuille
  avec le nombre de soutenances par enseignant·e, et une feuille avec les hypothèses retenues.
  La colonne « Heure » contient la plage horaire de la soutenance au format « HH:mm-HH:mm »
  (heure de début - heure de fin, par exemple « 09:00-10:00 »), la colonne « Date » est au
  format « JJ/MM/AAAA ».
  Si c’est infaisable : dis-moi quels mémoires ou quels directeurs posent problème, et quelle disponibilité supplémentaire résoudrait le blocage. Ne propose pas de jury incomplet.

# Ajouter les critères
 Au moins 1 du secteur
 Anglophone prof et qui veut soutenir en anglais
 Nombre de mémoire selon statut (mi-temps…)
 disponibilités des profs visibles par tous

# Les données

L'ensemble des données est sous forme de table au format CSV

## La liste des mémoires (format CSV)

"""
{{csv_liste_memoire}}
"""

## La liste des professeurs avec leur disponibilité (format CSV)

"""
{{csv_liste_dispo}}
"""

## La liste des salles (format CSV)

"""
{{csv_liste_salle}}
"""

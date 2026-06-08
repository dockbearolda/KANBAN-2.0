#!/bin/bash
# Double-clique ce fichier pour lancer le cockpit Atelier OLDA en local.
# Il s'ouvrira tout seul dans ton navigateur sur http://localhost:3000
# Pour arrêter : ferme cette fenêtre Terminal (ou Ctrl+C).

cd "$(dirname "$0")" || exit 1

echo "----------------------------------------"
echo "  Atelier OLDA — démarrage local"
echo "----------------------------------------"

# Vérifie que Node est installé
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  ⚠  Node.js n'est pas installé sur ce Mac."
  echo "  Installe-le depuis https://nodejs.org (version LTS), puis relance ce fichier."
  echo ""
  read -n 1 -s -r -p "Appuie sur une touche pour fermer..."
  exit 1
fi

# Installe les dépendances au premier lancement
if [ ! -d "node_modules" ]; then
  echo "  Première installation des dépendances (un instant)..."
  npm install || { echo "Échec de npm install"; read -n 1 -s -r; exit 1; }
fi

# Ouvre le navigateur dès que le serveur répond
( for i in $(seq 1 30); do
    if curl -s -o /dev/null "http://localhost:3000/"; then
      open "http://localhost:3000"
      break
    fi
    sleep 0.5
  done ) &

echo ""
echo "  Ouverture sur http://localhost:3000"
echo "  (laisse cette fenêtre ouverte tant que tu utilises l'outil)"
echo ""

# Lance le serveur (mode local : base en mémoire, accès ouvert)
exec node server.js

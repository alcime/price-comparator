# Calculateur de Prix de Recettes

Une application web permettant aux utilisateurs de comparer le coût des recettes chez différents supermarchés français.

## Fonctionnalités

- Interface moderne et responsive
- Calcul du coût total d'une recette
- Affichage détaillé des ingrédients avec prix
- Ajustement du nombre de portions
- Export de la liste de courses
- Comparaison entre différents supermarchés

## Guide d'installation

1. Cloner le dépôt
   ```bash
   git clone <url_du_depot>
   cd monoprix-dashboard
   ```

2. Installer les dépendances
   ```bash
   npm install
   ```

3. Configurer les variables d'environnement
   - Créer un fichier `.env` à la racine du projet
   - Ajouter votre clé API Anthropic:
     ```
     ANTHROPIC_API_KEY=votre_cle_api_anthropic
     PORT=3000
     ```

4. Lancer l'application
   ```bash
   npm start
   ```
   
   L'application sera accessible à l'adresse [http://localhost:5173](http://localhost:5173)
   Le tableau de bord admin est accessible à [http://localhost:5173/admin-dashboard](http://localhost:5173/admin-dashboard)

## Structure du projet

- `src/components/RecipePage.jsx` - Page principale de calcul de recettes
- `src/components/GroceryDashboard.jsx` - Tableau de bord admin (accessible uniquement via URL directe)
- `server.js` - Serveur backend pour l'API

## Technologies utilisées

- React 18
- Vite
- TailwindCSS
- shadcn/ui
- Express
- Claude API (Anthropic)
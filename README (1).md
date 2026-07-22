# Serveur de postback — Lexora Dash

Ce petit serveur reçoit les notifications automatiques de lolly-bet888
(inscriptions, dépôts, commissions) et les rend disponibles à ton
dashboard Lexora Dash via le bouton "Synchroniser".

## Étape 1 — Mettre le code sur GitHub (sans ligne de commande)

1. Va sur https://github.com et crée un compte gratuit si tu n'en as pas.
2. Clique sur le bouton "+" en haut à droite → "New repository".
3. Donne-lui un nom, ex : `lexora-postback-server`. Laisse-le en **Public**
   ou **Private**, les deux fonctionnent. Clique "Create repository".
4. Sur la page du repo, clique sur "Add file" → "Upload files".
5. Glisse-dépose les fichiers `server.js`, `package.json` et `.gitignore`
   (pas le dossier `node_modules`, il n'est pas nécessaire).
6. Clique "Commit changes" en bas de page.

## Étape 2 — Déployer sur Render (gratuit)

1. Va sur https://render.com et crée un compte gratuit (tu peux te
   connecter directement avec ton compte GitHub).
2. Clique "New +" → "Web Service".
3. Choisis "Build and deploy from a Git repository", puis connecte le
   repo GitHub créé à l'étape 1.
4. Render détecte normalement Node.js automatiquement. Vérifie que :
   - **Build Command** = `npm install`
   - **Start Command** = `npm start`
5. Descends jusqu'à "Environment Variables" et ajoute :
   - `ADMIN_API_KEY` → choisis toi-même une clé secrète, ex :
     `nono-cle-secrete-2026` (note-la bien, tu en auras besoin après)
6. Choisis le plan **Free**, puis clique "Create Web Service".
7. Attends 2-3 minutes que le déploiement se termine. Render te donne
   une URL du type : `https://lexora-postback-server.onrender.com`

⚠️ Sur le plan gratuit de Render, le serveur "s'endort" après 15 minutes
sans visite, puis se réveille automatiquement (1ère requête un peu plus
lente). C'est normal et sans danger pour ce type d'usage.

## Étape 3 — Configurer Lexora Dash

Dans ton dashboard → Paramètres → "Synchronisation automatique" :
- **URL du serveur** : colle ton URL Render (sans `/` à la fin), ex :
  `https://lexora-postback-server.onrender.com`
- **Clé API** : la même valeur que `ADMIN_API_KEY` choisie à l'étape 2

## Étape 4 — Configurer les postbacks côté lolly-bet888

Dans le panel lolly-bet888, colle ces URLs dans les champs correspondants
(remplace `TON-URL` par ton URL Render) :

| Champ lolly-bet888          | URL à coller |
|---|---|
| Postback URL register user   | `TON-URL/postback/signup?sub={sub}` |
| Postback URL first deposit   | `TON-URL/postback/first-deposit?sub={sub}&amount={amount}` |
| Postback URL repeated deposit| `TON-URL/postback/repeat-deposit?sub={sub}&amount={amount}` |
| Postback URL CPA             | `TON-URL/postback/cpa?sub={sub}&amount={amount}` |
| Postback URL NGR and RS      | `TON-URL/postback/ngr?sub={sub}&amount={amount}` |

⚠️ **Important** : `{sub}` et `{amount}` sont des exemples de macros —
lolly-bet888 utilise peut-être d'autres noms (`{subid}`, `{s2}`,
`{click_sub}`, `{deposit_amount}`...). Cherche un lien "voir les
paramètres disponibles" ou une info-bulle à côté des champs postback
dans leur panel, ou demande à ton contact/support chez lolly-bet888
quelles macros utiliser. Envoie-moi une capture de cette liste si tu la
trouves et j'ajusterai le serveur en conséquence.

## Comment vérifier que ça marche

Une fois tout configuré, ouvre cette URL dans ton navigateur (remplace
les valeurs) pour simuler un postback de test :

```
https://TON-URL/postback/signup?sub=Natacha
```

Tu devrais voir `ok` s'afficher. Ensuite, va dans Lexora Dash → fiche de
l'affilié "Natacha" → bouton "Synchroniser" : l'inscription doit
apparaître dans son historique.

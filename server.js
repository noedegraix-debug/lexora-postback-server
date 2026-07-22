// =====================================================================
// Serveur de réception des postbacks — pour Lexora Dash
// =====================================================================
// Ce serveur fait 2 choses :
//   1) Il reçoit les notifications ("postbacks") envoyées par le casino
//      à chaque inscription / dépôt / commission d'un joueur.
//   2) Il expose ces données à ton dashboard Lexora Dash via une route
//      /api/stats/:code protégée par une clé API.
//
// Les données sont stockées dans un simple fichier data.json à côté de
// ce fichier. C'est volontairement simple (pas de vraie base de
// données) car le volume d'un programme d'affiliation reste faible.
// =====================================================================

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "changeme-please";
const POSTBACK_KEY = process.env.POSTBACK_KEY || ""; // optionnel, voir README

const DATA_FILE = path.join(__dirname, "data.json");

// ---------------------------------------------------------------------
// Stockage (fichier JSON simple)
// ---------------------------------------------------------------------
function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    return { events: {} }; // events[code][date] = {clicks,signups,ftd,deposits,revenue}
  }
}
function saveDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
let DB = loadDB();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function bump(code, date, field, amount) {
  if (!code) return;
  if (!DB.events[code]) DB.events[code] = {};
  if (!DB.events[code][date]) {
    DB.events[code][date] = { clicks: 0, signups: 0, ftd: 0, deposits: 0, revenue: 0 };
  }
  DB.events[code][date][field] += amount;
  saveDB(DB);
}

// ---------------------------------------------------------------------
// Aide pour lire les paramètres envoyés par le casino (système Fundist)
// ---------------------------------------------------------------------
function readCode(q) {
  return q.sub || q.subid || q.sub_id || q.s2 || q.affsub || q.aff_sub || q.click_sub || null;
}
function readAmount(q) {
  // Fundist envoie le montant dans le paramètre "payout" (deposits/CPA)
  const raw = q.payout ?? q.amount ?? q.sum ?? q.value ?? q.deposit_amount ?? "0";
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
function readNgr(q) {
  const n = Number(q.ngr ?? "0");
  return Number.isFinite(n) ? n : 0;
}
function checkPostbackKey(req, res) {
  if (POSTBACK_KEY && req.query.key !== POSTBACK_KEY) {
    res.status(401).send("clé postback invalide");
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------
// Routes de postback — à coller dans le panel lolly-bet888
// ---------------------------------------------------------------------

// Postback URL register user
app.get("/postback/signup", (req, res) => {
  if (!checkPostbackKey(req, res)) return;
  const code = readCode(req.query);
  if (!code) return res.status(400).send("paramètre sub manquant");
  bump(code, todayStr(), "signups", 1);
  res.send("ok");
});

// Postback URL first deposit
app.get("/postback/first-deposit", (req, res) => {
  if (!checkPostbackKey(req, res)) return;
  const code = readCode(req.query);
  if (!code) return res.status(400).send("paramètre sub manquant");
  const amount = readAmount(req.query);
  const date = todayStr();
  bump(code, date, "ftd", 1);
  bump(code, date, "deposits", amount);
  res.send("ok");
});

// Postback URL repeated deposit
app.get("/postback/repeat-deposit", (req, res) => {
  if (!checkPostbackKey(req, res)) return;
  const code = readCode(req.query);
  if (!code) return res.status(400).send("paramètre sub manquant");
  const amount = readAmount(req.query);
  bump(code, todayStr(), "deposits", amount);
  res.send("ok");
});

// Postback URL CPA
app.get("/postback/cpa", (req, res) => {
  if (!checkPostbackKey(req, res)) return;
  const code = readCode(req.query);
  if (!code) return res.status(400).send("paramètre sub manquant");
  const amount = readAmount(req.query);
  bump(code, todayStr(), "revenue", amount);
  res.send("ok");
});

// Postback URL NGR and RS
app.get("/postback/ngr", (req, res) => {
  if (!checkPostbackKey(req, res)) return;
  const code = readCode(req.query);
  if (!code) return res.status(400).send("paramètre sub manquant");
  const ngr = readNgr(req.query);
  bump(code, todayStr(), "revenue", ngr);
  res.send("ok");
});

// ---------------------------------------------------------------------
// Route consultée par Lexora Dash (bouton "Synchroniser")
// ---------------------------------------------------------------------
app.get("/api/stats/:code", (req, res) => {
  const key = req.header("x-api-key");
  if (key !== ADMIN_API_KEY) return res.status(401).json({ error: "clé API invalide" });

  const code = req.params.code;
  const byDate = DB.events[code] || {};
  const dailyStats = Object.keys(byDate)
    .sort()
    .map((date) => ({ date, ...byDate[date] }));

  res.json({ dailyStats });
});

// ---------------------------------------------------------------------
// Vérification rapide que le serveur tourne
// ---------------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Serveur de postback Lexora Dash — actif ✔");
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

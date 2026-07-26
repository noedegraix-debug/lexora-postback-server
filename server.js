// =====================================================================
// Serveur de réception des postbacks — pour Lexora Dash
// =====================================================================
// Ce serveur fait 2 choses :
//   1) Il reçoit les notifications ("postbacks") envoyées par le casino
//      à chaque inscription / dépôt / commission d'un joueur.
//   2) Il expose ces données à ton dashboard Lexora Dash via une route
//      /api/stats/:code protégée par une clé API.
//
// Les données sont stockées dans Supabase (table kv_store), pas sur le
// disque local — donc elles survivent aux redéploiements/redémarrages
// du serveur, contrairement à un simple fichier.
// =====================================================================

const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const webpush = require("web-push");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "changeme-please";
const POSTBACK_KEY = process.env.POSTBACK_KEY || ""; // optionnel, voir README

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails("mailto:contact@lexoradash.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn("⚠️  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY non définies — les notifications push seront désactivées.");
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.warn("⚠️  SUPABASE_URL / SUPABASE_SERVICE_KEY non définies — le serveur ne pourra pas stocker de données.");
}
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || ""
);

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ---------------------------------------------------------------------
// Stockage : une table "kv_store" (key text, value jsonb) sur Supabase.
// On y garde 2 lignes : "postback-events" et "app-db".
// ---------------------------------------------------------------------
async function kvGet(key) {
  const { data, error } = await supabase.from("kv_store").select("value").eq("key", key).maybeSingle();
  if (error) { console.error("kvGet error:", error.message); return null; }
  return data ? data.value : null;
}
async function kvSet(key, value) {
  const { error } = await supabase.from("kv_store").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) console.error("kvSet error:", error.message);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function bump(code, date, field, amount) {
  if (!code) return;
  const events = (await kvGet("postback-events")) || {};
  if (!events[code]) events[code] = {};
  if (!events[code][date]) {
    events[code][date] = { clicks: 0, signups: 0, ftd: 0, deposits: 0, revenue: 0 };
  }
  events[code][date][field] += amount;
  await kvSet("postback-events", events);
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

app.get("/postback/signup", async (req, res) => {
  if (!checkPostbackKey(req, res)) return;
  const code = readCode(req.query);
  if (!code) return res.status(400).send("paramètre sub manquant");
  try { await bump(code, todayStr(), "signups", 1); res.send("ok"); }
  catch (e) { res.status(500).send("erreur serveur"); }
});

app.get("/postback/first-deposit", async (req, res) => {
  if (!checkPostbackKey(req, res)) return;
  const code = readCode(req.query);
  if (!code) return res.status(400).send("paramètre sub manquant");
  const amount = readAmount(req.query);
  const date = todayStr();
  try {
    await bump(code, date, "ftd", 1);
    await bump(code, date, "deposits", amount);
    res.send("ok");
  } catch (e) { res.status(500).send("erreur serveur"); }
});

app.get("/postback/repeat-deposit", async (req, res) => {
  if (!checkPostbackKey(req, res)) return;
  const code = readCode(req.query);
  if (!code) return res.status(400).send("paramètre sub manquant");
  const amount = readAmount(req.query);
  try { await bump(code, todayStr(), "deposits", amount); res.send("ok"); }
  catch (e) { res.status(500).send("erreur serveur"); }
});

app.get("/postback/cpa", async (req, res) => {
  if (!checkPostbackKey(req, res)) return;
  const code = readCode(req.query);
  if (!code) return res.status(400).send("paramètre sub manquant");
  const amount = readAmount(req.query);
  try { await bump(code, todayStr(), "revenue", amount); res.send("ok"); }
  catch (e) { res.status(500).send("erreur serveur"); }
});

app.get("/postback/ngr", async (req, res) => {
  if (!checkPostbackKey(req, res)) return;
  const code = readCode(req.query);
  if (!code) return res.status(400).send("paramètre sub manquant");
  const ngr = readNgr(req.query);
  try { await bump(code, todayStr(), "revenue", ngr); res.send("ok"); }
  catch (e) { res.status(500).send("erreur serveur"); }
});

// ---------------------------------------------------------------------
// Route consultée par Lexora Dash (bouton "Synchroniser")
// ---------------------------------------------------------------------
app.get("/api/stats/:code", async (req, res) => {
  const key = req.header("x-api-key");
  if (key !== ADMIN_API_KEY) return res.status(401).json({ error: "clé API invalide" });
  const events = (await kvGet("postback-events")) || {};
  const byDate = events[req.params.code] || {};
  const dailyStats = Object.keys(byDate).sort().map((date) => ({ date, ...byDate[date] }));
  res.json({ dailyStats });
});

// ---------------------------------------------------------------------
// Stockage central des données du dashboard (affiliés, stats, réglages)
// ---------------------------------------------------------------------

// Lecture : accessible sans clé (nécessaire pour charger le dashboard
// avant même que l'admin se soit identifié — connexion membre incluse).
app.get("/api/db", async (req, res) => {
  const db = await kvGet("app-db");
  res.json({ db });
});

// Écriture complète : réservée à l'admin (clé API requise).
app.post("/api/db", async (req, res) => {
  const key = req.header("x-api-key");
  if (key !== ADMIN_API_KEY) return res.status(401).json({ error: "clé API invalide" });
  await kvSet("app-db", req.body);
  res.json({ ok: true });
});

// Inscription publique via lien de parrainage : pas de clé requise.
// Ça crée une DEMANDE en attente (pas un compte actif tout de suite) —
// l'admin doit la valider depuis son dashboard.
app.post("/api/signup", async (req, res) => {
  const data = await kvGet("app-db");
  if (!data) return res.status(400).json({ error: "base de données non initialisée" });
  const { name, code, ref } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: "nom et code requis" });
  data.pendingSignups = data.pendingSignups || [];
  const codeTaken =
    (data.affiliates || []).some(a => a.code.toLowerCase() === String(code).toLowerCase()) ||
    data.pendingSignups.some(p => p.code.toLowerCase() === String(code).toLowerCase());
  if (codeTaken) return res.status(409).json({ error: "ce code est déjà pris" });
  const request = {
    id: "req_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name, code, ref: ref || "",
    requestedAt: new Date().toISOString()
  };
  data.pendingSignups.unshift(request);
  await kvSet("app-db", data);
  res.json({ ok: true, request });
});

// ---------------------------------------------------------------------
// Notifications push (Web Push) — pour alerter les sous-affiliés même
// quand l'appli n'est pas ouverte.
// ---------------------------------------------------------------------

// Le navigateur récupère la clé publique pour s'abonner.
app.get("/api/vapid-public-key", (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Enregistre l'abonnement push d'un appareil, rattaché à un affilié.
app.post("/api/push-subscribe", async (req, res) => {
  const { affiliateId, subscription } = req.body || {};
  if (!affiliateId || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "affiliateId et subscription requis" });
  }
  const subs = (await kvGet("push-subscriptions")) || {};
  subs[affiliateId] = subs[affiliateId] || [];
  const already = subs[affiliateId].some(s => s.endpoint === subscription.endpoint);
  if (!already) subs[affiliateId].push(subscription);
  await kvSet("push-subscriptions", subs);
  res.json({ ok: true });
});

// Envoie une notification push à TOUS les sous-affiliés abonnés (admin uniquement).
app.post("/api/broadcast-push", async (req, res) => {
  const key = req.header("x-api-key");
  if (key !== ADMIN_API_KEY) return res.status(401).json({ error: "clé API invalide" });
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(400).json({ error: "notifications push non configurées sur le serveur" });
  }
  const { title, body } = req.body || {};
  if (!body) return res.status(400).json({ error: "message manquant" });
  const subs = (await kvGet("push-subscriptions")) || {};
  const payload = JSON.stringify({ title: title || "Lexora Dash", body });
  let sent = 0, removed = 0;
  for (const affiliateId of Object.keys(subs)) {
    const kept = [];
    for (const sub of subs[affiliateId]) {
      try {
        await webpush.sendNotification(sub, payload);
        sent++;
        kept.push(sub);
      } catch (err) {
        // Abonnement expiré/invalide (410/404) : on ne le garde pas.
        removed++;
      }
    }
    subs[affiliateId] = kept;
  }
  await kvSet("push-subscriptions", subs);
  res.json({ ok: true, sent, removed });
});

// ---------------------------------------------------------------------
// Vérification rapide que le serveur tourne
// ---------------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Serveur de postback Lexora Dash — actif ✔ (Supabase)");
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

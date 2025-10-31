import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const {
  PORT = 3000,
  // NEW: comma-separated list (e.g., "https://savehub.site,https://www.savehub.site")
  ALLOWED_ORIGINS,
  KIT_API_KEY,
  KIT_API_SECRET, // reserved for future secured flows
  KIT_FORM_ID,    // 8705695
  TAG_SAVINGS,    // 12078155
  TAG_AUTOMATION, // 12078156
  TAG_BILLS       // 12078158
} = process.env;

const app = express();
app.use(express.json());

// --- CORS --------------------------------------------------------------------
const allowedOrigins = (ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// Fallback to both domains if env not set
if (allowedOrigins.length === 0) {
  allowedOrigins.push("https://savehub.site", "https://www.savehub.site");
}

app.use(cors({
  origin(origin, cb) {
    // allow requests without an Origin (curl/healthchecks) or whitelisted origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));

// fast preflight
app.options("*", cors());

// --- utils -------------------------------------------------------------------
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const tagMap = {
  savings: TAG_SAVINGS,
  automation: TAG_AUTOMATION,
  bills: TAG_BILLS
};

async function subscribeToForm(email) {
  const url = `https://api.convertkit.com/v3/forms/${KIT_FORM_ID}/subscribe`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: KIT_API_KEY, email })
  });
  if (!res.ok) throw new Error(`form subscribe failed: ${res.status}`);
  return res.json();
}

async function tagSubscriber(email, tagId) {
  const url = `https://api.convertkit.com/v3/tags/${tagId}/subscribe`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: KIT_API_KEY, email })
  });
  if (!res.ok) throw new Error(`tagging failed: ${res.status}`);
  return res.json();
}

// accept both / and /subscribe (in case the proxy strips a prefix)
app.post(["/", "/subscribe"], async (req, res) => {
  try {
    const { email, source } = req.body || {};
    if (!isEmail(email)) return res.status(400).json({ ok: false, error: "Invalid email" });

    const tagId = tagMap[source];
    if (!tagId) return res.status(400).json({ ok: false, error: "Unknown source" });

    await subscribeToForm(email);      // CK is idempotent here
    await tagSubscriber(email, tagId); // also idempotent

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/health", (_req, res) => res.status(200).send("ok"));

// IMPORTANT: bind 0.0.0.0 for Docker
app.listen(PORT, "0.0.0.0", () => console.log(`subscribe service on :${PORT}`));

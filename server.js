import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const {
  PORT = 3000,
  ALLOWED_ORIGIN = "https://savehub.site",
  KIT_API_KEY,
  KIT_API_SECRET, // not strictly needed here, but keep for future secured flows
  KIT_FORM_ID,    // 8705695
  TAG_SAVINGS,    // 12078155
  TAG_AUTOMATION, // 12078156
  TAG_BILLS       // 12078158
} = process.env;

const app = express();
app.use(express.json());

// CORS: allow main site
app.use(cors({
  origin: [ALLOWED_ORIGIN, "https://www.savehub.site"],
  methods: ["POST", "OPTIONS"]
}));

// simple email check
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// map product -> tag id
const tagMap = {
  savings: TAG_SAVINGS,
  automation: TAG_AUTOMATION,
  bills: TAG_BILLS
};

// helper: subscribe to Kit form
async function subscribeToForm(email) {
  const url = `https://api.convertkit.com/v3/forms/${KIT_FORM_ID}/subscribe`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: KIT_API_KEY, email })
  });
  // CK returns 200 for existing subscribers too. We accept 200/201.
  if (!res.ok) throw new Error(`form subscribe failed: ${res.status}`);
  return res.json();
}

// helper: apply tag
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

// accept both / and /subscribe (in case you strip the prefix at the proxy)
app.post(["/", "/subscribe"], async (req, res) => {
  try {
    const { email, source } = req.body || {};
    if (!isEmail(email)) return res.status(400).json({ ok: false, error: "Invalid email" });
    const tagId = tagMap[source];
    if (!tagId) return res.status(400).json({ ok: false, error: "Unknown source" });

    await subscribeToForm(email);      // idempotent
    await tagSubscriber(email, tagId); // idempotent

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`subscribe service on :${PORT}`));

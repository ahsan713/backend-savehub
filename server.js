import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(express.json());
app.use(cors());

// Brevo API key from environment
const BREVO_API_KEY = process.env.BREVO_API_KEY;
if (!BREVO_API_KEY) {
  console.warn("Warning: BREVO_API_KEY is not set");
}

// Create or update contact and merge INTEREST values
async function addOrUpdateContact(email, firstName, interestKey) {
  let interestsSet = new Set();
  let isNewInterest = true;

  // 1) Try to fetch existing contact
  try {
    const getRes = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "api-key": BREVO_API_KEY
        }
      }
    );

    if (getRes.ok) {
      const existing = await getRes.json();
      const current = existing.attributes?.INTEREST || "";

      if (current) {
        current
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
          .forEach((v) => interestsSet.add(v));
      }

      if (interestsSet.has(interestKey)) {
        isNewInterest = false;
      } else {
        interestsSet.add(interestKey);
      }
    }
  } catch (e) {
    console.log("Brevo GET contact error (can ignore 404):", e.message);
  }

  // 2) Build new INTEREST string
  if (interestsSet.size === 0) {
    interestsSet.add(interestKey);
  }

  const interestsString = Array.from(interestsSet).join(",");

  // 3) Upsert contact with merged interests
  const body = {
    email,
    attributes: {
      FIRSTNAME: firstName || "",
      INTEREST: interestsString
    },
    updateEnabled: true
  };

  const res = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": BREVO_API_KEY
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  console.log("Brevo contact upsert response:", data);

  if (!res.ok) {
    throw new Error(
      `Brevo contact error: ${res.status} ${JSON.stringify(data)}`
    );
  }

  // Return whether this interest was new
  return { data, isNewInterest };
}

  return data;
}

// Health check endpoints for Coolify
app.get("/", (req, res) => {
  res.send("OK");
});

app.get("/healthz", (req, res) => {
  res.json({ status: "ok" });
});

// Subscription endpoint

app.post("/subscribe", async (req, res) => {
  try {
    const { email, firstName, tag } = req.body;

    if (!email || !tag) {
      return res
        .status(400)
        .json({ error: "Email and tag (interest) are required" });
    }

    const { isNewInterest } = await addOrUpdateContact(email, firstName, tag);

    // Only send welcome email if this is a new interest for this contact
    if (isNewInterest) {
      await sendWelcomeEmail(email, firstName, tag);
    }

    res.json({
      success: true,
      message: isNewInterest
        ? "Subscribed and email sent."
        : "Interest updated; email already sent before for this product."
    });
  } catch (err) {
    console.error("Subscribe error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SaveHub API running on port ${PORT}`);
});

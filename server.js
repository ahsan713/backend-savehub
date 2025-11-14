import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import fs from "fs";

const app = express();
app.use(express.json());
app.use(cors());

// Brevo API key from environment
const BREVO_API_KEY = process.env.BREVO_API_KEY;
if (!BREVO_API_KEY) {
  console.warn("Warning: BREVO_API_KEY is not set");
}

/** Helper: get client IP behind proxy */
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return req.ip;
}

/** Helper: append a JSON line to signup.log */
function logSignup(entry) {
  const line = JSON.stringify(entry) + "\n";
  fs.appendFile("signup.log", line, (err) => {
    if (err) console.error("Error writing signup log:", err.message);
  });
}

/**
 * Create or update contact and merge INTEREST values.
 * INTEREST will be a comma-separated list:
 *   "savings_interest,automation_stack_interest"
 *
 * Returns: { data, isNewInterest, success }
 */
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
    } else {
      console.log("Brevo GET contact non-OK:", getRes.status);
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

  try {
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
    console.log("Brevo contact upsert response:", res.status, data);

    const success = res.ok;
    if (!success) {
      console.error(
        "Brevo contact error (non-fatal):",
        res.status,
        JSON.stringify(data)
      );
    }

    return { data, isNewInterest, success };
  } catch (err) {
    console.error("Brevo contact network error:", err.message);
    return { data: null, isNewInterest, success: false };
  }
}

/**
 * Send welcome email based on interestKey.
 * Only called when interest is new for that contact.
 *
 * Returns: { data, success }
 */
async function sendWelcomeEmail(email, firstName, interestKey) {
  const label =
    interestKey === "savings_interest"
      ? "Smart Savings"
      : interestKey === "automation_stack_interest"
      ? "Automation Stack"
      : interestKey === "bill_negotiation_interest"
      ? "Bill Negotiation"
      : "SaveHub";

  const subject = `Welcome to SaveHub – ${label}`;

  const htmlContent = `
    <h2>Hi ${firstName || "there"}, welcome to SaveHub!</h2>
    <p>Thanks for your interest in our ${label} program.</p>
    <p>We will keep you updated with useful tools and resources.</p>
    <p>– The SaveHub Team</p>
  `;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { name: "SaveHub", email: "info@savehub.site" },
        to: [{ email }],
        subject,
        htmlContent
      })
    });

    const data = await res.json();
    console.log("Brevo email response:", res.status, data);

    const success = res.ok;
    if (!success) {
      console.error(
        "Brevo email error (non-fatal):",
        res.status,
        JSON.stringify(data)
      );
    }

    return { data, success };
  } catch (err) {
    console.error("Brevo email network error:", err.message);
    return { data: null, success: false };
  }
}

// Health check endpoints
app.get("/", (req, res) => {
  res.send("OK");
});

app.get("/healthz", (req, res) => {
  res.json({ status: "ok" });
});

// Subscription endpoint
app.post("/subscribe", async (req, res) => {
  try {
    const { email, firstName, tag, source } = req.body;

    if (!email || !tag) {
      return res
        .status(400)
        .json({ error: "Email and tag (interest) are required" });
    }

    const contactResult = await addOrUpdateContact(email, firstName, tag);

    if (contactResult.isNewInterest) {
      await sendWelcomeEmail(email, firstName, tag);
    }

    const message = contactResult.isNewInterest
      ? "Subscribed and email sent."
      : "Interest updated; email already sent before for this product.";

    // Analytics log
    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "";
    const referer = req.headers["referer"] || "";

    logSignup({
      ts: new Date().toISOString(),
      email,
      firstName: firstName || "",
      tag,
      source: source || "",
      isNewInterest: contactResult.isNewInterest,
      success: contactResult.success,
      ip,
      userAgent,
      referer
    });

    res.json({
      success: contactResult.success,
      message
    });
  } catch (err) {
    console.error("Subscribe fatal error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SaveHub API running on port ${PORT}`);
});

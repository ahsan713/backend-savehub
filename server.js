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

// Create or update contact with INTEREST attribute
async function addOrUpdateContact(email, firstName, interestKey) {
  const body = {
    email,
    attributes: {
      FIRSTNAME: firstName || "",
      INTEREST: interestKey
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
  console.log("Brevo contact response:", data);

  if (!res.ok) {
    throw new Error(
      `Brevo contact error: ${res.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}

// Send welcome email based on interestKey
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
  console.log("Brevo email response:", data);

  if (!res.ok) {
    throw new Error(
      `Brevo email error: ${res.status} ${JSON.stringify(data)}`
    );
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

    await addOrUpdateContact(email, firstName, tag);
    await sendWelcomeEmail(email, firstName, tag);

    res.json({ success: true, message: "Subscribed and email sent." });
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

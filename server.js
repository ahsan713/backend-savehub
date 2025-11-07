import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

// Brevo API Key (keep secure, use environment variable in production)
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// Tag IDs (we’ll map your previous ConvertKit tags)
const TAGS = {
  savings_interest: 1, // replace with your actual tag IDs from Brevo once created
  automation_stack_interest: 2,
  bill_negotiation_interest: 3
};

// Add or update contact in Brevo
async function addOrUpdateContact(email, firstName, tag) {
  const res = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "api-key": BREVO_API_KEY
    },
    body: JSON.stringify({
      email,
      attributes: { FIRSTNAME: firstName || "" },
      listIds: [], // optional if you use lists
      updateEnabled: true,
      emailBlacklisted: false,
      smsBlacklisted: false
    })
  });

  const data = await res.json();
  console.log("Contact sync:", data);

  // Add tag
  if (tag && TAGS[tag]) {
    await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}/tags`, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": BREVO_API_KEY
      },
      body: JSON.stringify({ tags: [tag] })
    });
  }

  return data;
}

// Send welcome email
async function sendWelcomeEmail(email, firstName, product) {
  const subject = `Welcome to SaveHub – ${product === "savings_interest" ? "Smart Savings" : product === "automation_stack_interest" ? "Automation Stack" : "Bill Negotiation"}`
  const htmlContent = `
    <h2>Hi ${firstName || "there"}, welcome to SaveHub!</h2>
    <p>Thanks for your interest in our ${product.replace("_", " ")} program.</p>
    <p>We'll keep you updated with the latest insights and tools to help you save more, automate smarter, and get early access to new features.</p>
    <p>— The SaveHub Team</p>
  `;

  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
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
}

// POST /subscribe
app.post("/subscribe", async (req, res) => {
  try {
    const { email, firstName, tag } = req.body;
    if (!email || !tag) return res.status(400).json({ error: "Email and tag are required" });

    await addOrUpdateContact(email, firstName, tag);
    await sendWelcomeEmail(email, firstName, tag);

    res.json({ success: true, message: "Subscribed and email sent." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SaveHub API running on port ${PORT}`));

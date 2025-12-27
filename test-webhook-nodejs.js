const crypto = require("crypto");
const http = require("http");

// CONFIGURATION - UPDATE APPOINTMENT_ID
const STRAPI_HOST = "localhost";
const STRAPI_PORT = 1337;
const PAYSTACK_SECRET = "sk_test_f1f6c6637457d8fd4601b8890a87764e8c9505eb";
const APPOINTMENT_ID = "fr4fpfifd06bqucw5chjxvkv"; // UPDATE THIS if different

const webhookPayload = {
  event: "charge.success",
  data: {
    reference: "test_" + Date.now(),
    amount: 500000,
    customer: {
      email: "test@example.com",
    },
    metadata: {
      appointment_id: APPOINTMENT_ID,
      name: "Test User",
      phone: "08012345678",
    },
  },
};

const payloadString = JSON.stringify(webhookPayload);

const hash = crypto
  .createHmac("sha512", PAYSTACK_SECRET)
  .update(payloadString)
  .digest("hex");

console.log("🧪 Testing Webhook...");
console.log(
  "📍 URL:",
  `http://${STRAPI_HOST}:${STRAPI_PORT}/api/appointments/paystack-webhook`
);
console.log("🎯 Appointment ID:", APPOINTMENT_ID);
console.log("");

const options = {
  hostname: STRAPI_HOST,
  port: STRAPI_PORT,
  path: "/api/appointments/paystack-webhook",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-paystack-signature": hash,
    "Content-Length": Buffer.byteLength(payloadString),
  },
};

const req = http.request(options, (res) => {
  let data = "";

  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("Response Status:", res.statusCode);
    console.log("Response Body:", data);
    console.log("");

    if (res.statusCode === 200) {
      console.log("✅ Webhook succeeded!");
      console.log("");
      console.log("Check Strapi Admin:");
      console.log('- Appointment status should be "Confirmed"');
      console.log("- Should be published (not draft)");
    } else {
      console.log("❌ Webhook failed");
    }
  });
});

req.on("error", (err) => {
  console.error("❌ Request Failed:", err.message);
});

req.write(payloadString);
req.end();

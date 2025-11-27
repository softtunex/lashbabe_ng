// config/email-sendgrid.js
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

module.exports = {
  send: async (options) => {
    const msg = {
      to: options.to,
      from: process.env.SMTP_FROM_EMAIL || "iamtunex1@gmail.com",
      subject: options.subject,
      html: options.html,
    };

    try {
      await sgMail.send(msg);
      console.log(`✓ Email sent to ${options.to}`);
      return { success: true };
    } catch (error) {
      console.error("❌ SendGrid Error:", error);
      if (error.response) {
        console.error(error.response.body);
      }
      throw error;
    }
  },
};

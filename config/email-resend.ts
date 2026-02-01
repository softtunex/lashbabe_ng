const { Resend } = require("resend");

// Initialize Resend with the API key from env
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = {
  send: async (options) => {
    try {
      const data = await resend.emails.send({
        from: process.env.SMTP_FROM_EMAIL,
        to: options.to,
        subject: options.subject,
        html: options.html,
        reply_to: process.env.SMTP_REPLY_TO_EMAIL,
      });

      if (data.error) {
        console.error("❌ Resend Error:", data.error);
        throw data.error;
      }

      console.log(`✓ Email sent to ${options.to}. ID: ${data.data?.id}`);
      return { success: true, id: data.data?.id };
    } catch (error) {
      console.error("❌ Resend Exception:", error);
      throw error;
    }
  },
};

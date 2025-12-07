export default {
  routes: [
    {
      method: "POST",
      path: "/appointments/paystack-webhook",
      handler: "appointment.paystackWebhook",
      config: {
        auth: false, // Critical: Publicly accessible for Paystack
      },
    },
  ],
};

/**
 * appointment controller
 */

import { factories } from "@strapi/strapi";
import crypto from "crypto";

export default factories.createCoreController(
  "api::appointment.appointment",
  ({ strapi }) => ({
    /**
     * Endpoint to fetch booked slots
     * GET /api/appointments/booked-slots
     */
    async getBookedSlots(ctx) {
      try {
        const { date } = ctx.query;

        if (!date || typeof date !== "string") {
          return ctx.badRequest("Date parameter is required");
        }

        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const appointments = await strapi
          .documents("api::appointment.appointment")
          .findMany({
            filters: {
              AppointmentDateTime: {
                $gte: startOfDay.toISOString(),
                $lte: endOfDay.toISOString(),
              },
              // We only block slots that are effectively "taken"
              // We keep 'Pending' here so someone paying blocks the slot for others
              BookingStatus: {
                $in: ["Confirmed", "Pending", "Completed"],
              },
            },
            // status: 'draft', // <--- COMMENTED OUT AS REQUESTED (Fixes inaccurate data)
            fields: ["AppointmentDateTime"],
          });

        const bookedSlots = appointments.map((appointment: any) => {
          const dateTime = new Date(appointment.AppointmentDateTime);

          // Return time in Nigeria format (HH:mm)
          return dateTime.toLocaleTimeString("en-GB", {
            timeZone: "Africa/Lagos",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        });

        return ctx.send({
          data: bookedSlots,
        });
      } catch (error) {
        strapi.log.error("Error fetching booked slots:", error);
        return ctx.internalServerError(
          "An error occurred while fetching booked slots"
        );
      }
    },

    /**
     * Webhook Handler for Paystack
     */
    async paystackWebhook(ctx) {
      try {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        const signature = ctx.request.headers["x-paystack-signature"];

        if (!secret) return ctx.internalServerError("Config error");
        if (!signature) return ctx.unauthorized("Missing signature");

        const hash = crypto
          .createHmac("sha512", secret)
          .update(JSON.stringify(ctx.request.body))
          .digest("hex");

        if (hash !== signature) return ctx.unauthorized("Invalid signature");

        const event = ctx.request.body;

        if (event.event === "charge.success") {
          const { reference, amount, metadata, customer } = event.data;

          const appointmentId = metadata?.appointment_id;

          if (appointmentId) {
            strapi.log.info(
              `[Webhook] Confirming existing appointment: ${appointmentId}`
            );

            // Update status to Confirmed
            await strapi.documents("api::appointment.appointment").update({
              documentId: appointmentId,
              data: {
                BookingStatus: "Confirmed",
                // No need to set publishedAt here if Frontend already did it
              },
              // status: 'draft', // Removed this too
            });

            await ensurePaymentRecord(
              strapi,
              reference,
              amount,
              customer.email,
              appointmentId
            );
            return ctx.send({ status: "confirmed" });
          }

          // ... (Recovery logic if needed) ...
          return ctx.send({ status: "success_no_id" });
        }

        return ctx.send({ status: "ignored" });
      } catch (error) {
        strapi.log.error("[Webhook Error]", error);
        return ctx.internalServerError("Webhook failed");
      }
    },
  })
);

// Helper
async function ensurePaymentRecord(
  strapi,
  reference,
  amountKobo,
  email,
  appointmentId
) {
  const existing = await strapi
    .documents("api::payment.payment")
    .findMany({ filters: { Reference: reference } });
  if (existing.length === 0) {
    await strapi.documents("api::payment.payment").create({
      data: {
        Reference: reference,
        Amount: amountKobo / 100,
        ClientEmail: email,
        PaymentStatus: "Success",
        Appointment: appointmentId,
        publishedAt: new Date(),
      },
    });
  }
}

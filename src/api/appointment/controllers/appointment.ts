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

        // 1. QUERY APPOINTMENTS
        // We use the Documents API to find bookings for this specific day.
        const appointments = await strapi
          .documents("api::appointment.appointment")
          .findMany({
            filters: {
              AppointmentDateTime: {
                $gte: startOfDay.toISOString(),
                $lte: endOfDay.toISOString(),
              },
              // STRICT FILTER:
              // Only block slots for Confirmed, Completed, or Pending (currently paying)
              BookingStatus: {
                $in: ["Confirmed", "Pending", "Completed"],
              },
            },
            // CRITICAL FIX: We MUST include 'draft' status.
            // Why? Because a user currently on the checkout screen has a "Pending"
            // appointment which is technically a Draft in Strapi.
            // If we don't look here, their slot looks free to others!
            status: "draft",
            fields: ["AppointmentDateTime"],
          });

        // 2. FORMAT TIME
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
     * POST /api/appointments/paystack-webhook
     */
    async paystackWebhook(ctx) {
      try {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        const signature = ctx.request.headers["x-paystack-signature"];

        // 1. SECURITY CHECKS
        if (!secret) {
          strapi.log.error("[Webhook] Missing PAYSTACK_SECRET_KEY in .env");
          return ctx.internalServerError("Config error");
        }
        if (!signature) {
          return ctx.unauthorized("Missing signature");
        }

        const hash = crypto
          .createHmac("sha512", secret)
          .update(JSON.stringify(ctx.request.body))
          .digest("hex");

        if (hash !== signature) {
          strapi.log.warn("[Webhook] Invalid signature attempt.");
          return ctx.unauthorized("Invalid signature");
        }

        // 2. PROCESS EVENT
        const event = ctx.request.body;

        if (event.event === "charge.success") {
          const { reference, amount, metadata, customer } = event.data;

          // Get the ID we sent from Frontend
          const appointmentId = metadata?.appointment_id;

          if (appointmentId) {
            strapi.log.info(
              `[Webhook] Payment verified for Appointment: ${appointmentId}`
            );

            // 3. UPDATE APPOINTMENT
            // Set status to Confirmed AND ensure it is Published.
            await strapi.documents("api::appointment.appointment").update({
              documentId: appointmentId,
              data: {
                BookingStatus: "Confirmed",
                publishedAt: new Date(), // Force Publish to ensure it's live
              },
              status: "draft", // Allow finding it even if it's currently a draft
            });

            // 4. ENSURE PAYMENT RECORD
            await ensurePaymentRecord(
              strapi,
              reference,
              amount,
              customer.email,
              appointmentId
            );

            return ctx.send({ status: "success" });
          } else {
            strapi.log.warn(
              `[Webhook] charge.success received but no appointment_id in metadata.`
            );
          }
        }

        // Return 200 OK so Paystack stops retrying
        return ctx.send({ status: "ignored" });
      } catch (error) {
        strapi.log.error("[Webhook Error]", error);
        return ctx.internalServerError("Webhook processing failed");
      }
    },
  })
);

// --- HELPER: Create Payment Record ---
async function ensurePaymentRecord(
  strapi,
  reference,
  amountKobo,
  email,
  appointmentId
) {
  try {
    // Check if payment already exists to prevent duplicates
    const existing = await strapi.documents("api::payment.payment").findMany({
      filters: { Reference: reference },
      status: "draft", // Check drafts too just in case
    });

    if (existing.length === 0) {
      await strapi.documents("api::payment.payment").create({
        data: {
          Reference: reference,
          Amount: amountKobo / 100, // Convert Kobo to Naira
          ClientEmail: email,
          PaymentStatus: "Success",
          Appointment: appointmentId,
          publishedAt: new Date(), // Publish the payment record immediately
        },
      });
      strapi.log.info(`[Webhook] Payment record created for Ref: ${reference}`);
    }
  } catch (err) {
    strapi.log.error(
      `[Webhook] Failed to create payment record: ${err.message}`
    );
  }
}

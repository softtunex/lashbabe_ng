/**
 * appointment controller
 */

import { factories } from "@strapi/strapi";
import crypto from "crypto"; // Native Node.js module for security

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

        // Parse the date
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        // Query appointments for the given date
        const appointments = await strapi
          .documents("api::appointment.appointment")
          .findMany({
            filters: {
              AppointmentDateTime: {
                $gte: startOfDay.toISOString(),
                $lte: endOfDay.toISOString(),
              },
              // BLOCK SLOTS if they are Confirmed OR Pending (someone is paying)
              BookingStatus: {
                $ne: "Cancelled",
              },
            },
            fields: ["AppointmentDateTime"],
          });

        const bookedSlots = appointments.map((appointment: any) => {
          const dateTime = new Date(appointment.AppointmentDateTime);

          // Force format as Nigeria Time (HH:mm)
          const timeString = dateTime.toLocaleTimeString("en-GB", {
            timeZone: "Africa/Lagos",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

          return timeString;
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

        if (!secret) {
          strapi.log.error("[Webhook] Missing PAYSTACK_SECRET_KEY in .env");
          return ctx.internalServerError("Configuration error");
        }

        // 1. Verify Signature (Security Check)
        // Paystack sends a signature in the header to prove it's really them
        const hash = crypto
          .createHmac("sha512", secret)
          .update(JSON.stringify(ctx.request.body))
          .digest("hex");

        const paystackSignature = ctx.request.headers["x-paystack-signature"];

        if (hash !== paystackSignature) {
          strapi.log.warn("[Webhook] Invalid signature attempt.");
          return ctx.unauthorized("Invalid signature");
        }

        // 2. Parse Event
        const event = ctx.request.body;

        // We only care if payment was successful
        if (event.event === "charge.success") {
          const { metadata, reference, amount, customer } = event.data;

          // Get the Appointment ID we sent from the Frontend
          const appointmentId = metadata?.appointment_id;

          if (appointmentId) {
            strapi.log.info(
              `[Webhook] Verifying Appointment: ${appointmentId} | Ref: ${reference}`
            );

            // 3. Update Appointment Status to Confirmed
            // This triggers 'afterUpdate' lifecycle -> Sends Email
            await strapi.documents("api::appointment.appointment").update({
              documentId: appointmentId,
              data: {
                BookingStatus: "Confirmed",
              },
            });

            // 4. Create Payment Record (Safety Net)
            // If the frontend closed early, the payment record might not exist yet.
            // We check if it exists; if not, we create it.
            const existingPayments = await strapi
              .documents("api::payment.payment")
              .findMany({
                filters: { Reference: reference },
              });

            if (existingPayments.length === 0) {
              strapi.log.info(
                `[Webhook] Creating missing payment record for Ref: ${reference}`
              );
              await strapi.documents("api::payment.payment").create({
                data: {
                  Reference: reference,
                  Amount: amount / 100, // Paystack sends Kobo, we save Naira
                  ClientEmail: customer.email,
                  PaymentStatus: "Success",
                  Appointment: appointmentId,
                },
              });
            }

            return ctx.send({ status: "success" });
          } else {
            strapi.log.warn(
              `[Webhook] charge.success received but no appointment_id in metadata. Ref: ${reference}`
            );
          }
        }

        // Acknowledge other events so Paystack doesn't keep retrying
        return ctx.send({ status: "ignored" });
      } catch (error) {
        strapi.log.error("[Webhook Error]", error);
        return ctx.internalServerError("Webhook processing failed");
      }
    },
  })
);

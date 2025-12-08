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

        // Parse the date range
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
              // Block slots that are Confirmed, Completed, or Pending
              BookingStatus: {
                $in: ["Confirmed", "Pending", "Completed"],
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
     *
     * Handles "Passive Recovery": If the frontend failed to create the booking
     * (e.g., user closed app), this creates it using metadata.
     */
    async paystackWebhook(ctx) {
      try {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        const signature = ctx.request.headers["x-paystack-signature"];

        if (!secret) {
          strapi.log.error("[Webhook] Missing PAYSTACK_SECRET_KEY in .env");
          return ctx.internalServerError("Server configuration error");
        }

        if (!signature) {
          return ctx.unauthorized("Missing signature");
        }

        // 1. Verify Signature (Security Check)
        const hash = crypto
          .createHmac("sha512", secret)
          .update(JSON.stringify(ctx.request.body))
          .digest("hex");

        if (hash !== signature) {
          strapi.log.warn("[Webhook] Invalid signature attempt.");
          return ctx.unauthorized("Invalid signature");
        }

        // 2. Parse Event
        const event = ctx.request.body;

        if (event.event === "charge.success") {
          const { reference, amount, metadata, customer } = event.data;

          strapi.log.info(
            `[Webhook] Processing successful payment: ${reference}`
          );

          // 3. Check Metadata for Recovery Data
          const recoveryData = metadata?.booking_recovery;

          if (!recoveryData) {
            strapi.log.warn(
              `[Webhook] No recovery data found for ${reference}. Skipping appointment check.`
            );
            // We still verify the payment was logged though
            await ensurePaymentRecord(
              strapi,
              reference,
              amount,
              customer.email,
              null
            );
            return ctx.send({ status: "no_recovery_data" });
          }

          // 4. DUPLICATE CHECK: Did the frontend already create this?
          // We check for an appointment at the same time for the same email
          const existingAppointments = await strapi
            .documents("api::appointment.appointment")
            .findMany({
              filters: {
                ClientEmail: customer.email,
                AppointmentDateTime: recoveryData.dateTime, // Exact time match
                BookingStatus: { $ne: "Cancelled" }, // Ignore cancelled ones
              },
            });

          let finalAppointmentId = null;

          if (existingAppointments.length > 0) {
            strapi.log.info(
              `[Webhook] Appointment already exists (ID: ${existingAppointments[0].documentId}). No recovery needed.`
            );
            finalAppointmentId = existingAppointments[0].documentId;
          } else {
            // 5. RECOVERY: Create the Appointment
            strapi.log.info(
              `[Webhook] ⚠️ Frontend didn't create booking. Recovering now for ${reference}...`
            );

            const newAppointment = await strapi
              .documents("api::appointment.appointment")
              .create({
                data: {
                  ClientName: recoveryData.clientName,
                  ClientEmail: customer.email,
                  ClientPhone: recoveryData.clientPhone,
                  AppointmentDateTime: recoveryData.dateTime,
                  BookingStatus: "Confirmed", // Create directly as Confirmed
                  TotalAmount: recoveryData.totalPrice,
                  booked_services: recoveryData.serviceIds, // Array of IDs
                  SelectedStaff: recoveryData.staffId || null,
                },
              });

            finalAppointmentId = newAppointment.documentId;
            strapi.log.info(
              `[Webhook] ✓ Recovered Appointment ID: ${finalAppointmentId}`
            );
          }

          // 6. Ensure Payment Record Exists
          await ensurePaymentRecord(
            strapi,
            reference,
            amount,
            customer.email,
            finalAppointmentId
          );

          return ctx.send({ status: "success" });
        }

        return ctx.send({ status: "ignored" });
      } catch (error) {
        strapi.log.error("[Webhook Error]", error);
        return ctx.internalServerError("Webhook processing failed");
      }
    },
  })
);

// --- HELPER FUNCTION ---
async function ensurePaymentRecord(
  strapi,
  reference,
  amountKobo,
  email,
  appointmentId
) {
  try {
    const existingPayment = await strapi
      .documents("api::payment.payment")
      .findMany({
        filters: { Reference: reference },
      });

    if (existingPayment.length === 0) {
      await strapi.documents("api::payment.payment").create({
        data: {
          Reference: reference,
          Amount: amountKobo / 100, // Convert Kobo to Naira
          ClientEmail: email,
          PaymentStatus: "Success",
          Appointment: appointmentId, // Link if we have it
        },
      });
      strapi.log.info(`[Webhook] Created Payment record for ${reference}`);
    }
  } catch (err) {
    strapi.log.error(
      `[Webhook] Failed to ensure payment record: ${err.message}`
    );
  }
}

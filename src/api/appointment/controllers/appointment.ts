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

        // 1. Fetch Global Settings
        const settings = await strapi
          .documents("api::booking-setting.booking-setting")
          .findFirst();
        if (!settings) return ctx.badRequest("Booking settings not configured");

        const { StartTimeHour, EndTimeHour, SlotIntervalMinutes } = settings;

        // 2. Setup Date Range
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        // 3. Fetch Existing Appointments
        const appointments = await strapi
          .documents("api::appointment.appointment")
          .findMany({
            filters: {
              AppointmentDateTime: {
                $gte: startOfDay.toISOString(),
                $lte: endOfDay.toISOString(),
              },
              BookingStatus: {
                $in: ["Confirmed", "Pending", "Completed"],
              },
            },
            status: "draft",
            fields: ["AppointmentDateTime"],
          });

        // 4. Fetch Admin Blocked Dates
        const blockedDates = await strapi
          .documents("api::blocked-date.blocked-date")
          .findMany({
            filters: {
              Date: date,
            },
          });

        // --- MERGE LOGIC ---
        let finalBookedSlots = [];

        // A. Add Appointment Times
        appointments.forEach((app: any) => {
          const dateTime = new Date(app.AppointmentDateTime);
          const timeStr = dateTime.toLocaleTimeString("en-GB", {
            timeZone: "Africa/Lagos",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          finalBookedSlots.push(timeStr);
        });

        // B. Add Blocked Ranges
        if (blockedDates.length > 0) {
          blockedDates.forEach((block: any) => {
            if (block.IsFullDay) {
              const fullDaySlots = generateTimeRange(
                `${String(StartTimeHour).padStart(2, "0")}:00`,
                `${String(EndTimeHour).padStart(2, "0")}:00`,
                SlotIntervalMinutes
              );
              finalBookedSlots = [...finalBookedSlots, ...fullDaySlots];
            } else if (block.StartTime && block.EndTime) {
              const startStr = String(block.StartTime);
              const endStr = String(block.EndTime);
              const endLimit = endStr.substring(0, 5);

              const rangeSlots = generateTimeRange(
                startStr,
                endStr,
                SlotIntervalMinutes
              );

              const validBlockSlots = rangeSlots.filter((t) => t < endLimit);
              finalBookedSlots = [...finalBookedSlots, ...validBlockSlots];
            }
          });
        }

        // Deduplicate array
        finalBookedSlots = [...new Set(finalBookedSlots)];

        return ctx.send({
          data: finalBookedSlots,
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
      const startTime = Date.now();

      try {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        const signature = ctx.request.headers["x-paystack-signature"];

        if (!secret) {
          strapi.log.error("[Webhook] PAYSTACK_SECRET_KEY not configured");
          return ctx.internalServerError("Configuration error");
        }

        if (!signature) {
          strapi.log.warn("[Webhook] Missing x-paystack-signature header");
          return ctx.unauthorized("Missing signature");
        }

        // Verify webhook signature
        const hash = crypto
          .createHmac("sha512", secret)
          .update(JSON.stringify(ctx.request.body))
          .digest("hex");

        if (hash !== signature) {
          strapi.log.warn("[Webhook] Invalid signature detected");
          return ctx.unauthorized("Invalid signature");
        }

        const event = ctx.request.body;

        strapi.log.info(`[Webhook] Received event: ${event.event}`);

        // Only process successful charges
        if (event.event === "charge.success") {
          const { reference, amount, metadata, customer } = event.data;

          strapi.log.info(
            `[Webhook] Processing payment - Reference: ${reference}, Amount: ${amount / 100}`
          );

          // Extract appointment_id from metadata
          const appointmentId = metadata?.appointment_id;

          if (!appointmentId) {
            strapi.log.warn(
              `[Webhook] No appointment_id in metadata for reference: ${reference}`
            );
            strapi.log.debug(
              `[Webhook] Full metadata:`,
              JSON.stringify(metadata)
            );
            return ctx.send({
              status: "ignored",
              message: "No appointment_id in metadata",
            });
          }

          strapi.log.info(`[Webhook] Found appointment_id: ${appointmentId}`);

          try {
            // 1. Check if appointment exists
            const existingAppointment = await strapi
              .documents("api::appointment.appointment")
              .findOne({
                documentId: appointmentId,
                status: "draft",
              });

            if (!existingAppointment) {
              strapi.log.error(
                `[Webhook] Appointment not found: ${appointmentId}`
              );
              return ctx.badRequest({
                status: "error",
                message: "Appointment not found",
              });
            }

            strapi.log.info(
              `[Webhook] Found appointment: ${appointmentId}, Current status: ${existingAppointment.BookingStatus}`
            );

            // 2. Update appointment to Confirmed and publish
            await strapi.documents("api::appointment.appointment").update({
              documentId: appointmentId,
              data: {
                BookingStatus: "Confirmed",
                publishedAt: new Date(),
              },
              status: "draft",
            });

            strapi.log.info(
              `[Webhook] ✅ Appointment ${appointmentId} confirmed and published`
            );

            // 3. Ensure payment record exists
            await ensurePaymentRecord(
              strapi,
              reference,
              amount,
              customer.email,
              appointmentId
            );

            const duration = Date.now() - startTime;
            strapi.log.info(
              `[Webhook] ✅ Successfully processed in ${duration}ms - Appointment: ${appointmentId}, Reference: ${reference}`
            );

            return ctx.send({
              status: "success",
              appointment_id: appointmentId,
              reference: reference,
            });
          } catch (processingError) {
            strapi.log.error(
              `[Webhook] ❌ Processing failed for appointment ${appointmentId}:`,
              processingError
            );

            // Return 500 so Paystack retries the webhook
            return ctx.internalServerError({
              status: "error",
              message: "Processing failed, will retry",
            });
          }
        }

        // For other event types
        strapi.log.info(`[Webhook] Ignoring event type: ${event.event}`);
        return ctx.send({ status: "ignored", event: event.event });
      } catch (error) {
        const duration = Date.now() - startTime;
        strapi.log.error(
          `[Webhook] ❌ Fatal error after ${duration}ms:`,
          error
        );
        return ctx.internalServerError("Webhook processing failed");
      }
    },
  })
);

// --- HELPER FUNCTIONS ---

function generateTimeRange(startStr, endStr, intervalMinutes) {
  const slots = [];
  const [startH, startM] = String(startStr).split(":").map(Number);
  const [endH, endM] = String(endStr).split(":").map(Number);

  let current = new Date();
  current.setHours(startH, startM, 0, 0);

  const end = new Date();
  end.setHours(endH, endM, 0, 0);

  while (current <= end) {
    const h = String(current.getHours()).padStart(2, "0");
    const m = String(current.getMinutes()).padStart(2, "0");
    slots.push(`${h}:${m}`);
    current.setMinutes(current.getMinutes() + intervalMinutes);
  }
  return slots;
}

async function ensurePaymentRecord(
  strapi,
  reference,
  amountKobo,
  email,
  appointmentId
) {
  try {
    // Check if payment record already exists
    const existing = await strapi.documents("api::payment.payment").findMany({
      filters: { Reference: reference },
      status: "draft",
    });

    if (existing.length === 0) {
      strapi.log.info(
        `[Payment] Creating payment record for reference: ${reference}`
      );

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

      strapi.log.info(
        `[Payment] ✅ Payment record created for reference: ${reference}`
      );
    } else {
      strapi.log.info(
        `[Payment] Payment record already exists for reference: ${reference}`
      );
    }
  } catch (err) {
    strapi.log.error(
      `[Payment] ❌ Failed to create payment record for reference ${reference}:`,
      err
    );
    // Don't throw - we don't want to fail the whole webhook just because payment record failed
    // The appointment is still confirmed
  }
}

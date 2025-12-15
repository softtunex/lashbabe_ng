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
              // --- FIX IS HERE: String() conversion ---
              const startStr = String(block.StartTime);
              const endStr = String(block.EndTime);

              // We only want the HH:mm part for comparison
              const endLimit = endStr.substring(0, 5);

              const rangeSlots = generateTimeRange(
                startStr,
                endStr,
                SlotIntervalMinutes
              );

              // Only block slots that start strictly before the block EndTime
              // (e.g. if break is 13:00-14:00, slot 14:00 is allowed)
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
              `[Webhook] Payment verified for Appointment: ${appointmentId}`
            );

            await strapi.documents("api::appointment.appointment").update({
              documentId: appointmentId,
              data: {
                BookingStatus: "Confirmed",
                publishedAt: new Date(),
              },
              status: "draft",
            });

            await ensurePaymentRecord(
              strapi,
              reference,
              amount,
              customer.email,
              appointmentId
            );
            return ctx.send({ status: "success" });
          }
        }
        return ctx.send({ status: "ignored" });
      } catch (error) {
        strapi.log.error("[Webhook Error]", error);
        return ctx.internalServerError("Webhook processing failed");
      }
    },
  })
);

// --- HELPER FUNCTIONS ---

function generateTimeRange(startStr, endStr, intervalMinutes) {
  const slots = [];
  // Ensure we are working with strings for splitting
  const [startH, startM] = String(startStr).split(":").map(Number);
  const [endH, endM] = String(endStr).split(":").map(Number);

  let current = new Date();
  current.setHours(startH, startM, 0, 0);

  const end = new Date();
  end.setHours(endH, endM, 0, 0);

  while (current <= end) {
    // Manually format to HH:mm to avoid locale issues
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
    const existing = await strapi.documents("api::payment.payment").findMany({
      filters: { Reference: reference },
      status: "draft",
    });

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
  } catch (err) {
    strapi.log.error("Payment record error", err);
  }
}

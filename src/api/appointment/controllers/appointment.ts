/**
 * appointment controller
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::appointment.appointment",
  ({ strapi }) => ({
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
        const appointments = await strapi.entityService.findMany(
          "api::appointment.appointment",
          {
            filters: {
              AppointmentDateTime: {
                $gte: startOfDay.toISOString(),
                $lte: endOfDay.toISOString(),
              },
              BookingStatus: {
                $ne: "Cancelled", // Don't block slots if the appointment was cancelled
              },
            },
            fields: ["AppointmentDateTime"],
          }
        );

        // --- THE FIX IS HERE ---
        const bookedSlots = appointments.map((appointment: any) => {
          const dateTime = new Date(appointment.AppointmentDateTime);

          // Instead of .getHours(), we force it to format as Nigeria Time
          // "en-GB" ensures we get "09:00" format (24 hour) instead of "9:00 AM"
          const timeString = dateTime.toLocaleTimeString("en-GB", {
            timeZone: "Africa/Lagos",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

          return timeString;
        });

        // Return the booked time slots
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
  })
);

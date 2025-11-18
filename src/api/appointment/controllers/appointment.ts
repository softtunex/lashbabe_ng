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

        // Parse the date and create start/end of day
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
            },
            fields: ["AppointmentDateTime"],
          }
        );

        // Extract time slots in HH:MM format
        const bookedSlots = appointments.map((appointment: any) => {
          const dateTime = new Date(appointment.AppointmentDateTime);
          const hours = dateTime.getHours().toString().padStart(2, "0");
          const minutes = dateTime.getMinutes().toString().padStart(2, "0");
          return `${hours}:${minutes}`;
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

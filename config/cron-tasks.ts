// // config/cron-tasks.ts

// export default {
//   /**
//    * TESTING MODE: Run every 1 minute
//    */
//   "*/1 * * * *": async ({ strapi }) => {
//     try {
//       const expirationTime = new Date();
//       expirationTime.setMinutes(expirationTime.getMinutes() - 1);

//       // 1. Find pending appointments (entityService works fine for finding)
//       const abandonedAppointments = await strapi
//         .documents("api::appointment.appointment")
//         .findMany({
//           filters: {
//             BookingStatus: "Pending",
//             createdAt: { $lt: expirationTime.toISOString() },
//           },
//         });

//       if (abandonedAppointments.length > 0) {
//         strapi.log.info(
//           `[Cron Cleanup] Found ${abandonedAppointments.length} abandoned appointments. Deleting...`
//         );

//         for (const appointment of abandonedAppointments) {
//           // --- THE FIX IS HERE ---
//           // Use 'strapi.documents' + 'delete' + 'documentId'
//           await strapi.documents("api::appointment.appointment").delete({
//             documentId: appointment.documentId,
//           });
//         }

//         strapi.log.info(`[Cron Cleanup] Cleanup complete.`);
//       }
//     } catch (error) {
//       strapi.log.error("[Cron Cleanup] Error:", error);
//     }
//   },
// };

// config/cron-tasks.ts

export default {
  //   /**
  //    * Run every 10 minutes (*/10)
  //    * Deletes appointments that have been 'Pending' for more than 30 minutes
  //    */
  "*/10 * * * *": async ({ strapi }) => {
    try {
      // 1. Calculate the cutoff time (30 minutes ago)
      const expirationTime = new Date();
      expirationTime.setMinutes(expirationTime.getMinutes() - 30);

      // 2. Find "Pending" appointments created BEFORE 30 mins ago
      const abandonedAppointments = await strapi
        .documents("api::appointment.appointment")
        .findMany({
          filters: {
            BookingStatus: "Pending",
            createdAt: { $lt: expirationTime.toISOString() },
          },
        });

      // 3. Delete them
      if (abandonedAppointments.length > 0) {
        strapi.log.info(
          `[Cron Cleanup] Found ${abandonedAppointments.length} abandoned appointments. Deleting...`
        );

        for (const appointment of abandonedAppointments) {
          await strapi.documents("api::appointment.appointment").delete({
            documentId: appointment.documentId,
          });
        }

        strapi.log.info(`[Cron Cleanup] Cleanup complete.`);
      }
    } catch (error) {
      strapi.log.error(
        "[Cron Cleanup] Error deleting abandoned appointments:",
        error
      );
    }
  },
};

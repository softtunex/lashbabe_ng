/**
 * Custom appointment routes
 */

export default {
  routes: [
    {
      method: "GET",
      path: "/appointments/booked-slots",
      handler: "appointment.getBookedSlots",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};

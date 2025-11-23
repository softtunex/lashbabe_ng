// src/api/appointment/content-types/appointment/lifecycles.ts

const ADMIN_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL || "lashbabeng@gmail.com";

// Store to track the "before" state
const beforeUpdateState = new Map();

export default {
  /**
   * This hook is triggered BEFORE an appointment is updated.
   * We capture the state BEFORE the update happens.
   */
  async beforeUpdate(event) {
    const { params } = event;

    try {
      // Fetch the current state BEFORE any updates are applied
      const oldAppointment = await strapi
        .documents("api::appointment.appointment")
        .findOne({
          documentId: params.where.documentId,
          populate: ["service"],
        });

      if (oldAppointment) {
        // Store it temporarily using the documentId as key
        beforeUpdateState.set(params.where.documentId, {
          AppointmentDateTime: oldAppointment.AppointmentDateTime,
          BookingStatus: oldAppointment.BookingStatus,
          service: oldAppointment.service,
        });
        console.log("✓ Stored BEFORE state:", {
          documentId: params.where.documentId,
          status: oldAppointment.BookingStatus,
          time: oldAppointment.AppointmentDateTime,
        });
      }
    } catch (err) {
      console.error("Error in beforeUpdate hook:", err);
    }
  },

  /**
   * This hook is triggered AFTER a new appointment is created.
   */
  async afterCreate(event) {
    const { result } = event;
    console.log('--- "afterCreate" LIFECYCLE HOOK TRIGGERED ---');

    try {
      // Fetch the appointment with the service relation populated
      const appointmentWithService = await strapi
        .documents("api::appointment.appointment")
        .findOne({
          documentId: result.documentId,
          populate: ["service"],
        });

      if (!appointmentWithService) {
        console.error(
          `Could not find newly created appointment with documentId ${result.documentId}`
        );
        return;
      }

      const clientEmail = appointmentWithService.ClientEmail;
      const clientName = appointmentWithService.ClientName;
      const serviceName =
        appointmentWithService.service?.Name || "Your Service";
      const depositAmount = appointmentWithService.service?.Deposit
        ? `₦${Number(appointmentWithService.service.Deposit).toLocaleString()}`
        : "₦10,000";
      const serviceDuration = appointmentWithService.service?.Duration
        ? `${appointmentWithService.service.Duration} mins`
        : "";

      const appointmentDate = new Date(
        appointmentWithService.AppointmentDateTime
      );
      const formattedDate = appointmentDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const formattedTime = appointmentDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      console.log(`Preparing to send confirmation emails...`);

      // Client confirmation email
      await strapi.plugins["email"].services.email.send({
        to: clientEmail,
        subject: "✨ Your LashBabe Appointment is Confirmed!",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f0f0f0;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #1a1a1a; padding: 50px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 700; font-family: 'Playfair Display', Georgia, serif; letter-spacing: 0.5px;">✨ Booking Confirmed!</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 50px 40px;">
              <p style="color: #1a1a1a; font-size: 17px; line-height: 1.6; margin: 0 0 8px 0; font-weight: 500;">
                Hi <strong>${clientName}</strong>,
              </p>
              
              <p style="color: #888888; font-size: 16px; line-height: 1.7; margin: 0 0 40px 0;">
                We're excited to confirm your appointment! Here are the details:
              </p>
              
              <!-- Service Details Card -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0f0f0; margin-bottom: 40px;">
                <tr>
                  <td style="padding: 40px 35px;">
                    <h2 style="color: #1a1a1a; margin: 0 0 30px 0; font-size: 26px; font-weight: 600; font-family: 'Playfair Display', Georgia, serif; line-height: 1.3;">${serviceName}</h2>
                    
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #d0d0d0;">
                          <span style="color: #888888; font-size: 15px; font-weight: 500;">📅 Date</span>
                        </td>
                        <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #d0d0d0;">
                          <strong style="color: #1a1a1a; font-size: 15px; font-weight: 600;">${formattedDate}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #d0d0d0;">
                          <span style="color: #888888; font-size: 15px; font-weight: 500;">🕐 Time</span>
                        </td>
                        <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #d0d0d0;">
                          <strong style="color: #1a1a1a; font-size: 15px; font-weight: 600;">${formattedTime}</strong>
                        </td>
                      </tr>
                      ${
                        serviceDuration
                          ? `
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #d0d0d0;">
                          <span style="color: #888888; font-size: 15px; font-weight: 500;">⏱️ Duration</span>
                        </td>
                        <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #d0d0d0;">
                          <strong style="color: #1a1a1a; font-size: 15px; font-weight: 600;">${serviceDuration}</strong>
                        </td>
                      </tr>
                      `
                          : ""
                      }
                      <tr>
                        <td style="padding: 12px 0;">
                          <span style="color: #888888; font-size: 15px; font-weight: 500;">💰 Deposit Paid</span>
                        </td>
                        <td style="padding: 12px 0; text-align: right;">
                          <strong style="color: #1a1a1a; font-size: 18px; font-weight: 600;">${depositAmount}</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="color: #1a1a1a; font-size: 17px; line-height: 1.6; margin: 0 0 15px 0; font-weight: 500;">
                We look forward to pampering you! 💅
              </p>
              
              <p style="color: #888888; font-size: 14px; line-height: 1.7; margin: 35px 0 0 0; padding-top: 35px; border-top: 1px solid #e0e0e0;">
                Need to reschedule or have questions? Feel free to reach out to us anytime.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #1a1a1a; padding: 35px 40px; text-align: center;">
              <p style="color: #ffffff; font-size: 20px; margin: 0 0 8px 0; font-family: 'Playfair Display', Georgia, serif; font-weight: 600; letter-spacing: 0.5px;">LashBabe</p>
              <p style="color: #888888; font-size: 14px; margin: 0; line-height: 1.6;">
                Elevating beauty and building lash professionals.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      });
      console.log(`✓ Confirmation email sent to ${clientEmail}`);

      // Admin notification email
      await strapi.plugins["email"].services.email.send({
        to: ADMIN_EMAIL,
        subject: `🔔 New Booking: ${serviceName} - ${clientName}`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #f0f0f0;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #1a1a1a; padding: 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; font-family: 'Playfair Display', Georgia, serif;">🔔 New Appointment Alert</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #1a1a1a; margin: 0 0 25px 0; font-size: 22px; font-family: 'Playfair Display', Georgia, serif; font-weight: 600;">Client Details</h2>
              
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0f0f0; margin-bottom: 35px;">
                <tr>
                  <td style="padding: 30px;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 10px 0; color: #888888; font-size: 15px; width: 110px; font-weight: 500;">👤 Name</td>
                        <td style="padding: 10px 0;"><strong style="color: #1a1a1a; font-size: 16px; font-weight: 600;">${clientName}</strong></td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; color: #888888; font-size: 15px; font-weight: 500;">📧 Email</td>
                        <td style="padding: 10px 0;"><a href="mailto:${clientEmail}" style="color: #1a1a1a; text-decoration: none; font-size: 15px; font-weight: 500;">${clientEmail}</a></td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; color: #888888; font-size: 15px; font-weight: 500;">📱 Phone</td>
                        <td style="padding: 10px 0;"><strong style="color: #1a1a1a; font-size: 16px; font-weight: 600;">${appointmentWithService.ClientPhone}</strong></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <h2 style="color: #1a1a1a; margin: 0 0 25px 0; font-size: 22px; font-family: 'Playfair Display', Georgia, serif; font-weight: 600;">Appointment Details</h2>
              
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #1a1a1a;">
                <tr>
                  <td style="padding: 30px;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 10px 0; color: #888888; font-size: 15px; width: 110px; font-weight: 500;">💅 Service</td>
                        <td style="padding: 10px 0;"><strong style="color: #ffffff; font-size: 18px; font-weight: 600;">${serviceName}</strong></td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; color: #888888; font-size: 15px; font-weight: 500;">📅 Date</td>
                        <td style="padding: 10px 0;"><strong style="color: #ffffff; font-size: 16px; font-weight: 600;">${formattedDate}</strong></td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; color: #888888; font-size: 15px; font-weight: 500;">🕐 Time</td>
                        <td style="padding: 10px 0;"><strong style="color: #ffffff; font-size: 16px; font-weight: 600;">${formattedTime}</strong></td>
                      </tr>
                      ${
                        serviceDuration
                          ? `
                      <tr>
                        <td style="padding: 10px 0; color: #888888; font-size: 15px; font-weight: 500;">⏱️ Duration</td>
                        <td style="padding: 10px 0;"><strong style="color: #ffffff; font-size: 16px; font-weight: 600;">${serviceDuration}</strong></td>
                      </tr>
                      `
                          : ""
                      }
                      <tr>
                        <td style="padding: 10px 0; color: #888888; font-size: 15px; font-weight: 500;">💰 Deposit</td>
                        <td style="padding: 10px 0;"><strong style="color: #ffffff; font-size: 18px; font-weight: 600;">${depositAmount}</strong></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f0f0f0; padding: 30px 40px; text-align: center;">
              <p style="color: #888888; font-size: 14px; margin: 0;">LashBabe Admin Notification</p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      });
      console.log(`✓ Admin notification sent`);
      console.log('--- "afterCreate" HOOK COMPLETED ---');
    } catch (err) {
      console.error('--- ERROR INSIDE "afterCreate" HOOK ---:', err);
    }
  },

  /**
   * This hook is triggered AFTER an appointment is updated.
   */
  async afterUpdate(event) {
    console.log('--- "afterUpdate" LIFECYCLE HOOK TRIGGERED ---');

    const { result, params } = event;

    try {
      // Get the "before" state we stored
      const beforeState = beforeUpdateState.get(result.documentId);

      if (!beforeState) {
        console.log("✗ No before state found - skipping update email");
        return;
      }

      // Fetch the current state with service populated
      const currentAppointment = await strapi
        .documents("api::appointment.appointment")
        .findOne({
          documentId: result.documentId,
          populate: ["service"],
        });

      if (!currentAppointment) {
        console.log("Could not find the appointment. Exiting hook.");
        beforeUpdateState.delete(result.documentId);
        return;
      }

      const serviceName = currentAppointment.service?.Name || "Your Service";
      const currentStatus = result.BookingStatus;
      const previousStatus = beforeState.BookingStatus;
      const currentTime = new Date(result.AppointmentDateTime).getTime();
      const previousTime = new Date(beforeState.AppointmentDateTime).getTime();

      console.log("=== UPDATE DETECTION ===");
      console.log(`Previous Status: ${previousStatus}`);
      console.log(`Current Status: ${currentStatus}`);
      console.log(`Previous Time: ${new Date(previousTime).toISOString()}`);
      console.log(`Current Time: ${new Date(currentTime).toISOString()}`);
      console.log("========================");

      let subject = "";
      let message = "";
      let shouldSendEmail = false;

      // Check if time was changed
      if (currentTime !== previousTime) {
        console.log("✓ TIME CHANGE DETECTED - Preparing reschedule email");
        shouldSendEmail = true;

        const newDate = new Date(currentTime);
        const formattedDate = newDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const formattedTime = newDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

        subject = "⏰ Your LashBabe Appointment Has Been Rescheduled";
        message = `
<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #f0f0f0;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; overflow: hidden;">
          <tr>
            <td style="background-color: #1a1a1a; padding: 45px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-family: 'Playfair Display', Georgia, serif; font-weight: 700;">⏰ Appointment Rescheduled</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 45px 40px;">
              <p style="color: #1a1a1a; font-size: 17px; margin: 0 0 10px 0; font-weight: 500;">Hi ${result.ClientName},</p>
              <p style="color: #888888; font-size: 16px; line-height: 1.7; margin: 0 0 35px 0;">Your appointment for <strong style="color: #1a1a1a;">${serviceName}</strong> has been rescheduled to:</p>
              <table role="presentation" style="width: 100%; background-color: #f0f0f0; margin-bottom: 35px;">
                <tr>
                  <td style="padding: 35px; text-align: center;">
                    <p style="color: #1a1a1a; font-size: 20px; margin: 0 0 12px 0; font-weight: 600; font-family: 'Playfair Display', Georgia, serif; line-height: 1.4;">${formattedDate}</p>
                    <p style="color: #1a1a1a; font-size: 30px; margin: 0; font-weight: 700;">${formattedTime}</p>
                  </td>
                </tr>
              </table>
              <p style="color: #888888; font-size: 14px; line-height: 1.7; margin: 20px 0 0 0;">If you have any questions about this change, please don't hesitate to contact us.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #1a1a1a; padding: 30px 40px; text-align: center;">
              <p style="color: #ffffff; font-size: 18px; margin: 0 0 6px 0; font-family: 'Playfair Display', Georgia, serif; font-weight: 600;">LashBabe</p>
              <p style="color: #888888; font-size: 13px; margin: 0;">Elevating beauty and building lash professionals.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;
      }
      // Check if status was changed (only if time wasn't changed)
      else if (currentStatus !== previousStatus) {
        console.log(
          `✓ STATUS CHANGE DETECTED - From "${previousStatus}" to "${currentStatus}"`
        );
        shouldSendEmail = true;

        subject = `📋 Your LashBabe Appointment Status: ${currentStatus}`;
        message = `
<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #f0f0f0;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; overflow: hidden;">
          <tr>
            <td style="background-color: #1a1a1a; padding: 45px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-family: 'Playfair Display', Georgia, serif; font-weight: 700;">📋 Status Update</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 45px 40px;">
              <p style="color: #1a1a1a; font-size: 17px; margin: 0 0 10px 0; font-weight: 500;">Hi ${result.ClientName},</p>
              <p style="color: #888888; font-size: 16px; line-height: 1.7; margin: 0 0 35px 0;">The status of your appointment for <strong style="color: #1a1a1a;">${serviceName}</strong> has been updated:</p>
              <table role="presentation" style="width: 100%; background-color: #1a1a1a; margin-bottom: 35px;">
                <tr>
                  <td style="padding: 40px; text-align: center;">
                    <p style="color: #ffffff; font-size: 32px; margin: 0; font-weight: 700; font-family: 'Playfair Display', Georgia, serif;">${currentStatus}</p>
                  </td>
                </tr>
              </table>
              <p style="color: #888888; font-size: 14px; line-height: 1.7; margin: 20px 0 0 0;">If you have any questions, please feel free to contact us.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #1a1a1a; padding: 30px 40px; text-align: center;">
              <p style="color: #ffffff; font-size: 18px; margin: 0 0 6px 0; font-family: 'Playfair Display', Georgia, serif; font-weight: 600;">LashBabe</p>
              <p style="color: #888888; font-size: 13px; margin: 0;">Elevating beauty and building lash professionals.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;
      } else {
        console.log("✗ NO RELEVANT CHANGES DETECTED - No email will be sent.");
      }

      if (shouldSendEmail && subject && message) {
        console.log(`Sending update email to ${result.ClientEmail}`);
        await strapi.plugins["email"].services.email.send({
          to: result.ClientEmail,
          subject: subject,
          html: message,
        });
        console.log("✓ Update email sent successfully to client.");

        // Also notify admin about the update
        await strapi.plugins["email"].services.email.send({
          to: ADMIN_EMAIL,
          subject: `🔔 Appointment Updated: ${serviceName} - ${result.ClientName}`,
          html: message,
        });
        console.log("✓ Update email sent successfully to admin.");

        console.log('--- "afterUpdate" HOOK COMPLETED SUCCESSFULLY ---');
      }

      // Clean up the stored state
      beforeUpdateState.delete(result.documentId);
    } catch (err) {
      console.error('--- ERROR INSIDE "afterUpdate" LIFECYCLE HOOK ---');
      console.error(err);
      // Clean up even on error
      beforeUpdateState.delete(result.documentId);
    }
  },
};

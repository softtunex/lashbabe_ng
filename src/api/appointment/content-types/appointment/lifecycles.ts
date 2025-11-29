// src/api/appointment/content-types/appointment/lifecycles.ts

const ADMIN_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL || "lashbabeng@gmail.com";
const BUSINESS_TIMEZONE = "Africa/Lagos"; // Define timezone constant

// Track created appointments (documentId -> timestamp)
const createdAppointments = new Map();
const beforeUpdateState = new Map();

// Cleanup old entries every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of createdAppointments.entries()) {
    if (now - timestamp > 30000) {
      createdAppointments.delete(key);
    }
  }
}, 30000);

// ============================================================
// EMAIL WORKERS
// ============================================================

const sendNewAppointmentEmails = async (data) => {
  const {
    clientEmail,
    clientName,
    clientPhone,
    serviceNames,
    date,
    time,
    duration,
    deposit,
    staffName,
  } = data;

  try {
    await strapi.plugins["email"].services.email.send({
      to: clientEmail,
      subject: "✨ Your LashBabe Appointment is Confirmed!",
      html: getConfirmationTemplate(
        clientName,
        serviceNames,
        date,
        time,
        duration,
        deposit,
        staffName
      ),
    });
    console.log(`✓ Confirmation email sent to ${clientEmail}`);

    await strapi.plugins["email"].services.email.send({
      to: ADMIN_EMAIL,
      subject: `🔔 New Booking: ${serviceNames} - ${clientName}`,
      html: getAdminNotificationTemplate(
        clientName,
        clientEmail,
        clientPhone,
        serviceNames,
        date,
        time,
        duration,
        deposit,
        staffName
      ),
    });
    console.log(`✓ Admin notification sent`);
  } catch (err) {
    console.error("❌ Email Sending Failed:", err);
  }
};

const sendUpdateEmails = async (data) => {
  const { clientEmail, clientName, serviceNames, subject, message } = data;

  try {
    await strapi.plugins["email"].services.email.send({
      to: clientEmail,
      subject: subject,
      html: message,
    });

    await strapi.plugins["email"].services.email.send({
      to: ADMIN_EMAIL,
      subject: `🔔 Updated: ${serviceNames} - ${clientName}`,
      html: message,
    });
    console.log("✓ Update emails sent successfully.");
  } catch (err) {
    console.error("❌ Update Email Failed:", err);
  }
};

// ============================================================
// LIFECYCLE HOOKS
// ============================================================

export default {
  async beforeUpdate(event) {
    const { params } = event;

    try {
      const oldAppointment = await strapi.db
        .query("api::appointment.appointment")
        .findOne({
          where: params.where,
          populate: ["booked_services", "SelectedStaff"],
        });

      if (oldAppointment) {
        beforeUpdateState.set(oldAppointment.documentId, {
          AppointmentDateTime: oldAppointment.AppointmentDateTime,
          BookingStatus: oldAppointment.BookingStatus,
          booked_services: oldAppointment.booked_services,
          publishedAt: oldAppointment.publishedAt,
        });
      }
    } catch (err) {
      console.error("Error in beforeUpdate:", err);
    }
  },

  async afterCreate(event) {
    const { result } = event;

    console.log(`[afterCreate] Triggered for documentId: ${result.documentId}`);

    const createdAt = new Date(result.createdAt).getTime();
    const now = Date.now();
    const timeDiff = now - createdAt;

    if (timeDiff > 2000) {
      return;
    }

    if (createdAppointments.has(result.documentId)) {
      return;
    }

    createdAppointments.set(result.documentId, Date.now());
    console.log(`✓ New appointment confirmed - will send email`);

    try {
      const appointment = await strapi
        .documents("api::appointment.appointment")
        .findOne({
          documentId: result.documentId,
          populate: ["booked_services", "SelectedStaff"],
        });

      if (!appointment) {
        return;
      }

      const services = appointment.booked_services || [];
      const serviceNames =
        services.map((s) => s.Name).join(", ") || "Your Services";
      const totalDuration = services.reduce(
        (sum, s) => sum + (s.Duration || 0),
        0
      );
      const totalDeposit = services.reduce(
        (sum, s) => sum + (s.Deposit || 0),
        0
      );

      // --- FIX APPLIED HERE: Added timeZone option ---
      const emailData = {
        clientEmail: appointment.ClientEmail,
        clientName: appointment.ClientName,
        clientPhone: appointment.ClientPhone,
        serviceNames: serviceNames,
        deposit: `₦${Number(totalDeposit).toLocaleString()}`,
        duration: totalDuration > 0 ? `${totalDuration} mins` : "",
        staffName: appointment.SelectedStaff?.Name || null,
        date: new Date(appointment.AppointmentDateTime).toLocaleDateString(
          "en-US",
          {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: BUSINESS_TIMEZONE, // Fix: Force Lagos Time
          }
        ),
        time: new Date(appointment.AppointmentDateTime).toLocaleTimeString(
          "en-US",
          {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: BUSINESS_TIMEZONE, // Fix: Force Lagos Time
          }
        ),
      };

      console.log(`Sending confirmation email to ${emailData.clientEmail}`);
      sendNewAppointmentEmails(emailData);
    } catch (err) {
      console.error("Error preparing email data:", err);
    }
  },

  async afterUpdate(event) {
    const { result } = event;
    const beforeState = beforeUpdateState.get(result.documentId);

    console.log(`[afterUpdate] Triggered for documentId: ${result.documentId}`);

    if (!beforeState) {
      beforeUpdateState.delete(result.documentId);
      return;
    }

    try {
      const wasUnpublished = beforeState.publishedAt === null;
      const isNowPublished = result.publishedAt !== null;
      const currentStatus = result.BookingStatus;
      const previousStatus = beforeState.BookingStatus;
      const currentTime = new Date(result.AppointmentDateTime).getTime();
      const previousTime = new Date(beforeState.AppointmentDateTime).getTime();
      const statusChanged = currentStatus !== previousStatus;
      const timeChanged = currentTime !== previousTime;

      if (wasUnpublished && isNowPublished && !statusChanged && !timeChanged) {
        beforeUpdateState.delete(result.documentId);
        return;
      }

      const appointment = await strapi
        .documents("api::appointment.appointment")
        .findOne({
          documentId: result.documentId,
          populate: ["booked_services", "SelectedStaff"],
        });

      if (!appointment) {
        beforeUpdateState.delete(result.documentId);
        return;
      }

      const services = appointment.booked_services || [];
      const serviceNames =
        services.map((s) => s.Name).join(", ") || "Your Services";

      let subject = "";
      let message = "";
      let shouldSend = false;

      if (timeChanged) {
        shouldSend = true;
        const newDate = new Date(currentTime);

        // --- FIX APPLIED HERE: Added timeZone option ---
        const date = newDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: BUSINESS_TIMEZONE, // Fix: Force Lagos Time
        });
        const time = newDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: BUSINESS_TIMEZONE, // Fix: Force Lagos Time
        });

        subject = "⏰ Your LashBabe Appointment Has Been Rescheduled";
        message = getRescheduleTemplate(
          result.ClientName,
          serviceNames,
          date,
          time
        );
        console.log("✓ TIME CHANGE DETECTED - Sending reschedule email");
      } else if (statusChanged) {
        shouldSend = true;
        subject = `📋 Your LashBabe Appointment Status: ${currentStatus}`;
        message = getStatusUpdateTemplate(
          result.ClientName,
          serviceNames,
          currentStatus
        );
        console.log(
          `✓ STATUS CHANGE DETECTED - From "${previousStatus}" to "${currentStatus}"`
        );
      }

      if (shouldSend) {
        console.log(`Sending update email to ${result.ClientEmail}`);
        sendUpdateEmails({
          clientEmail: result.ClientEmail,
          clientName: result.ClientName,
          serviceNames,
          subject,
          message,
        });
      }
    } catch (err) {
      console.error("Error processing update email:", err);
    } finally {
      beforeUpdateState.delete(result.documentId);
    }
  },
};

// ... (Rest of your templates code remains exactly the same) ...
// Ensure you include the templates from your original file here
const getConfirmationTemplate = (
  clientName,
  serviceNames,
  date,
  time,
  duration,
  deposit,
  staffName
) => `
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
          <tr>
            <td style="background-color: #1a1a1a; padding: 50px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 700; font-family: 'Playfair Display', Georgia, serif; letter-spacing: 0.5px;">✨ Booking Confirmed!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 50px 40px;">
              <p style="color: #1a1a1a; font-size: 17px; line-height: 1.6; margin: 0 0 8px 0; font-weight: 500;">
                Hi <strong>${clientName}</strong>,
              </p>
              <p style="color: #888888; font-size: 16px; line-height: 1.7; margin: 0 0 40px 0;">
                We're excited to confirm your appointment! Here are the details:
              </p>
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0f0f0; margin-bottom: 40px;">
                <tr>
                  <td style="padding: 40px 35px;">
                    <h2 style="color: #1a1a1a; margin: 0 0 30px 0; font-size: 26px; font-weight: 600; font-family: 'Playfair Display', Georgia, serif; line-height: 1.3;">${serviceNames}</h2>
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      ${
                        staffName
                          ? `
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #d0d0d0;">
                          <span style="color: #888888; font-size: 15px; font-weight: 500;">👤 Technician</span>
                        </td>
                        <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #d0d0d0;">
                          <strong style="color: #1a1a1a; font-size: 15px; font-weight: 600;">${staffName}</strong>
                        </td>
                      </tr>`
                          : ""
                      }
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #d0d0d0;">
                          <span style="color: #888888; font-size: 15px; font-weight: 500;">📅 Date</span>
                        </td>
                        <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #d0d0d0;">
                          <strong style="color: #1a1a1a; font-size: 15px; font-weight: 600;">${date}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #d0d0d0;">
                          <span style="color: #888888; font-size: 15px; font-weight: 500;">🕐 Time</span>
                        </td>
                        <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #d0d0d0;">
                          <strong style="color: #1a1a1a; font-size: 15px; font-weight: 600;">${time}</strong>
                        </td>
                      </tr>
                      ${
                        duration
                          ? `
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #d0d0d0;">
                          <span style="color: #888888; font-size: 15px; font-weight: 500;">⏱️ Duration</span>
                        </td>
                        <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #d0d0d0;">
                          <strong style="color: #1a1a1a; font-size: 15px; font-weight: 600;">${duration}</strong>
                        </td>
                      </tr>`
                          : ""
                      }
                      <tr>
                        <td style="padding: 12px 0;">
                          <span style="color: #888888; font-size: 15px; font-weight: 500;">💰 Deposit Paid</span>
                        </td>
                        <td style="padding: 12px 0; text-align: right;">
                          <strong style="color: #1a1a1a; font-size: 18px; font-weight: 600;">${deposit}</strong>
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
`;

const getAdminNotificationTemplate = (
  clientName,
  email,
  phone,
  serviceNames,
  date,
  time,
  duration,
  deposit,
  staffName
) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #f0f0f0;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff;">
          <tr>
            <td style="background-color: #1a1a1a; padding: 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; font-family: 'Playfair Display', Georgia, serif;">🔔 New Appointment</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p><strong>Client:</strong> ${clientName}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Phone:</strong> ${phone}</p>
              <hr>
              <p><strong>Services:</strong> ${serviceNames}</p>
              ${staffName ? `<p><strong>Technician:</strong> ${staffName}</p>` : ""}
              <p><strong>Date:</strong> ${date}</p>
              <p><strong>Time:</strong> ${time}</p>
              <p><strong>Deposit:</strong> ${deposit}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const getRescheduleTemplate = (clientName, serviceNames, date, time) => `
<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #f0f0f0;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff;">
          <tr>
            <td style="background-color: #1a1a1a; padding: 45px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-family: 'Playfair Display', Georgia, serif;">⏰ Rescheduled</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 45px 40px;">
              <p>Hi ${clientName},</p>
              <p>Your appointment for <strong>${serviceNames}</strong> has been rescheduled to:</p>
              <h2 style="text-align:center; background:#f0f0f0; padding:25px;">${date} at ${time}</h2>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const getStatusUpdateTemplate = (clientName, serviceNames, status) => `
<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #f0f0f0;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff;">
          <tr>
            <td style="background-color: #1a1a1a; padding: 45px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-family: 'Playfair Display', Georgia, serif;">📋 Status Update</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 45px 40px;">
              <p>Hi ${clientName},</p>
              <p>Your appointment for <strong>${serviceNames}</strong> status is now:</p>
              <h2 style="text-align:center; background:#1a1a1a; color:#fff; padding:25px;">${status}</h2>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

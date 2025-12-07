// src/api/appointment/content-types/appointment/lifecycles.ts

const ADMIN_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL || "lashbabeng@gmail.com";
const BUSINESS_TIMEZONE = "Africa/Lagos";

// --- FOOTER DETAILS ---
const BUSINESS_ADDRESS = "No. 10, Ayato Street, Iwaya, Yaba, Lagos";
const BUSINESS_PHONE = "09134386487";
const POLICY_URL = "https://lashbabeng.com/policy";

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
    // 1. Send to Client
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
    strapi.log.info(`✓ Confirmation email sent to ${clientEmail}`);

    // 2. Send to Admin
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
    strapi.log.info(`✓ Admin notification sent`);
  } catch (err) {
    strapi.log.error("❌ Email Sending Failed:", err);
  }
};

const sendUpdateEmails = async (data) => {
  // Added 'adminMessage' and 'adminSubject' to separate the logic
  const {
    clientEmail,
    clientName,
    serviceNames,
    subject,
    message,
    adminMessage,
    adminSubject,
  } = data;

  try {
    // 1. Send to Client
    await strapi.plugins["email"].services.email.send({
      to: clientEmail,
      subject: subject,
      html: message,
    });

    // 2. Send to Admin (Use specific admin message if provided, otherwise fallback)
    await strapi.plugins["email"].services.email.send({
      to: ADMIN_EMAIL,
      subject: adminSubject || `🔔 Updated: ${serviceNames} - ${clientName}`,
      html: adminMessage || message, // <--- This fixes the "Admin gets Client email" issue
    });
    strapi.log.info(
      "✓ Update emails sent successfully (Separated Client/Admin)."
    );
  } catch (err) {
    strapi.log.error("❌ Update Email Failed:", err);
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

    strapi.log.info(
      `[afterCreate] Triggered for documentId: ${result.documentId} | Status: ${result.BookingStatus}`
    );

    // --- FIX 1: Ignore "Pending" appointments ---
    if (result.BookingStatus === "Pending") {
      strapi.log.info("Status is Pending. Skipping emails.");
      return;
    }

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
    strapi.log.info(`✓ New appointment confirmed - will send email`);

    try {
      const appointment = await strapi
        .documents("api::appointment.appointment")
        .findOne({
          documentId: result.documentId,
          populate: ["booked_services", "SelectedStaff"],
        });

      if (!appointment) return;

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
            timeZone: BUSINESS_TIMEZONE,
          }
        ),
        time: new Date(appointment.AppointmentDateTime).toLocaleTimeString(
          "en-US",
          {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: BUSINESS_TIMEZONE,
          }
        ),
      };

      await sendNewAppointmentEmails(emailData);
    } catch (err) {
      console.error("Error preparing email data:", err);
    }
  },

  async afterUpdate(event) {
    const { result } = event;
    const beforeState = beforeUpdateState.get(result.documentId);

    // Always cleanup
    beforeUpdateState.delete(result.documentId);

    strapi.log.info(
      `[afterUpdate] Triggered for documentId: ${result.documentId}`
    );

    if (!beforeState) return;

    try {
      const currentStatus = result.BookingStatus;
      const previousStatus = beforeState.BookingStatus;
      const currentTime = new Date(result.AppointmentDateTime).getTime();
      const previousTime = new Date(beforeState.AppointmentDateTime).getTime();
      const statusChanged = currentStatus !== previousStatus;
      const timeChanged = currentTime !== previousTime;

      // --- FIX 2: Detect Payment Success (Pending -> Confirmed) ---
      // This solves the issue of missing emails when the status updates from Pending
      if (previousStatus === "Pending" && currentStatus === "Confirmed") {
        strapi.log.info(
          "✓ PAYMENT SUCCESS DETECTED (Pending -> Confirmed). Sending Welcome Emails."
        );

        // Re-fetch to get full details (services, staff)
        const appointment = await strapi
          .documents("api::appointment.appointment")
          .findOne({
            documentId: result.documentId,
            populate: ["booked_services", "SelectedStaff"],
          });

        if (appointment) {
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
                timeZone: BUSINESS_TIMEZONE,
              }
            ),
            time: new Date(appointment.AppointmentDateTime).toLocaleTimeString(
              "en-US",
              {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
                timeZone: BUSINESS_TIMEZONE,
              }
            ),
          };
          await sendNewAppointmentEmails(emailData);
        }
        return; // STOP HERE so we don't trigger "Status Change" email too
      }

      // If still pending, ignore
      if (currentStatus === "Pending") return;

      const appointment = await strapi
        .documents("api::appointment.appointment")
        .findOne({
          documentId: result.documentId,
          populate: ["booked_services", "SelectedStaff"],
        });

      if (!appointment) return;

      const services = appointment.booked_services || [];
      const serviceNames =
        services.map((s) => s.Name).join(", ") || "Your Services";

      let subject = "";
      let message = "";
      let adminMessage = "";
      let adminSubject = "";
      let shouldSend = false;

      // --- FIX 3: Separate Admin/Client Logic ---

      if (timeChanged) {
        shouldSend = true;
        const newDate = new Date(currentTime);
        const date = newDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: BUSINESS_TIMEZONE,
        });
        const time = newDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: BUSINESS_TIMEZONE,
        });

        subject = "⏰ Your LashBabe Appointment Has Been Rescheduled";
        message = getRescheduleTemplate(
          result.ClientName,
          serviceNames,
          date,
          time
        );

        // Specific Admin Message
        adminSubject = `⚠️ Rescheduled: ${result.ClientName}`;
        adminMessage = getAdminSimpleTemplate(
          "Rescheduled",
          result.ClientName,
          serviceNames,
          `New time: ${date} at ${time}`
        );

        strapi.log.info("✓ TIME CHANGE DETECTED - Sending reschedule email");
      } else if (statusChanged) {
        shouldSend = true;
        subject = `📋 Your LashBabe Appointment Status: ${currentStatus}`;
        message = getStatusUpdateTemplate(
          result.ClientName,
          serviceNames,
          currentStatus
        );

        // Specific Admin Message
        adminSubject = `ℹ️ Status Change: ${result.ClientName} -> ${currentStatus}`;
        adminMessage = getAdminSimpleTemplate(
          "Status Update",
          result.ClientName,
          serviceNames,
          `New Status: ${currentStatus}`
        );

        strapi.log.info(
          `✓ STATUS CHANGE DETECTED - From "${previousStatus}" to "${currentStatus}"`
        );
      }

      if (shouldSend) {
        strapi.log.info(`Sending update email to ${result.ClientEmail}`);
        await sendUpdateEmails({
          clientEmail: result.ClientEmail,
          clientName: result.ClientName,
          serviceNames,
          subject,
          message,
          adminMessage, // Pass the distinct admin message
          adminSubject, // Pass the distinct admin subject
        });
      }
    } catch (err) {
      console.error("Error processing update email:", err);
    }
  },
};

// ============================================================
// 🎨 SHARED FOOTER & TEMPLATES
// ============================================================

const getEmailFooter = () => `
  <tr>
    <td style="background-color: #1a1a1a; padding: 40px 20px; text-align: center; border-top: 4px solid #d4af37;">
      <p style="color: #ffffff; font-size: 22px; margin: 0 0 10px 0; font-family: 'Playfair Display', Georgia, serif; font-weight: 600; letter-spacing: 0.5px;">LashBabe</p>
      
      <p style="color: #cccccc; font-size: 14px; margin: 0 0 20px 0; line-height: 1.6;">
        Elevating beauty and building lash professionals.
      </p>

      <div style="border-top: 1px solid #333333; margin: 20px auto; width: 80%;"></div>

      <p style="color: #999999; font-size: 13px; margin: 0 0 5px 0;">
        📍 ${BUSINESS_ADDRESS}
      </p>
      <p style="color: #999999; font-size: 13px; margin: 0 0 20px 0;">
        📞 <a href="tel:${BUSINESS_PHONE}" style="color:#999999; text-decoration:none;">${BUSINESS_PHONE}</a>
      </p>

      <div style="margin-top: 25px;">
        <a href="${POLICY_URL}" style="color: #ffffff; text-decoration: none; font-size: 13px; margin: 0 10px; border-bottom: 1px dotted #ffffff;">Booking Policy</a>
        <span style="color: #666;">|</span>
        <a href="mailto:${ADMIN_EMAIL}" style="color: #ffffff; text-decoration: none; font-size: 13px; margin: 0 10px; border-bottom: 1px dotted #ffffff;">Contact Us</a>
      </div>
    </td>
  </tr>
`;

// ============================================================
// EMAIL TEMPLATES
// ============================================================

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
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #f0f0f0;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #1a1a1a; padding: 50px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 700; font-family: 'Playfair Display', serif;">✨ Booking Confirmed!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 50px 40px;">
              <p style="color: #1a1a1a; font-size: 17px;">Hi <strong>${clientName}</strong>,</p>
              <p style="color: #666; font-size: 16px; margin-bottom: 30px;">We're excited to see you! Here are your appointment details:</p>
              
              <div style="background-color: #f9f9f9; padding: 30px; border-radius: 8px; border: 1px solid #eeeeee;">
                <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 24px; font-family: 'Playfair Display', serif;">${serviceNames}</h2>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  ${staffName ? `<tr><td style="padding: 5px 0; color:#444;"><strong>Technician:</strong></td><td style="text-align:right;">${staffName}</td></tr>` : ""}
                  <tr><td style="padding: 5px 0; color:#444;"><strong>Date:</strong></td><td style="text-align:right;">${date}</td></tr>
                  <tr><td style="padding: 5px 0; color:#444;"><strong>Time:</strong></td><td style="text-align:right;">${time}</td></tr>
                  ${duration ? `<tr><td style="padding: 5px 0; color:#444;"><strong>Duration:</strong></td><td style="text-align:right;">${duration}</td></tr>` : ""}
                  <tr><td style="padding: 15px 0 5px 0; color:#1a1a1a; font-size:18px;"><strong>Deposit Paid:</strong></td><td style="padding: 15px 0 5px 0; text-align:right; font-size:18px; font-weight:bold;">${deposit}</td></tr>
                </table>
              </div>

              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                Please remember to review our <a href="${POLICY_URL}" style="color:#1a1a1a; text-decoration:underline;">booking policy</a> regarding arrival times and guests.
              </p>
            </td>
          </tr>
          ${getEmailFooter()}
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
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #1a1a1a; padding: 45px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-family: 'Playfair Display', serif;">⏰ Rescheduled</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 45px 40px;">
              <p style="font-size: 16px;">Hi <strong>${clientName}</strong>,</p>
              <p style="font-size: 16px; color: #666;">Your appointment for <strong>${serviceNames}</strong> has been moved to a new time:</p>
              
              <div style="background-color: #f0f0f0; padding: 25px; text-align: center; border-radius: 8px; margin: 30px 0;">
                <h2 style="margin: 0; color: #1a1a1a;">${date}</h2>
                <h3 style="margin: 10px 0 0 0; color: #1a1a1a;">${time}</h3>
              </div>
            </td>
          </tr>
          ${getEmailFooter()}
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
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #1a1a1a; padding: 45px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-family: 'Playfair Display', serif;">📋 Status Update</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 45px 40px;">
              <p style="font-size: 16px;">Hi <strong>${clientName}</strong>,</p>
              <p style="font-size: 16px; color: #666;">The status of your appointment for <strong>${serviceNames}</strong> has changed.</p>
              
              <div style="background-color: #1a1a1a; color: #ffffff; padding: 20px; text-align: center; border-radius: 8px; margin: 30px 0;">
                <h2 style="margin: 0; letter-spacing: 1px;">${status.toUpperCase()}</h2>
              </div>
            </td>
          </tr>
          ${getEmailFooter()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// NEW ADMIN ALERT TEMPLATE (Used for Reschedule & Status)
const getAdminSimpleTemplate = (title, clientName, serviceNames, details) => `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; padding: 20px; background: #fff;">
  <h2 style="color: #1a1a1a;">${title}</h2>
  <p><strong>Client:</strong> ${clientName}</p>
  <p><strong>Service:</strong> ${serviceNames}</p>
  <div style="background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 15px 0;">
    ${details}
  </div>
  <p><em>The client has been notified automatically via email.</em></p>
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

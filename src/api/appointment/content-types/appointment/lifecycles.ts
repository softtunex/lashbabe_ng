// src/api/appointment/content-types/appointment/lifecycles.ts

const ADMIN_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL || "lashbabeng@gmail.com";
const beforeUpdateState = new Map();

// ============================================================
// PURE EMAIL WORKER (No DB Calls here!)
// ============================================================

const sendNewAppointmentEmails = async (data) => {
  const {
    clientEmail,
    clientName,
    clientPhone,
    serviceName,
    date,
    time,
    duration,
    deposit,
  } = data;

  try {
    // 1. Client Email
    await strapi.plugins["email"].services.email.send({
      to: clientEmail,
      subject: "✨ Your LashBabe Appointment is Confirmed!",
      html: getConfirmationTemplate(
        clientName,
        serviceName,
        date,
        time,
        duration,
        deposit
      ),
    });
    console.log(`✓ Email sent to ${clientEmail}`);

    // 2. Admin Email
    await strapi.plugins["email"].services.email.send({
      to: ADMIN_EMAIL,
      subject: `🔔 New Booking: ${serviceName} - ${clientName}`,
      html: getAdminNotificationTemplate(
        clientName,
        clientEmail,
        clientPhone,
        serviceName,
        date,
        time,
        duration,
        deposit
      ),
    });
    console.log(`✓ Admin notification sent`);
  } catch (err) {
    console.error("❌ Email Sending Failed:", err);
  }
};

const sendUpdateEmails = async (data) => {
  const { clientEmail, clientName, serviceName, subject, message } = data;

  try {
    // Client
    await strapi.plugins["email"].services.email.send({
      to: clientEmail,
      subject: subject,
      html: message,
    });

    // Admin
    await strapi.plugins["email"].services.email.send({
      to: ADMIN_EMAIL,
      subject: `🔔 Updated: ${serviceName} - ${clientName}`,
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
          populate: ["service"],
        });

      if (oldAppointment) {
        beforeUpdateState.set(oldAppointment.documentId, {
          AppointmentDateTime: oldAppointment.AppointmentDateTime,
          BookingStatus: oldAppointment.BookingStatus,
          service: oldAppointment.service,
        });
      }
    } catch (err) {
      console.error("Error in beforeUpdate:", err);
    }
  },

  async afterCreate(event) {
    const { result } = event;

    try {
      // 1. FETCH DATA HERE (Fast - await this!)
      // We must fetch here to avoid "Transaction closed" errors
      const appointment = await strapi
        .documents("api::appointment.appointment")
        .findOne({
          documentId: result.documentId,
          populate: ["service"],
        });

      if (!appointment) return;

      // 2. PREPARE DATA
      const emailData = {
        clientEmail: appointment.ClientEmail,
        clientName: appointment.ClientName,
        clientPhone: appointment.ClientPhone,
        serviceName: appointment.service?.Name || "Your Service",
        deposit: appointment.service?.Deposit
          ? `₦${Number(appointment.service.Deposit).toLocaleString()}`
          : "₦10,000",
        duration: appointment.service?.Duration
          ? `${appointment.service.Duration} mins`
          : "",
        date: new Date(appointment.AppointmentDateTime).toLocaleDateString(
          "en-US",
          { weekday: "long", year: "numeric", month: "long", day: "numeric" }
        ),
        time: new Date(appointment.AppointmentDateTime).toLocaleTimeString(
          "en-US",
          { hour: "numeric", minute: "2-digit", hour12: true }
        ),
      };

      // 3. SEND EMAIL (Slow - DO NOT await this!)
      // This runs in the background while Strapi responds to the user
      sendNewAppointmentEmails(emailData);
    } catch (err) {
      console.error("Error preparing email data:", err);
    }
  },

  async afterUpdate(event) {
    const { result } = event;
    const beforeState = beforeUpdateState.get(result.documentId);

    if (beforeState) {
      try {
        // 1. FETCH DATA (Fast - await this!)
        const appointment = await strapi
          .documents("api::appointment.appointment")
          .findOne({
            documentId: result.documentId,
            populate: ["service"],
          });

        if (!appointment) return;

        // 2. LOGIC
        const serviceName = appointment.service?.Name || "Your Service";
        const currentStatus = result.BookingStatus;
        const previousStatus = beforeState.BookingStatus;
        const currentTime = new Date(result.AppointmentDateTime).getTime();
        const previousTime = new Date(
          beforeState.AppointmentDateTime
        ).getTime();

        let subject = "";
        let message = "";
        let shouldSend = false;

        if (currentTime !== previousTime) {
          shouldSend = true;
          const newDate = new Date(currentTime);
          const date = newDate.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          const time = newDate.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
          subject = "⏰ Your LashBabe Appointment Has Been Rescheduled";
          message = getRescheduleTemplate(
            result.ClientName,
            serviceName,
            date,
            time
          );
        } else if (currentStatus !== previousStatus) {
          shouldSend = true;
          subject = `📋 Your LashBabe Appointment Status: ${currentStatus}`;
          message = getStatusUpdateTemplate(
            result.ClientName,
            serviceName,
            currentStatus
          );
        }

        // 3. SEND EMAIL (Slow - DO NOT await this!)
        if (shouldSend) {
          sendUpdateEmails({
            clientEmail: result.ClientEmail,
            clientName: result.ClientName,
            serviceName,
            subject,
            message,
          });
        }
      } catch (err) {
        console.error("Error processing update email:", err);
      }

      beforeUpdateState.delete(result.documentId);
    }
  },
};

// ... (Keep your HTML Templates exactly the same as before) ...
const getConfirmationTemplate = (
  clientName,
  serviceName,
  date,
  time,
  duration,
  deposit
) =>
  `<!DOCTYPE html><html><body style="font-family: sans-serif; background-color: #f0f0f0; padding: 20px;"><div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;"><div style="background: #1a1a1a; padding: 30px; text-align: center;"><h1 style="color: #fff; margin: 0;">✨ Booking Confirmed!</h1></div><div style="padding: 30px;"><p>Hi <strong>${clientName}</strong>,</p><p>We're excited to confirm your appointment for <strong>${serviceName}</strong>.</p><div style="background: #f9f9f9; padding: 20px; margin: 20px 0; border-radius: 4px;"><p><strong>📅 Date:</strong> ${date}</p><p><strong>🕐 Time:</strong> ${time}</p><p><strong>💰 Deposit Paid:</strong> ${deposit}</p></div><p>See you soon! 💅</p></div></div></body></html>`;
const getAdminNotificationTemplate = (
  clientName,
  email,
  phone,
  serviceName,
  date,
  time,
  duration,
  deposit
) =>
  `<!DOCTYPE html><html><body style="font-family: sans-serif; background-color: #f0f0f0; padding: 20px;"><div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 30px;"><h2>🔔 New Appointment Alert</h2><p><strong>Client:</strong> ${clientName}</p><p><strong>Email:</strong> ${email}</p><p><strong>Phone:</strong> ${phone}</p><hr><p><strong>Service:</strong> ${serviceName}</p><p><strong>Date:</strong> ${date} @ ${time}</p><p><strong>Deposit:</strong> ${deposit}</p></div></body></html>`;
const getRescheduleTemplate = (clientName, serviceName, date, time) =>
  `<!DOCTYPE html><html><body style="font-family: sans-serif; background-color: #f0f0f0; padding: 20px;"><div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 30px;"><div style="background: #1a1a1a; padding: 20px; text-align: center; color: #fff;"><h2>⏰ Appointment Rescheduled</h2></div><div style="padding: 20px;"><p>Hi ${clientName},</p><p>Your appointment for <strong>${serviceName}</strong> has been moved to:</p><h3 style="text-align:center; background:#eee; padding:15px;">${date} at ${time}</h3></div></div></body></html>`;
const getStatusUpdateTemplate = (clientName, serviceName, status) =>
  `<!DOCTYPE html><html><body style="font-family: sans-serif; background-color: #f0f0f0; padding: 20px;"><div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 30px;"><div style="background: #1a1a1a; padding: 20px; text-align: center; color: #fff;"><h2>📋 Status Update</h2></div><div style="padding: 20px;"><p>Hi ${clientName},</p><p>The status of your appointment for <strong>${serviceName}</strong> is now:</p><h2 style="text-align:center;">${status}</h2></div></div></body></html>`;

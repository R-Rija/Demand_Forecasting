require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: (process.env.EMAIL_PASS || '').replace(/\s+/g, '')
      }
    });

    const info = await transporter.sendMail({
      from: `"Cognitive Retail AI" <${process.env.EMAIL_USER}>`,
      to: "rija75217@gmail.com",
      subject: `Test Email`,
      text: "This is a test email."
    });
    console.log(`✅ Email sent successfully. MessageId: ${info.messageId}`);
  } catch (error) {
    console.error("❌ Failed to send email:", error.message);
  }
}
testEmail();

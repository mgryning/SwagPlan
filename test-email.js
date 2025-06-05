const nodemailer = require('nodemailer');
require('dotenv').config();

// Email configuration - Gmail SMTP (same as in reminders.js)
const EMAIL_CONFIG = {
  fromEmail: process.env.GMAIL_EMAIL,
  fromName: 'SwagPlan',
  password: process.env.GMAIL_PASSWORD,
  host: 'smtp.gmail.com',
  port: 587
};

console.log('🧪 Testing Gmail SMTP email configuration...');
console.log('📧 From:', EMAIL_CONFIG.fromEmail);
console.log('📧 To: mortengryning@gmail.com');
console.log('🔑 App Password:', EMAIL_CONFIG.password.substring(0, 4) + ' ' + EMAIL_CONFIG.password.substring(5, 9) + ' ****');

// Create nodemailer transporter for Gmail SMTP
const transporter = nodemailer.createTransport({
  host: EMAIL_CONFIG.host,
  port: EMAIL_CONFIG.port,
  secure: false, // true for 465, false for other ports
  auth: {
    user: EMAIL_CONFIG.fromEmail,
    pass: EMAIL_CONFIG.password
  },
  tls: {
    rejectUnauthorized: false
  }
});

async function testEmail() {
  try {
    console.log('\n📤 Sending test email...');
    
    const mailOptions = {
      from: `"${EMAIL_CONFIG.fromName}" <${EMAIL_CONFIG.fromEmail}>`,
      to: 'mortengryning@gmail.com',
      subject: '🧪 SwagPlan Email Test',
      text: `Hello!

This is a test email from SwagPlan to verify that the email configuration is working correctly.

Test details:
- Sent at: ${new Date().toISOString()}
- From: ${EMAIL_CONFIG.fromEmail}
- App Password: ${EMAIL_CONFIG.password.substring(0, 4)} ${EMAIL_CONFIG.password.substring(5, 9)} ****

If you receive this email, the Gmail SMTP configuration is working properly!

Best regards,
SwagPlan Test System`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50; text-align: center;">🧪 SwagPlan Email Test</h2>
          
          <div style="background: #e8f5e8; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #27ae60;">
            <p><strong>✅ Success!</strong> This test email was sent successfully.</p>
          </div>
          
          <h3 style="color: #2c3e50;">Test Details:</h3>
          <ul style="color: #666;">
            <li><strong>Sent at:</strong> ${new Date().toISOString()}</li>
            <li><strong>From:</strong> ${EMAIL_CONFIG.fromEmail}</li>
            <li><strong>App Password:</strong> ${EMAIL_CONFIG.password.substring(0, 4)} ${EMAIL_CONFIG.password.substring(5, 9)} ****</li>
          </ul>
          
          <p style="color: #666;">
            If you receive this email, the Gmail SMTP configuration is working properly and ready for production use!
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            SwagPlan Email Test System
          </p>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Test email sent successfully!');
    console.log('📧 Message ID:', info.messageId);
    console.log('📬 Check your inbox at mortengryning@gmail.com');
    console.log('\n🎉 Gmail SMTP configuration is working correctly!');
    
  } catch (error) {
    console.error('❌ Test email failed!');
    console.error('Error details:', error.message);
    
    if (error.code === 'EAUTH') {
      console.log('\n💡 Authentication failed. This could mean:');
      console.log('   1. Invalid app password');
      console.log('   2. 2FA not enabled on Gmail account');
      console.log('   3. Gmail account issues');
      console.log('   4. Wrong SMTP configuration');
    }
    
    console.log('\n🔧 Troubleshooting steps:');
    console.log('   1. Verify Gmail app password is correct');
    console.log('   2. Ensure 2-factor authentication is enabled');
    console.log('   3. Check if "Less secure app access" is disabled');
    console.log('   4. Try generating a new app password');
  }
}

// Run the test
testEmail();
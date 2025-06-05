const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { DateTime } = require('luxon');
require('dotenv').config();

// Email configuration - Gmail SMTP
const EMAIL_CONFIG = {
  fromEmail: process.env.GMAIL_EMAIL,
  fromName: 'SwagPlan',
  password: process.env.GMAIL_PASSWORD,
  host: 'smtp.gmail.com',
  port: 587
};

// Debug mode configuration
const DEBUG_MODE = process.env.REMINDER_DEBUG === 'true';
const DEBUG_EMAIL = process.env.DEBUG_EMAIL;

// Data file path
const DATA_FILE = process.env.NODE_ENV === 'production' ? '/data/data.json' : './data/data.json';

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

function readData() {
  try {
    console.log(`📁 Reading data from: ${DATA_FILE}`);
    console.log(`📁 File exists: ${fs.existsSync(DATA_FILE)}`);
    console.log(`📁 Current working directory: ${process.cwd()}`);
    
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Error reading data file:', error);
    console.log('📁 Creating default data structure...');
    return { activities: [], users: [] };
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`Data written to ${DATA_FILE}`);
  } catch (error) {
    console.error('Error writing data file:', error);
  }
}

function getUserById(users, userId) {
  return users.find(user => user.id === userId);
}

function getEmailsForActivity(activity, users) {
  const emails = [];
  
  // Add responsible person's email
  if (activity.responsible) {
    const responsibleUser = getUserById(users, activity.responsible);
    if (responsibleUser && responsibleUser.email) {
      emails.push(responsibleUser.email);
    }
  }
  
  // Add participants' emails
  if (activity.participants && activity.participants.length > 0) {
    activity.participants.forEach(participantId => {
      const participant = getUserById(users, participantId);
      if (participant && participant.email && !emails.includes(participant.email)) {
        emails.push(participant.email);
      }
    });
  }
  
  return emails;
}

function formatActivityDate(dateString) {
  const date = DateTime.fromISO(dateString);
  return date.toLocaleString(DateTime.DATE_FULL);
}

function createEmailContent(activity, reminderType) {
  const activityDate = formatActivityDate(activity.date);
  const timeframes = {
    twoMonths: { label: '2 months', period: 'two months' },
    oneMonth: { label: '1 month', period: 'one month' },
    twoWeeks: { label: '2 weeks', period: 'two weeks' }
  };
  
  const timeframe = timeframes[reminderType];
  
  const subject = `⏰ Reminder: "${activity.title}" is in ${timeframe.label}!`;
  
  const text = `Hi there!

This is your ${timeframe.period} reminder for the upcoming activity:

📅 Activity: ${activity.title}
📆 Date: ${activityDate}
${activity.notes ? `📝 Notes: ${activity.notes}` : ''}

${activity.responsible ? `👤 Remember you are responsible for this activity.` : `⚠️  No one is currently responsible for organizing this activity. Please assign someone soon!`}

Remember to plan it! 📅

Best regards,
SwagPlan Activity Reminder System`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2c3e50; text-align: center;">⏰ Activity Reminder</h2>
      
      <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #3498db;">
        <h3 style="color: #2c3e50; margin-top: 0;">${activity.title}</h3>
        <p style="font-size: 16px; margin: 10px 0;"><strong>📆 Date:</strong> ${activityDate}</p>
        ${activity.notes ? `<p style="font-size: 14px; color: #666; margin: 10px 0;"><strong>📝 Notes:</strong> ${activity.notes}</p>` : ''}
      </div>
      
      <div style="background: ${activity.responsible ? '#e8f5e8' : '#fff3cd'}; border-radius: 8px; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: ${activity.responsible ? '#27ae60' : '#d68910'};">
          ${activity.responsible 
            ? '👤 <strong>Remember</strong> you are responsible for this activity.' 
            : '⚠️ <strong>Heads up!</strong> No one is currently responsible for organizing this activity. Please assign someone soon!'}
        </p>
      </div>
      
      <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px;">
        This is your <strong>${timeframe.period}</strong> reminder. Remember to plan it! 📅
      </p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px; text-align: center;">
        Sent by SwagPlan Activity Reminder System
      </p>
    </div>
  `;
  
  return { subject, text, html };
}

async function sendEmail(emails, subject, text, html) {
  if (emails.length === 0) {
    console.log('No emails to send to');
    return false;
  }
  
  let actualRecipients;
  let debugInfo = '';
  
  if (DEBUG_MODE) {
    // In debug mode, send all emails to debug email address
    actualRecipients = DEBUG_EMAIL;
    debugInfo = `\n\n--- DEBUG MODE ---\nOriginal recipients would have been: ${emails.join(', ')}\nThis email was redirected to: ${DEBUG_EMAIL}\n--- END DEBUG ---`;
    
    // Modify subject to indicate debug mode
    subject = `[DEBUG] ${subject}`;
    
    // Add debug info to both text and HTML versions
    text += debugInfo;
    html += `<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin: 20px 0; font-family: monospace; font-size: 12px;">
      <strong>🐛 DEBUG MODE</strong><br>
      Original recipients: ${emails.join(', ')}<br>
      Redirected to: ${DEBUG_EMAIL}
    </div>`;
    
    console.log(`🐛 DEBUG MODE: Redirecting email from [${emails.join(', ')}] to [${DEBUG_EMAIL}]`);
  } else {
    actualRecipients = emails.join(', ');
  }
  
  try {
    const mailOptions = {
      from: `"${EMAIL_CONFIG.fromName}" <${EMAIL_CONFIG.fromEmail}>`,
      to: actualRecipients,
      subject,
      text,
      html
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    if (DEBUG_MODE) {
      console.log(`✅ DEBUG: Email sent to ${DEBUG_EMAIL} (would have gone to ${emails.length} recipients: ${emails.join(', ')})`);
    } else {
      console.log(`✅ Email sent successfully to ${emails.length} recipients:`, emails.join(', '));
    }
    console.log('Message ID:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return false;
  }
}

async function sendReminders() {
  console.log('🔔 Starting reminder sweep...');
  
  if (DEBUG_MODE) {
    console.log('🐛 DEBUG MODE ENABLED: All emails will be sent to', DEBUG_EMAIL);
  }
  
  const data = readData();
  const { activities, users } = data;
  
  if (!activities || activities.length === 0) {
    console.log('No activities found');
    return { processed: 0, sent: 0 };
  }
  
  const now = DateTime.utc();
  let processed = 0;
  let sent = 0;
  
  // Define reminder intervals in days
  const reminderIntervals = {
    twoMonths: 60,
    oneMonth: 30,
    twoWeeks: 14
  };
  
  for (const activity of activities) {
    // Only process planned activities
    if (activity.status !== 'planned') {
      continue;
    }
    
    processed++;
    
    const activityDate = DateTime.fromISO(activity.date);
    const daysUntilActivity = Math.floor(activityDate.diff(now, 'days').days);
    
    console.log(`📅 Activity "${activity.title}" is in ${daysUntilActivity} days`);
    
    // Initialize notifications object if it doesn't exist
    if (!activity.notifications) {
      activity.notifications = {};
    }
    
    // Check each reminder interval
    for (const [reminderType, daysBefore] of Object.entries(reminderIntervals)) {
      // Check if we should send this reminder
      if (daysUntilActivity === daysBefore) {
        // Check if we've already sent this reminder
        if (activity.notifications[reminderType] && activity.notifications[reminderType].sent) {
          console.log(`⏭️  ${reminderType} reminder already sent for "${activity.title}"`);
          continue;
        }
        
        console.log(`📬 Sending ${reminderType} reminder for "${activity.title}"`);
        
        // Get email addresses for this activity
        const emails = getEmailsForActivity(activity, users);
        
        if (emails.length === 0) {
          console.log(`⚠️  No email addresses found for activity "${activity.title}"`);
          continue;
        }
        
        // Create email content
        const { subject, text, html } = createEmailContent(activity, reminderType);
        
        // Send email
        const emailSent = await sendEmail(emails, subject, text, html);
        
        if (emailSent) {
          // Mark as sent
          activity.notifications[reminderType] = {
            sent: true,
            sentAt: now.toISO(),
            recipients: emails
          };
          sent++;
          console.log(`✅ ${reminderType} reminder sent for "${activity.title}"`);
        } else {
          console.log(`❌ Failed to send ${reminderType} reminder for "${activity.title}"`);
        }
      }
    }
  }
  
  // Save updated data with notification status
  writeData(data);
  
  const result = { processed, sent };
  console.log(`🎯 Reminder sweep complete: processed ${processed} activities, sent ${sent} emails`);
  return result;
}

module.exports = {
  sendReminders
};
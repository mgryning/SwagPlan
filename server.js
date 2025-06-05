const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = 3443;
// Use absolute path in production (Fly.io mount), relative path in development
const DATA_FILE = process.env.NODE_ENV === 'production' ? '/data/data.json' : './data/data.json';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

function readData() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log('Data file not found, creating default data structure');
    const defaultData = { activities: [], users: [] };
    
    // Ensure the directory exists
    const dataDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`Created data directory: ${dataDir}`);
    }
    
    // Create the data file with default structure
    writeData(defaultData);
    return defaultData;
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

app.get('/api/activities', (req, res) => {
  const data = readData();
  res.json(data.activities);
});

app.post('/api/activities', (req, res) => {
  const data = readData();
  const newActivity = {
    id: Date.now().toString(),
    title: req.body.title,
    date: req.body.date,
    responsible: req.body.responsible || null,
    notes: req.body.notes || '',
    participants: [],
    status: 'planned'
  };
  data.activities.push(newActivity);
  writeData(data);
  res.json(newActivity);
});

app.post('/api/activities/bulk', (req, res) => {
  const data = readData();
  const { startMonth } = req.body;
  
  if (!startMonth) {
    return res.status(400).json({ error: 'Start month is required' });
  }
  
  const startDate = new Date(startMonth + '-01');
  const newActivities = [];
  
  for (let i = 0; i < 8; i++) {
    const activityDate = new Date(startDate);
    activityDate.setMonth(startDate.getMonth() + (i * 2)); // Add 2 months for each activity
    
    const monthName = activityDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const newActivity = {
      id: (Date.now() + i).toString(), // Ensure unique IDs
      title: `Loge Activity ${monthName}`,
      date: activityDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
      responsible: null,
      notes: '',
      participants: [],
      status: 'planned'
    };
    
    data.activities.push(newActivity);
    newActivities.push(newActivity);
  }
  
  writeData(data);
  res.json({ created: newActivities.length, activities: newActivities });
});

app.post('/api/activities/:id/signup', (req, res) => {
  const data = readData();
  const activity = data.activities.find(a => a.id === req.params.id);
  if (!activity) {
    return res.status(404).json({ error: 'Activity not found' });
  }
  
  const userId = req.body.userId;
  if (!activity.participants.includes(userId)) {
    activity.participants.push(userId);
  }
  
  if (!activity.responsible) {
    activity.responsible = userId;
  }
  
  writeData(data);
  res.json(activity);
});

app.post('/api/activities/:id/leave', (req, res) => {
  const data = readData();
  const activity = data.activities.find(a => a.id === req.params.id);
  if (!activity) {
    return res.status(404).json({ error: 'Activity not found' });
  }
  
  const userId = req.body.userId;
  activity.participants = activity.participants.filter(p => p !== userId);
  
  if (activity.responsible === userId) {
    activity.responsible = activity.participants.length > 0 ? activity.participants[0] : null;
  }
  
  writeData(data);
  res.json(activity);
});

app.get('/api/users', (req, res) => {
  const data = readData();
  res.json(data.users);
});

app.post('/api/activities/:id/mark-held', (req, res) => {
  const data = readData();
  const activity = data.activities.find(a => a.id === req.params.id);
  if (!activity) {
    return res.status(404).json({ error: 'Activity not found' });
  }
  
  // Only allow marking as held if currently planned
  if (activity.status === 'planned') {
    activity.status = 'held';
    writeData(data);
    res.json(activity);
  } else {
    res.status(400).json({ error: 'Activity is already completed and cannot be changed back' });
  }
});

app.post('/api/activities/:id/mark-skipped', (req, res) => {
  const data = readData();
  const activity = data.activities.find(a => a.id === req.params.id);
  if (!activity) {
    return res.status(404).json({ error: 'Activity not found' });
  }
  
  // Only allow marking as skipped if currently planned
  if (activity.status === 'planned') {
    activity.status = 'skipped';
    writeData(data);
    res.json(activity);
  } else {
    res.status(400).json({ error: 'Activity is already completed and cannot be changed back' });
  }
});

app.post('/api/activities/:id/mark-planned', (req, res) => {
  const data = readData();
  const activity = data.activities.find(a => a.id === req.params.id);
  if (!activity) {
    return res.status(404).json({ error: 'Activity not found' });
  }
  
  // Allow marking as planned if currently held or skipped
  if (activity.status === 'held' || activity.status === 'skipped') {
    activity.status = 'planned';
    writeData(data);
    res.json(activity);
  } else {
    res.status(400).json({ error: 'Activity is already planned' });
  }
});

app.delete('/api/activities/:id', (req, res) => {
  const data = readData();
  const activityIndex = data.activities.findIndex(a => a.id === req.params.id);
  if (activityIndex === -1) {
    return res.status(404).json({ error: 'Activity not found' });
  }
  
  data.activities.splice(activityIndex, 1);
  writeData(data);
  res.json({ success: true });
});

app.post('/api/users', (req, res) => {
  const data = readData();
  const existingUser = data.users.find(u => u.facebookId === req.body.facebookId);
  if (existingUser) {
    return res.json(existingUser);
  }
  
  const newUser = {
    id: Date.now().toString(),
    name: req.body.name,
    facebookId: req.body.facebookId,
    email: req.body.email || null
  };
  data.users.push(newUser);
  writeData(data);
  res.json(newUser);
});

app.put('/api/users/:id', (req, res) => {
  const data = readData();
  const userIndex = data.users.findIndex(u => u.id === req.params.id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Update user email
  data.users[userIndex].email = req.body.email || null;
  writeData(data);
  res.json(data.users[userIndex]);
});

app.get('/api/data/download', (req, res) => {
  try {
    const data = readData();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `data-backup-${timestamp}.json`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(data);
  } catch (error) {
    console.error('Error downloading data:', error);
    res.status(500).json({ error: 'Failed to download data' });
  }
});

app.post('/api/send-reminders', async (req, res) => {
  try {
    // Simple token authentication
    const token = req.query.token || req.headers['x-reminder-token'];
    const expectedToken = process.env.REMINDER_TOKEN;
    
    if (token !== expectedToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('📤 Manual reminder endpoint called');
    
    // Import the sendReminders function
    const { sendReminders } = require('./lib/reminders');
    
    const result = await sendReminders();
    
    console.log('✅ Manual reminder sweep completed');
    res.json({
      success: true,
      message: 'Reminders sent successfully',
      processed: result.processed,
      sent: result.sent,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Manual reminder sweep failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send reminders',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/send-reminders/test', async (req, res) => {
  try {
    console.log('🧪 Test reminder endpoint called - emails will be redirected to mortengryning@gmail.com');
    
    // Set debug mode environment variable temporarily
    process.env.REMINDER_DEBUG = 'true';
    
    // Import the sendReminders function
    const { sendReminders } = require('./lib/reminders');
    
    const result = await sendReminders();
    
    // Clear debug mode
    delete process.env.REMINDER_DEBUG;
    
    console.log('✅ Test reminder sweep completed');
    res.json({
      success: true,
      message: 'Test reminders sent successfully (all emails redirected to mortengryning@gmail.com)',
      processed: result.processed,
      sent: result.sent,
      debugMode: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Test reminder sweep failed:', error);
    
    // Clear debug mode on error too
    delete process.env.REMINDER_DEBUG;
    
    res.status(500).json({
      success: false,
      error: 'Failed to send test reminders',
      message: error.message,
      debugMode: true,
      timestamp: new Date().toISOString()
    });
  }
});

// Email test endpoint - similar to test-email.js but as API
app.post('/api/test-email', async (req, res) => {
  try {
    // Simple token authentication
    const token = req.query.token || req.headers['x-reminder-token'];
    const expectedToken = process.env.REMINDER_TOKEN;
    
    if (token !== expectedToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🧪 Email test endpoint called');

    const nodemailer = require('nodemailer');
    
    // Email configuration
    const EMAIL_CONFIG = {
      fromEmail: process.env.GMAIL_EMAIL,
      fromName: 'SwagPlan',
      password: process.env.GMAIL_PASSWORD,
      host: 'smtp.gmail.com',
      port: 587
    };

    // Validate environment variables
    if (!EMAIL_CONFIG.fromEmail || !EMAIL_CONFIG.password) {
      return res.status(500).json({
        success: false,
        error: 'Missing email configuration',
        message: 'GMAIL_EMAIL or GMAIL_PASSWORD environment variables not set'
      });
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: EMAIL_CONFIG.host,
      port: EMAIL_CONFIG.port,
      secure: false,
      auth: {
        user: EMAIL_CONFIG.fromEmail,
        pass: EMAIL_CONFIG.password
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Get recipient from request body or use debug email
    const recipient = req.body.email || process.env.DEBUG_EMAIL || 'mortengryning@gmail.com';

    const mailOptions = {
      from: `"${EMAIL_CONFIG.fromName}" <${EMAIL_CONFIG.fromEmail}>`,
      to: recipient,
      subject: '🧪 SwagPlan Email Test - Server API',
      text: `Hello!

This is a test email from SwagPlan server API to verify that the email configuration is working correctly.

Test details:
- Sent at: ${new Date().toISOString()}
- From: ${EMAIL_CONFIG.fromEmail}
- To: ${recipient}
- Server: ${req.get('host')}
- User-Agent: ${req.get('user-agent')}

If you receive this email, the Gmail SMTP configuration is working properly on the server!

Best regards,
SwagPlan Server Test System`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50; text-align: center;">🧪 SwagPlan Server Email Test</h2>
          
          <div style="background: #e8f5e8; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #27ae60;">
            <p><strong>✅ Success!</strong> This test email was sent successfully from the server API.</p>
          </div>
          
          <h3 style="color: #2c3e50;">Test Details:</h3>
          <ul style="color: #666;">
            <li><strong>Sent at:</strong> ${new Date().toISOString()}</li>
            <li><strong>From:</strong> ${EMAIL_CONFIG.fromEmail}</li>
            <li><strong>To:</strong> ${recipient}</li>
            <li><strong>Server:</strong> ${req.get('host')}</li>
            <li><strong>User-Agent:</strong> ${req.get('user-agent')}</li>
          </ul>
          
          <p style="color: #666;">
            If you receive this email, the Gmail SMTP configuration is working properly on the server and ready for production use!
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            SwagPlan Server Email Test System
          </p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('✅ Test email sent successfully via API');
    console.log('📧 Message ID:', info.messageId);

    res.json({
      success: true,
      message: 'Test email sent successfully',
      details: {
        messageId: info.messageId,
        from: EMAIL_CONFIG.fromEmail,
        to: recipient,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Email test failed:', error);
    
    let errorDetails = {};
    if (error.code === 'EAUTH') {
      errorDetails = {
        code: 'EAUTH',
        message: 'Authentication failed - check Gmail credentials',
        suggestions: [
          'Verify Gmail app password is correct',
          'Ensure 2-factor authentication is enabled',
          'Try generating a new app password'
        ]
      };
    }

    res.status(500).json({
      success: false,
      error: 'Email test failed',
      message: error.message,
      details: errorDetails,
      timestamp: new Date().toISOString()
    });
  }
});

// For production deployment (like Fly.io), listen on 0.0.0.0
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

// Log data file location on startup
console.log(`Using data file: ${DATA_FILE}`);

// In production (like Fly.io), SSL is handled by the proxy, so we only need HTTP
if (process.env.NODE_ENV === 'production') {
  app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
    console.log(`Data persistence: ${DATA_FILE}`);
  });
} else {
  // For development, run both HTTP and HTTPS (if certificates exist)
  try {
    const sslOptions = {
      key: fs.readFileSync('key.pem'),
      cert: fs.readFileSync('cert.pem')
    };
    
    https.createServer(sslOptions, app).listen(HTTPS_PORT, HOST, () => {
      console.log(`HTTPS Server running at https://${HOST}:${HTTPS_PORT}`);
    });
  } catch (error) {
    console.log('SSL certificates not found, skipping HTTPS server for development');
  }

  app.listen(PORT, HOST, () => {
    console.log(`HTTP Server running at http://${HOST}:${PORT}`);
  });
}
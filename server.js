require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const https = require('https');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const nodemailer = require('nodemailer');

const app = express();

const PORT = process.env.PORT || 3000;
const HTTPS_PORT = 3443;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const HOST = IS_PRODUCTION ? '0.0.0.0' : 'localhost';
const DATA_FILE = process.env.DATA_FILE || (IS_PRODUCTION ? '/data/data.json' : path.join(__dirname, 'data', 'data.json'));
const SESSION_DIR = process.env.SESSION_DIR || (IS_PRODUCTION ? '/data/sessions' : path.join(__dirname, 'data', 'sessions'));
const SESSION_SECRET = process.env.SESSION_SECRET || 'swagplan-dev-session-secret';
const PRIMARY_ADMIN_EMAIL = normalizeEmail(process.env.PRIMARY_ADMIN_EMAIL);
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || process.env.FB_APP_ID || '';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
const MAIL_SUPPRESS_SEND = process.env.MAIL_SUPPRESS_SEND === 'true';

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  store: new FileStore({
    path: SESSION_DIR,
    retries: 0
  }),
  name: 'swagplan.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

app.use(attachCurrentUser);

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') {
    return null;
  }

  const value = email.trim().toLowerCase();
  return value || null;
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function addAuthProvider(user, provider) {
  if (!Array.isArray(user.authProviders)) {
    user.authProviders = [];
  }

  if (!user.authProviders.includes(provider)) {
    user.authProviders.push(provider);
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generatePasswordResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashToken(token)
  };
}

function getEmailConfig() {
  return {
    fromEmail: process.env.GMAIL_EMAIL || 'noreply@localhost',
    fromName: 'SwagPlan',
    password: process.env.GMAIL_PASSWORD,
    host: 'smtp.gmail.com',
    port: 587
  };
}

function createMailTransporter() {
  const emailConfig = getEmailConfig();

  if (MAIL_SUPPRESS_SEND) {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  if (!process.env.GMAIL_EMAIL || !emailConfig.password) {
    return null;
  }

  return nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    secure: false,
    auth: {
      user: emailConfig.fromEmail,
      pass: emailConfig.password
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

function getAppBaseUrl(req) {
  return PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

async function sendPasswordResetEmail(req, user, token) {
  const transporter = createMailTransporter();
  const emailConfig = getEmailConfig();

  if (!transporter) {
    throw new Error('Password reset email is not configured');
  }

  const resetLink = `${getAppBaseUrl(req)}/forgot-password.html?token=${encodeURIComponent(token)}`;
  const mailOptions = {
    from: `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`,
    to: user.email,
    subject: 'Reset your SwagPlan password',
    text: `Hello ${user.name},

We received a request to reset your SwagPlan password.

Use this link to choose a new password:
${resetLink}

This link expires in 1 hour. If you did not request this, you can ignore this email.

Best regards,
SwagPlan`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2c3e50;">Reset your SwagPlan password</h2>
        <p>Hello ${user.name},</p>
        <p>We received a request to reset your SwagPlan password.</p>
        <p style="margin: 24px 0;">
          <a href="${resetLink}" style="display: inline-block; background: #3498db; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 8px;">Choose a new password</a>
        </p>
        <p>If the button does not work, paste this link into your browser:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #7f8c8d; font-size: 12px;">Sent by SwagPlan</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);

  if (MAIL_SUPPRESS_SEND) {
    console.log(`MAIL_SUPPRESS_SEND password reset link for ${user.email}: ${resetLink}`);
  }
}

function applyAdminBootstrap(user) {
  if (PRIMARY_ADMIN_EMAIL && normalizeEmail(user.email) === PRIMARY_ADMIN_EMAIL) {
    user.isAdmin = true;
    user.status = 'approved';
  }
}

function migrateUser(user) {
  const migratedUser = { ...user };
  let changed = false;

  if (typeof migratedUser.id !== 'string') {
    migratedUser.id = String(migratedUser.id || generateId());
    changed = true;
  }

  if (typeof migratedUser.name !== 'string' || !migratedUser.name.trim()) {
    migratedUser.name = 'Unnamed user';
    changed = true;
  }

  const normalizedEmail = normalizeEmail(migratedUser.email);
  if ((migratedUser.email || null) !== normalizedEmail) {
    migratedUser.email = normalizedEmail;
    changed = true;
  }

  if (!Array.isArray(migratedUser.authProviders)) {
    migratedUser.authProviders = [];
    changed = true;
  }

  if (migratedUser.facebookId && !migratedUser.authProviders.includes('facebook')) {
    migratedUser.authProviders.push('facebook');
    changed = true;
  }

  if (migratedUser.passwordHash && !migratedUser.authProviders.includes('local')) {
    migratedUser.authProviders.push('local');
    changed = true;
  }

  if (!migratedUser.status) {
    migratedUser.status = 'approved';
    changed = true;
  }

  if (typeof migratedUser.isAdmin !== 'boolean') {
    migratedUser.isAdmin = false;
    changed = true;
  }

  if (!migratedUser.createdAt) {
    migratedUser.createdAt = new Date().toISOString();
    changed = true;
  }

  if (!migratedUser.updatedAt) {
    migratedUser.updatedAt = migratedUser.createdAt;
    changed = true;
  }

  if (!Object.prototype.hasOwnProperty.call(migratedUser, 'lastLoginAt')) {
    migratedUser.lastLoginAt = null;
    changed = true;
  }

  if (!Object.prototype.hasOwnProperty.call(migratedUser, 'passwordReset')) {
    migratedUser.passwordReset = null;
    changed = true;
  }

  const previousIsAdmin = migratedUser.isAdmin;
  const previousStatus = migratedUser.status;
  applyAdminBootstrap(migratedUser);

  if (previousIsAdmin !== migratedUser.isAdmin || previousStatus !== migratedUser.status) {
    changed = true;
  }

  return { user: migratedUser, changed };
}

function migrateData(data) {
  const nextData = {
    activities: Array.isArray(data.activities) ? data.activities : [],
    users: Array.isArray(data.users) ? data.users : []
  };

  let changed = !Array.isArray(data.activities) || !Array.isArray(data.users);
  nextData.users = nextData.users.map((user) => {
    const result = migrateUser(user);
    changed = changed || result.changed;
    return result.user;
  });

  return { data: nextData, changed };
}

function writeData(data) {
  try {
    ensureDirectoryExists(path.dirname(DATA_FILE));
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`Data written to ${DATA_FILE}`);
  } catch (error) {
    console.error('Error writing data file:', error);
  }
}

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const migrated = migrateData(parsed);

    if (migrated.changed) {
      writeData(migrated.data);
    }

    return migrated.data;
  } catch (error) {
    console.log('Data file not found or unreadable, creating default data structure');
    const defaultData = { activities: [], users: [] };
    writeData(defaultData);
    return defaultData;
  }
}

function findUserById(data, userId) {
  return data.users.find((user) => user.id === userId);
}

function findUserByEmail(data, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  return data.users.find((user) => normalizeEmail(user.email) === normalizedEmail);
}

function findUserByFacebookId(data, facebookId) {
  if (!facebookId) {
    return null;
  }

  return data.users.find((user) => user.facebookId === facebookId);
}

function sanitizeUser(user, options = {}) {
  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email || null,
    isAdmin: Boolean(user.isAdmin),
    status: user.status,
    authProviders: Array.isArray(user.authProviders) ? user.authProviders : []
  };

  if (options.adminView) {
    safeUser.facebookId = user.facebookId || null;
    safeUser.createdAt = user.createdAt || null;
    safeUser.updatedAt = user.updatedAt || null;
    safeUser.lastLoginAt = user.lastLoginAt || null;
  }

  return safeUser;
}

function createSession(req, user, provider) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((sessionError) => {
      if (sessionError) {
        reject(sessionError);
        return;
      }

      req.session.userId = user.id;
      req.session.provider = provider;

      req.session.save((saveError) => {
        if (saveError) {
          reject(saveError);
          return;
        }

        resolve();
      });
    });
  });
}

function destroySession(req) {
  return new Promise((resolve) => {
    if (!req.session) {
      resolve();
      return;
    }

    req.session.destroy(() => {
      resolve();
    });
  });
}

function attachCurrentUser(req, res, next) {
  if (!req.session || !req.session.userId) {
    next();
    return;
  }

  const data = readData();
  const user = findUserById(data, req.session.userId);

  if (!user || user.status === 'disabled') {
    destroySession(req).then(() => next());
    return;
  }

  req.user = user;
  next();
}

function requireAuthenticated(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  next();
}

function requireApprovedUser(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.status !== 'approved') {
    res.status(403).json({ error: 'Account approval required', status: req.user.status });
    return;
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!req.user.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

function canManageActivity(user, activity) {
  return Boolean(user && (user.isAdmin || activity.responsible === user.id));
}

function updateUserTimestamps(user) {
  user.updatedAt = new Date().toISOString();
}

function sendJsonError(res, statusCode, error, extra = {}) {
  res.status(statusCode).json({ error, ...extra });
}

function fetchFacebookProfile(accessToken) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://graph.facebook.com/me');
    url.searchParams.set('fields', 'id,name,email');
    url.searchParams.set('access_token', accessToken);

    https.get(url, (response) => {
      let body = '';

      response.on('data', (chunk) => {
        body += chunk;
      });

      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);

          if (response.statusCode !== 200 || parsed.error) {
            reject(new Error(parsed.error?.message || 'Facebook token validation failed'));
            return;
          }

          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

app.get('/api/auth/me', (req, res) => {
  res.json({
    user: req.user ? sanitizeUser(req.user) : null,
    facebookEnabled: Boolean(FACEBOOK_APP_ID)
  });
});

app.post('/api/auth/signup', async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!name) {
    sendJsonError(res, 400, 'Name is required');
    return;
  }

  if (!isValidEmail(email)) {
    sendJsonError(res, 400, 'A valid email is required');
    return;
  }

  if (password.length < 8) {
    sendJsonError(res, 400, 'Password must be at least 8 characters long');
    return;
  }

  const data = readData();
  const existingUser = findUserByEmail(data, email);

  if (existingUser && Array.isArray(existingUser.authProviders) && existingUser.authProviders.includes('local')) {
    sendJsonError(res, 409, 'An account with that email already has local login enabled');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const timestamp = new Date().toISOString();
  let user = existingUser;

  if (user) {
    user.passwordHash = passwordHash;
    user.name = user.name || name;
    user.email = email;
    addAuthProvider(user, 'local');
    updateUserTimestamps(user);
    applyAdminBootstrap(user);
  } else {
    user = {
      id: generateId(),
      name,
      email,
      facebookId: null,
      passwordHash,
      authProviders: ['local'],
      status: 'pending',
      isAdmin: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastLoginAt: null
    };
    applyAdminBootstrap(user);
    data.users.push(user);
  }

  writeData(data);

  res.status(existingUser ? 200 : 201).json({
    message: user.status === 'approved'
      ? 'Local login enabled. Your account is ready to use.'
      : 'Signup request received. An admin must approve your account before you can log in.',
    user: sanitizeUser(user)
  });
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!isValidEmail(email) || !password) {
    sendJsonError(res, 400, 'Email and password are required');
    return;
  }

  const data = readData();
  const user = findUserByEmail(data, email);

  if (!user || !user.passwordHash || !user.authProviders.includes('local')) {
    sendJsonError(res, 401, 'Invalid email or password');
    return;
  }

  const previousStatus = user.status;
  const previousAdminState = user.isAdmin;
  applyAdminBootstrap(user);

  if (user.status !== previousStatus || user.isAdmin !== previousAdminState) {
    updateUserTimestamps(user);
    writeData(data);
  }

  if (user.status === 'pending') {
    sendJsonError(res, 403, 'Your account is waiting for admin approval', { status: 'pending' });
    return;
  }

  if (user.status === 'disabled') {
    sendJsonError(res, 403, 'Your account has been disabled', { status: 'disabled' });
    return;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    sendJsonError(res, 401, 'Invalid email or password');
    return;
  }

  user.lastLoginAt = new Date().toISOString();
  updateUserTimestamps(user);
  writeData(data);

  await createSession(req, user, 'local');
  res.json({ user: sanitizeUser(user) });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!isValidEmail(email)) {
    sendJsonError(res, 400, 'A valid email is required');
    return;
  }

  const data = readData();
  const user = findUserByEmail(data, email);

  if (!user || !user.passwordHash || !user.authProviders.includes('local') || user.status === 'disabled') {
    res.json({
      message: 'If that email is registered, a password reset link has been sent.'
    });
    return;
  }

  try {
    const resetToken = generatePasswordResetToken();
    user.passwordReset = {
      tokenHash: resetToken.tokenHash,
      expiresAt: new Date(Date.now() + (60 * 60 * 1000)).toISOString()
    };
    updateUserTimestamps(user);
    writeData(data);

    await sendPasswordResetEmail(req, user, resetToken.token);
    res.json({
      message: 'If that email is registered, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    sendJsonError(res, 500, 'Password reset email could not be sent');
  }
});

app.get('/api/auth/reset-password/validate', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    sendJsonError(res, 400, 'Reset token is required');
    return;
  }

  const data = readData();
  const tokenHash = hashToken(token);
  const user = data.users.find((entry) =>
    entry.passwordReset &&
    entry.passwordReset.tokenHash === tokenHash &&
    new Date(entry.passwordReset.expiresAt).getTime() > Date.now()
  );

  if (!user) {
    sendJsonError(res, 400, 'This password reset link is invalid or has expired');
    return;
  }

  res.json({ valid: true });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!token) {
    sendJsonError(res, 400, 'Reset token is required');
    return;
  }

  if (password.length < 8) {
    sendJsonError(res, 400, 'Password must be at least 8 characters long');
    return;
  }

  const data = readData();
  const tokenHash = hashToken(token);
  const user = data.users.find((entry) =>
    entry.passwordReset &&
    entry.passwordReset.tokenHash === tokenHash &&
    new Date(entry.passwordReset.expiresAt).getTime() > Date.now()
  );

  if (!user) {
    sendJsonError(res, 400, 'This password reset link is invalid or has expired');
    return;
  }

  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordReset = null;
  addAuthProvider(user, 'local');
  updateUserTimestamps(user);
  writeData(data);

  res.json({ message: 'Your password has been updated. You can now sign in.' });
});

app.post('/api/auth/facebook', async (req, res) => {
  const accessToken = typeof req.body.accessToken === 'string' ? req.body.accessToken : '';

  if (!accessToken) {
    sendJsonError(res, 400, 'Facebook access token is required');
    return;
  }

  try {
    const profile = await fetchFacebookProfile(accessToken);
    const email = normalizeEmail(profile.email);
    const data = readData();
    let user = findUserByFacebookId(data, profile.id);

    if (!user && email) {
      user = findUserByEmail(data, email);
    }

    if (user) {
      user.name = profile.name || user.name;
      user.facebookId = profile.id;
      if (email) {
        user.email = email;
      }
      addAuthProvider(user, 'facebook');
      user.status = user.status || 'approved';
      applyAdminBootstrap(user);
      user.lastLoginAt = new Date().toISOString();
      updateUserTimestamps(user);
    } else {
      user = {
        id: generateId(),
        name: profile.name || 'Facebook user',
        email,
        facebookId: profile.id,
        passwordHash: null,
        authProviders: ['facebook'],
        status: 'approved',
        isAdmin: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
      applyAdminBootstrap(user);
      data.users.push(user);
    }

    writeData(data);
    await createSession(req, user, 'facebook');
    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error('Facebook authentication failed:', error);
    sendJsonError(res, 401, 'Facebook authentication failed');
  }
});

app.post('/api/auth/logout', async (req, res) => {
  await destroySession(req);
  res.clearCookie('swagplan.sid');
  res.json({ success: true });
});

app.get('/api/activities', requireApprovedUser, (req, res) => {
  const data = readData();
  res.json(data.activities);
});

app.post('/api/activities', requireApprovedUser, (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const date = typeof req.body.date === 'string' ? req.body.date : '';
  const responsible = typeof req.body.responsible === 'string' ? req.body.responsible.trim() : '';
  const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';

  if (!title || !date) {
    sendJsonError(res, 400, 'Title and date are required');
    return;
  }

  const data = readData();
  const newActivity = {
    id: generateId(),
    title,
    date,
    responsible: responsible || null,
    notes,
    participants: [],
    status: 'planned'
  };

  data.activities.push(newActivity);
  writeData(data);
  res.status(201).json(newActivity);
});

app.post('/api/activities/bulk', requireApprovedUser, (req, res) => {
  const data = readData();
  const { startMonth } = req.body;

  if (!startMonth) {
    sendJsonError(res, 400, 'Start month is required');
    return;
  }

  const startDate = new Date(`${startMonth}-01`);
  const newActivities = [];

  for (let index = 0; index < 8; index += 1) {
    const activityDate = new Date(startDate);
    activityDate.setMonth(startDate.getMonth() + (index * 2));

    const monthName = activityDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const newActivity = {
      id: generateId(),
      title: `Loge Activity ${monthName}`,
      date: activityDate.toISOString().split('T')[0],
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

app.post('/api/activities/:id/signup', requireApprovedUser, (req, res) => {
  const data = readData();
  const activity = data.activities.find((entry) => entry.id === req.params.id);

  if (!activity) {
    sendJsonError(res, 404, 'Activity not found');
    return;
  }

  if (!activity.participants.includes(req.user.id)) {
    activity.participants.push(req.user.id);
  }

  if (!activity.responsible) {
    activity.responsible = req.user.id;
  }

  writeData(data);
  res.json(activity);
});

app.post('/api/activities/:id/leave', requireApprovedUser, (req, res) => {
  const data = readData();
  const activity = data.activities.find((entry) => entry.id === req.params.id);

  if (!activity) {
    sendJsonError(res, 404, 'Activity not found');
    return;
  }

  activity.participants = activity.participants.filter((participantId) => participantId !== req.user.id);

  if (activity.responsible === req.user.id) {
    activity.responsible = activity.participants.length > 0 ? activity.participants[0] : null;
  }

  writeData(data);
  res.json(activity);
});

app.post('/api/activities/:id/mark-held', requireApprovedUser, (req, res) => {
  const data = readData();
  const activity = data.activities.find((entry) => entry.id === req.params.id);

  if (!activity) {
    sendJsonError(res, 404, 'Activity not found');
    return;
  }

  if (!canManageActivity(req.user, activity)) {
    sendJsonError(res, 403, 'You are not allowed to update this activity');
    return;
  }

  if (activity.status !== 'planned') {
    sendJsonError(res, 400, 'Activity is already completed and cannot be changed back');
    return;
  }

  activity.status = 'held';
  writeData(data);
  res.json(activity);
});

app.post('/api/activities/:id/mark-skipped', requireApprovedUser, (req, res) => {
  const data = readData();
  const activity = data.activities.find((entry) => entry.id === req.params.id);

  if (!activity) {
    sendJsonError(res, 404, 'Activity not found');
    return;
  }

  if (!canManageActivity(req.user, activity)) {
    sendJsonError(res, 403, 'You are not allowed to update this activity');
    return;
  }

  if (activity.status !== 'planned') {
    sendJsonError(res, 400, 'Activity is already completed and cannot be changed back');
    return;
  }

  activity.status = 'skipped';
  writeData(data);
  res.json(activity);
});

app.post('/api/activities/:id/mark-planned', requireApprovedUser, (req, res) => {
  const data = readData();
  const activity = data.activities.find((entry) => entry.id === req.params.id);

  if (!activity) {
    sendJsonError(res, 404, 'Activity not found');
    return;
  }

  if (!canManageActivity(req.user, activity)) {
    sendJsonError(res, 403, 'You are not allowed to update this activity');
    return;
  }

  if (activity.status !== 'held' && activity.status !== 'skipped') {
    sendJsonError(res, 400, 'Activity is already planned');
    return;
  }

  activity.status = 'planned';
  writeData(data);
  res.json(activity);
});

app.delete('/api/activities/:id', requireAdmin, (req, res) => {
  const data = readData();
  const activityIndex = data.activities.findIndex((entry) => entry.id === req.params.id);

  if (activityIndex === -1) {
    sendJsonError(res, 404, 'Activity not found');
    return;
  }

  data.activities.splice(activityIndex, 1);
  writeData(data);
  res.json({ success: true });
});

app.get('/api/users', requireApprovedUser, (req, res) => {
  const data = readData();
  const approvedUsers = data.users
    .filter((user) => user.status === 'approved')
    .map((user) => sanitizeUser(user));

  res.json(approvedUsers);
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const data = readData();
  res.json(data.users.map((user) => sanitizeUser(user, { adminView: true })));
});

app.get('/api/admin/users/pending', requireAdmin, (req, res) => {
  const data = readData();
  res.json(data.users
    .filter((user) => user.status === 'pending')
    .map((user) => sanitizeUser(user, { adminView: true })));
});

app.post('/api/admin/users/:id/approve', requireAdmin, (req, res) => {
  const data = readData();
  const user = findUserById(data, req.params.id);

  if (!user) {
    sendJsonError(res, 404, 'User not found');
    return;
  }

  user.status = 'approved';
  updateUserTimestamps(user);
  writeData(data);
  res.json(sanitizeUser(user, { adminView: true }));
});

app.post('/api/admin/users/:id/disable', requireAdmin, (req, res) => {
  const data = readData();
  const user = findUserById(data, req.params.id);

  if (!user) {
    sendJsonError(res, 404, 'User not found');
    return;
  }

  user.status = 'disabled';
  updateUserTimestamps(user);
  writeData(data);
  res.json(sanitizeUser(user, { adminView: true }));
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (email && !isValidEmail(email)) {
    sendJsonError(res, 400, 'Please provide a valid email address');
    return;
  }

  const data = readData();
  const user = findUserById(data, req.params.id);

  if (!user) {
    sendJsonError(res, 404, 'User not found');
    return;
  }

  const conflictingUser = email ? findUserByEmail(data, email) : null;
  if (conflictingUser && conflictingUser.id !== user.id) {
    sendJsonError(res, 409, 'That email address is already in use');
    return;
  }

  user.email = email;
  applyAdminBootstrap(user);
  updateUserTimestamps(user);
  writeData(data);
  res.json(sanitizeUser(user, { adminView: true }));
});

app.get('/api/data/download', requireAdmin, (req, res) => {
  try {
    const data = readData();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `data-backup-${timestamp}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(data);
  } catch (error) {
    console.error('Error downloading data:', error);
    sendJsonError(res, 500, 'Failed to download data');
  }
});

app.post('/api/send-reminders', async (req, res) => {
  try {
    const token = req.query.token || req.headers['x-reminder-token'];
    const expectedToken = process.env.REMINDER_TOKEN;

    if (token !== expectedToken) {
      sendJsonError(res, 401, 'Unauthorized');
      return;
    }

    console.log('📤 Manual reminder endpoint called');
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
    process.env.REMINDER_DEBUG = 'true';

    const { sendReminders } = require('./lib/reminders');
    const result = await sendReminders();

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

app.post('/api/test-email', async (req, res) => {
  try {
    const token = req.query.token || req.headers['x-reminder-token'];
    const expectedToken = process.env.REMINDER_TOKEN;

    if (token !== expectedToken) {
      sendJsonError(res, 401, 'Unauthorized');
      return;
    }

    console.log('🧪 Email test endpoint called');

    const nodemailer = require('nodemailer');
    const EMAIL_CONFIG = {
      fromEmail: process.env.GMAIL_EMAIL,
      fromName: 'SwagPlan',
      password: process.env.GMAIL_PASSWORD,
      host: 'smtp.gmail.com',
      port: 587
    };

    if (!EMAIL_CONFIG.fromEmail || !EMAIL_CONFIG.password) {
      res.status(500).json({
        success: false,
        error: 'Missing email configuration',
        message: 'GMAIL_EMAIL or GMAIL_PASSWORD environment variables not set'
      });
      return;
    }

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

console.log(`Using data file: ${DATA_FILE}`);
console.log(`Using session directory: ${SESSION_DIR}`);

ensureDirectoryExists(path.dirname(DATA_FILE));
ensureDirectoryExists(SESSION_DIR);
readData();

if (IS_PRODUCTION) {
  app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
    console.log(`Data persistence: ${DATA_FILE}`);
  });
} else {
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

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = 3000;
const HTTPS_PORT = 3443;
const DATA_FILE = 'data.json';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

function readData() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { activities: [], users: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
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
    facebookId: req.body.facebookId
  };
  data.users.push(newUser);
  writeData(data);
  res.json(newUser);
});

// SSL certificate options
const sslOptions = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

// Start HTTPS server
https.createServer(sslOptions, app).listen(HTTPS_PORT, () => {
  console.log(`HTTPS Server running at https://localhost:${HTTPS_PORT}`);
});

// Optional: Start HTTP server that redirects to HTTPS
app.listen(PORT, () => {
  console.log(`HTTP Server running at http://localhost:${PORT} (redirects to HTTPS)`);
});
# Loge Planner - Activity Planning System

A simple activity planning system for friend groups with Facebook authentication.

## Features

- **Activity Overview**: View upcoming activities (1 per 2 months)
- **Responsibility Tracking**: See who's responsible for each activity
- **Sign Up/Leave**: Join or leave activities easily
- **Activity Scheduling**: Create new activities
- **Facebook Login**: Secure authentication via Facebook

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Facebook App Setup**
   - Go to [Facebook Developers](https://developers.facebook.com/)
   - Create a new app
   - Get your App ID
   - Replace `YOUR_FACEBOOK_APP_ID` in `public/app.js` with your actual App ID

3. **Run the Application**
   ```bash
   npm start
   ```
   
   The app will be available at `http://localhost:3000`

## Data Storage

- Data is stored in `data.json` file
- Simple JSON structure with activities and users
- Automatically created when first user registers

## Usage

1. **Login**: Click "Login with Facebook" to authenticate
2. **View Activities**: See all upcoming activities on the main page
3. **Join Activity**: Click "Join Activity" to participate
4. **Leave Activity**: Click "Leave Activity" to withdraw
5. **Create Activity**: Fill out the form at the bottom to schedule new activities

## API Endpoints

- `GET /api/activities` - Get all activities
- `POST /api/activities` - Create new activity
- `POST /api/activities/:id/signup` - Join an activity
- `POST /api/activities/:id/leave` - Leave an activity
- `GET /api/users` - Get all users
- `POST /api/users` - Register/login user

## File Structure

```
LogePlanner/
├── server.js          # Express backend
├── data.json          # Data storage
├── package.json       # Dependencies
├── public/
│   ├── index.html     # Main HTML page
│   ├── style.css      # Styling
│   └── app.js         # Frontend JavaScript
└── README.md          # This file
```
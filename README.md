# Loge Planner - Activity Planning System

A simple activity planning system for friend groups with Facebook and local email/password authentication.

## Features

- **Activity Overview**: View upcoming activities (1 per 2 months)
- **Responsibility Tracking**: See who's responsible for each activity
- **Sign Up/Leave**: Join or leave activities easily
- **Activity Scheduling**: Create new activities
- **Facebook Login**: Secure authentication via Facebook
- **Local Login**: Email/password accounts with admin approval
- **Admin User Management**: Approve pending users and disable access

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Facebook App Setup**
   - Go to [Facebook Developers](https://developers.facebook.com/)
   - Create a new app
   - Get your App ID

3. **Environment Variables**
   - `SESSION_SECRET` - Secret used to sign the auth cookie
   - `PRIMARY_ADMIN_EMAIL` - Email that should become the initial admin
   - `FACEBOOK_APP_ID` - Optional app id reference for deployment
   - `PUBLIC_BASE_URL` - Optional public app URL used in password reset emails, for example `https://swagplan.fly.dev`
   - `DATA_FILE` - Optional override for the JSON data file path
   - `SESSION_DIR` - Optional override for the session-file directory
   - In production on Fly.io, keep `DATA_FILE` and `SESSION_DIR` on the mounted volume (defaults already point to `/data`)

4. **Run the Application**
   ```bash
   npm start
   ```
   
   The app will be available at `http://localhost:3000`

## Data Storage

- Data is stored in a JSON file
- Session data is stored in a file-backed session directory
- Both are persisted on Fly.io by using the mounted `/data` volume in production

## Usage

1. **Login**: Sign in with Facebook or use an approved local email/password account
2. **Request Account**: Submit a local account request if you do not want to use Facebook
3. **Admin Approval**: An admin approves local account requests from the user management page
4. **View Activities**: See all upcoming activities on the main page
5. **Join Activity**: Click "Join Activity" to participate
6. **Leave Activity**: Click "Leave Activity" to withdraw
7. **Create Activity**: Fill out the form at the bottom to schedule new activities

## API Endpoints

- `GET /api/auth/me` - Get the current authenticated session user
- `POST /api/auth/signup` - Request or add a local login
- `POST /api/auth/login` - Log in with email/password
- `POST /api/auth/logout` - End the current session
- `POST /api/auth/facebook` - Log in with a Facebook access token
- `POST /api/auth/forgot-password` - Send a password reset link
- `GET /api/auth/reset-password/validate` - Validate a reset link
- `POST /api/auth/reset-password` - Set a new password from a reset link
- `GET /api/activities` - Get all activities
- `POST /api/activities` - Create new activity
- `POST /api/activities/:id/signup` - Join an activity
- `POST /api/activities/:id/leave` - Leave an activity
- `GET /api/users` - Get all users
- `GET /api/admin/users` - Get all users for admin management
- `GET /api/admin/users/pending` - Get pending local account requests
- `POST /api/admin/users/:id/approve` - Approve or re-enable a user
- `POST /api/admin/users/:id/disable` - Disable a user
- `PUT /api/users/:id` - Update a user email as admin

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

# Tempo — AI Day Planner

A beautiful, AI-powered day planner that understands natural language. Just type tasks the way you think, and Tempo will automatically parse the time, date, category, and create a professional task entry.

![Tempo Screenshot](https://via.placeholder.com/800x450?text=Tempo+Day+Planner)

## Features

- 🤖 **AI-Powered Task Parsing** — Type "meeting with John tomorrow at 2pm" and Tempo understands it
- 📅 **Smart Scheduling** — Automatic time and duration estimation
- 🏷️ **Auto-Categorization** — Tasks are automatically organized into categories
- 🔐 **Google Sign-In** — Secure authentication with your Google account
- 📱 **Responsive Design** — Works on desktop and mobile
- 🌙 **Beautiful Dark Theme** — Easy on the eyes

## Tech Stack

- **Backend**: Flask, SQLAlchemy
- **Database**: PostgreSQL (production) / SQLite (development)
- **AI**: Google Gemini API (free tier)
- **Auth**: Google OAuth 2.0
- **Frontend**: Vanilla JS, CSS3

## Setup Instructions

### 1. Get API Keys

#### Google Gemini API (Free)
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key

#### Google OAuth Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Go to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Select **Web application**
6. Add authorized redirect URIs:
   - For local: `http://localhost:5000/login/google/callback`
   - For production: `https://your-domain.com/login/google/callback`
7. Copy the Client ID and Client Secret

### 2. Local Development

```bash
# Clone the repo
git clone https://github.com/yourusername/day-planner.git
cd day-planner

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables (create a .env file)
export SECRET_KEY=your-secret-key-here
export GEMINI_API_KEY=your-gemini-api-key
export GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
export GOOGLE_CLIENT_SECRET=your-client-secret
export DATABASE_URL=sqlite:///planner.db
export APP_URL=http://localhost:5000

# Run the app
python app.py
```

### 3. Deploy to Render.com (Recommended, Free)

1. Push your code to GitHub
2. Go to [Render.com](https://render.com) and create an account
3. Click **New** > **Web Service**
4. Connect your GitHub repo
5. Configure:
   - **Name**: tempo-planner
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
6. Add Environment Variables:
   - `SECRET_KEY`: Generate a random string
   - `GEMINI_API_KEY`: Your Gemini API key
   - `GOOGLE_CLIENT_ID`: Your OAuth client ID
   - `GOOGLE_CLIENT_SECRET`: Your OAuth secret
   - `APP_URL`: Your Render URL (e.g., https://tempo-planner.onrender.com)
7. Add a PostgreSQL database:
   - Click **New** > **PostgreSQL**
   - Connect it to your web service (it will auto-set `DATABASE_URL`)
8. Update Google OAuth redirect URI to include your Render URL

### 4. Deploy to Railway.app (Alternative)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add PostgreSQL
railway add

# Set environment variables
railway variables set SECRET_KEY=your-secret-key
railway variables set GEMINI_API_KEY=your-gemini-key
# ... add other variables

# Deploy
railway up
```

### 5. Deploy to Heroku

```bash
# Login to Heroku
heroku login

# Create app
heroku create tempo-planner

# Add PostgreSQL
heroku addons:create heroku-postgresql:mini

# Set environment variables
heroku config:set SECRET_KEY=your-secret-key
heroku config:set GEMINI_API_KEY=your-gemini-key
heroku config:set GOOGLE_CLIENT_ID=your-client-id
heroku config:set GOOGLE_CLIENT_SECRET=your-secret
heroku config:set APP_URL=https://tempo-planner.herokuapp.com

# Deploy
git push heroku main
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SECRET_KEY` | Flask secret key for sessions | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes (for production) |
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Yes |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Yes |
| `APP_URL` | Your app's public URL | Yes |

## AI Task Parsing Examples

| You type | Tempo creates |
|----------|---------------|
| "call mom tomorrow at 3pm" | 📞 Social task at 3:00 PM tomorrow |
| "gym at 7am for 1 hour" | 🏃 Health task at 7:00 AM, 1hr duration |
| "pay electric bill" | 💰 Finance task, medium priority |
| "amazon returns at 10am" | 🛒 Errands task at 10:00 AM |
| "meeting with team friday 2pm" | 💼 Work task on Friday at 2:00 PM |

## License

MIT License - feel free to use this for personal or commercial projects.

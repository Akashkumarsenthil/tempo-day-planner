from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from datetime import datetime, date, timedelta
from config import Config
import json
import re
import os

app = Flask(__name__)
app.config.from_object(Config)

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# Check if we're in dev mode (no OAuth required)
DEV_MODE = not app.config.get('GOOGLE_CLIENT_ID') or app.config.get('FLASK_ENV') == 'development'

# Only setup OAuth if credentials are provided
if app.config.get('GOOGLE_CLIENT_ID') and app.config.get('GOOGLE_CLIENT_SECRET'):
    try:
        from authlib.integrations.flask_client import OAuth
        oauth = OAuth(app)
        google = oauth.register(
            name='google',
            client_id=app.config['GOOGLE_CLIENT_ID'],
            client_secret=app.config['GOOGLE_CLIENT_SECRET'],
            server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
            client_kwargs={'scope': 'openid email profile'}
        )
        OAUTH_ENABLED = True
    except Exception as e:
        print(f"OAuth setup failed: {e}")
        OAUTH_ENABLED = False
else:
    OAUTH_ENABLED = False
    google = None

# Setup Gemini if API key is provided
GEMINI_ENABLED = False
if app.config.get('GEMINI_API_KEY'):
    try:
        import google.generativeai as genai
        genai.configure(api_key=app.config['GEMINI_API_KEY'])
        GEMINI_ENABLED = True
    except Exception as e:
        print(f"Gemini setup failed: {e}")

# Task categories
CATEGORIES = {
    'work': {'label': 'Work', 'color': '#6366f1', 'icon': '💼'},
    'personal': {'label': 'Personal', 'color': '#ec4899', 'icon': '👤'},
    'health': {'label': 'Health & Fitness', 'color': '#10b981', 'icon': '🏃'},
    'errands': {'label': 'Errands', 'color': '#f59e0b', 'icon': '🛒'},
    'finance': {'label': 'Finance', 'color': '#06b6d4', 'icon': '💰'},
    'social': {'label': 'Social', 'color': '#8b5cf6', 'icon': '👥'},
    'learning': {'label': 'Learning', 'color': '#f43f5e', 'icon': '📚'},
    'home': {'label': 'Home', 'color': '#84cc16', 'icon': '🏠'},
    'other': {'label': 'Other', 'color': '#71717a', 'icon': '📌'}
}


# ===== Models =====
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    google_id = db.Column(db.String(100), unique=True, nullable=True)
    email = db.Column(db.String(100), unique=True, nullable=False)
    name = db.Column(db.String(100))
    picture = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    tasks = db.relationship('Task', backref='user', lazy=True, cascade='all, delete-orphan')


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    date = db.Column(db.Date, nullable=False, default=date.today)
    time_slot = db.Column(db.String(20), nullable=True)
    duration = db.Column(db.Integer, default=60)
    completed = db.Column(db.Boolean, default=False)
    priority = db.Column(db.String(20), default='medium')
    color = db.Column(db.String(20), default='#6366f1')
    category = db.Column(db.String(50), default='other')
    original_input = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        cat_info = CATEGORIES.get(self.category, CATEGORIES['other'])
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'date': self.date.isoformat(),
            'time_slot': self.time_slot,
            'duration': self.duration,
            'completed': self.completed,
            'priority': self.priority,
            'color': cat_info['color'],
            'category': self.category,
            'category_label': cat_info['label'],
            'category_icon': cat_info['icon']
        }


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# ===== AI Functions =====
def parse_task_with_gemini(user_input, reference_date=None):
    """Use Google Gemini to parse natural language task input."""
    if not GEMINI_ENABLED:
        return fallback_parse(user_input, reference_date)
    
    if reference_date is None:
        reference_date = date.today()
    
    today_str = reference_date.strftime('%Y-%m-%d')
    tomorrow_str = (reference_date + timedelta(days=1)).strftime('%Y-%m-%d')
    day_of_week = reference_date.strftime('%A')
    
    # Calculate dates for day names
    days_ahead = {}
    for i in range(7):
        future_date = reference_date + timedelta(days=i)
        days_ahead[future_date.strftime('%A').lower()] = future_date.strftime('%Y-%m-%d')
    
    prompt = f"""You are a task parser. Extract task details from the user's input and return ONLY a JSON object.

Today: {today_str} ({day_of_week})
Tomorrow: {tomorrow_str}
This week's dates: {json.dumps(days_ahead)}

User input: "{user_input}"

Return a JSON object with:
- "title": Professional, clear task title (properly capitalized)
- "description": Brief helpful description (1-2 sentences) or empty string
- "date": YYYY-MM-DD format. Use {today_str} if not specified. Use the dates above for day names.
- "time_slot": Time in HH:MM 24-hour format (e.g., "14:30") or null if not specified
- "duration": Minutes (15, 30, 45, 60, 90, 120, 180). Estimate based on task type.
- "priority": "low", "medium", or "high"
- "category": One of: work, personal, health, errands, finance, social, learning, home, other

Category guide:
- work: job tasks, meetings, projects, emails, deadlines
- personal: self-care, hobbies, appointments
- health: gym, doctor, exercise, medicine, wellness
- errands: shopping, returns, pickups, deliveries, packages
- finance: bills, banking, taxes, payments
- social: calls, meetups, events with friends/family
- learning: study, courses, reading, practice
- home: cleaning, cooking, repairs, organizing
- other: anything else

Return ONLY valid JSON, no markdown or explanation:"""

    try:
        import google.generativeai as genai
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(prompt)
        result = response.text.strip()
        
        # Clean up response - extract JSON
        if '```' in result:
            result = re.sub(r'```json?\s*', '', result)
            result = re.sub(r'```\s*', '', result)
        
        json_match = re.search(r'\{[^{}]*\}', result, re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group())
            if 'title' in parsed:
                return parsed
    except Exception as e:
        print(f"Gemini API error: {e}")
    
    return fallback_parse(user_input, reference_date)


def fallback_parse(user_input, reference_date=None):
    """Smart parsing without AI - still extracts time, date, and categorizes."""
    if reference_date is None:
        reference_date = date.today()
    
    text = user_input.lower()
    title = user_input.strip()
    task_date = reference_date
    time_slot = None
    duration = 60
    priority = 'medium'
    category = 'other'
    
    # Extract time (e.g., "at 3pm", "at 14:30", "10am", "7:30pm")
    # Pattern 1: "at 3:30 pm" or "at 3:30pm" or "at 15:30"
    time_match = re.search(r'at\s+(\d{1,2}):(\d{2})\s*(am|pm)?', text, re.IGNORECASE)
    if not time_match:
        # Pattern 2: "at 3pm" or "at 3 pm"
        time_match = re.search(r'at\s+(\d{1,2})\s*(am|pm)', text, re.IGNORECASE)
    if not time_match:
        # Pattern 3: "3:30pm" or "3:30 pm" or "15:30"
        time_match = re.search(r'(\d{1,2}):(\d{2})\s*(am|pm)?', text, re.IGNORECASE)
    if not time_match:
        # Pattern 4: "3pm" or "3 pm"
        time_match = re.search(r'(\d{1,2})\s*(am|pm)', text, re.IGNORECASE)
    
    if time_match:
        groups = time_match.groups()
        hour = int(groups[0])
        
        # Check if second group is minutes (digits) or am/pm
        if len(groups) >= 2 and groups[1] and groups[1].isdigit():
            minute = int(groups[1])
            ampm = groups[2].lower() if len(groups) > 2 and groups[2] else None
        else:
            minute = 0
            ampm = groups[1].lower() if len(groups) > 1 and groups[1] else None
        
        # Convert to 24-hour format
        if ampm == 'pm' and hour < 12:
            hour += 12
        elif ampm == 'am' and hour == 12:
            hour = 0
        
        time_slot = f"{hour:02d}:{minute:02d}"
        # Remove time from title
        title = re.sub(time_match.group(0), '', title, flags=re.IGNORECASE).strip()
    
    # Extract date (tomorrow, day names)
    if 'tomorrow' in text:
        task_date = reference_date + timedelta(days=1)
        title = re.sub(r'\btomorrow\b', '', title, flags=re.IGNORECASE).strip()
    else:
        days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        for i, day in enumerate(days):
            if day in text:
                current_day = reference_date.weekday()
                days_ahead = (i - current_day) % 7
                if days_ahead == 0:
                    days_ahead = 7
                task_date = reference_date + timedelta(days=days_ahead)
                title = re.sub(rf'\b{day}\b', '', title, flags=re.IGNORECASE).strip()
                break
    
    # Extract duration
    duration_match = re.search(r'for\s+(\d+)\s*(hour|hr|min|minute)', text)
    if duration_match:
        num = int(duration_match.group(1))
        unit = duration_match.group(2)
        if 'hour' in unit or 'hr' in unit:
            duration = num * 60
        else:
            duration = num
        title = re.sub(r'for\s+\d+\s*(hour|hr|min|minute)s?', '', title, flags=re.IGNORECASE).strip()
    
    # Categorize based on keywords
    category_keywords = {
        'work': ['meeting', 'work', 'office', 'email', 'project', 'deadline', 'client', 'report'],
        'health': ['gym', 'workout', 'exercise', 'doctor', 'medicine', 'run', 'yoga', 'dentist'],
        'errands': ['buy', 'shop', 'return', 'pick up', 'pickup', 'drop off', 'amazon', 'store', 'grocery'],
        'finance': ['pay', 'bill', 'bank', 'tax', 'budget', 'invoice', 'rent', 'insurance'],
        'social': ['call', 'meet', 'lunch', 'dinner', 'party', 'friend', 'family', 'mom', 'dad'],
        'learning': ['study', 'learn', 'read', 'course', 'class', 'practice', 'tutorial'],
        'home': ['clean', 'cook', 'laundry', 'repair', 'organize', 'dishes', 'vacuum'],
        'personal': ['appointment', 'haircut', 'spa', 'self-care']
    }
    
    for cat, keywords in category_keywords.items():
        if any(kw in text for kw in keywords):
            category = cat
            break
    
    # Clean up title
    title = re.sub(r'\s+', ' ', title).strip()
    title = re.sub(r'^(at|for|on)\s+', '', title, flags=re.IGNORECASE).strip()
    if title:
        title = title[0].upper() + title[1:] if len(title) > 1 else title.upper()
    
    return {
        'title': title or user_input.strip().title(),
        'description': '',
        'date': task_date.strftime('%Y-%m-%d'),
        'time_slot': time_slot,
        'duration': duration,
        'priority': priority,
        'category': category
    }


# ===== Auth Routes =====
@app.route('/login')
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template('login.html', oauth_enabled=OAUTH_ENABLED, dev_mode=DEV_MODE)


@app.route('/login/demo')
def demo_login():
    """Quick login for development/demo without OAuth"""
    # Find or create demo user
    demo_user = User.query.filter_by(email='demo@tempo.app').first()
    if not demo_user:
        demo_user = User(
            email='demo@tempo.app',
            name='Demo User',
            google_id='demo-user-id'
        )
        db.session.add(demo_user)
        db.session.commit()
    
    login_user(demo_user)
    return redirect(url_for('index'))


@app.route('/login/google')
def google_login():
    if not OAUTH_ENABLED:
        return redirect(url_for('login'))
    redirect_uri = url_for('google_callback', _external=True)
    return google.authorize_redirect(redirect_uri)


@app.route('/login/google/callback')
def google_callback():
    if not OAUTH_ENABLED:
        return redirect(url_for('login'))
    
    try:
        token = google.authorize_access_token()
        user_info = token.get('userinfo')
        
        if user_info:
            user = User.query.filter_by(google_id=user_info['sub']).first()
            
            if not user:
                user = User(
                    google_id=user_info['sub'],
                    email=user_info['email'],
                    name=user_info.get('name', ''),
                    picture=user_info.get('picture', '')
                )
                db.session.add(user)
                db.session.commit()
            else:
                user.name = user_info.get('name', user.name)
                user.picture = user_info.get('picture', user.picture)
                db.session.commit()
            
            login_user(user)
            return redirect(url_for('index'))
    except Exception as e:
        print(f"OAuth error: {e}")
    
    return redirect(url_for('login'))


@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))


# ===== Main Routes =====
@app.route('/')
@login_required
def index():
    today = date.today()
    return render_template('index.html', 
                         current_date=today, 
                         categories=CATEGORIES, 
                         user=current_user,
                         gemini_enabled=GEMINI_ENABLED)


@app.route('/api/categories')
@login_required
def get_categories():
    return jsonify(CATEGORIES)


@app.route('/api/tasks', methods=['GET'])
@login_required
def get_tasks():
    date_str = request.args.get('date', date.today().isoformat())
    try:
        query_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        query_date = date.today()
    
    tasks = Task.query.filter_by(user_id=current_user.id, date=query_date).order_by(Task.time_slot).all()
    return jsonify([task.to_dict() for task in tasks])


@app.route('/api/tasks/parse', methods=['POST'])
@login_required
def parse_task():
    """Parse natural language input using AI or fallback."""
    data = request.json
    user_input = data.get('input', '')
    reference_date_str = data.get('reference_date')
    
    if reference_date_str:
        try:
            reference_date = datetime.strptime(reference_date_str, '%Y-%m-%d').date()
        except ValueError:
            reference_date = date.today()
    else:
        reference_date = date.today()
    
    if GEMINI_ENABLED:
        parsed = parse_task_with_gemini(user_input, reference_date)
    else:
        parsed = fallback_parse(user_input, reference_date)
    
    return jsonify(parsed)


@app.route('/api/tasks', methods=['POST'])
@login_required
def create_task():
    data = request.json
    
    task_date = date.today()
    if 'date' in data and data['date']:
        try:
            task_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
        except ValueError:
            pass
    
    category = data.get('category', 'other')
    cat_color = CATEGORIES.get(category, CATEGORIES['other'])['color']
    
    task = Task(
        user_id=current_user.id,
        title=data['title'],
        description=data.get('description', ''),
        date=task_date,
        time_slot=data.get('time_slot'),
        duration=data.get('duration', 60),
        priority=data.get('priority', 'medium'),
        color=cat_color,
        category=category,
        original_input=data.get('original_input', '')
    )
    db.session.add(task)
    db.session.commit()
    return jsonify(task.to_dict()), 201


@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
@login_required
def update_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=current_user.id).first_or_404()
    data = request.json
    
    task.title = data.get('title', task.title)
    task.description = data.get('description', task.description)
    task.time_slot = data.get('time_slot', task.time_slot)
    task.duration = data.get('duration', task.duration)
    task.completed = data.get('completed', task.completed)
    task.priority = data.get('priority', task.priority)
    task.category = data.get('category', task.category)
    
    cat_color = CATEGORIES.get(task.category, CATEGORIES['other'])['color']
    task.color = cat_color
    
    if 'date' in data:
        try:
            task.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
        except ValueError:
            pass
    
    db.session.commit()
    return jsonify(task.to_dict())


@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=current_user.id).first_or_404()
    db.session.delete(task)
    db.session.commit()
    return jsonify({'message': 'Task deleted'}), 200


@app.route('/api/tasks/<int:task_id>/toggle', methods=['POST'])
@login_required
def toggle_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=current_user.id).first_or_404()
    task.completed = not task.completed
    db.session.commit()
    return jsonify(task.to_dict())


# Create tables
with app.app_context():
    db.create_all()


if __name__ == '__main__':
    app.run(debug=True, port=5000)

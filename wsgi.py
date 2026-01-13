# WSGI entry point for PythonAnywhere
# This file is used by PythonAnywhere to run your Flask app

import sys
import os

# Add your project directory to the sys.path
project_home = os.path.dirname(os.path.abspath(__file__))
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Set environment variables (PythonAnywhere will use these)
# You can also set these in the PythonAnywhere web app configuration
os.environ.setdefault('FLASK_ENV', 'production')

from app import app as application

import os
import sys
import tempfile

os.environ.setdefault("UPLOAD_DIR", tempfile.mkdtemp(prefix="uploads_"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

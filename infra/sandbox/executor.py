"""
Python Code Execution Sandbox
HTTP server that receives Python code, executes it in a subprocess,
and returns stdout, stderr, and generated files (charts as base64).
"""
import os
import sys
import json
import time
import base64
import signal
import subprocess
import tempfile
import glob
from flask import Flask, request, jsonify

app = Flask(__name__)

TIMEOUT_DEFAULT = 30
TIMEOUT_MAX = 60
TMP_DIR = '/tmp/sandbox'

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/execute', methods=['POST'])
def execute():
    data = request.get_json()
    if not data or 'code' not in data:
        return jsonify({'error': 'Missing "code" field'}), 400

    code = data['code']
    timeout = min(data.get('timeout', TIMEOUT_DEFAULT), TIMEOUT_MAX)

    # Create a temporary directory for this execution
    exec_dir = tempfile.mkdtemp(dir=TMP_DIR)
    code_file = os.path.join(exec_dir, 'script.py')

    # Wrap user code to auto-save matplotlib figures
    wrapped_code = f'''
import os
import sys
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt

# Change to execution directory for file output
os.chdir("{exec_dir}")

# User code starts here
{code}

# Auto-save any open matplotlib figures
for i, fig_num in enumerate(plt.get_fignums()):
    fig = plt.figure(fig_num)
    fig.savefig(os.path.join("{exec_dir}", f"figure_{{i}}.png"), dpi=150, bbox_inches='tight')
    plt.close(fig)
'''

    try:
        # Write code to file
        with open(code_file, 'w') as f:
            f.write(wrapped_code)

        start_time = time.time()

        # Execute in subprocess
        result = subprocess.run(
            [sys.executable, code_file],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=exec_dir,
            env={
                **os.environ,
                'MPLCONFIGDIR': exec_dir,  # matplotlib config
            }
        )

        execution_time_ms = int((time.time() - start_time) * 1000)

        # Collect generated files (images)
        files = []
        for img_path in sorted(glob.glob(os.path.join(exec_dir, '*.png'))):
            with open(img_path, 'rb') as f:
                img_data = base64.b64encode(f.read()).decode('utf-8')
                files.append({
                    'name': os.path.basename(img_path),
                    'base64': img_data,
                    'mimeType': 'image/png',
                })

        return jsonify({
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returnCode': result.returncode,
            'files': files,
            'executionTimeMs': execution_time_ms,
        })

    except subprocess.TimeoutExpired:
        return jsonify({
            'stdout': '',
            'stderr': f'Execution timed out after {timeout} seconds',
            'returnCode': -1,
            'files': [],
            'executionTimeMs': timeout * 1000,
        })

    except Exception as e:
        return jsonify({
            'stdout': '',
            'stderr': str(e),
            'returnCode': -1,
            'files': [],
            'executionTimeMs': 0,
        }), 500

    finally:
        # Cleanup temp files
        import shutil
        try:
            shutil.rmtree(exec_dir, ignore_errors=True)
        except:
            pass

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=False)

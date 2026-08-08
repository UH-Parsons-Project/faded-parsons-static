import re

with open('js/task/task-set-overview.js', 'r') as f:
    content = f.read()

# Extract heatmap logic
heatmap_match = re.search(r'(// ─── Heatmap helpers ──.*?^}\n)', content, re.MULTILINE | re.DOTALL)
if heatmap_match:
    heatmap_code = heatmap_match.group(1)
    
    # We need to add imports to heatmap code
    imports = "import { escapeHtml, fetchJsonWithError } from '../utils/api-utils.js'; // Note: adjust as needed\n"
    # Wait, the prompt says "Import the extracted logic back into task-set-overview.js"
    # Actually let's just do this in the script properly.


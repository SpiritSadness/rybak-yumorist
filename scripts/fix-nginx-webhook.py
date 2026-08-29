#!/usr/bin/env python3
from pathlib import Path
import re

nginx = Path('/etc/nginx/sites-enabled/kadr')
text = nginx.read_text()
text = re.sub(r'\n?    location = /fishing-bot/webhook \{.*?\}\n', '\n', text, flags=re.S)
block = Path('/tmp/nginx-fishing-webhook.conf').read_text()
text = text.replace('    location = /drop {', block + '    location = /drop {', 1)
nginx.write_text(text)
print('nginx fixed')

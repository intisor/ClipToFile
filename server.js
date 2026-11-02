const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execFile } = require('child_process');

const PORT = process.env.PORT || 5050;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const CLIPS_FILE = path.join(DATA_DIR, 'clips.json');
const LOG_FILE = path.join(DATA_DIR, 'saved_clips.md');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure initial markdown log file exists
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(
    LOG_FILE,
    `# 📋 ClipAI Log File\n*Created on ${new Date().toLocaleString()}*\n\n---\n\n`,
    'utf8'
  );
}

// Load or initialize clips history
function getClips() {
  try {
    if (fs.existsSync(CLIPS_FILE)) {
      return JSON.parse(fs.readFileSync(CLIPS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading clips.json:', err.message);
  }
  return [];
}

function saveClips(clips) {
  try {
    fs.writeFileSync(CLIPS_FILE, JSON.stringify(clips, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving clips.json:', err.message);
  }
}

// Append clip to markdown file
function appendToMarkdown(content, metadata = {}) {
  const timestamp = new Date().toLocaleString();
  const title = metadata.title || 'Clip';
  const source = metadata.source || 'Clipboard';
  const tag = metadata.tag ? ` \`#${metadata.tag}\`` : '';

  const entry = `\n### [${title}] ${timestamp}${tag}\n*Source: ${source}*\n\n\`\`\`\n${content}\n\`\`\`\n\n---\n`;

  fs.appendFileSync(LOG_FILE, entry, 'utf8');
}

// Windows native clipboard helper
function getWindowsClipboard() {
  return new Promise((resolve) => {
    // Uses powershell to retrieve clipboard text safely
    exec(
      'powershell.exe -NoProfile -NonInteractive -Command "$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Clipboard"',
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          return resolve('');
        }
        resolve(stdout ? stdout.trim() : '');
      }
    );
  });
}

function setWindowsClipboard(text) {
  return new Promise((resolve, reject) => {
    const child = exec(
      'powershell.exe -NoProfile -NonInteractive -Command "$Input | Set-Clipboard"',
      { encoding: 'utf8' },
      (error) => {
        if (error) reject(error);
        else resolve(true);
      }
    );
    child.stdin.write(text, 'utf8');
    child.stdin.end();
  });
}

// Background Clipboard Watcher state
let isWatching = process.argv.includes('--watch');
let lastSeenClip = '';
let watchInterval = null;

function startWatching() {
  if (watchInterval) clearInterval(watchInterval);
  isWatching = true;
  console.log('👀 [Watcher] Background clipboard monitor active');

  watchInterval = setInterval(async () => {
    try {
      const current = await getWindowsClipboard();
      if (current && current.length > 0 && current !== lastSeenClip) {
        lastSeenClip = current;
        // Don't auto-save if it's identical to last clip in list
        const clips = getClips();
        if (clips.length === 0 || clips[0].content !== current) {
          const newClip = {
            id: 'clip_' + Date.now(),
            content: current,
            timestamp: new Date().toISOString(),
            source: 'Auto-Watcher',
            title: current.slice(0, 40).replace(/\n/g, ' ') + (current.length > 40 ? '...' : '')
          };
          clips.unshift(newClip);
          if (clips.length > 100) clips.pop();
          saveClips(clips);
          appendToMarkdown(current, { title: newClip.title, source: 'Auto-Watcher' });
          console.log(`📌 [Watcher] Captured new clip (${current.length} chars)`);
        }
      }
    } catch (err) {
      // ignore transient clipboard locks
    }
  }, 1500);
}

function stopWatching() {
  if (watchInterval) {
    clearInterval(watchInterval);
    watchInterval = null;
  }
  isWatching = false;
  console.log('🛑 [Watcher] Clipboard monitor stopped');
}

if (isWatching) {
  startWatching();
}

// MIME types table
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Helper to parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // Enable CORS for universal web access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gemini-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // API Endpoints
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // 1. Status
    if (pathname === '/api/status' && req.method === 'GET') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          status: 'ok',
          isWatching,
          logFilePath: LOG_FILE,
          platform: process.platform,
          hostname: os.hostname(),
          time: new Date().toISOString()
        })
      );
      return;
    }

    // 2. Get / Set Watcher
    if (pathname === '/api/watcher' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        if (body.enabled) startWatching();
        else stopWatching();
        res.writeHead(200);
        res.end(JSON.stringify({ isWatching }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 3. Read current Windows clipboard
    if (pathname === '/api/clipboard' && req.method === 'GET') {
      try {
        const text = await getWindowsClipboard();
        res.writeHead(200);
        res.end(JSON.stringify({ clipboard: text }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 4. Set Windows clipboard
    if (pathname === '/api/clipboard' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        if (!body.text && body.text !== '') {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Text required' }));
          return;
        }
        await setWindowsClipboard(body.text);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 5. Get saved clips
    if (pathname === '/api/clips' && req.method === 'GET') {
      const clips = getClips();
      res.writeHead(200);
      res.end(JSON.stringify({ clips }));
      return;
    }

    // 6. Save a new clip to file & history
    if (pathname === '/api/clips' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        if (!body.content) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Content is required' }));
          return;
        }

        const clips = getClips();
        const newClip = {
          id: 'clip_' + Date.now(),
          content: body.content,
          title: body.title || body.content.slice(0, 45).replace(/\n/g, ' ') + '...',
          source: body.source || 'Manual/Web',
          tag: body.tag || 'general',
          timestamp: new Date().toISOString()
        };

        clips.unshift(newClip);
        if (clips.length > 200) clips.pop();
        saveClips(clips);

        // Append to local markdown file
        appendToMarkdown(body.content, {
          title: newClip.title,
          source: newClip.source,
          tag: newClip.tag
        });

        res.writeHead(201);
        res.end(JSON.stringify({ success: true, clip: newClip, logFile: LOG_FILE }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 7. Delete clip
    if (pathname.startsWith('/api/clips/') && req.method === 'DELETE') {
      const id = pathname.replace('/api/clips/', '');
      let clips = getClips();
      clips = clips.filter((c) => c.id !== id);
      saveClips(clips);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // 8. Open log file in default OS editor
    if (pathname === '/api/open-log' && req.method === 'POST') {
      exec(`start "" "${LOG_FILE}"`);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, path: LOG_FILE }));
      return;
    }

    // 9. Read the entire markdown log file
    if (pathname === '/api/log' && req.method === 'GET') {
      const content = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '';
      res.writeHead(200);
      res.end(JSON.stringify({ path: LOG_FILE, content }));
      return;
    }

    // 10. Gemini AI Chat Proxy
    if (pathname === '/api/chat' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const apiKey =
          req.headers['x-gemini-key'] ||
          process.env.GEMINI_API_KEY ||
          body.apiKey;

        if (!apiKey) {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              error: 'Gemini API Key missing. Please provide it in settings or as an environment variable.'
            })
          );
          return;
        }

        const model = body.model || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // Prepare contents array
        let contents = [];
        if (body.messages && Array.isArray(body.messages)) {
          contents = body.messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }));
        } else if (body.prompt) {
          contents = [{ role: 'user', parts: [{ text: body.prompt }] }];
        }

        const systemInstruction = body.systemInstruction
          ? { parts: [{ text: body.systemInstruction }] }
          : undefined;

        const geminiRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4096
            }
          })
        });

        const data = await geminiRes.json();
        if (!geminiRes.ok) {
          res.writeHead(geminiRes.status);
          res.end(JSON.stringify({ error: data.error?.message || 'Gemini API Error' }));
          return;
        }

        const candidateText =
          data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';

        res.writeHead(200);
        res.end(JSON.stringify({ reply: candidateText }));
      } catch (err) {
        console.error('Chat error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 404 for unknown api
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
    return;
  }

  // Static files server
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, safePath);
  const ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexPath, (readErr, content) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('File not found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        }
      });
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// Get local IPv4 addresses for phone/remote access
function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

server.listen(PORT, '0.0.0.0', () => {
  const localIps = getLocalIps();
  console.log(`\n======================================================`);
  console.log(`🚀 ClipAI Worker & AI Chat Hub is Running!`);
  console.log(`======================================================`);
  console.log(`💻 Local PC Web UI:     http://localhost:${PORT}`);
  localIps.forEach((ip) => {
    console.log(`📱 Phone / Network UI:   http://${ip}:${PORT}`);
  });
  console.log(`📁 Auto-Save File:       ${LOG_FILE}`);
  console.log(`👀 Watcher Status:      ${isWatching ? 'ACTIVE (auto-capturing PC clipboard)' : 'Idle (toggle in UI or pass --watch)'}`);
  console.log(`======================================================\n`);
});

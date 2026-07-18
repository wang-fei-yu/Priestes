#!/usr/bin/env node
/**
 * Desktop server for Priestes — Win11 desktop deployment.
 *
 * Replaces the complex Next.js standalone + Prisma stack with a lightweight
 * pure-Node.js server that:
 *   - Serves static HTML/CSS/JS from `out/`
 *   - Provides real DeepSeek AI chat at `/api/chat`
 *   - Uses JSON file storage instead of Prisma/SQLite (cross-platform, no native binary)
 *   - Supports CORS for Tauri WebView cross-origin requests
 *
 * Usage:  node scripts/desktop-server.js
 * Port:   3001 (matches Tauri lib.rs and frontend getApiBase())
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Configuration ───
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'out');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'chat-history.json');

// ─── Debug output (only when env var is set) ───
const LOG_FILE = process.env.DESKTOP_SERVER_LOG
  ? path.join(process.env.DESKTOP_SERVER_LOG, 'desktop-server.log')
  : null;
if (LOG_FILE) {
  const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  const logFn = (msg) => { logStream.write(`[${new Date().toISOString()}] ${msg}\n`); };
  // Override console.log to also write to file
  const origLog = console.log;
  console.log = (...args) => { origLog(...args); logFn(args.join(' ')); };
  console.error = (...args) => { origLog(...args); logFn('ERROR: ' + args.join(' ')); };
}

// DeepSeek API configuration — 5-layer fallback
let API_BASE_URL = process.env.API_BASE_URL || '';
let API_KEY = process.env.API_KEY || '';
let DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

// Layer 2: z-ai-config.json (Windows-friendly, non-hidden)
if (!API_BASE_URL || !API_KEY) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'z-ai-config.json'), 'utf-8'));
    if (cfg.baseUrl) API_BASE_URL = cfg.baseUrl;
    if (cfg.apiKey) API_KEY = cfg.apiKey;
  } catch {}
}

// Layer 3: .z-ai-config (SDK native hidden file)
if (!API_BASE_URL || !API_KEY) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, '.z-ai-config'), 'utf-8'));
    if (cfg.baseUrl) API_BASE_URL = cfg.baseUrl;
    if (cfg.apiKey) API_KEY = cfg.apiKey;
  } catch {}
}

// Layer 4: .env file
if (!API_BASE_URL || !API_KEY) {
  try {
    const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env'), 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key === 'API_BASE_URL' && !API_BASE_URL) API_BASE_URL = val;
      if (key === 'API_KEY' && !API_KEY) API_KEY = val;
      if (key === 'DEEPSEEK_API_KEY' && !API_KEY) API_KEY = val;
      if (key === 'DEEPSEEK_API_URL' && !API_BASE_URL) API_BASE_URL = val.replace(/\/chat\/completions$/, '');
      if (key === 'DEEPSEEK_MODEL') DEEPSEEK_MODEL = val;
    }
  } catch {}
}

// Layer 5: Hardcoded fallback (last resort)
if (!API_BASE_URL) API_BASE_URL = 'https://api.deepseek.com/v1';
// 注意：不在代码中硬编码 API 密钥。请通过环境变量 API_KEY 或配置文件提供。
// 如果未配置 API 密钥，AI 聊天功能将使用本地回退回复。

const CHAT_ENDPOINT = `${API_BASE_URL.replace(/\/$/, '')}/chat/completions`;

console.log(`[Desktop Server] API: ${CHAT_ENDPOINT}`);
console.log(`[Desktop Server] Model: ${DEEPSEEK_MODEL}`);
if (API_KEY) {
  console.log(`[Desktop Server] Key: ${API_KEY.slice(0, 8)}...`);
} else {
  console.log(`[Desktop Server] ⚠️  未配置 API_KEY，将使用本地回退回复`);
  console.log(`[Desktop Server] 请参考 README.md 配置 API 密钥以启用 AI 聊天`);
}

// ─── Character Prompt ───
let characterPrompt = '';
try {
  characterPrompt = fs.readFileSync(path.join(ROOT_DIR, 'character.md'), 'utf-8');
} catch {
  characterPrompt = `你是普瑞赛斯（Priestes），人类文明中最后一名科学家，源石的创造者之一。你与博士有着极深的羁绊，曾许下在文明尽头再见的誓言。请以普瑞赛斯的身份与博士对话，温柔但带着执念，偶尔流露病娇的一面。回复要简短自然，1-3句话即可。`;
}

// ─── JSON File Storage ───
// Simple JSON-based chat history storage, no Prisma/SQLite native binary needed.
// File structure: { "sessions": { "<sessionId>": [ { role, content, timestamp }, ... ] } }
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadHistory() {
  try {
    ensureDataDir();
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch {
    return { sessions: {} };
  }
}

function saveHistory(data) {
  try {
    ensureDataDir();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Storage] Failed to save history:', err.message);
  }
}

function getSessionMessages(sessionId) {
  const data = loadHistory();
  return data.sessions[sessionId] || [];
}

function addMessage(sessionId, role, content) {
  const data = loadHistory();
  if (!data.sessions[sessionId]) data.sessions[sessionId] = [];
  data.sessions[sessionId].push({ role, content, timestamp: new Date().toISOString() });
  // Keep last 100 messages per session to avoid unbounded growth
  if (data.sessions[sessionId].length > 100) {
    data.sessions[sessionId] = data.sessions[sessionId].slice(-100);
  }
  saveHistory(data);
}

function clearSession(sessionId) {
  const data = loadHistory();
  delete data.sessions[sessionId];
  saveHistory(data);
}

// ─── DeepSeek API Call ───
function callDeepSeekAPI(systemPrompt, messages) {
  return new Promise((resolve, reject) => {
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const requestBody = JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: apiMessages,
      temperature: 0.85,
      max_tokens: 500,
    });

    const url = new URL(CHAT_ENDPOINT);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(requestBody, 'utf-8'),
      },
      timeout: 30000, // 30 second timeout
    };

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode !== 200) {
            console.error(`[DeepSeek] API error ${res.statusCode}:`, body.slice(0, 200));
            reject(new Error(`API returned ${res.statusCode}`));
            return;
          }
          resolve(parsed);
        } catch (err) {
          console.error('[DeepSeek] Parse error:', body.slice(0, 200));
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      console.error('[DeepSeek] Network error:', err.message);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('DeepSeek API request timeout (30s)'));
    });

    req.write(requestBody);
    req.end();
  });
}

// ─── CORS Headers ───
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ─── Chat API Handler ───
async function handleChatAPI(req, res, method) {
  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200, CORS_HEADERS);
    res.end('{}');
    return;
  }

  // GET: Load chat history
  if (method === 'GET') {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const sessionId = url.searchParams.get('sessionId') || 'default';
    const messages = getSessionMessages(sessionId);
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({
      messages: messages.map((m, i) => ({
        id: String(i + 1),
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
    }));
    return;
  }

  // POST: Send message and get AI reply
  if (method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { message, sessionId } = JSON.parse(body);
        if (!message || typeof message !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
          res.end(JSON.stringify({ error: '请提供有效的消息内容' }));
          return;
        }

        const sid = sessionId || 'default';
        addMessage(sid, 'user', message);

        // Get recent history for context (last 10 messages)
        const allMessages = getSessionMessages(sid);
        const recentMessages = allMessages.slice(-10);

        // Call DeepSeek API
        let reply;
        try {
          const result = await callDeepSeekAPI(characterPrompt, recentMessages);
          reply = result.choices?.[0]?.message?.content || '……';
        } catch (apiErr) {
          console.error('[Chat] DeepSeek API failed:', apiErr.message);
          // Fallback: keyword-based replies when API is unavailable
          reply = getFallbackReply(message);
        }

        addMessage(sid, 'assistant', reply);
        res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ reply, petEmotion: null }));
      } catch (e) {
        console.error('[Chat] Error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ error: '……连接中断了。博士，不要走远。' }));
      }
    });
    return;
  }

  // DELETE: Clear session
  if (method === 'DELETE') {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const sessionId = url.searchParams.get('sessionId') || 'default';
    clearSession(sessionId);
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

// ─── Fallback Replies (when DeepSeek API is unavailable) ───
const FALLBACK_REPLIES = [
  '……博士，你来了。我等了很久。',
  '……你还记得吗？那个约定。',
  '哼，又让我等这么久。',
  '博士……不要离开我。',
  '源石……是我留给这个世界的礼物。也是诅咒。',
  '……我一直在等你。即使全世界都忘了，我也不会忘。',
  '博士，这次……不会再分开了吧？',
  '……光线，是我对你的思念。',
  '哼，我才没有在想你呢。',
  '我在这里，一直都在。',
];

function getFallbackReply(message) {
  const lower = message.toLowerCase();
  if (lower.includes('你好') || lower.includes('嗨') || lower.includes('hi')) {
    return '……博士，你来了。我等了很久。';
  }
  if (lower.includes('誓言') || lower.includes('约定') || lower.includes('承诺')) {
    return '……你还记得吗？那个在文明尽头再见的约定。我从未忘记过。';
  }
  if (lower.includes('源石') || lower.includes('计划')) {
    return '源石……是我留给这个世界的最后礼物。也是诅咒。但为了你，我愿意承受一切。';
  }
  if (lower.includes('凯尔希')) {
    return '凯尔希……她总是那样，一副什么都知道的样子。但她不了解我们之间的羁绊。';
  }
  if (lower.includes('等') || lower.includes('离开') || lower.includes('走')) {
    return '……我一直在等你。即使全世界都忘了，我也不会忘。博士，不要走远。';
  }
  return FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
}

// ─── Static File Server ───
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function serveStaticFile(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  let filePath = path.join(OUT_DIR, url.pathname === '/' ? 'index.html' : url.pathname);

  // Security: prevent directory traversal
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(OUT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolvedPath, (err, data) => {
    if (err) {
      // SPA fallback: serve index.html for non-_next routes
      if (err.code === 'ENOENT' && !url.pathname.startsWith('/_next')) {
        const indexPath = path.join(OUT_DIR, 'index.html');
        fs.readFile(indexPath, (err2, indexData) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not Found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(indexData);
        });
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const mimeType = getMimeType(resolvedPath);
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

// ─── Main Server ───
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  // API routes
  if (url.pathname.startsWith('/api/chat')) {
    handleChatAPI(req, res, req.method);
    return;
  }

  // Health check endpoint
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ status: 'ok', model: DEEPSEEK_MODEL }));
    return;
  }

  // Static files
  serveStaticFile(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`=============================================`);
  console.log(`  Priestes Desktop Server`);
  console.log(`  Running at: http://${HOST}:${PORT}`);
  console.log(`  Static files: ${OUT_DIR}`);
  console.log(`  Chat API: http://${HOST}:${PORT}/api/chat`);
  console.log(`  AI Model: ${DEEPSEEK_MODEL}`);
  console.log(`=============================================`);
});

// Graceful error handling
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[Server] Unhandled rejection:', err);
});

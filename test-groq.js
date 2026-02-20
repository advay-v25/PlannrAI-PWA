const https = require('https');
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) { console.error("No GROQ_API_KEY found"); process.exit(1); }

const data = JSON.stringify({
  model: "llama-3.1-8b-instant",
  messages: [{ role: "user", content: "Say hi" }]
});

const req = https.request('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log(`Status: ${res.statusCode}\nBody: ${body}`));
});

req.on('error', e => console.error(e));
req.write(data);
req.end();

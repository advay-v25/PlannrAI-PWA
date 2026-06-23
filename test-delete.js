const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/delete-account',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, data));
});

req.write(JSON.stringify({ confirm: 'delete' }));
req.end();

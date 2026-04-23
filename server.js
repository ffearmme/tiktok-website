const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  // 1. Remove query strings and decode path safely
  let urlPath = req.url.split('?')[0];
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch (err) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  // 2. Default paths
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/admin') urlPath = '/dashboard.html';

  // 3. Normalize and lock path to this directory
  const normalized = path.normalize(urlPath).replace(/^([\\/])+/, '');
  const baseDir = path.resolve(__dirname);
  const filePath = path.resolve(baseDir, normalized);
  if (!filePath.startsWith(baseDir + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const extname = path.extname(filePath);
  const contentType = MIME_TYPES[extname] || 'text/plain';

  // 4. Read and serve the file
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File Not Found');
      } else {
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\x1b[32m%s\x1b[0m`, `✔ Spencer Live Server is running!`);
  console.log(`-------------------------------------------`);
  console.log(`Fan Page:  http://localhost:${PORT}/index.html`);
  console.log(`Dashboard: http://localhost:${PORT}/admin`);
  console.log(`-------------------------------------------`);
  console.log(`(Press Ctrl+C to stop the server)`);
});

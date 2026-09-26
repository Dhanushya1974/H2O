// Builds overlay.html from the template and the shared boy drawing (boy.svg.html),
// so the website and the desktop app use the same character.
const fs = require('fs');
const path = require('path');

const boy = fs.readFileSync(path.join(__dirname, 'boy.svg.html'), 'utf8').trimEnd();
const tpl = fs.readFileSync(path.join(__dirname, 'overlay.template.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'overlay.html'), tpl.replace('<!--BOY-->', boy));
console.log('overlay.html built');

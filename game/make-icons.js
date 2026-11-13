// Renders game/icon.svg to the PNGs the home-screen install uses
// (src/assets/game/icon-180.png, -192, -512). Run after changing the icon:
//   node game/make-icons.js
// Needs Chrome or Edge (the same as `npm run build`; CHROME_PATH if it is
// somewhere unusual).
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const chrome = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find((p) => fs.existsSync(p));
if (!chrome) throw new Error('No Chrome or Edge found: set CHROME_PATH');
const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
const out = path.join(__dirname, '..', 'src', 'assets', 'game');
fs.mkdirSync(out, { recursive: true });
for (const size of [180, 192, 512]) {
  const html = path.join(os.tmpdir(), 'ou-icon-' + size + '.html');
  fs.writeFileSync(html, '<!doctype html><style>html,body{margin:0;background:#1F4552}svg{display:block;width:' + size + 'px;height:' + size + 'px}</style>' + svg);
  const file = path.join(out, 'icon-' + size + '.png');
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=' + size + ',' + size, '--screenshot=' + file, 'file:///' + html.split(path.sep).join('/')], { stdio: 'ignore' });
  console.log('wrote', path.relative(process.cwd(), file));
}

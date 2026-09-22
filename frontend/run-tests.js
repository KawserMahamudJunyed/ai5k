const puppeteer = require('puppeteer');
const fs = require('fs');
const execSync = require('child_process').execSync;

(async () => {
  const url = 'https://ai5k.vercel.app';
  console.log(`Testing ${url}...`);

  // Run Lighthouse
  try {
    console.log('Running Lighthouse...');
    execSync(`lighthouse ${url} --output html --output-path ./artifacts/lighthouse-report.html --chrome-flags="--headless"`, { stdio: 'inherit' });
    console.log('Lighthouse report saved to ./artifacts/lighthouse-report.html');
  } catch (e) {
    console.error('Lighthouse failed:', e.message);
  }

  // Screenshots
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  const viewports = [
    { width: 360, height: 800, name: '360px' },
    { width: 768, height: 1024, name: '768px' },
    { width: 900, height: 1200, name: '900px' },
    { width: 1440, height: 900, name: '1440px' }
  ];

  if (!fs.existsSync('./artifacts')) {
    fs.mkdirSync('./artifacts');
  }

  for (const vp of viewports) {
    console.log(`Taking screenshot for ${vp.name}...`);
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: `./artifacts/screenshot-${vp.name}.png`, fullPage: true });
  }

  await browser.close();
  console.log('Done!');
})();

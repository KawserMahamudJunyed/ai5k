const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  const dir = "C:\\Users\\IT BD\\.gemini\\antigravity\\brain\\b9770d6c-f2ea-408d-8d3e-7189de0d2a27";
  
  await page.setViewport({ width: 1440, height: 1080 });

  try {
    console.log("Navigating to analyze...");
    await page.goto('https://ai5k.vercel.app/analyze', { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log("Clicking Analyze button...");
    await page.click('button'); // Clicks "Analyze profile"
    await new Promise(r => setTimeout(r, 4000));
    
    const screenshotPath = `${dir}\\analyze_report_prod.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved screenshot to ${screenshotPath}`);

  } catch (err) {
    console.error("Failed:", err);
  }

  await browser.close();
  console.log("Done");
})();

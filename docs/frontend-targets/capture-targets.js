const path = require("path");
const { chromium } = require("@playwright/test");

const root = __dirname;
const source = `file:///${path.join(root, "target-prototype.html").replace(/\\/g, "/")}`;
const targets = [
  ["hub", "01-project-hub-desktop.png", 1440, 900],
  ["canvas", "02-studio-canvas-desktop.png", 1440, 900],
  ["inspector", "03-generation-inspector-desktop.png", 1440, 900],
  ["assets", "04-asset-library-desktop.png", 1440, 900],
  ["mobile", "05-studio-mobile.png", 390, 844],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const [screen, filename, width, height] of targets) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(`${source}?screen=${screen}`, { waitUntil: "load" });
    await page.screenshot({ path: path.join(root, filename), fullPage: false });
    await page.close();
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

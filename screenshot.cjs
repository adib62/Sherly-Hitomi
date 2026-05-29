const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Set viewport to a good size
  await page.setViewport({ width: 1280, height: 720 });
  
  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 60000 });
  
  console.log('Waiting for VRM to load (5 seconds)...');
  await new Promise(r => setTimeout(r, 5000));
  
  console.log('Taking before-zoom screenshot...');
  await page.screenshot({ path: 'screenshot_before.png' });

  console.log('Zooming in...');
  // Move mouse to center
  await page.mouse.move(640, 360);
  
  // Simulate mouse wheel scroll to zoom in (OrbitControls uses wheel delta)
  // Positive deltaY usually zooms out, negative zooms in. Let's send multiple wheel events.
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel({ deltaY: -100 });
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log('Waiting for zoom to settle...');
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('Taking after-zoom screenshot...');
  await page.screenshot({ path: 'screenshot_after.png' });
  
  await browser.close();
  console.log('Done!');
})();

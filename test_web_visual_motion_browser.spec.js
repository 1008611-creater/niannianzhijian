const { test, expect } = require('playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const baseUrl = 'http://127.0.0.1:4188';

test.describe('web visual motion browser contract', () => {
  test.skip('legacy oil video hero contract kept for historical comparison', async ({ page }) => {
    const browserProblems = [];
    page.on('console', message => {
      if (['warning', 'error'].includes(message.type())) browserProblems.push(`${message.type()}:${message.text()}`);
    });
    page.on('pageerror', error => browserProblems.push(`pageerror:${error.message}`));

    await page.setViewportSize({ width:1440, height:900 });
    await page.goto(baseUrl + '/#home', { waitUntil:'networkidle' });
    const hero = page.locator('.hero');
    const video = page.locator('#heroVideo');
    await expect(hero).toBeVisible();
    await expect(video).toHaveCount(1);
    await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThanOrEqual(2);
    await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);

    const desktop = await hero.evaluate(element => {
      const media = element.querySelector('#heroVideo');
      const mediaStyle = getComputedStyle(media);
      const copy = getComputedStyle(element.querySelector('.hero-copy'));
      const shade = getComputedStyle(element.querySelector('.hero-shade'));
      const bounds = media.getBoundingClientRect();
      return {
        duration:media.duration,
        muted:media.muted,
        loop:media.loop,
        playsInline:media.playsInline,
        source:new URL(media.currentSrc).pathname,
        objectFit:mediaStyle.objectFit,
        cssWidth:bounds.width,
        cssHeight:bounds.height,
        heroBackground:getComputedStyle(element).backgroundImage,
        copyZ:Number(copy.zIndex),
        shadeZ:Number(shade.zIndex),
        videoZ:Number(mediaStyle.zIndex),
        scrollWidth:document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth
      };
    });
    expect(desktop.duration).toBeGreaterThan(9.9);
    expect(desktop.duration).toBeLessThan(10.2);
    expect(desktop.muted).toBe(true);
    expect(desktop.loop).toBe(true);
    expect(desktop.playsInline).toBe(true);
    expect(desktop.source).toContain('niannian-hero-oil-vortex-loop-v2.mp4');
    expect(desktop.objectFit).toBe('cover');
    expect(desktop.copyZ).toBeGreaterThan(desktop.shadeZ);
    expect(desktop.shadeZ).toBeGreaterThan(desktop.videoZ);
    expect(desktop.scrollWidth).toBeLessThanOrEqual(desktop.viewportWidth);

    const firstFrame = await video.screenshot({ path:'output/playwright/hero-oil-video-t0-desktop.png' });
    const firstTime = await video.evaluate(element => element.currentTime);
    await page.waitForTimeout(1800);
    const secondFrame = await video.screenshot({ path:'output/playwright/hero-oil-video-t1_8-desktop.png' });
    const secondTime = await video.evaluate(element => element.currentTime);
    expect(secondTime).toBeGreaterThan(firstTime + 1);
    expect(crypto.createHash('sha256').update(firstFrame).digest('hex'))
      .not.toBe(crypto.createHash('sha256').update(secondFrame).digest('hex'));
    await page.screenshot({ path:'output/playwright/hero-oil-video-desktop.png', fullPage:true });

    await page.locator('.nav-item[data-view="projects"]').click();
    await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
    const pausedAt = await video.evaluate(element => element.currentTime);
    await page.waitForTimeout(500);
    expect(Math.abs((await video.evaluate(element => element.currentTime)) - pausedAt)).toBeLessThan(0.08);
    await page.locator('.nav-item[data-view="home"]').click();
    await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);

    await page.setViewportSize({ width:390, height:844 });
    await expect.poll(() => hero.locator('.hero-copy').evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);
    const mobile = await hero.evaluate(element => {
      const media = element.querySelector('#heroVideo');
      const bounds = media.getBoundingClientRect();
      const headingBounds = element.querySelector('h1').getBoundingClientRect();
      return {
        cssWidth:bounds.width,
        cssHeight:bounds.height,
        objectFit:getComputedStyle(media).objectFit,
        headingLeft:headingBounds.left,
        headingRight:headingBounds.right,
        scrollWidth:document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth
      };
    });
    expect(mobile.cssWidth).toBeGreaterThan(0);
    expect(mobile.cssHeight).toBeGreaterThan(0);
    expect(mobile.objectFit).toBe('cover');
    expect(mobile.headingLeft).toBeGreaterThanOrEqual(0);
    expect(mobile.headingRight).toBeLessThanOrEqual(mobile.viewportWidth);
    expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.viewportWidth);
    await page.screenshot({ path:'output/playwright/hero-oil-video-mobile.png', fullPage:true });

    await page.emulateMedia({ reducedMotion:'reduce' });
    await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
    const reduced = await hero.evaluate(element => ({
      videoDisplay:getComputedStyle(element.querySelector('#heroVideo')).display,
      heroBackground:getComputedStyle(element).backgroundImage
    }));
    expect(reduced.videoDisplay).toBe('none');
    expect(reduced.heroBackground).toContain('niannian-hero-oil-paint-quiet-v1.png');
    await page.screenshot({ path:'output/playwright/hero-oil-video-reduced-motion.png', fullPage:true });

    const fallbackPage = await page.context().newPage();
    await fallbackPage.setViewportSize({ width:1024, height:720 });
    await fallbackPage.goto(baseUrl + '/#home');
    await fallbackPage.locator('#heroVideo').evaluate(element => {
      element.querySelectorAll('source').forEach(source => source.remove());
      element.src = '/assets/home/intentional-missing-hero-video.mp4';
      element.load();
    });
    await expect(fallbackPage.locator('.hero')).toHaveClass(/is-video-fallback/);
    await expect(fallbackPage.locator('#fluidCanvas')).toHaveCount(0);
    const fallback = await fallbackPage.locator('.hero').evaluate(element => ({
      videoDisplay:getComputedStyle(element.querySelector('#heroVideo')).display,
      heroBackground:getComputedStyle(element).backgroundImage
    }));
    expect(fallback.videoDisplay).toBe('none');
    expect(fallback.heroBackground).toContain('niannian-hero-oil-paint-quiet-v1.png');
    await fallbackPage.screenshot({ path:'output/playwright/hero-oil-video-fallback.png', fullPage:true });
    await fallbackPage.close();

    expect(browserProblems).toEqual([]);
    const evidencePath = path.join(__dirname, 'output', 'playwright', 'hero-oil-video-samples.json');
    fs.mkdirSync(path.dirname(evidencePath), { recursive:true });
    fs.writeFileSync(evidencePath, JSON.stringify({ desktop, mobile, reduced, fallback:'static-poster' }, null, 2) + '\n');
  });

  test('home renders the fluid logo hero, pauses offscreen, and keeps reduced-motion fallbacks', async ({ page }) => {
    const browserProblems = [];
    const gpuReadbackDiagnostics = [];
    page.on('console', message => {
      const entry = `${message.type()}:${message.text()}`;
      if (message.type() === 'warning' && /GL Driver Message.*GPU stall due to ReadPixels/.test(message.text())) {
        gpuReadbackDiagnostics.push(entry);
      } else if (['warning', 'error'].includes(message.type())) {
        browserProblems.push(entry);
      }
    });
    page.on('pageerror', error => browserProblems.push(`pageerror:${error.message}`));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(baseUrl + '/#home');
    await page.reload({ waitUntil:'networkidle' });
    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('.hero-copy')).toBeVisible();
    await expect(page.locator('.hero h1')).toHaveText('让角色、镜头与资产持续一致');
    await expect(page.locator('.hero-logo')).toBeVisible();
    await expect(page.locator('.hero-kicker')).toHaveCount(0);
    await expect(page.locator('.hero-support')).toHaveCount(0);
    await expect(page.locator('#heroVideo')).toHaveCount(0);
    const fluidCanvas = page.locator('#fluidCanvas');
    await expect(fluidCanvas).toHaveCount(1);
    await expect.poll(() => fluidCanvas.getAttribute('data-renderer-state')).toBe('running');
    await expect.poll(async () => Number(await fluidCanvas.getAttribute('data-renderer-frames'))).toBeGreaterThan(2);

    const desktop = await page.locator('.hero').evaluate(element => {
      const canvas = element.querySelector('#fluidCanvas');
      const canvasStyle = getComputedStyle(canvas);
      const copy = getComputedStyle(element.querySelector('.hero-copy'));
      const shade = getComputedStyle(element.querySelector('.hero-shade'));
      const bounds = canvas.getBoundingClientRect();
      return {
        renderer:canvas.dataset.renderer,
        rendererState:canvas.dataset.rendererState,
        width:canvas.width,
        height:canvas.height,
        cssWidth:bounds.width,
        cssHeight:bounds.height,
        canvasTransform:canvasStyle.transform,
        heroBackground:getComputedStyle(element).backgroundImage,
        copyZ:Number(copy.zIndex),
        shadeZ:Number(shade.zIndex),
        canvasZ:Number(canvasStyle.zIndex),
        scrollWidth:document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth
      };
    });
    expect(['webgl', '2d']).toContain(desktop.renderer);
    expect(desktop.rendererState).toBe('running');
    expect(desktop.width).toBeGreaterThan(0);
    expect(desktop.height).toBeGreaterThan(0);
    expect(desktop.cssWidth).toBeGreaterThan(0);
    expect(desktop.cssHeight).toBeGreaterThan(0);
    expect(desktop.canvasTransform).toBe('none');
    expect(desktop.heroBackground).toBe('none');
    expect(desktop.copyZ).toBeGreaterThan(desktop.shadeZ);
    expect(desktop.shadeZ).toBeGreaterThan(desktop.canvasZ);
    expect(desktop.scrollWidth).toBeLessThanOrEqual(desktop.viewportWidth);

    const geometry = () => page.locator('.hero').evaluate(element => {
      const rect = selector => {
        const box = element.querySelector(selector).getBoundingClientRect();
        return { x:box.x, y:box.y, width:box.width, height:box.height };
      };
      return { logo:rect('.hero-logo'), headline:rect('h1'), cta:rect('.create-button') };
    });
    const samplePaths = [
      'output/playwright/hero-fluid-shader-t0-desktop.png',
      'output/playwright/hero-fluid-shader-t1_5-desktop.png',
      'output/playwright/hero-fluid-shader-t4-desktop.png'
    ];
    const samples = [];
    const capture = async (at, screenshotPath) => {
      const buffer = await fluidCanvas.screenshot({ path:screenshotPath });
      samples.push({
        at,
        sha256:crypto.createHash('sha256').update(buffer).digest('hex'),
        frames:Number(await fluidCanvas.getAttribute('data-renderer-frames')),
        geometry:await geometry()
      });
    };
    await capture(0, samplePaths[0]);
    await page.waitForTimeout(1500);
    await capture(1.5, samplePaths[1]);
    await page.waitForTimeout(2500);
    await capture(4, samplePaths[2]);
    expect(new Set(samples.map(sample => sample.sha256)).size).toBe(3);
    expect(samples[1].frames).toBeGreaterThan(samples[0].frames);
    expect(samples[2].frames).toBeGreaterThan(samples[1].frames);
    for (const selector of ['logo', 'headline', 'cta']) {
      for (const key of ['x', 'y', 'width', 'height']) {
        expect(Math.abs(samples[2].geometry[selector][key] - samples[0].geometry[selector][key])).toBeLessThan(0.5);
      }
    }
    await page.screenshot({ path:'output/playwright/hero-fluid-shader-desktop.png', fullPage:true });

    await page.locator('.nav-item[data-view="projects"]').click();
    await expect.poll(() => fluidCanvas.getAttribute('data-renderer-state')).toBe('stopped');
    const pausedFrames = Number(await fluidCanvas.getAttribute('data-renderer-frames'));
    await page.waitForTimeout(500);
    expect(Number(await fluidCanvas.getAttribute('data-renderer-frames'))).toBe(pausedFrames);
    await page.locator('.nav-item[data-view="home"]').click();
    await expect.poll(() => fluidCanvas.getAttribute('data-renderer-state')).toBe('running');
    await expect.poll(async () => Number(await fluidCanvas.getAttribute('data-renderer-frames'))).toBeGreaterThan(pausedFrames);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.locator('.hero').evaluate(element => {
      const canvas = element.querySelector('#fluidCanvas');
      return {
        renderer:canvas.dataset.renderer,
        rendererState:canvas.dataset.rendererState,
        width:canvas.width,
        height:canvas.height,
        cssWidth:canvas.getBoundingClientRect().width,
        transform:getComputedStyle(canvas).transform,
        scrollWidth:document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth
      };
    });
    expect(['webgl', '2d']).toContain(mobile.renderer);
    expect(mobile.rendererState).toBe('running');
    expect(mobile.width).toBeLessThanOrEqual(Math.ceil(mobile.cssWidth * 1.2));
    expect(mobile.height).toBeGreaterThan(0);
    expect(mobile.transform).toBe('none');
    expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.viewportWidth);
    await page.screenshot({ path:'output/playwright/hero-fluid-shader-mobile.png', fullPage:true });

    await page.emulateMedia({ reducedMotion:'reduce' });
    await expect.poll(() => fluidCanvas.getAttribute('data-renderer-state')).toBe('stopped');
    const reduced = await page.locator('.hero').evaluate(element => ({
      canvasDisplay:getComputedStyle(element.querySelector('#fluidCanvas')).display,
      rendererState:element.querySelector('#fluidCanvas').dataset.rendererState,
      heroBackground:getComputedStyle(element).backgroundImage
    }));
    expect(reduced.canvasDisplay).toBe('none');
    expect(reduced.rendererState).toBe('stopped');
    expect(reduced.heroBackground).toBe('none');
    await page.screenshot({ path:'output/playwright/hero-fluid-shader-reduced-motion.png', fullPage:true });

    const fallbackProblems = [];
    const fallbackPage = await page.context().newPage();
    fallbackPage.on('console', message => {
      if (['warning', 'error'].includes(message.type())) fallbackProblems.push(`${message.type()}:${message.text()}`);
    });
    fallbackPage.on('pageerror', error => fallbackProblems.push(`pageerror:${error.message}`));
    await fallbackPage.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (type === 'webgl' || type === 'experimental-webgl') return null;
        return original.call(this, type, ...args);
      };
    });
    await fallbackPage.setViewportSize({ width: 1024, height: 720 });
    await fallbackPage.goto(baseUrl + '/#home', { waitUntil:'networkidle' });
    const fallbackCanvas = fallbackPage.locator('#fluidCanvas');
    await expect(fallbackCanvas).toHaveAttribute('data-renderer', '2d');
    await expect.poll(() => fallbackCanvas.getAttribute('data-renderer-state')).toBe('running');
    const fallbackStart = Number(await fallbackCanvas.getAttribute('data-renderer-frames'));
    await fallbackPage.waitForTimeout(300);
    expect(Number(await fallbackCanvas.getAttribute('data-renderer-frames'))).toBeGreaterThan(fallbackStart);
    await fallbackPage.screenshot({ path:'output/playwright/hero-fluid-shader-2d-fallback.png', fullPage:true });
    await fallbackPage.close();

    expect(browserProblems).toEqual([]);
    expect(fallbackProblems).toEqual([]);
    const evidencePath = path.join(__dirname, 'output', 'playwright', 'hero-fluid-shader-samples.json');
    fs.mkdirSync(path.dirname(evidencePath), { recursive:true });
    fs.writeFileSync(evidencePath, JSON.stringify({ desktop, samples, mobile, reduced, fallback:'2d', gpuReadbackDiagnostics }, null, 2) + '\n');
  });

  test('workbench presents two clear production paths before login and reserves the project queue structure for signed-in work', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(baseUrl + '/#workbench');
    await expect(page.locator('.public-workbench')).toBeVisible();
    await expect(page.locator('.public-workbench')).toContainText('独立脱敏演示');
    await expect(page.locator('.workbench-app-nav')).toHaveCount(0);
    await expect(page.locator('.workbench-canvas')).toHaveCount(0);
    await expect(page.locator('.workbench-context-panel')).toHaveCount(0);
    await expect(page.locator('.public-preview-project')).toHaveCount(2);
    await expect(page.locator('.public-preview-project').nth(0)).toContainText('小说短剧');
    await expect(page.locator('.public-preview-project').nth(1)).toContainText('视频转绘');
    await expect(page.locator('.public-preview-stage')).toHaveCount(8);
    await expect(page.locator('.public-preview-stage.is-locked')).toHaveCount(5);
    await expect(page.locator('[data-workbench-create-actions]')).toBeHidden();

    const desktop = await page.evaluate(() => {
      const workspace = document.querySelector('.public-workbench');
      return {
        workspaceDisplay: workspace ? getComputedStyle(workspace).display : '',
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth
      };
    });
    expect(desktop.workspaceDisplay).not.toBe('none');
    expect(desktop.scrollWidth).toBeLessThanOrEqual(desktop.viewportWidth);

    await page.locator('.public-workbench-footer [data-modal="login"]').click();
    await expect(page.locator('#modalBackdrop')).toBeVisible();
    await expect(page.locator('#modalTitle')).toHaveText('登录念念 AI');
    await page.locator('#modalClose').click();

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({
      workbenchDisplay: getComputedStyle(document.querySelector('.public-workbench')).display,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));
    expect(mobile.workbenchDisplay).not.toBe('none');
    expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.viewportWidth);
    await expect(page.locator('#accountButton')).toBeVisible();
    await page.locator('#mobileMenuToggle').click();
    await expect(page.locator('.mobile-account-actions')).toBeVisible();
    await expect(page.locator('.mobile-account-actions [data-modal="register"]')).toBeVisible();
    await expect(page.locator('.mobile-account-actions [data-modal="enterprise"]')).toBeVisible();
    const mobileTargets = await page.evaluate(() => ['#mobileMenuToggle', '.command-trigger', '#accountButton'].map(selector => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { selector, width:box.width, height:box.height };
    }));
    expect(mobileTargets.every(target => target.width >= 44 && target.height >= 44)).toBe(true);
  });

  test('project library and team pages do not present invented workspace facts before login', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(baseUrl + '/#projects');
    await expect(page.locator('#projectSummary')).toBeHidden();
    await expect(page.locator('.project-toolbar')).toBeHidden();
    await expect(page.locator('.public-project-access')).toBeVisible();
    await expect(page.locator('.public-project-access')).toContainText('登录后管理你的项目');
    expect((await page.locator('.public-project-access').boundingBox())?.width || 0).toBeGreaterThan(800);
    await page.screenshot({ path:'output/playwright/public-surfaces-projects-desktop.png', fullPage:true });
    await page.locator('.public-project-access [data-open-auth-login]').click();
    await expect(page.locator('#modalBackdrop')).toBeVisible();
    await expect(page.locator('#modalTitle')).toHaveText('登录念念 AI');
    await page.locator('#modalClose').click();

    await page.setViewportSize({ width:390, height:844 });
    const projectMobileDimensions = await page.evaluate(() => ({ scrollWidth:document.documentElement.scrollWidth, viewportWidth:window.innerWidth }));
    expect(projectMobileDimensions.scrollWidth).toBeLessThanOrEqual(projectMobileDimensions.viewportWidth);
    await page.screenshot({ path:'output/playwright/public-surfaces-projects-mobile.png', fullPage:true });

    await page.setViewportSize({ width:1280, height:800 });
    await page.goto(baseUrl + '/#team');
    await expect(page.locator('.public-team-access')).toBeVisible();
    await expect(page.locator('.public-team-access')).toContainText('仅显示当前账户的项目与协作范围');
    await expect(page.locator('.public-team-access h3')).toHaveText('登录后查看你的工作区');
    await expect(page.locator('.public-team-access h3')).toHaveCSS('white-space', 'normal');
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    await page.screenshot({ path:'output/playwright/public-surfaces-team-desktop.png', fullPage:true });

    await page.setViewportSize({ width:390, height:844 });
    const mobileDimensions = await page.evaluate(() => ({ scrollWidth:document.documentElement.scrollWidth, viewportWidth:window.innerWidth }));
    expect(mobileDimensions.scrollWidth).toBeLessThanOrEqual(mobileDimensions.viewportWidth);
    await page.screenshot({ path:'output/playwright/public-surfaces-team-mobile.png', fullPage:true });
  });

  test('guide step changes preserve the route and the viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(baseUrl + '/#guide');
    await expect(page.locator('[data-guide-flow="novel"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-guide-flow="redraw"]').click();
    await expect(page.locator('[data-guide-step="Step01"]')).toBeVisible();
    await expect(page.locator('#guideFocus h3')).toHaveText('证据整理');
    await expect(page.locator('#guideChecklist > p')).toHaveCount(0);

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);

    const routeBefore = page.url();
    await page.locator('[data-guide-step="Step02"]').click();

    await expect(page.locator('#guideFocus h3')).toHaveText('干净时间轴');
    await expect.poll(() => page.locator('#guideFocus').evaluate(element => element.classList.contains('guide-motion-active'))).toBe(false);
    expect(page.url()).toBe(routeBefore);
    await page.screenshot({ path:'output/playwright/public-surfaces-guide-desktop.png', fullPage:true });

    await page.setViewportSize({ width:390, height:844 });
    const mobileDimensions = await page.evaluate(() => ({ scrollWidth:document.documentElement.scrollWidth, viewportWidth:window.innerWidth }));
    expect(mobileDimensions.scrollWidth).toBeLessThanOrEqual(mobileDimensions.viewportWidth);
    await page.screenshot({ path:'output/playwright/public-surfaces-guide-mobile.png', fullPage:true });
  });

  test('a recoverable workbench project route remains in the workbench panel without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(baseUrl + '/#workbench/project/script%3ANS-MRGUJUH9-9E8904/tab/assets');
    await expect(page.locator('[data-view-panel="workbench"]')).toHaveClass(/is-visible/);
    await expect(page.locator('.public-workbench')).toBeVisible();
    expect(page.url()).toContain('#workbench/project/script%3ANS-MRGUJUH9-9E8904/tab/assets');
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  });

  test('showcase presents the reviewed short-drama key art and opens the real creation entry point', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(baseUrl + '/#showcase');
    const activeFilm = page.locator('[data-showcase-film="0"]');
    await expect(activeFilm.locator('.showcase-film-image')).toBeVisible();
    await expect(activeFilm.locator('.showcase-film-image')).toHaveAttribute('src', /short-drama-keyart-v1\.png/);
    await expect(page.locator('#showcaseFilmTitle')).toHaveText('高燃短剧');
    await expect(page.locator('.showcase-film-copy p')).toHaveCount(0);
    await activeFilm.hover({ position: { x: 120, y: 220 } });
    await expect(activeFilm).toHaveCSS('--showcase-shift-x', /px/);
    await activeFilm.locator('[data-open-script-drama-wizard]').click();
    await expect(page.locator('#modalBackdrop')).toBeVisible();
    await expect(page.locator('#modalTitle')).toHaveText('登录念念 AI');

    await page.locator('#modalClose').click();
    await page.locator('[data-showcase-film-index="1"]').click();
    await expect(page.locator('[data-showcase-film="1"]')).toHaveClass(/is-active/);
    await expect(page.locator('#showcaseAnimationTitle')).toHaveText('动画漫剧');
    await expect(page.locator('[data-showcase-film="1"] .showcase-film-image')).toHaveAttribute('src', /animation-drama-keyart-v1\.png/);
    await page.locator('[data-showcase-film-index="2"]').click();
    await expect(page.locator('[data-showcase-film="2"]')).toHaveClass(/is-active/);
    await expect(page.locator('#showcaseRedrawTitle')).toHaveText('参考视频转绘');
    await expect(page.locator('#showcaseRedrawTitle')).toHaveCSS('white-space', 'nowrap');
    await expect(page.locator('[data-showcase-film="2"] .showcase-film-image')).toHaveAttribute('src', /redraw-keyart-partial-xuedi-v1\.png/);

    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);

    await page.setViewportSize({ width: 390, height: 844 });
    const showcaseTouchTargets = await page.locator('.showcase-film-nav button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
    expect(showcaseTouchTargets.every(height => height >= 44)).toBe(true);
  });

  test('reduced motion renders the guide statically and current assets use the visual-motion revision', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl + '/#guide');
    await page.locator('[data-guide-flow="redraw"]').click();
    await expect(page.locator('[data-guide-step="Step01"]')).toBeVisible();

    await page.locator('[data-guide-step="Step02"]').click();
    await expect(page.locator('#guideFocus h3')).toHaveText('干净时间轴');
    expect(await page.locator('#guideFocus').evaluate(element => element.classList.contains('guide-motion-active'))).toBe(false);

    const assets = await page.evaluate(() => ({
      motionQuery: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      productCss: document.querySelector('link[href*="product.css"]')?.getAttribute('href') || '',
      app: document.querySelector('script[src*="app.js"]')?.getAttribute('src') || '',
      mvp: document.querySelector('script[src*="mvp-step02-r13.js"]')?.getAttribute('src') || '',
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));
    expect(assets.motionQuery).toBe(true);
    expect(assets.productCss).toContain('step02-localization-r1');
    expect(assets.app).toContain('fluid-hero-r1');
    expect(assets.mvp).toContain('step03-v31');
    expect(assets.scrollWidth).toBeLessThanOrEqual(assets.viewportWidth);
  });

  test('PWA installs an offline shell without treating cached project facts as current state', async ({ page, context }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(baseUrl + '/#workbench', { waitUntil:'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil:'networkidle' });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    const response = await page.evaluate(async () => {
      const request = new Request('/api/health');
      const result = await fetch(request);
      return { cacheControl: result.headers.get('cache-control'), ok: result.ok };
    });
    expect(response.ok).toBe(true);
    expect(response.cacheControl || '').toMatch(/no-store/i);

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    const status = page.locator('#connectionStatus');
    await expect(status).toBeVisible();
    await expect(status).toContainText('网络已中断');
    await expect(status).toContainText('项目状态将在恢复连接后更新');
    await expect(status).toHaveAttribute('aria-live', 'polite');

    await page.reload({ waitUntil:'domcontentloaded' });
    await expect(page.locator('.public-workbench')).toBeVisible();
    await expect(page.locator('#connectionStatus')).toBeVisible();

    const offlineApiResult = await page.evaluate(() => fetch('/api/health').then(() => 'resolved').catch(() => 'rejected'));
    expect(offlineApiResult).toBe('rejected');
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(status).toBeHidden();
  });
});

/**
 * End-to-end CMS test — the exact chain from the brief, driven in a real
 * browser (Microsoft Edge via puppeteer-core) against a running server and
 * the real database.
 *
 *   node --env-file=.env.local scripts/e2e-cms.mjs [baseUrl]
 *
 * Steps (numbers match the brief):
 *   1-2  record the live hero headline and image
 *   3    log in to the admin
 *   4-5  change the headline and the image URL in the hero editor
 *   6    wait for the autosaved draft
 *   7    verify PRODUCTION did not change
 *   8-9  verify the PREVIEW shows the new headline and image
 *   10   publish
 *   11-13 verify production shows the new headline and image
 *   14   verify the mobile viewport renders the hero image within the screen
 *   15   verify the hero CTA leads to /checkout
 *   16   verify checkout still shows the offer price and the form
 *   17-18 restore the previous version, publish, verify production is back
 *
 * Every step prints PASS or FAIL with what was observed. Exit code is
 * non-zero on the first failure. Nothing is faked: the browser clicks the
 * same buttons a person would.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import puppeteer from 'puppeteer-core'

const BASE = (process.argv[2] ?? 'http://localhost:3130').replace(/\/+$/, '')
const EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL ?? ''
const PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? ''
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']
const SHOTS = process.env.E2E_SHOTS ?? join(process.cwd(), '.e2e-shots')
const NEW_HEADLINE = `E2E শিরোনাম ${Date.now()}`
const NEW_IMAGE = 'https://picsum.photos/seed/e2e-cms/640/360.jpg'

if (!EMAIL || !PASSWORD) {
  console.error('ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD must be set (run with --env-file=.env.local)')
  process.exit(2)
}
mkdirSync(SHOTS, { recursive: true })

let step = 0
let failed = false
function pass(msg) {
  step += 1
  console.log(`PASS ${String(step).padStart(2)}  ${msg}`)
}
function fail(msg) {
  step += 1
  failed = true
  console.log(`FAIL ${String(step).padStart(2)}  ${msg}`)
  throw new Error(msg)
}
function assert(cond, ok, bad) {
  if (cond) pass(ok)
  else fail(bad)
}

async function fetchHtml(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { 'cache-control': 'no-cache' } })
  return { status: r.status, html: await r.text() }
}


const CDP_PORT = 9444

/**
 * Edge 152's msedge.exe is a launcher: it hands the real browser off to a child
 * process and exits 0. puppeteer.launch() sees its child die and gives up,
 * although DevTools is up and answering. So: spawn Edge ourselves with a
 * debugging port and connect over the protocol. browser.close() at the end
 * closes the real browser through CDP.
 */
async function launchEdge(exe) {
  for (const port of [9333, CDP_PORT]) {
    try { const stray = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` }); await stray.close() } catch {}
  }
  const profile = join(SHOTS, `edge-profile-${Date.now()}`)
  const child = spawn(exe, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync',
    '--disable-features=msSmartScreenProtection,msEdgeSmartScreen',
    '--disable-blink-features=AutomationControlled', '--window-size=1280,900',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  const url = `http://127.0.0.1:${CDP_PORT}`
  for (let i = 0; i < 40; i += 1) {
    try { const r = await fetch(`${url}/json/version`); if (r.ok) break } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return puppeteer.connect({ browserURL: url, defaultViewport: null })
}

async function clearAndType(page, selector, text) {
  await page.click(selector)
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await page.type(selector, text)
}

async function main() {
  const exe = EDGE.find((p) => existsSync(p))
  if (!exe) {
    console.error('Microsoft Edge not found')
    process.exit(2)
  }

  const browser = await launchEdge(exe)
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900 })
    page.on('dialog', (d) => { console.log('   dialog:', d.type(), d.message().slice(0, 80)); d.accept() })
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('   nav ->', f.url()) })
    page.on('console', (m) => { if (m.type() === 'error') console.log('   console.error:', m.text().slice(0, 160)) })
    page.on('pageerror', (e) => console.log('   pageerror:', String(e).slice(0, 160)))
    page.on('response', (r) => { if (r.status() >= 400) console.log('   http', r.status(), r.url().slice(0, 120)) })

    // 1-2 record production ------------------------------------------------
    const before = await fetchHtml('/')
    assert(before.status === 200, 'production landing page responds 200', `production responded ${before.status}`)
    const h1Before = before.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, '').trim() ?? ''
    assert(h1Before.length > 0, `recorded live headline: "${h1Before.slice(0, 60)}"`, 'no <h1> on production')
    const hadNewImageBefore = before.html.includes(NEW_IMAGE)
    assert(!hadNewImageBefore, 'test image is not on production yet', 'test image already present; cannot prove a change')

    // 3 login --------------------------------------------------------------
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle2' })
    await page.type('#email', EMAIL)
    await page.type('#password', PASSWORD)
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type=submit]')])
    assert(page.url().endsWith('/admin') || page.url().includes('/admin?'), 'logged in and landed on the dashboard', `login did not reach the dashboard: ${page.url()}`)

    // 4-5 edit the hero ----------------------------------------------------
    await page.goto(`${BASE}/admin/landing/hero`, { waitUntil: 'networkidle2' })
    await page.waitForSelector('#headlineLines')
    await clearAndType(page, '#headlineLines', NEW_HEADLINE)
    await clearAndType(page, '#image\\.url', NEW_IMAGE)
    await clearAndType(page, '#image\\.alt', 'E2E test image')
    pass('typed a new headline and a new image URL into the hero editor')

    // 6 autosave -----------------------------------------------------------
    await page.waitForFunction(() => document.body.innerText.includes('খসড়া সংরক্ষিত'), { timeout: 15000 })
    pass('editor reported "খসড়া সংরক্ষিত" (draft saved) after autosave')
    // The preview must either load the image or say it cannot; silence is the failure.
    let previewState = 'none'
    try {
      await page.waitForFunction(
        () => Array.from(document.images).some((i) => i.src.includes('picsum') && i.complete && i.naturalWidth > 0) || document.body.innerText.includes('ছবিটি লোড হচ্ছে না'),
        { timeout: 20000 },
      )
      previewState = await page.evaluate(() => (Array.from(document.images).some((i) => i.src.includes('picsum') && i.complete && i.naturalWidth > 0) ? 'loaded' : 'warned'))
    } catch {}
    assert(previewState !== 'none', `inline image preview ${previewState === 'loaded' ? 'loaded the new URL' : 'could not load it and SAID so'}`, 'inline preview neither loaded nor warned within 20s')
    await page.screenshot({ path: join(SHOTS, '01-editor.png'), fullPage: true })

    // 7 production unchanged -----------------------------------------------
    const mid = await fetchHtml('/')
    assert(!mid.html.includes(NEW_HEADLINE) && !mid.html.includes(NEW_IMAGE), 'production still shows the OLD headline (draft did not leak)', 'draft reached production before publish')

    // 8-9 preview shows draft ----------------------------------------------
    await page.goto(`${BASE}/admin/preview`, { waitUntil: 'networkidle2' })
    const previewText = await page.evaluate(() => document.body.innerText)
    assert(previewText.includes(NEW_HEADLINE), 'preview shows the NEW headline', 'preview does not show the new headline')
    const previewHasImg = await page.evaluate((u) => Array.from(document.images).some((i) => i.src === u), NEW_IMAGE)
    assert(previewHasImg, 'preview shows the NEW image', 'preview does not show the new image')
    assert(previewText.includes('খসড়া প্রিভিউ'), 'preview carries the draft banner', 'preview banner missing')
    await page.screenshot({ path: join(SHOTS, '02-preview.png'), fullPage: false })

    // 10 publish -----------------------------------------------------------
    await page.goto(`${BASE}/admin/landing`, { waitUntil: 'networkidle2' })
    const builderText = await page.evaluate(() => document.body.innerText)
    assert(builderText.includes('প্রকাশের অপেক্ষায়') && builderText.includes('hero'), 'builder lists hero as pending publish', 'builder does not show hero as pending')
    const publishBtn = await page.$$("xpath///button[contains(., 'পরিবর্তন প্রকাশ করুন')]")
    assert(publishBtn.length === 1, 'publish button present', 'publish button missing')
    await publishBtn[0].click()
    await page.waitForFunction(() => document.body.innerText.includes('প্রকাশ সফল হয়েছে'), { timeout: 20000 })
    const versionText = await page.evaluate(() => document.body.innerText.match(/সংস্করণ v(\d+)/)?.[1] ?? '')
    pass(`published: server reported version v${versionText}`)
    await page.screenshot({ path: join(SHOTS, '03-published.png'), fullPage: false })

    // 11-13 production changed ---------------------------------------------
    let after = await fetchHtml('/')
    for (let i = 0; i < 6 && !after.html.includes(NEW_HEADLINE); i += 1) {
      await new Promise((r) => setTimeout(r, 1500))
      after = await fetchHtml('/')
    }
    assert(after.html.includes(NEW_HEADLINE), 'production now shows the NEW headline', 'production did not pick up the new headline')
    assert(after.html.includes(NEW_IMAGE), 'production now shows the NEW image URL', 'production did not pick up the new image')

    // 14 mobile ------------------------------------------------------------
    const mobile = await browser.newPage()
    await mobile.setViewport({ width: 375, height: 740, isMobile: true, deviceScaleFactor: 2 })
    await mobile.goto(`${BASE}/`, { waitUntil: 'networkidle2' })
    const fit = await mobile.evaluate((u) => {
      const img = Array.from(document.images).find((i) => i.src === u)
      if (!img) return { found: false }
      const r = img.getBoundingClientRect()
      return { found: true, width: r.width, viewport: window.innerWidth, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 }
    }, NEW_IMAGE)
    assert(fit.found && fit.width <= fit.viewport && !fit.overflow, `mobile: hero image ${Math.round(fit.width ?? 0)}px fits in ${fit.viewport}px, no horizontal scroll`, `mobile layout problem: ${JSON.stringify(fit)}`)
    await mobile.screenshot({ path: join(SHOTS, '04-mobile.png'), fullPage: false })
    await mobile.close()

    // 15-16 CTA and checkout -----------------------------------------------
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' })
    const ctaHref = await page.evaluate(() => document.querySelector('main a[href="/checkout"]')?.getAttribute('href'))
    assert(ctaHref === '/checkout', 'hero CTA links to /checkout', 'hero CTA does not link to checkout')
    await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle2' })
    const co = await page.evaluate(() => ({ form: !!document.querySelector('input[name=email]'), text: document.body.innerText }))
    assert(co.form, 'checkout form renders', 'checkout form missing')
    assert(co.text.includes('৳৯৯৯'), 'checkout shows the authoritative price ৳৯৯৯', 'checkout price missing')

    // 17-18 restore previous version ---------------------------------------
    await page.goto(`${BASE}/admin/landing/versions`, { waitUntil: 'networkidle2' })
    const restoreButtons = await page.$$("xpath///button[contains(., 'এই সংস্করণ ফেরান')]")
    assert(restoreButtons.length >= 1, 'a previous version offers "restore"', 'no restorable previous version')
    await restoreButtons[0].click()
    await page.waitForFunction(() => location.pathname === '/admin/landing', { timeout: 15000 })
    await page.goto(`${BASE}/admin/landing`, { waitUntil: 'networkidle2' })
    const publishBtn2 = await page.$$("xpath///button[contains(., 'পরিবর্তন প্রকাশ করুন')]")
    await publishBtn2[0].click()
    await page.waitForFunction(() => document.body.innerText.includes('প্রকাশ সফল হয়েছে'), { timeout: 20000 })
    pass('restored the previous version into the draft and published it')
    let restored = await fetchHtml('/')
    for (let i = 0; i < 6 && restored.html.includes(NEW_HEADLINE); i += 1) {
      await new Promise((r) => setTimeout(r, 1500))
      restored = await fetchHtml('/')
    }
    const h1After = restored.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, '').trim() ?? ''
    assert(!restored.html.includes(NEW_HEADLINE) && h1After === h1Before, `production is back to the original headline: "${h1After.slice(0, 60)}"`, `production headline after restore: "${h1After.slice(0, 60)}"`)
    assert(!restored.html.includes(NEW_IMAGE), 'production no longer shows the test image', 'test image still on production after restore')

    console.log(`\nALL ${step} STEPS PASSED. Screenshots in ${SHOTS}`)
  } catch (err) {
    if (!failed) { failed = true; console.log(`ERROR  ${err instanceof Error ? err.message : err}`) }
    try { const pg = (await browser.pages()).at(-1); if (pg) { console.log('   at url:', pg.url()); await pg.screenshot({ path: join(SHOTS, 'error.png'), fullPage: true }); console.log('   body:', (await pg.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n/g, ' | ')) } } catch {}
  } finally {
    await browser.close()
  }
  process.exit(failed ? 1 : 0)
}

main()

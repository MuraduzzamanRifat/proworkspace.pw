/**
 * Permission and security tests for the admin CMS, in a real browser.
 *
 *   node --env-file=.env.local scripts/e2e-security.mjs [baseUrl]
 *
 * What it proves (brief §64–65):
 *   - every admin page redirects to login when signed out
 *   - a server action called directly, with a valid action id and NO
 *     session, is refused and changes nothing
 *   - a Customer Support user cannot see or use content, offers or users
 *   - a headline containing <script> and an inline handler is stored as text
 *     and rendered as escaped text on the live page, never executed
 *   - a javascript: image URL is refused by the server, not just the form
 *
 * The support user it creates is deactivated at the end; the XSS headline is
 * reverted by restoring the previous version. Exit code is non-zero on the
 * first failure.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import puppeteer from 'puppeteer-core'

const BASE = (process.argv[2] ?? 'http://localhost:3131').replace(/\/+$/, '')
const EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL ?? ''
const PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? ''
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']
const SHOTS = process.env.E2E_SHOTS ?? join(process.cwd(), '.e2e-shots')
const CDP_PORT = 9445
const SUPPORT_EMAIL = `e2e-support-${Date.now()}@example.com`
const SUPPORT_PASSWORD = `Support-Pass-${Date.now()}-xyz`
const XSS = '<script>alert("xss")</script> <img src=x onerror=alert(1)>'

let step = 0
let failed = false
const pass = (m) => console.log(`PASS ${String((step += 1)).padStart(2)}  ${m}`)
const fail = (m) => {
  step += 1
  failed = true
  console.log(`FAIL ${String(step).padStart(2)}  ${m}`)
  throw new Error(m)
}
const assert = (c, ok, bad) => (c ? pass(ok) : fail(bad))
const note = (m) => console.log(`NOTE     ${m}`)

async function launchEdge(exe) {
  try {
    const stray = await puppeteer.connect({ browserURL: `http://127.0.0.1:${CDP_PORT}` })
    await stray.close()
  } catch {}
  const profile = join(SHOTS, `edge-sec-${Date.now()}`)
  const child = spawn(
    exe,
    ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-features=msSmartScreenProtection,msEdgeSmartScreen', '--window-size=1280,900', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, 'about:blank'],
    { detached: true, stdio: 'ignore', windowsHide: true },
  )
  child.unref()
  for (let i = 0; i < 40; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok) break
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return puppeteer.connect({ browserURL: `http://127.0.0.1:${CDP_PORT}`, defaultViewport: null })
}

async function login(page, email, password) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle2' })
  await page.type('#email', email)
  await page.type('#password', password)
  await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }).catch(() => {}), page.click('button[type=submit]')])
  await page.waitForFunction(() => !location.pathname.endsWith('/admin/login') || document.body.innerText.includes('সঠিক নয়') || document.body.innerText.includes('অনেকবার চেষ্টা'), { timeout: 60000 }).catch(() => {})
  const loginText = await page.evaluate(() => document.body.innerText)
  if (loginText.includes('অনেকবার চেষ্টা')) fail('login rate limiter is active for this address (10 attempts / 15 min) — clear it with scripts/reset-rate-limit.ts admin-login:')
}
async function logout(page) {
  const btn = await page.$$("xpath///button[contains(., 'লগআউট')]")
  if (btn[0]) await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), btn[0].click()])
}
async function clearAndType(page, selector, text) {
  await page.click(selector)
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  if (text) await page.type(selector, text)
}
const bodyText = (page) => page.evaluate(() => document.body.innerText)

/** Find a server action id by its export name in the built client chunks. */
function findActionId(exportName) {
  const dir = join(process.cwd(), '.next', 'static', 'chunks')
  if (!existsSync(dir)) return null
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop()
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name)
      if (f.isDirectory()) stack.push(p)
      else if (f.name.endsWith('.js')) {
        const src = readFileSync(p, 'utf8')
        const m = src.match(new RegExp(`"([0-9a-f]{40,})"[^"]{0,240}"${exportName}"`))
        if (m) return m[1]
      }
    }
  }
  return null
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD must be set')
    process.exit(2)
  }
  mkdirSync(SHOTS, { recursive: true })
  const exe = EDGE.find((p) => existsSync(p))
  if (!exe) {
    console.error('Microsoft Edge not found')
    process.exit(2)
  }

  // --- 1. Signed-out access (plain HTTP, no browser needed) -----------------
  for (const path of ['/admin', '/admin/landing', '/admin/landing/hero', '/admin/preview', '/admin/offers', '/admin/users', '/admin/audit', '/admin/settings', '/admin/media']) {
    const r = await fetch(`${BASE}${path}`, { redirect: 'manual' })
    const loc = r.headers.get('location') ?? ''
    assert(r.status === 307 && loc.includes('/admin/login'), `signed out: ${path} -> 307 to login`, `signed out: ${path} -> ${r.status} ${loc}`)
  }

  // --- 2. Direct server-action call without a session ------------------------
  const actionId = findActionId('saveSectionDraft')
  if (!actionId) {
    note('could not locate the saveSectionDraft action id in the client bundle; direct-call test skipped (UNVERIFIED)')
  } else {
    const r = await fetch(`${BASE}/admin/landing/hero`, {
      method: 'POST',
      headers: { 'Next-Action': actionId, 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component' },
      body: JSON.stringify(['hero', { headlineLines: ['HACKED BY DIRECT CALL'] }]),
      redirect: 'manual',
    })
    const text = await r.text().catch(() => '')
    const refused = r.status === 307 || r.status === 303 || /সেশনের মেয়াদ শেষ|Unauthorized|not allowed/.test(text) || /"ok":false/.test(text)
    assert(refused, `direct action call without session refused (HTTP ${r.status})`, `direct action call was NOT refused: HTTP ${r.status} ${text.slice(0, 120)}`)
  }

  const browser = await launchEdge(exe)
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900 })
    page.on('dialog', (d) => d.accept())

    // --- 3. As super admin: create a support user ----------------------------
    await login(page, EMAIL, PASSWORD)
    assert(page.url().includes('/admin'), 'super admin logged in', `login failed: ${page.url()}`)

    // The direct-call attempt above must have changed nothing.
    await page.goto(`${BASE}/admin/landing/hero`, { waitUntil: 'networkidle2' })
    const headlineNow = await page.$eval('#headlineLines', (el) => el.value)
    assert(!headlineNow.includes('HACKED'), 'draft headline untouched by the direct call', `draft headline was modified: ${headlineNow.slice(0, 60)}`)

    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle2' })
    await page.type('input[name=email]', SUPPORT_EMAIL)
    await page.type('input[name=name]', 'E2E Support')
    await page.select("form:has(input[name=email]) select[name=role]", 'support')
    await page.type('input[name=password]', SUPPORT_PASSWORD)
    const createBtn = await page.$$("xpath///form[.//input[@name='email']]//button[@type='submit']")
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), createBtn[0].click()])
    await page.waitForFunction(() => location.search.includes('msg=') || location.search.includes('error='), { timeout: 15000 })
    assert(decodeURIComponent(page.url()).includes('তৈরি হয়েছে'), `created support user ${SUPPORT_EMAIL}`, `support user was not created: ${decodeURIComponent(page.url()).slice(-120)}`)
    await logout(page)

    // --- 4. As support: what is hidden, what is refused ----------------------
    await login(page, SUPPORT_EMAIL, SUPPORT_PASSWORD)
    const navText = await page.evaluate(() => document.querySelector('nav[aria-label="অ্যাডমিন"]')?.innerText ?? '')
    assert(!navText.includes('ল্যান্ডিং পেজ') && !navText.includes('ব্যবহারকারী') && !navText.includes('অফার'), 'support nav hides landing page, offers and users', `support nav shows too much: ${navText.replace(/\n/g, ' | ')}`)

    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle2' })
    assert(!page.url().includes('/admin/users') && decodeURIComponent(page.url()).includes('অনুমতি'), 'support: /admin/users redirected away with a permission message in the URL', `support reached ${page.url()}`)
    await page.waitForFunction(() => document.body.innerText.includes('অনুমতি'), { timeout: 10000 }).catch(() => {})
    assert((await bodyText(page)).includes('অনুমতি'), 'support: the permission message is VISIBLE on the dashboard', 'the dashboard did not display the permission message')

    await page.goto(`${BASE}/admin/landing`, { waitUntil: 'networkidle2' })
    const landingText = await bodyText(page)
    const publishButtons = await page.$$("xpath///button[contains(., 'পরিবর্তন প্রকাশ করুন')]")
    assert(publishButtons.length === 0 && landingText.includes('প্রকাশ করার অনুমতি আপনার নেই'), 'support: no publish button, permission notice shown', 'support could see a publish control')
    const rowButtons = await page.$$("xpath///button[contains(., 'বন্ধ করুন') or contains(., 'কপি') or contains(., 'মুছুন')]")
    assert(rowButtons.length === 0, 'support: no enable/duplicate/delete controls in the builder', 'support saw section controls')

    await page.goto(`${BASE}/admin/offers`, { waitUntil: 'networkidle2' })
    const priceDisabled = await page.$eval('input[name=price]', (el) => el.disabled).catch(() => null)
    assert(priceDisabled === true, 'support: offer price inputs are disabled', `support: price input disabled=${priceDisabled}`)
    await logout(page)

    // --- 5. As super admin: stored XSS attempt and javascript: URL -----------
    await login(page, EMAIL, PASSWORD)
    await page.goto(`${BASE}/admin/landing/hero`, { waitUntil: 'networkidle2' })
    const originalHeadline = await page.$eval('#headlineLines', (el) => el.value)

    await clearAndType(page, '#image\\.url', 'javascript:alert(1)')
    await page.waitForFunction(() => document.body.innerText.includes('শুধু https:// লিংক গ্রহণযোগ্য'), { timeout: 5000 })
    pass('form warns that only https:// image URLs are accepted')
    await page.waitForFunction(() => document.body.innerText.includes('সংরক্ষণ ব্যর্থ'), { timeout: 15000 })
    pass('server refused the javascript: URL on save (status shows "সংরক্ষণ ব্যর্থ")')
    await clearAndType(page, '#image\\.url', '')

    await clearAndType(page, '#headlineLines', XSS)
    await page.waitForFunction(() => document.body.innerText.includes('খসড়া সংরক্ষিত'), { timeout: 15000 })
    pass('headline containing <script> was accepted as TEXT (draft saved)')

    await page.goto(`${BASE}/admin/landing`, { waitUntil: 'networkidle2' })
    const publishBtn = await page.$$("xpath///button[contains(., 'পরিবর্তন প্রকাশ করুন')]")
    await publishBtn[0].click()
    await page.waitForFunction(() => document.body.innerText.includes('প্রকাশ সফল হয়েছে'), { timeout: 20000 })
    pass('published the XSS-bearing draft')

    let html = ''
    for (let i = 0; i < 8; i += 1) {
      html = await (await fetch(`${BASE}/`, { headers: { 'cache-control': 'no-cache' } })).text()
      if (html.includes('&lt;script&gt;')) break
      await new Promise((r) => setTimeout(r, 1500))
    }
    assert(html.includes('&lt;script&gt;alert'), 'live page contains the headline as ESCAPED text', 'escaped headline not found on the live page')
    assert(!/<script>alert\("xss"\)/.test(html), 'live page contains no executable <script> from the headline', 'raw <script> found on the live page')
    assert(!/<img[^>]*onerror/i.test(html), 'live page has no <img onerror> attribute from the headline', 'raw onerror attribute found on the live page')

    const live = await browser.newPage()
    let dialogs = 0
    live.on('dialog', (d) => {
      dialogs += 1
      d.dismiss()
    })
    await live.goto(`${BASE}/`, { waitUntil: 'networkidle2' })
    assert(dialogs === 0, 'no alert() fired when the live page rendered', `${dialogs} alert dialog(s) fired on the live page`)
    await live.close()

    // --- 6. Revert: restore the previous version and publish ----------------
    await page.goto(`${BASE}/admin/landing/versions`, { waitUntil: 'networkidle2' })
    const restore = await page.$$("xpath///button[contains(., 'এই সংস্করণ ফেরান')]")
    await restore[0].click()
    await page.waitForFunction(() => location.pathname === '/admin/landing', { timeout: 15000 })
    await page.goto(`${BASE}/admin/landing`, { waitUntil: 'networkidle2' })
    const publishBtn2 = await page.$$("xpath///button[contains(., 'পরিবর্তন প্রকাশ করুন')]")
    await publishBtn2[0].click()
    await page.waitForFunction(() => document.body.innerText.includes('প্রকাশ সফল হয়েছে'), { timeout: 20000 })
    let back = ''
    for (let i = 0; i < 8; i += 1) {
      back = await (await fetch(`${BASE}/`, { headers: { 'cache-control': 'no-cache' } })).text()
      if (!back.includes('&lt;script&gt;')) break
      await new Promise((r) => setTimeout(r, 1500))
    }
    assert(!back.includes('&lt;script&gt;'), 'reverted: live page no longer carries the test headline', 'live page still carries the XSS text after restore')
    await page.goto(`${BASE}/admin/landing/hero`, { waitUntil: 'networkidle2' })
    const nowHeadline = await page.$eval('#headlineLines', (el) => el.value)
    assert(nowHeadline === originalHeadline, 'draft headline restored to the original', `draft headline differs after restore: ${nowHeadline.slice(0, 60)}`)

    // --- 7. Clean up: deactivate the support user ----------------------------
    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle2' })
    const rowBtn = await page.$$(`xpath///tr[contains(., '${SUPPORT_EMAIL}')]//button[contains(., 'বন্ধ করুন')]`)
    assert(rowBtn.length === 1, 'found the support user row', 'support user row not found for cleanup')
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), rowBtn[0].click()])
    await page.waitForFunction(() => location.search.includes('msg=') || location.search.includes('error='), { timeout: 15000 })
    assert(decodeURIComponent(page.url()).includes('বন্ধ করা হয়েছে'), 'support user deactivated (sessions ended)', `could not deactivate the support user: ${decodeURIComponent(page.url()).slice(-120)}`)

    console.log(`\nALL ${step} SECURITY STEPS PASSED.`)
  } catch (err) {
    if (!failed) {
      failed = true
      console.log(`ERROR  ${err instanceof Error ? err.message : err}`)
    }
    try {
      const pg = (await browser.pages()).at(-1)
      if (pg) {
        console.log('   at url:', pg.url())
        await pg.screenshot({ path: join(SHOTS, 'security-error.png'), fullPage: true })
      }
    } catch {}
  } finally {
    await browser.close()
  }
  process.exit(failed ? 1 : 0)
}

main()

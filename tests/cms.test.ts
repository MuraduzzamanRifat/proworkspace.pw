import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { checkPublish } from '../src/cms/publish'
import { DEFAULT_PAGE, SECTION_DEFINITIONS } from '../src/cms/registry'
import {
  SECTION_SCHEMAS,
  SECTION_TYPES,
  ctaActionSchema,
  parseSectionContent,
  safeHttpsUrl,
  validateSectionContent,
} from '../src/cms/schemas'
import { splitParagraphs, tokenizeLine } from '../src/components/landing/rich-parse'
import { can } from '../src/lib/permissions'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

describe('safe URLs', () => {
  test('accepts https and empty', () => {
    assert.equal(safeHttpsUrl.safeParse('https://cdn.example.com/a.webp').success, true)
    assert.equal(safeHttpsUrl.safeParse('').success, true)
  })

  for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'file:///etc/passwd', 'http://example.com/a.png', 'https://x.com/a b', 'vbscript:x']) {
    test(`rejects ${bad.split(':')[0]}: URLs (${bad.slice(0, 24)})`, () => {
      assert.equal(safeHttpsUrl.safeParse(bad).success, false)
    })
  }
})

describe('CTA actions', () => {
  test('checkout, scroll, external, internal, none all validate', () => {
    for (const a of [
      { type: 'checkout' },
      { type: 'scroll', target: 'offer' },
      { type: 'external', url: 'https://example.com' },
      { type: 'internal', path: '/checkout' },
      { type: 'none' },
    ]) {
      assert.equal(ctaActionSchema.safeParse(a).success, true, JSON.stringify(a))
    }
  })

  test('refuses arbitrary javascript or unknown types', () => {
    assert.equal(ctaActionSchema.safeParse({ type: 'js', code: 'alert(1)' }).success, false)
    assert.equal(ctaActionSchema.safeParse({ type: 'external', url: 'javascript:alert(1)' }).success, false)
    assert.equal(ctaActionSchema.safeParse({ type: 'scroll', target: '<script>' }).success, false)
    assert.equal(ctaActionSchema.safeParse({ type: 'internal', path: 'https://evil' }).success, false)
  })
})

describe('section defaults', () => {
  for (const type of SECTION_TYPES) {
    test(`${type}: defaults satisfy the schema`, () => {
      const def = SECTION_DEFINITIONS[type]
      const issues = validateSectionContent(type, def.defaults())
      assert.deepEqual(issues, [])
    })
  }

  test('every default page instance parses and every key is unique', () => {
    const keys = new Set<string>()
    for (const s of DEFAULT_PAGE) {
      assert.equal(keys.has(s.key), false, `duplicate key ${s.key}`)
      keys.add(s.key)
      assert.deepEqual(validateSectionContent(s.type, s.content()), [])
    }
    assert.ok(DEFAULT_PAGE.some((s) => s.type === 'hero'))
    assert.ok(DEFAULT_PAGE.some((s) => s.type === 'seo'))
  })

  test('the default hero carries the live headline and a checkout CTA', () => {
    const hero = SECTION_DEFINITIONS.hero.defaults()
    assert.ok(hero.headlineLines.length >= 1)
    assert.equal(hero.primaryCta.action.type, 'checkout')
  })

  test('every field spec name exists on its schema (no dead form fields)', () => {
    for (const type of SECTION_TYPES) {
      const def = SECTION_DEFINITIONS[type]
      const shape = (SECTION_SCHEMAS[type] as unknown as { shape: Record<string, unknown> }).shape
      for (const f of def.fields) {
        assert.ok(f.name in shape, `${type}.${f.name} is in the form but not the schema`)
      }
    }
  })
})

describe('stored content is parsed defensively', () => {
  test('garbage falls back to defaults and reports issues instead of throwing', () => {
    const r = parseSectionContent('hero', { headlineLines: 'not-an-array', primaryCta: 42 })
    assert.ok(r.issues.length > 0)
    assert.ok(Array.isArray(r.content.headlineLines))
  })

  test('script tags survive as literal text; they are never interpreted', () => {
    const r = parseSectionContent('hero', { headlineLines: ['<script>alert(1)</script>'] })
    assert.deepEqual(r.issues, [])
    assert.equal(r.content.headlineLines[0], '<script>alert(1)</script>')
  })

  test('over-long text is refused rather than truncated silently', () => {
    const issues = validateSectionContent('faq', { items: [{ id: 'a', question: 'x'.repeat(201), answer: '' }] })
    assert.ok(issues.length > 0)
  })
})

// ---------------------------------------------------------------------------
// Rich text
// ---------------------------------------------------------------------------

describe('rich text tokeniser', () => {
  test('bold, italic and https links', () => {
    assert.deepEqual(tokenizeLine('a **b** *c* [d](https://e.com) f'), [
      { kind: 'text', text: 'a ' },
      { kind: 'bold', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'italic', text: 'c' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'd', href: 'https://e.com' },
      { kind: 'text', text: ' f' },
    ])
  })

  test('a javascript: link is not a link', () => {
    assert.deepEqual(tokenizeLine('[x](javascript:alert(1))'), [{ kind: 'text', text: '[x](javascript:alert(1))' }])
  })

  test('HTML is text', () => {
    assert.deepEqual(tokenizeLine('<b>hi</b>'), [{ kind: 'text', text: '<b>hi</b>' }])
  })

  test('paragraph splitting ignores blank-only paragraphs', () => {
    assert.deepEqual(splitParagraphs('a\n\n\n  \nb'), ['a', 'b'])
  })
})

// ---------------------------------------------------------------------------
// Publish gate
// ---------------------------------------------------------------------------

const offer = { code: 'bundle', pricePoisha: 99900, isActive: true, isDefault: true }
function page(over: Partial<Record<string, { enabled?: boolean; content?: Record<string, unknown> }>> = {}) {
  return DEFAULT_PAGE.map((s) => ({
    key: s.key,
    type: s.type,
    enabled: over[s.key]?.enabled ?? s.enabled,
    sortOrder: s.sortOrder,
    content: { ...s.content(), ...(over[s.key]?.content ?? {}) },
  }))
}

describe('publish gate', () => {
  test('the default page with a live offer passes', () => {
    const r = checkPublish(page(), [offer])
    assert.deepEqual(r.errors, [])
  })

  test('no active offer blocks publishing', () => {
    const r = checkPublish(page(), [{ ...offer, isActive: false }])
    assert.ok(r.errors.some((e) => e.key === 'offer'))
  })

  test('a zero-price offer blocks publishing', () => {
    const r = checkPublish(page(), [{ ...offer, pricePoisha: 0 }])
    assert.ok(r.errors.some((e) => e.key === 'offer'))
  })

  test('an empty hero headline blocks publishing', () => {
    const r = checkPublish(page({ hero: { content: { headlineLines: ['', '  '] } } }), [offer])
    assert.ok(r.errors.some((e) => e.key === 'hero' && /শিরোনাম/.test(e.message)))
  })

  test('a hero CTA with no destination blocks publishing', () => {
    const r = checkPublish(page({ hero: { content: { primaryCta: { label: 'Buy', action: { type: 'none' } } } } }), [offer])
    assert.ok(r.errors.some((e) => e.key === 'hero' && /গন্তব্য/.test(e.message)))
  })

  test('a disabled hero blocks publishing', () => {
    const r = checkPublish(page({ hero: { enabled: false } }), [offer])
    assert.ok(r.errors.some((e) => e.key === 'hero'))
  })

  test('a scroll CTA to a disabled section blocks publishing', () => {
    const r = checkPublish(
      page({ intro: { content: { cta: { label: 'See', action: { type: 'scroll', target: 'trust' } } } } }),
      [offer],
    )
    assert.ok(r.errors.some((e) => e.key === 'intro' && /trust/.test(e.message)))
  })

  test('a scroll CTA to an enabled section passes', () => {
    const r = checkPublish(page({ intro: { content: { cta: { label: 'See', action: { type: 'scroll', target: 'offer' } } } } }), [offer])
    assert.deepEqual(r.errors, [])
  })

  test('invalid stored content (bad image URL) blocks publishing', () => {
    const r = checkPublish(page({ hero: { content: { image: { url: 'javascript:x', alt: '' } } } }), [offer])
    assert.ok(r.errors.some((e) => e.key === 'hero'))
  })

  test('an empty SEO title blocks; a long one only warns', () => {
    assert.ok(checkPublish(page({ seo: { content: { title: '' } } }), [offer]).errors.some((e) => e.key === 'seo'))
    const long = checkPublish(page({ seo: { content: { title: 'x'.repeat(80) } } }), [offer])
    assert.deepEqual(long.errors, [])
    assert.ok(long.warnings.some((w) => w.key === 'seo'))
  })

  test('disabled sections are not validated for required text', () => {
    const r = checkPublish(page({ 'bonus-leads': { enabled: false, content: { title: '' } } }), [offer])
    assert.deepEqual(r.errors, [])
  })
})

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

describe('permissions matrix', () => {
  test('marketing edits and publishes content but cannot touch prices, settings or users', () => {
    assert.equal(can('marketing', 'content.edit'), true)
    assert.equal(can('marketing', 'content.publish'), true)
    assert.equal(can('marketing', 'media.manage'), true)
    assert.equal(can('marketing', 'commerce.manage'), false)
    assert.equal(can('marketing', 'settings.manage'), false)
    assert.equal(can('marketing', 'users.manage'), false)
    assert.equal(can('marketing', 'audit.view'), false)
  })

  test('support can only see orders/customers and act on orders', () => {
    assert.equal(can('support', 'orders.view'), true)
    assert.equal(can('support', 'orders.manage'), true)
    assert.equal(can('support', 'customers.view'), true)
    assert.equal(can('support', 'content.edit'), false)
    assert.equal(can('support', 'content.publish'), false)
    assert.equal(can('support', 'commerce.manage'), false)
  })

  test('admin has everything except user management; super admin has all', () => {
    assert.equal(can('admin', 'commerce.manage'), true)
    assert.equal(can('admin', 'users.manage'), false)
    assert.equal(can('super_admin', 'users.manage'), true)
  })
})

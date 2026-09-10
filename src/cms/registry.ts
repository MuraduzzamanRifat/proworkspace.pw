import { BOOK, DELIVERABLES } from '@/config/product'
import { LANDING } from '@/content/landing'
import { formatBdt } from '@/domain/money'
import { SECTION_SCHEMAS, type SectionContent, type SectionType } from '@/cms/schemas'

/**
 * Section registry: what each type is called, how its form is laid out, and
 * what it contains before anyone has edited anything.
 *
 * The defaults are the current landing page, so the first publish after
 * seeding renders byte-for-byte what the hard-coded page rendered. From then
 * on the database owns the words.
 *
 * Field specs drive one generic editor (src/app/admin/(protected)/landing/
 * SectionEditor.tsx). Adding a section type is: schema + entry here + a
 * renderer case. No new form code.
 */

// ---------------------------------------------------------------------------
// Field specification for the generic editor
// ---------------------------------------------------------------------------

export type FieldSpec =
  | { kind: 'text'; name: string; label: string; help?: string; required?: boolean }
  | { kind: 'textarea'; name: string; label: string; help?: string; rows?: number; rich?: boolean; required?: boolean }
  | { kind: 'lines'; name: string; label: string; help?: string; required?: boolean }
  | { kind: 'paragraphs'; name: string; label: string; help?: string }
  | { kind: 'boolean'; name: string; label: string; help?: string }
  | { kind: 'number'; name: string; label: string; min?: number; max?: number }
  | { kind: 'select'; name: string; label: string; options: Array<{ value: string; label: string }> }
  | { kind: 'image'; name: string; label: string; help?: string }
  | { kind: 'url'; name: string; label: string; help?: string }
  | { kind: 'cta'; name: string; label: string }
  | { kind: 'list'; name: string; label: string; itemLabel: string; fields: FieldSpec[] }

export interface SectionDefinition<T extends SectionType = SectionType> {
  type: T
  /** Shown in the builder and the nav. */
  label: string
  description: string
  /** Rendered in the ordered page body (false = global: footer, seo). */
  inPage: boolean
  /** May exist more than once on the page (bonus sections). */
  duplicable: boolean
  fields: FieldSpec[]
  defaults: () => SectionContent<T>
}

const theme: FieldSpec = {
  kind: 'select',
  name: 'theme',
  label: 'পটভূমি',
  options: [
    { value: 'flat', label: 'সমতল' },
    { value: 'raised', label: 'হালকা উঁচু' },
  ],
}
const cta = (name: string, label: string): FieldSpec => ({ kind: 'cta', name, label })
const image = (name: string, label: string, help?: string): FieldSpec => ({ kind: 'image', name, label, help })

const ebook = DELIVERABLES.find((d) => d.key === 'ebook')!
const workflows = DELIVERABLES.find((d) => d.key === 'workflows')!
const leads = DELIVERABLES.find((d) => d.key === 'leads')!

let seq = 0
const id = (prefix: string) => `${prefix}-${(seq += 1)}`

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export const SECTION_DEFINITIONS: { [T in SectionType]: SectionDefinition<T> } = {
  hero: {
    type: 'hero',
    label: 'হিরো',
    description: 'পেজের প্রথম অংশ: শিরোনাম, উপশিরোনাম, দাম ও প্রধান বোতাম।',
    inPage: true,
    duplicable: false,
    fields: [
      { kind: 'text', name: 'eyebrow', label: 'আইব্রো টেক্সট', help: 'শিরোনামের উপরে ছোট লেবেল' },
      { kind: 'lines', name: 'headlineLines', label: 'মূল শিরোনাম', help: 'প্রতি লাইনে একটি অংশ', required: true },
      { kind: 'text', name: 'highlightText', label: 'হাইলাইট অংশ', help: 'শিরোনামের যে অংশটি রঙিন হবে (ঐচ্ছিক)' },
      { kind: 'textarea', name: 'subheadline', label: 'উপশিরোনাম', rows: 3 },
      { kind: 'text', name: 'bonusIntro', label: 'বোনাস ভূমিকা' },
      { kind: 'lines', name: 'bonusItems', label: 'বোনাস তালিকা' },
      { kind: 'text', name: 'bookMeta', label: 'বইয়ের তথ্যরেখা' },
      image('image', 'ডেস্কটপ ছবি'),
      image('mobileImage', 'মোবাইল ছবি', 'খালি রাখলে ডেস্কটপ ছবিই দেখাবে'),
      { kind: 'url', name: 'videoUrl', label: 'ভিডিও লিংক', help: 'YouTube watch বা embed লিংক (https)' },
      cta('primaryCta', 'প্রধান বোতাম'),
      cta('secondaryCta', 'দ্বিতীয় বোতাম'),
      { kind: 'boolean', name: 'showPrice', label: 'দাম দেখান', help: 'দামটি অফার থেকে আসে; এখানে শুধু দেখানো/লুকানো' },
      { kind: 'text', name: 'trustLine', label: 'বিশ্বাসের লাইন', help: 'বোতামের নিচের ছোট লেখা' },
      { kind: 'text', name: 'badge', label: 'ব্যাজ', help: 'খালি রাখলে দেখাবে না' },
    ],
    defaults: () => ({
      eyebrow: LANDING.hero.eyebrow,
      headlineLines: [...LANDING.hero.headline],
      highlightText: '',
      subheadline: LANDING.hero.subheadline,
      bonusIntro: LANDING.hero.bonusIntro,
      bonusItems: [...LANDING.hero.bonuses],
      bookMeta: LANDING.hero.bookMeta,
      image: { url: '', alt: '' },
      mobileImage: { url: '', alt: '' },
      videoUrl: '',
      primaryCta: { label: LANDING.hero.ctaLabel, action: { type: 'checkout' } },
      secondaryCta: { label: '', action: { type: 'none' } },
      showPrice: true,
      trustLine: LANDING.hero.ctaSubtext,
      badge: '',
    }),
  },

  intro: {
    type: 'intro',
    label: 'পণ্য পরিচিতি',
    description: 'সমস্যা/প্রেক্ষাপট: কেন এখন শুধু প্রম্পট যথেষ্ট নয়।',
    inPage: true,
    duplicable: false,
    fields: [
      { kind: 'text', name: 'heading', label: 'শিরোনাম', required: true },
      { kind: 'textarea', name: 'sub', label: 'উপশিরোনাম', rows: 2 },
      { kind: 'textarea', name: 'lead', label: 'ভূমিকা', rows: 2, rich: true },
      { kind: 'lines', name: 'items', label: 'পয়েন্ট তালিকা' },
      { kind: 'textarea', name: 'closing', label: 'সমাপ্তি বাক্য', rows: 2 },
      cta('cta', 'বোতাম'),
      theme,
    ],
    defaults: () => ({
      heading: LANDING.agents.heading,
      sub: LANDING.agents.sub,
      lead: LANDING.agents.lead,
      items: [...LANDING.agents.items],
      closing: LANDING.agents.closing,
      cta: { label: 'Get the eBook + Bonus Bundle', action: { type: 'checkout' } },
      theme: 'flat',
    }),
  },

  book: {
    type: 'book',
    label: 'পণ্যের গল্প (বই)',
    description: 'বইটি কী, কেন আলাদা, লেখক।',
    inPage: true,
    duplicable: false,
    fields: [
      { kind: 'textarea', name: 'heading', label: 'শিরোনাম', rows: 2, required: true },
      { kind: 'lines', name: 'tagline', label: 'ট্যাগলাইন', help: 'ছোট ছোট বাক্য, প্রতি লাইনে একটি' },
      { kind: 'text', name: 'title', label: 'বইয়ের নাম' },
      { kind: 'text', name: 'subtitle', label: 'বইয়ের উপনাম' },
      { kind: 'textarea', name: 'lead', label: 'মূল বাক্য', rows: 2, rich: true },
      { kind: 'paragraphs', name: 'paragraphs', label: 'অনুচ্ছেদ', help: 'ফাঁকা লাইন দিয়ে অনুচ্ছেদ আলাদা করুন' },
      { kind: 'text', name: 'authorLine', label: 'লেখক-রেখা' },
      { kind: 'textarea', name: 'quote', label: 'উদ্ধৃতি (ঐচ্ছিক)', rows: 2 },
      image('image', 'ছবি (কভার)'),
      { kind: 'url', name: 'videoUrl', label: 'ভিডিও লিংক' },
      cta('cta', 'বোতাম'),
      {
        kind: 'select',
        name: 'layout',
        label: 'বিন্যাস',
        options: [
          { value: 'centered', label: 'মাঝখানে' },
          { value: 'image-left', label: 'ছবি বামে' },
          { value: 'image-right', label: 'ছবি ডানে' },
        ],
      },
      theme,
    ],
    defaults: () => ({
      heading: LANDING.book.heading,
      tagline: [...LANDING.book.tagline],
      title: LANDING.book.title,
      subtitle: LANDING.book.subtitle,
      lead: LANDING.book.lead,
      paragraphs: [...LANDING.book.paragraphs],
      authorLine: LANDING.book.authorLine,
      quote: '',
      image: { url: '', alt: '' },
      videoUrl: '',
      cta: { label: '', action: { type: 'none' } },
      theme: 'raised',
      layout: 'centered',
    }),
  },

  benefits: {
    type: 'benefits',
    label: 'সুবিধা',
    description: 'পড়ার পর কী কী পরিষ্কার হবে — কার্ড আকারে।',
    inPage: true,
    duplicable: false,
    fields: [
      { kind: 'text', name: 'heading', label: 'শিরোনাম', required: true },
      { kind: 'textarea', name: 'sub', label: 'উপশিরোনাম', rows: 2 },
      {
        kind: 'list',
        name: 'items',
        label: 'সুবিধার তালিকা',
        itemLabel: 'সুবিধা',
        fields: [
          {
            kind: 'select',
            name: 'icon',
            label: 'আইকন',
            options: ['check', 'spark', 'bolt', 'book', 'gear', 'chart', 'shield', 'star'].map((v) => ({ value: v, label: v })),
          },
          { kind: 'text', name: 'title', label: 'শিরোনাম' },
          { kind: 'textarea', name: 'description', label: 'বিবরণ', rows: 2 },
          { kind: 'boolean', name: 'enabled', label: 'দেখান' },
        ],
      },
      theme,
    ],
    defaults: () => ({
      heading: LANDING.practical.heading,
      sub: LANDING.practical.sub,
      items: LANDING.practical.items.map((t) => ({ id: id('benefit'), icon: 'check' as const, title: t, description: '', enabled: true })),
      theme: 'flat',
    }),
  },

  bonus: {
    type: 'bonus',
    label: 'বোনাস',
    description: 'একটি বোনাস আইটেমের বিস্তারিত। একাধিক বোনাস সেকশন রাখা যায়।',
    inPage: true,
    duplicable: true,
    fields: [
      { kind: 'text', name: 'badge', label: 'ব্যাজ' },
      { kind: 'text', name: 'title', label: 'শিরোনাম', required: true },
      { kind: 'textarea', name: 'sub', label: 'উপশিরোনাম', rows: 2 },
      { kind: 'textarea', name: 'lead', label: 'ভূমিকা', rows: 3, rich: true },
      { kind: 'text', name: 'usesHeading', label: 'ব্যবহার-তালিকার শিরোনাম' },
      { kind: 'lines', name: 'uses', label: 'ব্যবহার তালিকা' },
      { kind: 'text', name: 'whyHeading', label: '"কেন গুরুত্বপূর্ণ" শিরোনাম' },
      { kind: 'paragraphs', name: 'why', label: '"কেন গুরুত্বপূর্ণ" অনুচ্ছেদ' },
      { kind: 'text', name: 'valueLabel', label: 'মূল্য-লেবেল', help: 'যেমন: Bonus Value: ৳২,০০০' },
      { kind: 'textarea', name: 'notice', label: 'নোটিশ', rows: 3, help: 'Technical note / Responsible-use notice' },
      {
        kind: 'select',
        name: 'noticeTone',
        label: 'নোটিশের ধরন',
        options: [
          { value: 'neutral', label: 'সাধারণ' },
          { value: 'warning', label: 'সতর্কতা (হলুদ)' },
        ],
      },
      image('image', 'ছবি (ঐচ্ছিক)'),
      cta('cta', 'বোতাম'),
      theme,
    ],
    defaults: () => ({
      badge: 'BONUS',
      title: workflows.label,
      sub: '',
      lead: LANDING.bonusWorkflows.lead,
      usesHeading: LANDING.bonusWorkflows.usesHeading,
      uses: [...LANDING.bonusWorkflows.uses],
      whyHeading: LANDING.bonusWorkflows.whyHeading,
      why: [...LANDING.bonusWorkflows.why],
      valueLabel: LANDING.bonusWorkflows.valueLabel,
      notice: LANDING.bonusWorkflows.technicalNote,
      noticeTone: 'neutral',
      image: { url: '', alt: '' },
      cta: { label: 'Get the eBook + Bonus Bundle', action: { type: 'checkout' } },
      theme: 'raised',
    }),
  },

  steps: {
    type: 'steps',
    label: 'কীভাবে কাজ করে',
    description: 'ধাপে ধাপে: Learn → Explore → Apply।',
    inPage: true,
    duplicable: false,
    fields: [
      { kind: 'text', name: 'heading', label: 'শিরোনাম', required: true },
      {
        kind: 'list',
        name: 'steps',
        label: 'ধাপসমূহ',
        itemLabel: 'ধাপ',
        fields: [
          { kind: 'text', name: 'number', label: 'নম্বর', help: 'যেমন 01.' },
          { kind: 'text', name: 'title', label: 'শিরোনাম' },
          { kind: 'textarea', name: 'body', label: 'বিবরণ', rows: 2 },
          { kind: 'boolean', name: 'enabled', label: 'দেখান' },
        ],
      },
      cta('cta', 'বোতাম'),
      theme,
    ],
    defaults: () => ({
      heading: LANDING.threeResources.heading,
      steps: LANDING.threeResources.steps.map((s) => ({ id: id('step'), number: s.n, title: s.title, body: s.body, enabled: true })),
      cta: { label: 'Get the guide now', action: { type: 'checkout' } },
      theme: 'raised',
    }),
  },

  audience: {
    type: 'audience',
    label: 'কার জন্য / কার জন্য নয়',
    description: 'বাস্তবসম্মত প্রত্যাশা — দুই কলাম।',
    inPage: true,
    duplicable: false,
    fields: [
      { kind: 'text', name: 'forHeading', label: '"কার জন্য" শিরোনাম' },
      { kind: 'text', name: 'forLead', label: '"কার জন্য" ভূমিকা' },
      { kind: 'lines', name: 'forItems', label: '"কার জন্য" তালিকা' },
      { kind: 'textarea', name: 'forNote', label: '"কার জন্য" নোট', rows: 2 },
      { kind: 'text', name: 'notHeading', label: '"কার জন্য নয়" শিরোনাম' },
      { kind: 'text', name: 'notLead', label: '"কার জন্য নয়" ভূমিকা' },
      { kind: 'lines', name: 'notItems', label: '"কার জন্য নয়" তালিকা' },
      { kind: 'paragraphs', name: 'closing', label: 'সমাপ্তি অনুচ্ছেদ' },
    ],
    defaults: () => ({
      forHeading: LANDING.forWhom.heading,
      forLead: LANDING.forWhom.lead,
      forItems: [...LANDING.forWhom.items],
      forNote: LANDING.forWhom.note,
      notHeading: LANDING.notFor.heading,
      notLead: LANDING.notFor.lead,
      notItems: [...LANDING.notFor.items],
      closing: [...LANDING.notFor.closing],
    }),
  },

  trust: {
    type: 'trust',
    label: 'বিশ্বাস / সনদ',
    description: 'সার্টিফিকেশন, পরীক্ষা, উৎস — শুধু সত্যিকারের তথ্য। খালি থাকলে দেখাবে না।',
    inPage: true,
    duplicable: false,
    fields: [
      { kind: 'text', name: 'heading', label: 'শিরোনাম' },
      { kind: 'textarea', name: 'sub', label: 'উপশিরোনাম', rows: 2 },
      {
        kind: 'list',
        name: 'items',
        label: 'আইটেম',
        itemLabel: 'বিশ্বাসের আইটেম',
        fields: [
          { kind: 'text', name: 'title', label: 'শিরোনাম' },
          { kind: 'textarea', name: 'description', label: 'বিবরণ', rows: 2 },
          image('image', 'লোগো/ছবি'),
          { kind: 'url', name: 'documentUrl', label: 'নথির লিংক (ঐচ্ছিক)' },
          { kind: 'boolean', name: 'enabled', label: 'দেখান' },
        ],
      },
      theme,
    ],
    defaults: () => ({ heading: '', sub: '', items: [], theme: 'flat' }),
  },

  testimonials: {
    type: 'testimonials',
    label: 'রিভিউ',
    description: 'ক্রেতাদের মতামত। কখনো বানানো রিভিউ নয়; খালি থাকলে সেকশন দেখাবে না।',
    inPage: true,
    duplicable: false,
    fields: [
      { kind: 'text', name: 'heading', label: 'শিরোনাম' },
      { kind: 'textarea', name: 'sub', label: 'উপশিরোনাম', rows: 2 },
      {
        kind: 'list',
        name: 'items',
        label: 'রিভিউ',
        itemLabel: 'রিভিউ',
        fields: [
          { kind: 'text', name: 'name', label: 'নাম' },
          { kind: 'text', name: 'meta', label: 'পরিচয় / স্থান' },
          { kind: 'textarea', name: 'review', label: 'রিভিউ', rows: 3 },
          { kind: 'number', name: 'rating', label: 'রেটিং (১–৫)', min: 1, max: 5 },
          image('photo', 'ছবি'),
          { kind: 'text', name: 'date', label: 'তারিখ' },
          { kind: 'boolean', name: 'verified', label: 'যাচাইকৃত ক্রেতা' },
          { kind: 'boolean', name: 'enabled', label: 'দেখান' },
        ],
      },
    ],
    defaults: () => ({ heading: '', sub: '', items: [] }),
  },

  offer: {
    type: 'offer',
    label: 'অফার / দাম',
    description: 'দামের সংখ্যাগুলো অফার ও পণ্য থেকে আসে; এখানে শুধু কথাগুলো।',
    inPage: true,
    duplicable: false,
    fields: [
      { kind: 'text', name: 'headingTemplate', label: 'শিরোনাম', help: '{list} লিখলে সেখানে আলাদা-দামের যোগফল বসবে' },
      { kind: 'text', name: 'subTemplate', label: 'উপশিরোনাম', help: '{pct} লিখলে সাশ্রয়ের শতাংশ বসবে' },
      { kind: 'text', name: 'breakdownHeading', label: 'ভাঙনের শিরোনাম' },
      { kind: 'text', name: 'priceCaption', label: 'দামের ক্যাপশন' },
      { kind: 'text', name: 'ctaLabel', label: 'বোতামের লেখা', help: 'দাম স্বয়ংক্রিয়ভাবে সামনে বসবে' },
      { kind: 'textarea', name: 'note', label: 'নোট (ঐচ্ছিক)', rows: 2 },
      theme,
    ],
    defaults: () => ({
      headingTemplate: 'আপনাকে {list} দিতে হচ্ছে না',
      subTemplate: 'প্রায় {pct}% কম দামে সম্পূর্ণ Bundle',
      breakdownHeading: LANDING.value.breakdownHeading,
      priceCaption: 'বর্তমান অফার মূল্য',
      ctaLabel: LANDING.value.ctaLabel,
      note: '',
      theme: 'flat',
    }),
  },

  faq: {
    type: 'faq',
    label: 'সাধারণ প্রশ্ন',
    description: 'প্রশ্নোত্তর। প্রকাশিত প্রশ্নগুলো Google-এর FAQ structured data-তেও যায়।',
    inPage: true,
    duplicable: false,
    fields: [
      { kind: 'text', name: 'heading', label: 'শিরোনাম' },
      {
        kind: 'list',
        name: 'items',
        label: 'প্রশ্ন',
        itemLabel: 'প্রশ্ন',
        fields: [
          { kind: 'text', name: 'question', label: 'প্রশ্ন' },
          { kind: 'textarea', name: 'answer', label: 'উত্তর', rows: 3, rich: true },
          { kind: 'boolean', name: 'enabled', label: 'দেখান' },
        ],
      },
    ],
    defaults: () => ({
      heading: 'সাধারণ প্রশ্ন',
      items: LANDING.faq.map((f) => ({ id: id('faq'), question: f.q, answer: f.a, enabled: true })),
    }),
  },

  finalCta: {
    type: 'finalCta',
    label: 'শেষ আহ্বান',
    description: 'পেজের শেষ CTA ব্লক।',
    inPage: true,
    duplicable: false,
    fields: [
      { kind: 'text', name: 'heading', label: 'শিরোনাম', required: true },
      { kind: 'textarea', name: 'body', label: 'বিবরণ', rows: 2, rich: true },
      cta('cta', 'বোতাম'),
      { kind: 'boolean', name: 'showPrice', label: 'বোতামে দাম দেখান' },
      { kind: 'text', name: 'trustLine', label: 'বিশ্বাসের লাইন' },
      image('image', 'পণ্যের ছবি (ঐচ্ছিক)'),
      image('backgroundImage', 'পটভূমির ছবি (ঐচ্ছিক)'),
      theme,
    ],
    defaults: () => ({
      heading: LANDING.finalCta.heading,
      body: LANDING.finalCta.body,
      cta: { label: LANDING.finalCta.ctaLabel, action: { type: 'checkout' } },
      trustLine: '',
      image: { url: '', alt: '' },
      backgroundImage: { url: '', alt: '' },
      showPrice: true,
      theme: 'flat',
    }),
  },

  footer: {
    type: 'footer',
    label: 'ফুটার',
    description: 'ব্র্যান্ড, যোগাযোগ, নীতির লিংক, সোশ্যাল।',
    inPage: false,
    duplicable: false,
    fields: [
      { kind: 'textarea', name: 'brandLine', label: 'ব্র্যান্ড বর্ণনা', rows: 2 },
      image('logo', 'লোগো'),
      { kind: 'text', name: 'copyright', label: 'কপিরাইট', help: '{year} লিখলে চলতি বছর বসবে' },
      { kind: 'text', name: 'email', label: 'ইমেইল' },
      { kind: 'text', name: 'phone', label: 'ফোন' },
      { kind: 'textarea', name: 'address', label: 'ঠিকানা', rows: 2 },
      {
        kind: 'list',
        name: 'links',
        label: 'লিংক',
        itemLabel: 'লিংক',
        fields: [
          { kind: 'text', name: 'label', label: 'লেবেল' },
          { kind: 'cta', name: 'action', label: 'গন্তব্য' },
        ],
      },
      {
        kind: 'list',
        name: 'social',
        label: 'সোশ্যাল',
        itemLabel: 'সোশ্যাল লিংক',
        fields: [
          {
            kind: 'select',
            name: 'network',
            label: 'নেটওয়ার্ক',
            options: ['facebook', 'youtube', 'instagram', 'linkedin', 'x', 'whatsapp', 'telegram', 'other'].map((v) => ({ value: v, label: v })),
          },
          { kind: 'url', name: 'url', label: 'লিংক' },
        ],
      },
    ],
    defaults: () => ({
      brandLine: '',
      logo: { url: '', alt: '' },
      copyright: '© {year} ProWorkspace',
      email: '',
      phone: '',
      address: '',
      links: [],
      social: [],
    }),
  },

  seo: {
    type: 'seo',
    label: 'SEO',
    description: 'সার্চ ও সোশ্যাল শেয়ারে পেজটি কেমন দেখাবে।',
    inPage: false,
    duplicable: false,
    fields: [
      { kind: 'text', name: 'title', label: 'SEO শিরোনাম', help: '৬০ অক্ষরের মধ্যে রাখা ভালো' },
      { kind: 'textarea', name: 'description', label: 'মেটা বিবরণ', rows: 3, help: '১৬০ অক্ষরের মধ্যে রাখা ভালো' },
      { kind: 'url', name: 'canonical', label: 'ক্যানোনিকাল লিংক', help: 'খালি রাখলে নিজের ঠিকানা' },
      { kind: 'text', name: 'ogTitle', label: 'শেয়ার শিরোনাম (OG)' },
      { kind: 'textarea', name: 'ogDescription', label: 'শেয়ার বিবরণ (OG)', rows: 2 },
      { kind: 'url', name: 'ogImage', label: 'শেয়ার ছবি (OG)', help: '১২০০×৬৩০ প্রস্তাবিত' },
      { kind: 'url', name: 'twitterImage', label: 'X/Twitter ছবি' },
      { kind: 'boolean', name: 'index', label: 'সার্চ ইঞ্জিনে ইনডেক্স করতে দিন' },
    ],
    defaults: () => ({
      title: `AI Agent Development Bundle — শুধু Prompt ব্যবহার নয় — বাস্তব AI Agent System তৈরি করা শিখুন`,
      description: `${BOOK.title} (${BOOK.pageCount} পৃষ্ঠা, ${BOOK.chapterCount} অধ্যায়) + 4,000 n8n workflow templates + 10 million email research dataset — এক Bundle-এ।`,
      canonical: '',
      ogTitle: '',
      ogDescription: '',
      ogImage: '',
      twitterImage: '',
      index: true,
    }),
  },
}

/** Second bonus instance defaults (leads dataset). */
export function bonusLeadsDefaults(): SectionContent<'bonus'> {
  return {
    badge: 'BONUS',
    title: leads.label,
    sub: LANDING.bonusLeads.sub,
    lead: LANDING.bonusLeads.lead,
    usesHeading: LANDING.bonusLeads.usesHeading,
    uses: [...LANDING.bonusLeads.uses],
    whyHeading: '',
    why: [],
    valueLabel: LANDING.bonusLeads.valueLabel,
    notice: LANDING.bonusLeads.responsibleNotice,
    noticeTone: 'warning',
    image: { url: '', alt: '' },
    cta: { label: 'Get the eBook + Bonus Bundle', action: { type: 'checkout' } },
    theme: 'flat',
  }
}

/**
 * The default page: key, type, label, enabled, order. This is what the seed
 * writes, and what the renderer falls back to if the database is unreachable.
 */
export interface SectionInstanceSeed {
  key: string
  type: SectionType
  label: string
  enabled: boolean
  sortOrder: number
  content: () => Record<string, unknown>
}

export const DEFAULT_PAGE: readonly SectionInstanceSeed[] = [
  { key: 'hero', type: 'hero', label: 'হিরো', enabled: true, sortOrder: 10, content: () => SECTION_DEFINITIONS.hero.defaults() },
  { key: 'intro', type: 'intro', label: 'পণ্য পরিচিতি', enabled: true, sortOrder: 20, content: () => SECTION_DEFINITIONS.intro.defaults() },
  { key: 'book', type: 'book', label: 'পণ্যের গল্প (বই)', enabled: true, sortOrder: 30, content: () => SECTION_DEFINITIONS.book.defaults() },
  { key: 'benefits', type: 'benefits', label: 'সুবিধা', enabled: true, sortOrder: 40, content: () => SECTION_DEFINITIONS.benefits.defaults() },
  { key: 'bonus-workflows', type: 'bonus', label: `বোনাস: ${workflows.label}`, enabled: true, sortOrder: 50, content: () => SECTION_DEFINITIONS.bonus.defaults() },
  { key: 'bonus-leads', type: 'bonus', label: `বোনাস: ${leads.label}`, enabled: true, sortOrder: 60, content: () => bonusLeadsDefaults() },
  { key: 'steps', type: 'steps', label: 'কীভাবে কাজ করে', enabled: true, sortOrder: 70, content: () => SECTION_DEFINITIONS.steps.defaults() },
  { key: 'audience', type: 'audience', label: 'কার জন্য / কার জন্য নয়', enabled: true, sortOrder: 80, content: () => SECTION_DEFINITIONS.audience.defaults() },
  { key: 'trust', type: 'trust', label: 'বিশ্বাস / সনদ', enabled: false, sortOrder: 90, content: () => SECTION_DEFINITIONS.trust.defaults() },
  { key: 'testimonials', type: 'testimonials', label: 'রিভিউ', enabled: false, sortOrder: 100, content: () => SECTION_DEFINITIONS.testimonials.defaults() },
  { key: 'offer', type: 'offer', label: 'অফার / দাম', enabled: true, sortOrder: 110, content: () => SECTION_DEFINITIONS.offer.defaults() },
  { key: 'faq', type: 'faq', label: 'সাধারণ প্রশ্ন', enabled: true, sortOrder: 120, content: () => SECTION_DEFINITIONS.faq.defaults() },
  { key: 'final-cta', type: 'finalCta', label: 'শেষ আহ্বান', enabled: true, sortOrder: 130, content: () => SECTION_DEFINITIONS.finalCta.defaults() },
  { key: 'footer', type: 'footer', label: 'ফুটার', enabled: true, sortOrder: 900, content: () => SECTION_DEFINITIONS.footer.defaults() },
  { key: 'seo', type: 'seo', label: 'SEO', enabled: true, sortOrder: 910, content: () => SECTION_DEFINITIONS.seo.defaults() },
]

export function definitionFor(type: SectionType): SectionDefinition {
  return SECTION_DEFINITIONS[type] as SectionDefinition
}

/** Money shown in offer copy is formatted the same way everywhere. */
export { formatBdt, ebook as EBOOK_DELIVERABLE, SECTION_SCHEMAS }

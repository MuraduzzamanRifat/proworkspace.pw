import { BOOK, DELIVERABLES } from '@/config/product'
import { formatBdt } from '@/domain/money'

/**
 * Landing page copy — AI Agent Development Bundle.
 *
 * Source: the owner's live page at proworkspace.online (captured 2026-09-10).
 * The structure, section order and most sentences are the owner's. Where the
 * original described Manning's "AI Agents in Action", the book slot now
 * describes the owner's own title, and every sentence about the book was
 * rewritten to claim only what that book contains. Nothing about the two
 * bonuses was changed, including the owner's own technical and
 * responsible-use notices.
 *
 * Deliberately NOT carried over, and why:
 *   - the countdown timer: it displayed 00:00:00 and never counted anything;
 *   - "Regular Bundle Value ৳5,500": replaced by the sum of the three separate
 *     prices, computed in code, so the saving is arithmetic a visitor can check;
 *   - "Publisher-এর ভাষ্য অনুযায়ী … intermediate Python programmers": the
 *     book here is no-code/low-code, so the Python bullets are gone;
 *   - the author biography: none exists for this author, and inventing one is
 *     not an option;
 *   - the Manning promo video: it advertises a different product.
 */

const bn = (n: number): string => {
  const digits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']
  return String(n).replace(/\d/g, (d) => digits[Number(d)]!)
}

const ebook = DELIVERABLES.find((d) => d.key === 'ebook')!
const workflows = DELIVERABLES.find((d) => d.key === 'workflows')!
const leads = DELIVERABLES.find((d) => d.key === 'leads')!

export const LANDING = {
  hero: {
    eyebrow: 'AI AGENT DEVELOPMENT BUNDLE',
    headline: ['শুধু Prompt ব্যবহার নয়', 'বাস্তব AI Agent System তৈরি করা শিখুন'],
    subheadline:
      `${BOOK.title} থেকে শিখুন কীভাবে n8n, MCP, tool integration আর AI agent একসঙ্গে ব্যবহার করে ` +
      'এমন automation system তৈরি করা হয় যেটা একবার বানিয়ে ক্লায়েন্টের কাছে বারবার বিক্রি করা যায় — হাতে-কলমে, বাংলায়।',
    bonusIntro: 'এই অফারে Bonus হিসেবে আরও পাচ্ছেন',
    bonuses: [workflows.label, leads.label],
    bookMeta:
      `${BOOK.author}-এর লেখা • ${BOOK.edition}, ${BOOK.editionMonth} • ` +
      `${bn(BOOK.pageCount)} পৃষ্ঠা • ${bn(BOOK.chapterCount)} অধ্যায়`,
    ctaLabel: 'Complete Bundle নিন',
    ctaSubtext: 'তাৎক্ষণিক ডাউনলোড · সব ফাইল একসঙ্গে · আজীবন হালনাগাদ',
  },

  agents: {
    heading: 'AI এখন শুধু প্রশ্নের উত্তর দেয় না',
    sub: 'Modern AI Agent কাজ বুঝতে পারে, Tool ব্যবহার করতে পারে এবং একাধিক Step সম্পন্ন করতে পারে',
    lead: 'একটি সাধারণ chatbot মূলত আপনার প্রশ্নের উত্তর দেয়। কিন্তু একটি AI agent প্রয়োজন অনুযায়ী:',
    items: [
      'External tool ব্যবহার করতে পারে',
      'API এবং data source-এর সঙ্গে connect করতে পারে',
      'Multi-step task plan করতে পারে',
      'প্রয়োজনীয় তথ্য retrieve করতে পারে',
      'Memory এবং context ব্যবহার করতে পারে',
      'একাধিক specialized agent-এর সঙ্গে কাজ করতে পারে',
      'নিজের output evaluate ও improve করতে পারে',
    ],
    closing: 'তাই শুধু prompt লেখা জানলেই এখন আর যথেষ্ট নয়।',
  },

  book: {
    heading: 'ChatGPT ব্যবহার জানা আর AI দিয়ে Income Opportunity তৈরি করা এক জিনিস নয়',
    tagline: ['Learn the architecture.', 'Understand the workflow.', 'Explore practical automation resources.'],
    title: BOOK.title,
    subtitle: BOOK.subtitle,
    lead: `${BOOK.title} শুধু "এআই কী" শেখায় না। এটা একটা বিক্রিযোগ্য স্কিল তৈরির ম্যানুয়াল।`,
    paragraphs: [
      'প্রথম অংশে বুঝবেন এজেন্ট আসলে কী, বাংলাদেশের বাজারে কী বদলাচ্ছে, আর কোন কাজে কোন টুল — আসল দামসহ।',
      `দ্বিতীয় অংশে ${bn(BOOK.caseStudyCount)}টি সম্পূর্ণ সিস্টেম বানাবেন, নোড ধরে ধরে, যে মান বসাতে হবে সেটা হুবহু লেখা — ` +
        'লিড ট্রায়াজ, ইনবক্স এজেন্ট, এফ-কমার্স ও কুরিয়ার অটোমেশন, কনটেন্ট পাইপলাইন, রিপোর্টিং সিস্টেম।',
      'তৃতীয় অংশে শিখবেন এগুলো কত টাকায় বিক্রি হয়, প্রপোজাল কেমন হবে, প্রথম ক্লায়েন্ট কোথায় পাবেন, আর ৯০ দিনে কীভাবে এগোবেন।',
    ],
    authorLine: `লেখক: ${BOOK.author} · প্রকাশক: ${BOOK.publisher}`,
  },

  practical: {
    heading: 'শুধু Theory নয়—Practical Understanding',
    sub: 'বইটি পড়ার পর আপনি যেসব বিষয়ে আরও পরিষ্কার ধারণা পাবেন',
    items: [
      'এআই এজেন্ট আসলে কী — চ্যাটবট আর এজেন্টের পার্থক্য',
      'n8n, Make, Zapier ও এআই মডেলের আসল দাম — কোন কাজে কোনটা',
      'প্রথম অটোমেশন ৩০ মিনিটে, তারপর MCP দিয়ে একবার বানিয়ে বারবার বিক্রি',
      `${bn(BOOK.caseStudyCount)}টি কেস স্টাডি: ইনবক্স, এফ-কমার্স ও কুরিয়ার, কনটেন্ট পাইপলাইন, রিপোর্টিং`,
      'ভুল, খরচ ও নিরাপত্তা — কোথায় টাকা যায়, কোথায় ঝুঁকি',
      'এই স্কিল বিক্রি করা — দাম, প্যাকেজ, প্রপোজাল, আর ৯০ দিনের অ্যাকশন প্ল্যান',
    ],
  },

  bonusWorkflows: {
    badge: 'BONUS',
    title: workflows.label,
    lead:
      'Existing workflow structure দেখে আপনি দ্রুত বুঝতে পারবেন একটি automation কীভাবে সাজানো হয়েছে এবং ' +
      'নিজের project অনুযায়ী কোথায় configuration বা customization প্রয়োজন।',
    usesHeading: 'Workflow Library ব্যবহার করতে পারবেন',
    uses: [
      'Automation structure explore করতে',
      'নতুন workflow idea খুঁজতে',
      'Client project-এর reference হিসেবে',
      'নিজের automation দ্রুত plan করতে',
      'Repetitive process automate করার concept পেতে',
      'n8n workflow structure বুঝতে',
      'API এবং webhook-based workflow study করতে',
      'AI automation use case explore করতে',
    ],
    whyHeading: 'কেন এটি গুরুত্বপূর্ণ?',
    why: [
      'Blank canvas থেকে শুরু করলে একটি workflow plan করতেই অনেক সময় চলে যায়।',
      'Ready workflow collection থাকলে আপনি existing logic analyse করে নিজের requirement অনুযায়ী relevant workflow customize করতে পারবেন।',
    ],
    valueLabel: `Bonus Value: ${formatBdt(workflows.separateValue)}`,
    technicalNote:
      'Technical Note: কিছু workflow ব্যবহারের আগে API key, login credentials, third-party integration, ' +
      'updated node, compatible software version বা manual customization প্রয়োজন হতে পারে।',
  },

  bonusLeads: {
    badge: 'BONUS',
    title: leads.label,
    sub: 'Market Research এবং Prospecting Preparation-এর জন্য একটি বড় Data Resource',
    lead: 'আপনার offer ভালো হলেও সঠিক audience খুঁজে না পেলে outreach campaign কার্যকর হয় না।',
    usesHeading: 'এই Bonus dataset ব্যবহার করা যেতে পারে:',
    uses: [
      'Market research',
      'Audience segmentation',
      'B2B prospect research',
      'Lead-list organization',
      'Campaign preparation',
      'Industry-based research',
      'Compliant outreach planning',
    ],
    valueLabel: `Bonus Value: ${formatBdt(leads.separateValue)}`,
    responsibleNotice:
      'Responsible Use Notice: এই dataset unsolicited bulk email পাঠানোর permission নয়। Data ব্যবহার করার আগে ' +
      'accuracy, relevance এবং freshness verify করুন এবং applicable privacy, consent, anti-spam ও marketing requirements অনুসরণ করুন।',
  },

  threeResources: {
    heading: 'THREE RESOURCES. ONE PRACTICAL BUNDLE.',
    steps: [
      {
        n: '01.',
        title: 'Learn',
        body: `${BOOK.title} থেকে AI agent, n8n আর MCP-ভিত্তিক automation-এর কাঠামো ও development concept বুঝুন।`,
      },
      {
        n: '02.',
        title: 'Explore',
        body: '4,000 workflow templates থেকে practical automation structure ও implementation idea দেখুন।',
      },
      {
        n: '03.',
        title: 'Apply',
        body: 'Relevant workflow নিজের project অনুযায়ী configure করুন এবং research dataset ব্যবহার করে lawful market research ও prospecting preparation করুন।',
      },
    ],
  },

  forWhom: {
    heading: 'এই Bundle কার জন্য?',
    lead: 'এই Bundle আপনার কাজে আসবে যদি আপনি—',
    items: [
      'AI Agent Development শিখতে চান',
      'n8n workflow automation শিখছেন',
      'MCP এবং tool integration বুঝতে চান',
      'Freelancing service expand করতে চান',
      'Automation agency শুরু করতে চান',
      'Client-এর জন্য automation solution তৈরি করেন',
      'Business process automation নিয়ে কাজ করেন',
      'ছোট ব্যবসার মালিক — দিনের অর্ধেক কপি-পেস্টে যায়',
    ],
    note: 'বইটি no-code ও low-code পথ ধরে লেখা — আগে কোডিং বা AI agent নিয়ে কাজ করার অভিজ্ঞতা প্রয়োজন নেই।',
  },

  notFor: {
    heading: 'এই Bundle কার জন্য নয়?',
    lead: 'এই Bundle আপনার জন্য উপযুক্ত নাও হতে পারে যদি—',
    items: [
      'কোনো configuration ছাড়াই সব workflow চলবে বলে আশা করেন',
      'শুধু one-click software খুঁজছেন',
      'API বা automation concept explore করতে আগ্রহী নন',
      'Email dataset দিয়ে unsolicited bulk messaging করতে চান',
      'প্রোগ্রামার হয়ে LangChain দিয়ে কোড লিখতে চান — এই বই আপনার লেভেলের নিচে',
    ],
    closing: [
      'আমরা realistic expectation রাখতে চাই।',
      'এই Bundle আপনাকে resource, structure এবং learning material দেবে—কিন্তু skill তৈরি করতে আপনাকেই সময় দিয়ে শিখতে ও practice করতে হবে। ' +
        'প্রথম তিন মাসে বেশিরভাগ মানুষের আয় সামান্য হয়; বইয়ে বাস্তব সময়সীমা দেওয়া আছে, বাড়ানো সংখ্যা নয়।',
    ],
  },

  value: {
    heading: (listTotal: string) => `আপনাকে ${listTotal} দিতে হচ্ছে না`,
    sub: (pct: number) => `প্রায় ${bn(pct)}% কম দামে সম্পূর্ণ Bundle`,
    breakdownHeading: 'আলাদা কিনলে',
    rows: DELIVERABLES.map((d) => ({ label: d.label, value: d.separateValue })),
    ctaLabel: 'Complete Bundle নিন',
  },

  faq: [
    {
      q: 'ফাইলগুলো কীভাবে পাব?',
      a: 'পেমেন্ট সম্পন্ন হলে সঙ্গে সঙ্গে একটি পেজে তিনটি ফাইলের আলাদা ডাউনলোড বোতাম পাবেন; একই লিংক আপনার ইমেইলেও যাবে। লিংক আপনার ব্যক্তিগত, এক বছর সক্রিয় থাকে।',
    },
    {
      q: 'কোডিং জানতে হবে?',
      a:
        'না। বইটা no-code ও low-code পথ ধরে লেখা। তবে কম্পিউটারে ফাইল-ফোল্ডার সামলাতে পারা আর ' +
        'ইংরেজি টেকনিক্যাল শব্দ পড়ে বুঝতে পারা লাগবে — টুলগুলোর ইন্টারফেস ইংরেজিতে।',
    },
    {
      q: 'টুলগুলো ব্যবহার করতে টাকা লাগবে?',
      a:
        'n8n-এর কমিউনিটি এডিশন সম্পূর্ণ ফ্রি, নিজের সার্ভারে চালানো যায় (মাসে $৫–১০)। ' +
        'এআই API-তে খরচ হয়, কিন্তু কম — বইয়ের সব অনুশীলন $৫ ক্রেডিটেই করা যায়। বইয়ে পুরো খরচের হিসাব ও কমানোর কৌশল আলাদা অধ্যায়ে আছে।',
    },
    {
      q: 'ওয়ার্কফ্লো টেমপ্লেটগুলো কি সরাসরি চলবে?',
      a: 'কিছু চলবে, কিছুতে API key, login credentials, third-party integration, updated node বা manual customization লাগবে। এগুলো structure শেখার ও দ্রুত plan করার জন্য — one-click software নয়।',
    },
    {
      q: 'MCP জিনিসটা কি খুব নতুন? শিখে লাভ হবে?',
      a:
        'এর সর্বশেষ সংস্করণ বেরিয়েছে ২৮ জুলাই ২০২৬-এ। প্রোটোকল পরিণত, বড় এআই কোম্পানিগুলো সমর্থন করছে — ' +
        'কিন্তু বাংলাদেশে এটা নিয়ে কাজ করা মানুষের সংখ্যা এখনো দুই অঙ্কে। এই জানালা ১২–১৮ মাস খোলা থাকবে।',
    },
    {
      q: 'হালনাগাদ কি সত্যিই ফ্রি?',
      a: 'হ্যাঁ। এই খাত দ্রুত বদলায়, তাই বইও বদলাবে। বৈধ ক্রেতারা পরবর্তী সব সংস্করণ বিনামূল্যে পাবেন।',
    },
  ],

  finalCta: {
    heading: 'আপনার Freelancing Journey আজই শুরু করুন',
    body: 'আপনার নাম, ফোন নম্বর ও Email দিয়ে অর্ডার সম্পন্ন করুন। সফল পেমেন্টের পর সঙ্গে সঙ্গে তিনটি ফাইলের Access পাবেন।',
    ctaLabel: 'Complete Bundle নিন',
  },
} as const

export { bn as toBengaliDigitsShort }

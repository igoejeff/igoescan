/* ================================================================
   AI READINESS SCANNER — C-Health Connections
   scanner.js — Pure ASCII, no smart quotes or special chars in strings
================================================================ */

/* ----------------------------------------------------------------
   UTILITY HELPERS
---------------------------------------------------------------- */
function cleanDomain(raw) {
  var d = raw.trim().toLowerCase();
  if (!d.startsWith('http')) d = 'https://' + d;
  try {
    var u = new URL(d);
    return u.origin;
  } catch(e) { return null; }
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function gradeFromScore(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

function gradeColor(grade) {
  var map = {
    A: '#09b85a',   /* vivid green */
    B: '#1a6fd4',   /* vivid blue */
    C: '#f5a800',   /* vivid yellow */
    D: '#e86400',   /* vivid orange */
    F: '#e02020'    /* vivid red */
  };
  return map[grade] || map['F'];
}
function gradeBgClass(grade) {
  var map = { A:'ga', B:'gb', C:'gc', D:'gd', F:'gf' };
  return map[grade] || 'gf';
}

function statusIcon(status) {
  if (status === 'pass') return '<div class="sdot sp"><i class="fas fa-check"></i></div>';
  if (status === 'warn') return '<div class="sdot sw"><i class="fas fa-exclamation"></i></div>';
  return '<div class="sdot sf"><i class="fas fa-times"></i></div>';
}

/* ----------------------------------------------------------------
   FETCH WEBSITE HTML — 4-proxy waterfall with timeout per attempt
---------------------------------------------------------------- */
async function fetchWithTimeout(url, ms) {
  var ctrl = new AbortController();
  var t = setTimeout(function(){ ctrl.abort(); }, ms);
  try {
    var r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return r;
  } catch(e) { clearTimeout(t); throw e; }
}

async function fetchSiteHTML(origin) {
  var enc = encodeURIComponent(origin);
  var proxies = [
    { url: 'https://api.allorigins.win/get?url=' + enc,                    type:'json',  key:'contents' },
    { url: 'https://corsproxy.io/?' + enc,                                  type:'text',  key:null       },
    { url: 'https://api.codetabs.com/v1/proxy?quest=' + enc,               type:'text',  key:null       },
    { url: 'https://thingproxy.freeboard.io/fetch/' + enc,                 type:'text',  key:null       }
  ];
  var lastErr = null;
  for (var i = 0; i < proxies.length; i++) {
    try {
      var p = proxies[i];
      var res = await fetchWithTimeout(p.url, 12000);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (p.type === 'json') {
        var data = await res.json();
        if (!data[p.key] || data[p.key].length < 200) throw new Error('Empty JSON response');
        return data[p.key];
      } else {
        var text = await res.text();
        if (!text || text.length < 200) throw new Error('Empty text response');
        return text;
      }
    } catch(e) { lastErr = e; }
  }
  throw lastErr || new Error('All proxies failed');
}

async function fetchRobotsTxt(origin) {
  var enc = encodeURIComponent(origin + '/robots.txt');
  var proxies = [
    { url: 'https://api.allorigins.win/get?url=' + enc, type:'json', key:'contents' },
    { url: 'https://corsproxy.io/?' + enc,               type:'text', key:null       },
    { url: 'https://api.codetabs.com/v1/proxy?quest=' + enc, type:'text', key:null  }
  ];
  for (var i = 0; i < proxies.length; i++) {
    try {
      var p = proxies[i];
      var res = await fetchWithTimeout(p.url, 8000);
      if (!res.ok) continue;
      if (p.type === 'json') {
        var data = await res.json();
        return data[p.key] || '';
      } else {
        return await res.text();
      }
    } catch(e) { /* try next */ }
  }
  return '';
}

/* ----------------------------------------------------------------
   PARSE HTML
---------------------------------------------------------------- */
function parseHTML(html) {
  var parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

/* ----------------------------------------------------------------
   SEO CHECKS
---------------------------------------------------------------- */
function checkSEO(doc, origin, html) {
  var checks = [];

  // 1. Title tag
  var titleEl = doc.querySelector('title');
  var titleText = titleEl ? titleEl.textContent.trim() : '';
  if (!titleText) {
    checks.push({ name:'Page Title Tag', status:'fail',
      detail:'No title tag found on the homepage.',
      fix:'Add a descriptive title tag (50-60 characters) including your specialty and location.' });
  } else if (titleText.length < 30) {
    checks.push({ name:'Page Title Tag', status:'warn',
      detail:'Title found but very short (' + titleText.length + ' chars): "' + titleText.substring(0,70) + '"',
      fix:'Expand your title to 50-60 characters. Include your specialty, city, and a keyword.' });
  } else if (titleText.length > 65) {
    checks.push({ name:'Page Title Tag', status:'warn',
      detail:'Title is too long (' + titleText.length + ' chars) and may be truncated in search results.',
      fix:'Shorten your title to under 60 characters while keeping key information.' });
  } else {
    checks.push({ name:'Page Title Tag', status:'pass',
      detail:'Good title found (' + titleText.length + ' chars): "' + titleText.substring(0,70) + '"' });
  }

  // 2. Meta description
  var metaDescEl = doc.querySelector('meta[name="description"]');
  var descContent = metaDescEl ? (metaDescEl.getAttribute('content') || '').trim() : '';
  if (!descContent) {
    checks.push({ name:'Meta Description', status:'fail',
      detail:'No meta description found. AI engines and Google use this for summaries.',
      fix:'Write a compelling 150-160 character meta description including your specialty, location, and a call to action.' });
  } else if (descContent.length < 70) {
    checks.push({ name:'Meta Description', status:'warn',
      detail:'Meta description found but short (' + descContent.length + ' chars).',
      fix:'Expand to 150-160 characters for maximum visibility in search results and AI snippets.' });
  } else {
    checks.push({ name:'Meta Description', status:'pass',
      detail:'Meta description present (' + descContent.length + ' chars).' });
  }

  // 3. H1 tag
  var h1s = doc.querySelectorAll('h1');
  if (h1s.length === 0) {
    checks.push({ name:'H1 Heading', status:'fail',
      detail:'No H1 heading found on the page.',
      fix:'Add one clear H1 heading that describes your practice and primary service.' });
  } else if (h1s.length > 1) {
    checks.push({ name:'H1 Heading', status:'warn',
      detail:'Multiple H1 tags found (' + h1s.length + '). Best practice is exactly one H1 per page.',
      fix:'Reduce to a single H1. Use H2 and H3 for sub-sections.' });
  } else {
    checks.push({ name:'H1 Heading', status:'pass',
      detail:'Single H1 found: "' + h1s[0].textContent.trim().substring(0,80) + '"' });
  }

  // 4. H2 headings
  var h2s = doc.querySelectorAll('h2');
  if (h2s.length === 0) {
    checks.push({ name:'H2 Sub-Headings', status:'warn',
      detail:'No H2 headings found. Structured content with headings helps AI parse your page.',
      fix:'Add H2 headings to organize your content into clear sections (services, about, location, etc.).' });
  } else {
    checks.push({ name:'H2 Sub-Headings', status:'pass',
      detail:h2s.length + ' H2 heading(s) found - good content structure.' });
  }

  // 5. HTTPS
  var isHttps = origin.startsWith('https://');
  checks.push({
    name: 'HTTPS / SSL Security',
    status: isHttps ? 'pass' : 'fail',
    detail: isHttps ? 'Site is served over HTTPS - secure connection confirmed.' : 'Site is not using HTTPS. This is a critical trust and ranking signal.',
    fix: isHttps ? null : 'Install an SSL certificate immediately. HTTPS is required for medical sites by Google policy and HIPAA best practice.'
  });

  // 6. Canonical tag
  var canonical = doc.querySelector('link[rel="canonical"]');
  if (!canonical) {
    checks.push({ name:'Canonical Tag', status:'warn',
      detail:'No canonical tag found. This can cause duplicate content issues.',
      fix:'Add a canonical link tag pointing to the preferred URL of each page.' });
  } else {
    checks.push({ name:'Canonical Tag', status:'pass',
      detail:'Canonical tag present: ' + (canonical.getAttribute('href') || '').substring(0,60) });
  }

  // 7. Meta viewport
  var viewport = doc.querySelector('meta[name="viewport"]');
  if (!viewport) {
    checks.push({ name:'Mobile Viewport Tag', status:'fail',
      detail:'No viewport meta tag found. Site may not display correctly on mobile devices.',
      fix:'Add the mobile viewport meta tag to your HTML head section.' });
  } else {
    checks.push({ name:'Mobile Viewport Tag', status:'pass',
      detail:'Mobile viewport tag present - mobile-friendly display configured.' });
  }

  // 8. Images alt text
  var images = doc.querySelectorAll('img');
  var imagesNoAlt = Array.from(images).filter(function(i) {
    return !i.getAttribute('alt') || i.getAttribute('alt').trim() === '';
  });
  if (images.length > 0 && imagesNoAlt.length > images.length * 0.5) {
    checks.push({ name:'Image Alt Text', status:'fail',
      detail:imagesNoAlt.length + ' of ' + images.length + ' images are missing alt text.',
      fix:'Add descriptive alt text to all images. This helps accessibility and image search visibility.' });
  } else if (imagesNoAlt.length > 0) {
    checks.push({ name:'Image Alt Text', status:'warn',
      detail:imagesNoAlt.length + ' of ' + images.length + ' images missing alt text.',
      fix:'Fill in alt text for the remaining images for full accessibility and SEO benefit.' });
  } else if (images.length > 0) {
    checks.push({ name:'Image Alt Text', status:'pass',
      detail:'All ' + images.length + ' images have alt text - great for accessibility and SEO.' });
  } else {
    checks.push({ name:'Image Alt Text', status:'warn',
      detail:'No images detected on the homepage.',
      fix:'Consider adding professional photos of your practice and team.' });
  }

  // 9. Internal links
  var links = doc.querySelectorAll('a[href]');
  var hostname = '';
  try { hostname = new URL(origin).hostname; } catch(e) {}
  var internalLinks = Array.from(links).filter(function(l) {
    var href = l.getAttribute('href') || '';
    return href.startsWith('/') || href.includes(hostname);
  });
  if (internalLinks.length < 3) {
    checks.push({ name:'Internal Link Structure', status:'warn',
      detail:'Only ' + internalLinks.length + ' internal links detected on the homepage.',
      fix:'Add more internal links to key pages: Services, About, Contact, Blog. Good internal linking helps AI engines map your site.' });
  } else {
    checks.push({ name:'Internal Link Structure', status:'pass',
      detail:internalLinks.length + ' internal links found - good site connectivity.' });
  }

  // 10. Page load / size
  var sizeKb = Math.round(html.length / 1024);
  if (sizeKb > 500) {
    checks.push({ name:'Page Size (HTML)', status:'warn',
      detail:'Homepage HTML is ' + sizeKb + 'KB - may be heavy for fast loading.',
      fix:'Minify HTML, defer non-critical scripts, and compress assets to improve load time.' });
  } else {
    checks.push({ name:'Page Size (HTML)', status:'pass',
      detail:'Homepage HTML is ' + sizeKb + 'KB - reasonable size.' });
  }

  return checks;
}

/* ----------------------------------------------------------------
   GEO CHECKS
---------------------------------------------------------------- */
function checkGEO(doc, html) {
  var checks = [];
  var htmlLow = html.toLowerCase();
  var schemaScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  var hasSchema = schemaScripts.length > 0;
  var schemaContent = '';
  schemaScripts.forEach(function(s) { schemaContent += s.textContent.toLowerCase(); });

  // 1. Any Schema
  if (!hasSchema) {
    checks.push({ name:'Structured Data (Schema.org)', status:'fail',
      detail:'No JSON-LD structured data found. This is one of the most important signals for AI search engines.',
      fix:'Add Schema.org markup immediately - start with LocalBusiness, MedicalBusiness, and Physician schemas.' });
  } else {
    checks.push({ name:'Structured Data (Schema.org)', status:'pass',
      detail:schemaScripts.length + ' JSON-LD schema block(s) found on the page.' });
  }

  // 2. Medical schema
  var hasMedicalSchema = schemaContent.includes('medicalbusiness') || schemaContent.includes('physician') ||
    schemaContent.includes('medicalclinic') || schemaContent.includes('doctor');
  if (!hasSchema || !hasMedicalSchema) {
    checks.push({ name:'Medical / Physician Schema', status:'fail',
      detail:'No MedicalBusiness, Physician, or MedicalClinic schema type found.',
      fix:'Add a Physician or MedicalClinic schema type. This directly tells AI engines your site is a medical authority.' });
  } else {
    checks.push({ name:'Medical / Physician Schema', status:'pass',
      detail:'Medical schema type (Physician/MedicalClinic/MedicalBusiness) detected.' });
  }

  // 3. LocalBusiness schema
  var hasLocalBiz = schemaContent.includes('localbusiness') || schemaContent.includes('address') || schemaContent.includes('geo');
  if (!hasLocalBiz) {
    checks.push({ name:'Local Business Schema', status: hasSchema ? 'warn' : 'fail',
      detail:'LocalBusiness schema with address and geo coordinates not detected.',
      fix:'Add LocalBusiness schema including address, phone, geo coordinates, and opening hours. Critical for local AI search.' });
  } else {
    checks.push({ name:'Local Business Schema', status:'pass',
      detail:'Local business information found in structured data.' });
  }

  // 4. FAQ Schema
  var hasFAQ = schemaContent.includes('faqpage') || schemaContent.includes('question') ||
    htmlLow.includes('faq') || htmlLow.includes('frequently asked');
  if (!hasFAQ) {
    checks.push({ name:'FAQ Schema / Content', status:'fail',
      detail:'No FAQ page or FAQ schema found. AI chatbots love to pull from FAQ content.',
      fix:'Add an FAQ section with 5-10 questions patients commonly ask. Mark it up with FAQPage schema.' });
  } else {
    var hasFaqSchema = schemaContent.includes('faqpage');
    checks.push({ name:'FAQ Schema / Content',
      status: hasFaqSchema ? 'pass' : 'warn',
      detail: hasFaqSchema ? 'FAQPage schema detected - excellent for AI answer sourcing.' : 'FAQ content found but no FAQPage schema markup.',
      fix: hasFaqSchema ? null : 'Add FAQPage JSON-LD schema to your FAQ section for AI engine citation boost.' });
  }

  // 5. Open Graph tags
  var ogTitle = doc.querySelector('meta[property="og:title"]');
  var ogDesc  = doc.querySelector('meta[property="og:description"]');
  var ogImage = doc.querySelector('meta[property="og:image"]');
  var ogCount = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
  if (ogCount === 0) {
    checks.push({ name:'Open Graph / Social Tags', status:'fail',
      detail:'No Open Graph meta tags found. These control how your site appears when shared on social media and in AI previews.',
      fix:'Add og:title, og:description, og:image, and og:url tags to every page.' });
  } else if (ogCount < 3) {
    var missingOG = [];
    if (!ogTitle) missingOG.push('og:title');
    if (!ogDesc)  missingOG.push('og:description');
    if (!ogImage) missingOG.push('og:image');
    checks.push({ name:'Open Graph / Social Tags', status:'warn',
      detail:'Only ' + ogCount + '/3 core OG tags found (missing: ' + missingOG.join(', ') + ').',
      fix:'Complete your Open Graph implementation with all three core tags.' });
  } else {
    checks.push({ name:'Open Graph / Social Tags', status:'pass',
      detail:'Open Graph tags (title, description, image) all present.' });
  }

  // 6. Twitter/X card
  var twitterCard = doc.querySelector('meta[name="twitter:card"]');
  if (!twitterCard) {
    checks.push({ name:'Twitter/X Card Tags', status:'warn',
      detail:'No Twitter Card meta tags found.',
      fix:'Add twitter:card, twitter:title, and twitter:description for better social sharing and AI content indexing.' });
  } else {
    checks.push({ name:'Twitter/X Card Tags', status:'pass',
      detail:'Twitter Card tags detected.' });
  }

  // 7. Author attribution
  var hasAuthor = doc.querySelector('meta[name="author"]') ||
    htmlLow.includes('written by') || htmlLow.includes('by dr.') ||
    htmlLow.includes('medically reviewed') || htmlLow.includes('author:');
  if (!hasAuthor) {
    checks.push({ name:'Author Attribution', status:'warn',
      detail:'No clear author attribution found. AI engines prioritize content with clear authorship.',
      fix:'Add author bylines to content pages and a meta author tag. Include credentials (MD, DO, etc.).' });
  } else {
    checks.push({ name:'Author Attribution', status:'pass',
      detail:'Author attribution detected on the page.' });
  }

  // 8. Sitemap reference
  var hasSitemapRef = htmlLow.includes('sitemap.xml') || doc.querySelector('link[rel="sitemap"]');
  if (!hasSitemapRef) {
    checks.push({ name:'Sitemap Reference', status:'warn',
      detail:'No sitemap.xml reference found in page HTML.',
      fix:'Create and submit a sitemap.xml to Google Search Console and reference it in your robots.txt.' });
  } else {
    checks.push({ name:'Sitemap Reference', status:'pass',
      detail:'Sitemap reference found.' });
  }

  return checks;
}

/* ----------------------------------------------------------------
   E-E-A-T CHECKS
---------------------------------------------------------------- */
function checkEEAT(doc, html, origin) {
  var checks = [];
  var htmlLow = html.toLowerCase();

  // 1. About page
  var aboutLink = Array.from(doc.querySelectorAll('a')).some(function(a) {
    return a.textContent.toLowerCase().includes('about') ||
      (a.getAttribute('href') || '').toLowerCase().includes('about');
  });
  if (!aboutLink) {
    checks.push({ name:'About Us Page', status:'fail',
      detail:'No link to an About page detected. This is a core E-E-A-T requirement for medical sites.',
      fix:'Create a thorough About page showcasing your practice history, mission, and team credentials.' });
  } else {
    checks.push({ name:'About Us Page', status:'pass',
      detail:'Link to an About page found - key for establishing practice authority.' });
  }

  // 2. Physician credentials
  var credKeywords = ['md', 'm.d.', 'do', 'd.o.', 'physician', 'doctor', 'dr.', 'board certified', 'board-certified', 'fellowship', 'residency'];
  var hasCredentials = credKeywords.some(function(kw) { return htmlLow.includes(kw); });
  if (!hasCredentials) {
    checks.push({ name:'Physician Credentials', status:'fail',
      detail:'No visible physician credentials (MD, DO, Board Certified, etc.) detected on the homepage.',
      fix:'Prominently display doctor credentials, board certifications, and medical education on the homepage and About page.' });
  } else {
    checks.push({ name:'Physician Credentials', status:'pass',
      detail:'Physician credentials or degree indicators found on the page.' });
  }

  // 3. Contact information
  var phonePattern = /(\+?1?\s?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/;
  var hasPhone = phonePattern.test(html);
  var hasAddress = htmlLow.includes('address') || htmlLow.includes('suite') || htmlLow.includes('blvd') ||
    htmlLow.includes('street') || htmlLow.includes('ave ') || htmlLow.includes('road');
  if (!hasPhone && !hasAddress) {
    checks.push({ name:'Contact Information (NAP)', status:'fail',
      detail:'No phone number or physical address detected. Google requires NAP (Name, Address, Phone) for medical sites.',
      fix:'Add your full NAP (Name, Address, Phone) to the homepage footer and a dedicated Contact page.' });
  } else if (!hasPhone || !hasAddress) {
    checks.push({ name:'Contact Information (NAP)', status:'warn',
      detail:(hasPhone ? 'Phone found' : 'No phone') + ' / ' + (hasAddress ? 'Address found' : 'No address detected') + '.',
      fix:'Make sure both a phone number AND physical address are clearly visible on your homepage.' });
  } else {
    checks.push({ name:'Contact Information (NAP)', status:'pass',
      detail:'Phone number and address information found - good NAP visibility.' });
  }

  // 4. Privacy Policy
  var hasPrivacy = Array.from(doc.querySelectorAll('a')).some(function(a) {
    return a.textContent.toLowerCase().includes('privacy') ||
      (a.getAttribute('href') || '').toLowerCase().includes('privacy');
  }) || htmlLow.includes('privacy policy');
  if (!hasPrivacy) {
    checks.push({ name:'Privacy Policy', status:'fail',
      detail:'No Privacy Policy link found. Required for HIPAA compliance and E-E-A-T trust signals.',
      fix:'Add a Privacy Policy page and link it in your footer. This is legally required for medical websites.' });
  } else {
    checks.push({ name:'Privacy Policy', status:'pass',
      detail:'Privacy Policy link detected - important for HIPAA trust signals.' });
  }

  // 5. Medical disclaimer
  var hasDisclaimer = htmlLow.includes('disclaimer') || htmlLow.includes('not a substitute') ||
    htmlLow.includes('seek professional') || htmlLow.includes('consult') || htmlLow.includes('medical advice');
  if (!hasDisclaimer) {
    checks.push({ name:'Medical Disclaimer', status:'warn',
      detail:'No medical disclaimer language found. Google medical quality guidelines require this.',
      fix:'Add a medical disclaimer stating that content is informational and not a substitute for professional medical advice.' });
  } else {
    checks.push({ name:'Medical Disclaimer', status:'pass',
      detail:'Medical disclaimer language detected on the page.' });
  }

  // 6. Terms of Service
  var hasTerms = Array.from(doc.querySelectorAll('a')).some(function(a) {
    return a.textContent.toLowerCase().includes('terms') ||
      (a.getAttribute('href') || '').toLowerCase().includes('terms');
  });
  if (!hasTerms) {
    checks.push({ name:'Terms of Service', status:'warn',
      detail:'No Terms of Service / Terms of Use link found.',
      fix:'Add a Terms of Service page and link it in your footer alongside your Privacy Policy.' });
  } else {
    checks.push({ name:'Terms of Service', status:'pass',
      detail:'Terms of Service link found.' });
  }

  // 7. Patient reviews
  var hasReviews = htmlLow.includes('review') || htmlLow.includes('testimonial') ||
    htmlLow.includes('patient') || htmlLow.includes('rating') || htmlLow.includes('stars');
  if (!hasReviews) {
    checks.push({ name:'Patient Reviews / Testimonials', status:'warn',
      detail:'No patient reviews or testimonials detected. Social proof is critical for medical E-E-A-T.',
      fix:'Add a patient testimonials section and embed a Google Reviews widget on your homepage.' });
  } else {
    checks.push({ name:'Patient Reviews / Testimonials', status:'pass',
      detail:'Review or testimonial content detected - boosts patient trust signals.' });
  }

  // 8. Associations
  var hasSocial = htmlLow.includes('award') || htmlLow.includes('member') || htmlLow.includes('association') ||
    htmlLow.includes('accredited') || htmlLow.includes('certified') || htmlLow.includes('ama');
  if (!hasSocial) {
    checks.push({ name:'Credentials & Associations', status:'warn',
      detail:'No mention of medical associations, awards, or accreditations found.',
      fix:'Add badges/logos for AMA membership, board certifications, hospital affiliations, and any awards.' });
  } else {
    checks.push({ name:'Credentials & Associations', status:'pass',
      detail:'Professional associations or credentials mentioned on the page.' });
  }

  // 9. Blog / Educational content
  var hasBlog = Array.from(doc.querySelectorAll('a')).some(function(a) {
    return a.textContent.toLowerCase().includes('blog') ||
      (a.getAttribute('href') || '').toLowerCase().includes('blog') ||
      a.textContent.toLowerCase().includes('article') ||
      a.textContent.toLowerCase().includes('resource');
  }) || htmlLow.includes('blog') || htmlLow.includes('health tips');
  if (!hasBlog) {
    checks.push({ name:'Blog / Educational Content', status:'warn',
      detail:'No blog or educational resources section found.',
      fix:'Start a blog with patient education articles. This is one of the fastest ways to build E-E-A-T authority for medical sites.' });
  } else {
    checks.push({ name:'Blog / Educational Content', status:'pass',
      detail:'Blog or educational content section found - great for E-E-A-T building.' });
  }

  return checks;
}

/* ----------------------------------------------------------------
   AI CRAWLER CHECKS
---------------------------------------------------------------- */
function checkAICrawlers(robotsTxt, html) {
  var checks = [];
  var robots = robotsTxt.toLowerCase();
  var htmlLow = html.toLowerCase();

  var aiCrawlers = [
    { name:'GPTBot',         label:'GPTBot (ChatGPT / OpenAI)',       agent:'gptbot',          description:'Powers ChatGPT web browsing and training data' },
    { name:'ClaudeBot',      label:'ClaudeBot (Anthropic / Claude)',   agent:'claudebot',       description:'Powers Anthropic Claude AI assistant' },
    { name:'PerplexityBot',  label:'PerplexityBot (Perplexity AI)',    agent:'perplexitybot',   description:'Powers Perplexity AI search answers' },
    { name:'Google-Extended',label:'Google-Extended (AI Overviews)',   agent:'google-extended', description:'Powers Google AI Overviews in search results' },
    { name:'CCBot',          label:'CCBot (Common Crawl)',             agent:'ccbot',           description:'Powers many AI training datasets' },
  ];

  var robotsFound = robots.length > 50;
  if (!robotsFound) {
    checks.push({ name:'robots.txt File', status:'warn',
      detail:'Could not fetch or parse your robots.txt file. This file controls what search and AI crawlers can access.',
      fix:'Make sure your robots.txt is accessible at yourdomain.com/robots.txt and is correctly formatted.' });
  } else {
    checks.push({ name:'robots.txt File', status:'pass',
      detail:'robots.txt file found and accessible.' });
  }

  aiCrawlers.forEach(function(crawler) {
    var crawlerSection = extractCrawlerSection(robots, crawler.agent);
    var wildcardSection = extractCrawlerSection(robots, '*');
    var isExplicitlyBlocked = robots.includes('user-agent: ' + crawler.agent) &&
      crawlerSection.includes('disallow: /') &&
      !crawlerSection.includes('disallow: \n') &&
      !crawlerSection.includes('disallow:\n');
    var isBlockedViaAll = !robots.includes('user-agent: ' + crawler.agent) &&
      wildcardSection.includes('disallow: /');

    if (isExplicitlyBlocked) {
      checks.push({
        name: crawler.label,
        status: 'fail',
        detail: crawler.label + ' is BLOCKED in your robots.txt. ' + crawler.description + ' cannot index your site.',
        fix: 'Remove or update the User-agent: ' + crawler.name + ' Disallow: / rule in robots.txt to allow AI indexing.'
      });
    } else if (isBlockedViaAll) {
      checks.push({
        name: crawler.label,
        status: 'warn',
        detail: 'A wildcard Disallow: / rule may be blocking ' + crawler.label + '. No explicit Allow rule found.',
        fix: 'Add "User-agent: ' + crawler.name + ' / Allow: /" to your robots.txt to explicitly allow AI crawling.'
      });
    } else {
      checks.push({
        name: crawler.label,
        status: 'pass',
        detail: crawler.label + ' appears to have crawl access. ' + crawler.description + '.'
      });
    }
  });

  // AI no-index meta tags
  var hasAINoIndex = htmlLow.includes('noai') || htmlLow.includes('noimageai');
  if (hasAINoIndex) {
    checks.push({ name:'AI No-Index Meta Tags', status:'warn',
      detail:'AI-blocking meta tags (noai/noimageai) detected in page HTML.',
      fix:'Review your meta tags to ensure you are not accidentally blocking AI crawlers.' });
  } else {
    checks.push({ name:'AI No-Index Meta Tags', status:'pass',
      detail:'No AI-blocking meta tags detected in page HTML.' });
  }

  // Content accessibility
  checks.push({
    name: 'Content Accessibility for AI',
    status: htmlLow.length > 5000 ? 'pass' : 'warn',
    detail: htmlLow.length > 5000
      ? 'Page has substantial text content accessible to AI crawlers.'
      : 'Page HTML appears thin or content-light. AI crawlers may not have enough to index.',
    fix: htmlLow.length > 5000 ? null : 'Add more rich, text-based content describing your services, location, and expertise.'
  });

  return checks;
}

function extractCrawlerSection(robotsTxt, agentName) {
  var lines = robotsTxt.split('\n');
  var inSection = false;
  var section = '';
  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim().toLowerCase();
    if (trimmed.startsWith('user-agent:')) {
      var agent = trimmed.replace('user-agent:', '').trim();
      inSection = (agent === agentName || agent === '*');
    }
    if (inSection) section += trimmed + '\n';
    if (inSection && trimmed === '' && section.length > 20) inSection = false;
  }
  return section;
}

/* ----------------------------------------------------------------
   SCORE CALCULATOR
---------------------------------------------------------------- */
function calculateScore(checks) {
  var total = checks.length;
  if (total === 0) return 0;
  var points = checks.reduce(function(sum, c) {
    if (c.status === 'pass') return sum + 1;
    if (c.status === 'warn') return sum + 0.5;
    return sum;
  }, 0);
  return Math.round((points / total) * 100);
}

/* ----------------------------------------------------------------
   SUMMARY & TIP TEXT
---------------------------------------------------------------- */
function getCategorySummaryText(id, grade, pass, fail, warn) {
  var texts = {
    seo: {
      A: 'Excellent SEO fundamentals! Your technical foundation is strong - keep maintaining these best practices.',
      B: 'Good SEO setup with a few gaps to address. Fixing these will improve your search visibility.',
      C: 'Several important SEO elements are missing. These gaps are likely costing you patient traffic.',
      D: 'Significant SEO issues detected. These need urgent attention to remain competitive.',
      F: 'Critical SEO deficiencies found. Your practice may be nearly invisible to search engines.'
    },
    geo: {
      A: 'Great GEO signals! Your site is well-positioned to be cited in AI-generated search answers.',
      B: 'Good GEO foundation. A few schema additions could significantly boost your AI answer visibility.',
      C: 'Your site is missing key structured data that AI engines rely on. This is a prime opportunity.',
      D: 'Weak GEO signals. ChatGPT, Perplexity, and Google AI Overview are unlikely citing your practice.',
      F: 'No GEO optimization found. You are essentially invisible to the AI search revolution.'
    },
    eeat: {
      A: 'Strong E-E-A-T signals! Google views your site as a trustworthy medical authority.',
      B: 'Good authority signals with room for improvement. Addressing gaps will build stronger trust.',
      C: 'E-E-A-T needs work. Google medical quality evaluators would flag several missing trust elements.',
      D: 'Weak authority signals. Your site may be penalized by Google medical content quality guidelines.',
      F: 'Critical E-E-A-T deficiencies. Medical sites with low E-E-A-T are heavily deprioritized by Google.'
    },
    ai: {
      A: 'Great news! Your site appears to be accessible to all major AI crawlers.',
      B: 'Good AI crawler access with minor concerns. A quick robots.txt review is recommended.',
      C: 'Some AI crawlers may be blocked. This is directly limiting your AI search visibility.',
      D: 'Multiple AI crawlers appear blocked. You may be invisible to several AI search platforms.',
      F: 'AI crawlers are blocked. ChatGPT, Claude, and Perplexity cannot index your practice.'
    }
  };
  return (texts[id] && texts[id][grade]) || (pass + ' checks passed, ' + warn + ' warnings, ' + fail + ' issues found.');
}

function getCategoryTip(id, grade) {
  if (grade === 'A') return null;
  var tips = {
    seo: '<strong>Quick Win:</strong> The single highest-impact SEO fix for medical practices is optimizing your title tag and meta description to include your specialty + city + a patient benefit. This alone can boost click-through rates by 20-30%.',
    geo: '<strong>Quick Win:</strong> Adding a Physician or MedicalClinic JSON-LD schema block to your homepage typically takes less than 1 hour but can get your practice cited in AI answers within weeks.',
    eeat: '<strong>Quick Win:</strong> A well-written physician bio page with credentials, education, and a professional photo is one of the fastest E-E-A-T improvements. Google specifically looks for this on medical sites.',
    ai: '<strong>Quick Win:</strong> Check your robots.txt file at yourdomain.com/robots.txt. A single misplaced Disallow: / rule under a wildcard can block all AI crawlers simultaneously.'
  };
  return tips[id] || null;
}

/* ----------------------------------------------------------------
   RENDER RESULTS  — clean one-page layout
---------------------------------------------------------------- */
function renderResults(domain, results) {
  var CAT_ICONS = { seo:'ico-seo', geo:'ico-geo', eeat:'ico-eat', ai:'ico-ai' };
  var categories = [
    { id:'seo',  label:'SEO',         fullLabel:'SEO Fundamentals',             icon:'fa-chart-line',     checks: results.seo  },
    { id:'geo',  label:'GEO',         fullLabel:'GEO — AI Answer Optimization', icon:'fa-map-marker-alt', checks: results.geo  },
    { id:'eeat', label:'E-E-A-T',     fullLabel:'E-E-A-T Authority',            icon:'fa-user-md',        checks: results.eeat },
    { id:'ai',   label:'AI Crawlers', fullLabel:'AI Crawler Access',            icon:'fa-robot',          checks: results.ai   },
  ];

  categories.forEach(function(cat) {
    cat.passCount = cat.checks.filter(function(c){return c.status==='pass';}).length;
    cat.warnCount = cat.checks.filter(function(c){return c.status==='warn';}).length;
    cat.failCount = cat.checks.filter(function(c){return c.status==='fail';}).length;
    /* Detect partial-scan category: no passes and no fails — only warns */
    cat.partial = (cat.passCount === 0 && cat.failCount === 0 && cat.warnCount > 0);
    cat.score = cat.partial ? null : calculateScore(cat.checks);
    cat.grade = cat.partial ? '?' : gradeFromScore(cat.score);
  });

  var totalPass  = categories.reduce(function(s,c){return s+c.passCount;},0);
  var totalWarn  = categories.reduce(function(s,c){return s+c.warnCount;},0);
  var totalFail  = categories.reduce(function(s,c){return s+c.failCount;},0);

  /* For overall score, only use non-partial categories */
  var scorableCats = categories.filter(function(c){ return !c.partial; });
  var isFullyPartial = scorableCats.length === 0;
  var overallScore = isFullyPartial ? null : Math.round(scorableCats.reduce(function(s,c){return s+c.score;},0)/scorableCats.length);
  var overallGrade = isFullyPartial ? '?' : gradeFromScore(overallScore);

  /* ── Banner ── */
  document.getElementById('result-domain').textContent = domain;
  document.getElementById('result-timestamp').textContent = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});
  document.getElementById('overall-score-num').textContent = overallScore !== null ? overallScore + '/100' : 'N/A';
  document.getElementById('overall-checks-summary').innerHTML =
    '<span style="color:#18c45a;font-weight:600">' + totalPass + ' passed</span>' +
    ' &nbsp;&middot;&nbsp; ' +
    '<span style="color:#f5bb00;font-weight:600">' + totalWarn + ' warnings</span>' +
    ' &nbsp;&middot;&nbsp; ' +
    '<span style="color:#e82020;font-weight:600">' + totalFail + ' failed</span>';
  var gradeCircle = document.getElementById('overall-grade-circle');
  var overallColor = overallGrade === '?' ? '#8899aa' : gradeColor(overallGrade);
  gradeCircle.style.background = overallColor;
  gradeCircle.style.boxShadow  = '0 0 0 6px ' + overallColor + '33';
  document.getElementById('overall-grade-letter').textContent = overallGrade === '?' ? '?' : overallGrade;

  /* ── 4 Grade summary cards ── */
  document.getElementById('category-overview').innerHTML = categories.map(function(cat) {
    if (cat.partial) {
      return '<div class="grade-cell" onclick="togglePanel(\'' + cat.id + '\')">' +
        '<div class="gc-badge" style="background:#8899aa">?</div>' +
        '<div class="gc-name">' + cat.label + '</div>' +
        '<div class="gc-sub" style="color:#8899aa">Blocked</div>' +
        '<div class="gc-bar-t"><div class="gc-bar-f" style="background:#ccd5de" data-w="0"></div></div>' +
      '</div>';
    }
    return '<div class="grade-cell" onclick="togglePanel(\'' + cat.id + '\')">' +
      '<div class="gc-badge bg-' + cat.grade + '">' + cat.grade + '</div>' +
      '<div class="gc-name">' + cat.label + '</div>' +
      '<div class="gc-sub">' + cat.score + '/100</div>' +
      '<div class="gc-bar-t"><div class="gc-bar-f" style="background:' + gradeColor(cat.grade) + '" data-w="' + cat.score + '"></div></div>' +
    '</div>';
  }).join('');

  /* ── Key Findings — top issues list (fails first, then warns) ── */
  var findings = [];
  categories.forEach(function(cat) {
    cat.checks.forEach(function(chk) {
      /* In partial-scan mode, skip the generic "could not check" warns — they're not real issues */
      if (chk.status !== 'pass' && !(cat.partial && chk.status === 'warn')) {
        findings.push({ status: chk.status, name: chk.name, detail: chk.detail, catLabel: cat.label, partial: cat.partial });
      }
    });
  });
  /* Sort: fail first, warn second */
  findings.sort(function(a,b){
    var order = {fail:0, warn:1};
    return (order[a.status]||2) - (order[b.status]||2);
  });
  /* Cap at 10 items so it fits on one page */
  var shown = findings.slice(0, 10);

  var realFail = categories.reduce(function(s,c){ return s + (c.partial ? 0 : c.failCount); }, 0);
  var realWarn = categories.reduce(function(s,c){ return s + (c.partial ? 0 : c.warnCount); }, 0);
  var actionSubEl = document.getElementById('action-sub-text');
  if (actionSubEl) {
    actionSubEl.textContent = realFail + ' issues, ' + realWarn + ' warnings found';
  }

  document.getElementById('action-list').innerHTML = shown.length === 0
    ? '<div style="padding:14px 0;font-size:.85rem;color:#18c45a;font-weight:600"><i class="fas fa-check-circle" style="margin-right:6px"></i>No issues found — excellent work!</div>'
    : shown.map(function(f) {
        var dotClass = f.status === 'fail' ? 'fail' : 'warn';
        var icon     = f.status === 'fail' ? '<i class="fas fa-times"></i>' : '<i class="fas fa-exclamation"></i>';
        return '<div class="action-row">' +
          '<div class="action-dot ' + dotClass + '">' + icon + '</div>' +
          '<div class="action-body">' +
            '<div class="action-name">' + f.name + '</div>' +
            '<div class="action-detail">' + f.detail + '</div>' +
          '</div>' +
          '<div class="action-cat">' + f.catLabel + '</div>' +
        '</div>';
      }).join('');

  /* ── Collapsible detail accordion (screen only) ── */
  document.getElementById('detail-panels').innerHTML = categories.map(function(cat) {
    var rowsHTML = cat.checks.map(function(chk) {
      var dotCls = chk.status==='pass' ? 'sp' : (chk.status==='warn' ? 'sw' : 'sf');
      var icon   = chk.status==='pass' ? '<i class="fas fa-check"></i>' : (chk.status==='warn' ? '<i class="fas fa-exclamation"></i>' : '<i class="fas fa-times"></i>');
      return '<div class="crow">' +
        '<div class="sdot ' + dotCls + '">' + icon + '</div>' +
        '<div class="crow-text">' +
          '<div class="c-label">' + chk.name + '</div>' +
          '<div class="c-detail">' + chk.detail + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    var passC = '<span style="color:#18c45a;font-weight:600">' + cat.passCount + ' passed</span>';
    var warnC = cat.partial
      ? '<span style="color:#8899aa;font-weight:600">Page blocked — ' + cat.warnCount + ' checks skipped</span>'
      : '<span style="color:#f5bb00;font-weight:600">' + cat.warnCount + ' warnings</span>';
    var failC = '<span style="color:#e82020;font-weight:600">' + cat.failCount + ' failed</span>';
    var metaLine = cat.partial ? warnC : passC + ' &middot; ' + warnC + ' &middot; ' + failC;

    var gradeStyle = cat.partial
      ? 'background:#8899aa;color:#fff;border-radius:8px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.05rem;flex-shrink:0'
      : '';
    var gradeEl = cat.partial
      ? '<div style="' + gradeStyle + '">?</div>'
      : '<div class="cat-grade bg-' + cat.grade + '">' + cat.grade + '</div>';

    return '<div class="cat-section" id="panel-' + cat.id + '">' +
      '<div class="cat-head" onclick="togglePanel(\'' + cat.id + '\')">' +
        '<div class="cat-hl">' +
          '<div class="cat-ico ' + CAT_ICONS[cat.id] + '"><i class="fas ' + cat.icon + '"></i></div>' +
          '<div>' +
            '<div class="cat-title">' + cat.fullLabel + '</div>' +
            '<div class="cat-meta">' + metaLine + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cat-hr">' +
          gradeEl +
          '<i class="fas fa-chevron-down chevron" id="chevron-' + cat.id + '"></i>' +
        '</div>' +
      '</div>' +
      '<div class="cat-body" id="body-' + cat.id + '">' + rowsHTML + '</div>' +
    '</div>';
  }).join('');

  /* ── Show results ── */
  document.getElementById('results-section').style.display = 'block';
  document.getElementById('results-section').scrollIntoView({ behavior:'smooth', block:'start' });

  /* ── Animate grade bars ── */
  setTimeout(function() {
    document.querySelectorAll('.gc-bar-f').forEach(function(bar) {
      var w = bar.getAttribute('data-w') || '0';
      bar.style.width = '0%';
      setTimeout(function() { bar.style.width = w + '%'; }, 100);
    });
  }, 300);
}

/* ----------------------------------------------------------------
   PARTIAL SCAN — runs when the target site blocks all proxies.
   We can still check: HTTPS, robots.txt AI-crawler rules, and
   flag everything we CANNOT check with honest "blocked" status.
---------------------------------------------------------------- */
function buildPartialResults(origin, robotsTxt) {
  /* SEO — only HTTPS and domain basics can be confirmed */
  var isHttps = origin.startsWith('https://');
  var seo = [
    { name:'HTTPS / SSL Security',    status: isHttps ? 'pass' : 'fail',
      detail: isHttps ? 'Site uses HTTPS — secure connection confirmed.' : 'Site is not using HTTPS.',
      fix: isHttps ? null : 'Install an SSL certificate immediately.' },
    { name:'Page Title Tag',          status:'warn', detail:'Could not fetch page HTML — title tag could not be checked.', fix:'Ask your web developer to verify a 50-60 character title with your specialty and city.' },
    { name:'Meta Description',        status:'warn', detail:'Could not fetch page HTML — meta description could not be checked.', fix:'Ensure a 150-160 character meta description is present on every page.' },
    { name:'H1 Heading',              status:'warn', detail:'Could not fetch page HTML — H1 check skipped.', fix:'Confirm one clear H1 heading is on your homepage.' },
    { name:'H2 Sub-Headings',         status:'warn', detail:'Could not fetch page HTML — H2 check skipped.', fix:'Add multiple H2 headings to organize your content.' },
    { name:'Canonical Tag',           status:'warn', detail:'Could not fetch page HTML — canonical tag check skipped.', fix:'Add a canonical link tag to each page.' },
    { name:'Mobile Viewport Tag',     status:'warn', detail:'Could not fetch page HTML — viewport check skipped.', fix:'Ensure the viewport meta tag is present.' },
    { name:'Image Alt Text',          status:'warn', detail:'Could not fetch page HTML — image alt-text check skipped.', fix:'Audit all images and add descriptive alt text.' },
    { name:'Internal Link Structure', status:'warn', detail:'Could not fetch page HTML — internal links check skipped.', fix:'Ensure your homepage links to your key pages.' },
    { name:'Page Size (HTML)',        status:'warn', detail:'Could not fetch page HTML — page size check skipped.', fix:'Keep your HTML under 500KB for best performance.' }
  ];

  /* GEO — all schema checks need the HTML */
  var geo = [
    { name:'Structured Data (Schema.org)', status:'warn', detail:'Could not fetch page HTML — schema check skipped.', fix:'Add JSON-LD schema (LocalBusiness, Physician, FAQPage) to your homepage.' },
    { name:'Medical / Physician Schema',   status:'warn', detail:'Could not fetch page HTML — medical schema check skipped.', fix:'Add a MedicalClinic or Physician schema type.' },
    { name:'Local Business Schema',        status:'warn', detail:'Could not fetch page HTML — local schema check skipped.', fix:'Include LocalBusiness schema with address, phone, and geo coordinates.' },
    { name:'FAQ Schema / Content',         status:'warn', detail:'Could not fetch page HTML — FAQ check skipped.', fix:'Add a FAQ section with FAQPage schema markup.' },
    { name:'Open Graph / Social Tags',     status:'warn', detail:'Could not fetch page HTML — OG tag check skipped.', fix:'Add og:title, og:description, and og:image to every page.' },
    { name:'Twitter/X Card Tags',          status:'warn', detail:'Could not fetch page HTML — Twitter card check skipped.', fix:'Add twitter:card and related tags.' },
    { name:'Author Attribution',           status:'warn', detail:'Could not fetch page HTML — author check skipped.', fix:'Add author bylines and a meta author tag.' },
    { name:'Sitemap Reference',            status:'warn', detail:'Could not fetch page HTML — sitemap reference check skipped.', fix:'Reference your sitemap.xml in robots.txt and the page head.' }
  ];

  /* E-E-A-T — all checks need the HTML */
  var eeat = [
    { name:'About Us Page',                   status:'warn', detail:'Could not fetch page HTML — About page check skipped.', fix:'Create a thorough About page with your practice history and team.' },
    { name:'Physician Credentials',           status:'warn', detail:'Could not fetch page HTML — credentials check skipped.', fix:'Display MD/DO, board certifications prominently on the homepage.' },
    { name:'Contact Information (NAP)',       status:'warn', detail:'Could not fetch page HTML — NAP check skipped.', fix:'Ensure your name, address, and phone number are visible on every page.' },
    { name:'Privacy Policy',                  status:'warn', detail:'Could not fetch page HTML — privacy policy check skipped.', fix:'Add a Privacy Policy page and link it in your footer.' },
    { name:'Medical Disclaimer',              status:'warn', detail:'Could not fetch page HTML — disclaimer check skipped.', fix:'Add a medical disclaimer to your homepage and all content pages.' },
    { name:'Terms of Service',                status:'warn', detail:'Could not fetch page HTML — terms check skipped.', fix:'Add a Terms of Service page linked from your footer.' },
    { name:'Patient Reviews / Testimonials', status:'warn', detail:'Could not fetch page HTML — reviews check skipped.', fix:'Add a patient testimonials section and embed Google Reviews.' },
    { name:'Credentials & Associations',     status:'warn', detail:'Could not fetch page HTML — associations check skipped.', fix:'Add logos for AMA membership, board certifications, and hospital affiliations.' },
    { name:'Blog / Educational Content',     status:'warn', detail:'Could not fetch page HTML — blog check skipped.', fix:'Start a blog with patient education articles to build E-E-A-T authority.' }
  ];

  /* AI Crawlers — robots.txt IS available */
  var ai = checkAICrawlers(robotsTxt, '');

  return { seo: seo, geo: geo, eeat: eeat, ai: ai };
}

function showPartialBanner(origin) {
  /* Remove any existing banner first */
  var old = document.getElementById('partial-scan-banner');
  if (old) old.parentNode.removeChild(old);

  var host = origin.replace('https://','').replace('http://','');
  var banner = document.createElement('div');
  banner.id = 'partial-scan-banner';
  banner.style.cssText = [
    'background:#fff8e1','border:1.5px solid #f5a800','border-radius:12px',
    'padding:14px 20px','margin:0 0 20px 0','display:flex','align-items:flex-start',
    'gap:12px','font-size:.83rem','line-height:1.5'
  ].join(';');
  banner.innerHTML =
    '<span style="font-size:1.3rem;flex-shrink:0">⚠️</span>' +
    '<div>' +
      '<strong style="color:#b37700;display:block;margin-bottom:3px">' +
        host + ' is blocking external page requests' +
      '</strong>' +
      'We tried 4 different proxy services and none could load your page HTML. ' +
      'This is common with Cloudflare, Wix, and other site-security systems. ' +
      '<strong>AI Crawler checks used your real robots.txt</strong>, but SEO, GEO, and E-E-A-T checks ' +
      'show "⚠ Could not check" — these are <em>not failures</em>, just items we couldn\'t verify remotely. ' +
      '<a href="https://chealthconnections.com/contact" target="_blank" rel="noopener" ' +
      'style="color:#1a6fd4;font-weight:600;text-decoration:underline">' +
      'Book a free manual audit</a> for a complete report.' +
    '</div>';

  /* Insert before the report card */
  var rc = document.getElementById('report-card');
  if (rc) rc.parentNode.insertBefore(banner, rc);
}

/* ----------------------------------------------------------------
   UI HELPERS
---------------------------------------------------------------- */
function togglePanel(id) {
  var body    = document.getElementById('body-' + id);
  var chevron = document.getElementById('chevron-' + id);
  if (!body) return;
  var isOpen = body.style.display === 'block';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

function scrollToPanel(id) {
  var el = document.getElementById('panel-' + id);
  if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
}

/* ----------------------------------------------------------------
   PROGRESS ANIMATION
---------------------------------------------------------------- */
async function animateProgress(steps) {
  var bar = document.getElementById('progress-bar');
  var pcts = [10, 25, 45, 62, 78, 95];
  for (var i = 0; i < steps.length; i++) {
    var stepEl = document.getElementById('step-' + (i+1));
    if (stepEl) stepEl.classList.add('active');
    bar.style.width = pcts[i] + '%';
    await sleep(steps[i]);
    if (stepEl) {
      stepEl.classList.remove('active');
      stepEl.classList.add('done');
      var ico2 = stepEl.querySelector('.step-orb');
      if (ico2) ico2.innerHTML = '<i class="fas fa-check"></i>';
    }
  }
  bar.style.width = '100%';
}

/* ----------------------------------------------------------------
   MAIN SCAN ORCHESTRATOR
---------------------------------------------------------------- */
async function startScan() {
  var input  = document.getElementById('domain-input').value;
  var origin = cleanDomain(input);

  if (!origin) {
    alert('Please enter a valid domain name, e.g. yourpractice.com');
    return;
  }

  // Hide panels, show loader
  var wc = document.getElementById('what-we-check'); if (wc) wc.style.display = 'none';
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('error-section').style.display = 'none';
  document.getElementById('loading-section').style.display = 'block';
  document.getElementById('loader-domain-name').textContent = origin.replace('https://','').replace('http://','');
  document.getElementById('scan-btn').disabled = true;

  // Reset steps
  for (var s = 1; s <= 6; s++) {
    var el = document.getElementById('step-' + s);
    if (el) {
      el.classList.remove('active','done');
      var ico = el.querySelector('.step-orb');
      if (ico) ico.innerHTML = '<i class="fas ' + ['fa-globe','fa-chart-line','fa-map-marker-alt','fa-user-md','fa-robot','fa-file-alt'][s-1] + '"></i>';
    }
  }
  document.getElementById('progress-bar').style.width = '0%';

  var progressPromise = animateProgress([800, 1200, 1200, 1000, 1000, 600]);

  var html = null;
  var fetchBlocked = false;

  try {
    html = await fetchSiteHTML(origin);
  } catch(err) {
    fetchBlocked = true;
  }

  var robotsTxt = await fetchRobotsTxt(origin);

  await progressPromise;
  await sleep(400);

  document.getElementById('loading-section').style.display = 'none';

  if (fetchBlocked) {
    /* ---- PARTIAL SCAN MODE ---- */
    /* Build results using only what we can detect without the page HTML */
    var partialResults = buildPartialResults(origin, robotsTxt);
    showPartialBanner(origin);
    renderResults(origin.replace('https://','').replace('http://',''), partialResults);
  } else {
    var doc = parseHTML(html);
    var results = {
      seo:  checkSEO(doc, origin, html),
      geo:  checkGEO(doc, html),
      eeat: checkEEAT(doc, html, origin),
      ai:   checkAICrawlers(robotsTxt, html),
    };
    renderResults(origin.replace('https://','').replace('http://',''), results);
  }

  document.getElementById('scan-btn').disabled = false;
}

function getStepIcon(n) {
  var icons = ['fa-globe','fa-chart-line','fa-map-marker-alt','fa-user-md','fa-robot','fa-file-alt'];
  return '<i class="fas ' + (icons[n-1] || 'fa-circle') + '"></i>';
}

/* ----------------------------------------------------------------
   RESET
---------------------------------------------------------------- */
function resetScanner() {
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('error-section').style.display = 'none';
  document.getElementById('loading-section').style.display = 'none';
  var wc2 = document.getElementById('what-we-check'); if (wc2) wc2.style.display = 'block';
  document.getElementById('domain-input').value = '';
  // Remove demo notice if present
  var notice = document.getElementById('demo-notice');
  if (notice) notice.parentNode.removeChild(notice);
  // Remove partial-scan banner if present
  var pb = document.getElementById('partial-scan-banner');
  if (pb) pb.parentNode.removeChild(pb);
  document.getElementById('domain-input').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ----------------------------------------------------------------
   DEMO MODE — Realistic sample scan for a fictitious medical practice
   Showcases a typical mix of pass / warn / fail results
---------------------------------------------------------------- */
function loadDemo() {
  var demoResults = {
    seo: [
      { name:'Page Title Tag',          status:'warn', detail:'Title found but too short (28 chars): "Dr. Emily Carter MD - Home". Ideally 50-60 characters.', fix:'Expand title to: "Dr. Emily Carter, MD | Functional Medicine | Austin, TX" to include specialty and location.' },
      { name:'Meta Description',        status:'fail', detail:'No meta description found on the homepage. Search engines and AI tools use this as a summary of your page.', fix:'Write a compelling 150-160 character meta description such as: "Austin functional medicine physician Dr. Emily Carter helps patients resolve chronic illness naturally. Book a free 15-minute consult today."' },
      { name:'H1 Heading',              status:'pass', detail:'Single H1 found: "Welcome to Carter Functional Medicine"' },
      { name:'H2 Sub-Headings',         status:'warn', detail:'Only 1 H2 heading found. More structured sections help AI engines understand your page topics.', fix:'Add H2 headings for key sections: Our Services, About Dr. Carter, Patient Testimonials, Location & Hours.' },
      { name:'HTTPS / SSL Security',    status:'pass', detail:'Site is served over HTTPS - secure connection confirmed.' },
      { name:'Canonical Tag',           status:'fail', detail:'No canonical tag found. This can cause duplicate content issues if your site is accessible at multiple URLs.', fix:'Add <link rel="canonical" href="https://carterfunctionalmedicine.com/"> to the <head> of every page.' },
      { name:'Mobile Viewport Tag',     status:'pass', detail:'Mobile viewport meta tag present - mobile-friendly display configured.' },
      { name:'Image Alt Text',          status:'warn', detail:'6 of 14 images are missing alt text, including the hero photo and team photo.', fix:'Add descriptive alt text to all images. Example: alt="Dr. Emily Carter MD smiling in her Austin medical office"' },
      { name:'Internal Link Structure', status:'pass', detail:'18 internal links found across the homepage - good site connectivity.' },
      { name:'Page Size (HTML)',         status:'pass', detail:'Homepage HTML is 84KB - well within optimal range.' }
    ],
    geo: [
      { name:'Structured Data (Schema.org)',  status:'fail', detail:'No JSON-LD structured data found anywhere on the homepage. This is the #1 missing signal for AI search engines.', fix:'Add Schema.org JSON-LD markup immediately. Start with Physician + LocalBusiness schemas. This is the single highest-impact GEO fix available.' },
      { name:'Medical / Physician Schema',    status:'fail', detail:'No MedicalBusiness, Physician, or MedicalClinic schema type detected.', fix:'Add a Physician schema block with name, specialty, address, telephone, and url fields. ChatGPT and Perplexity use this to identify and cite medical professionals.' },
      { name:'Local Business Schema',         status:'fail', detail:'No LocalBusiness schema with address and geo coordinates found.', fix:'Add LocalBusiness schema with your full NAP (Name, Address, Phone), geo coordinates, and openingHoursSpecification. Critical for local AI search.' },
      { name:'FAQ Schema / Content',          status:'warn', detail:'An FAQ section exists on the page but no FAQPage JSON-LD schema markup is present.', fix:'Wrap your existing FAQ content in FAQPage schema. This alone can generate featured snippets in Google and citations in Perplexity AI answers.' },
      { name:'Open Graph / Social Tags',      status:'warn', detail:'2/3 core OG tags found (missing: og:image). Title and description are present.', fix:'Add an og:image tag pointing to a professional 1200x630px photo. This controls how your site looks when shared on social media and in AI link previews.' },
      { name:'Twitter/X Card Tags',           status:'fail', detail:'No Twitter Card meta tags found.', fix:'Add twitter:card, twitter:title, twitter:description, and twitter:image tags to boost social sharing and AI content indexing.' },
      { name:'Author Attribution',            status:'warn', detail:'No meta author tag found. Doctor name appears in body text but is not marked up for machine readability.', fix:'Add <meta name="author" content="Dr. Emily Carter, MD"> and use structured bylines on all blog/article pages.' },
      { name:'Sitemap Reference',             status:'pass', detail:'Sitemap.xml referenced in robots.txt and accessible at /sitemap.xml.' }
    ],
    eeat: [
      { name:'About Us Page',               status:'pass', detail:'Link to an About page found in main navigation - key for establishing practice authority.' },
      { name:'Physician Credentials',        status:'pass', detail:'MD credential, board certification, and fellowship training mentioned on the homepage.' },
      { name:'Contact Information (NAP)',    status:'pass', detail:'Phone number (512-555-0192) and physical address (Austin, TX) both found - good NAP visibility.' },
      { name:'Privacy Policy',              status:'pass', detail:'Privacy Policy link found in footer - important for HIPAA trust signals.' },
      { name:'Medical Disclaimer',          status:'fail', detail:'No medical disclaimer language found anywhere on the site. This is flagged by Google medical quality evaluators.', fix:'Add a medical disclaimer to the footer and any health-related content pages: "Content on this site is for informational purposes only and does not constitute medical advice."' },
      { name:'Terms of Service',            status:'warn', detail:'No Terms of Service page found, only a Privacy Policy.', fix:'Create a Terms of Service page and link it in the footer alongside your Privacy Policy.' },
      { name:'Patient Reviews / Testimonials', status:'pass', detail:'Patient testimonials section found on the homepage with 4 quoted reviews.' },
      { name:'Credentials & Associations',  status:'warn', detail:'Board certification mentioned in text but no official badge images or association logos displayed.', fix:'Add logo badges for your board certification body, any hospital affiliations, and professional associations (IFM, AAFP, etc.). Visual trust signals matter.' },
      { name:'Blog / Educational Content',  status:'fail', detail:'No blog or educational resource section found. This is a major missed E-E-A-T opportunity for a functional medicine practice.', fix:'Launch a blog with monthly articles on topics like gut health, hormone balance, and integrative nutrition. Even 6 quality articles per year builds significant E-E-A-T authority.' }
    ],
    ai: [
      { name:'robots.txt File',                   status:'pass', detail:'robots.txt file found and accessible at /robots.txt.' },
      { name:'GPTBot (ChatGPT / OpenAI)',          status:'fail', detail:'GPTBot is explicitly BLOCKED in your robots.txt. ChatGPT cannot read or cite your practice website.', fix:'Remove the "User-agent: GPTBot / Disallow: /" line from your robots.txt. Blocking GPTBot means ChatGPT cannot include your practice in AI-generated answers.' },
      { name:'ClaudeBot (Anthropic / Claude)',     status:'pass', detail:'ClaudeBot has crawl access. Anthropic Claude AI assistant can index your site.' },
      { name:'PerplexityBot (Perplexity AI)',      status:'warn', detail:'No explicit allow or deny rule found for PerplexityBot. A wildcard Disallow may be limiting access.', fix:'Add "User-agent: PerplexityBot / Allow: /" to your robots.txt to explicitly grant Perplexity AI access.' },
      { name:'Google-Extended (AI Overviews)',     status:'fail', detail:'Google-Extended is BLOCKED in your robots.txt. Your site will not appear in Google AI Overviews.', fix:'Remove the Google-Extended block from robots.txt. This single change can get your practice featured in Google AI Overview answers for searches like "functional medicine doctor Austin".' },
      { name:'CCBot (Common Crawl)',               status:'pass', detail:'CCBot has crawl access. Common Crawl (which powers many AI training datasets) can index your site.' },
      { name:'AI No-Index Meta Tags',              status:'pass', detail:'No AI-blocking meta tags (noai / noimageai) detected in page HTML.' },
      { name:'Content Accessibility for AI',       status:'pass', detail:'Page has substantial text content (112KB) accessible to AI crawlers.' }
    ]
  };

  // Show the loading animation briefly, then render the demo
  var wc = document.getElementById('what-we-check'); if (wc) wc.style.display = 'none';
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('error-section').style.display = 'none';
  document.getElementById('loading-section').style.display = 'block';
  document.getElementById('loader-domain-name').textContent = 'carterfunctionalmedicine.com';
  document.getElementById('scan-btn').disabled = true;

  // Reset progress steps
  for (var s = 1; s <= 6; s++) {
    var el = document.getElementById('step-' + s);
    if (el) {
      el.classList.remove('active','done');
      var ico = el.querySelector('.step-orb');
      if (ico) ico.innerHTML = '<i class="fas ' + ['fa-globe','fa-chart-line','fa-map-marker-alt','fa-user-md','fa-robot','fa-file-alt'][s-1] + '"></i>';
    }
  }
  document.getElementById('progress-bar').style.width = '0%';

  // Run the progress animation, then show demo results
  animateProgress([400, 500, 500, 400, 400, 300]).then(function() {
    return sleep(300);
  }).then(function() {
    document.getElementById('loading-section').style.display = 'none';
    document.getElementById('scan-btn').disabled = false;

    // Add a "DEMO" watermark badge to the result domain
    renderResults('carterfunctionalmedicine.com [DEMO]', demoResults);

    // Insert demo notice banner after scan-again button
    var resultsSection = document.getElementById('results-section');
    var demoNotice = document.createElement('div');
    demoNotice.id = 'demo-notice';
    demoNotice.style.cssText = 'background:linear-gradient(135deg,#0d1b36,#1a4f8a);color:white;border-radius:14px;padding:16px 22px;display:flex;align-items:center;gap:14px;margin-bottom:22px;font-size:.86rem;line-height:1.55;box-shadow:0 4px 18px rgba(13,27,54,.18);';
    demoNotice.innerHTML =
      '<i class="fas fa-flask" style="font-size:1.4rem;flex-shrink:0;color:#8fda42;"></i>' +
      '<div>' +
        '<strong style="font-size:.95rem;">You are viewing a sample report.</strong> ' +
        'This is a fictional medical practice with realistic results showing the types of issues we find. ' +
        '<a href="#" onclick="resetScanner();return false;" style="color:#8fda42;font-weight:700;text-decoration:underline;">Enter your own domain</a> to get your real report.' +
      '</div>';

    // Insert after the scan-again button (first child)
    var firstChild = resultsSection.firstElementChild;
    resultsSection.insertBefore(demoNotice, firstChild.nextSibling);
  });
}

/* Enter key support */
document.addEventListener('DOMContentLoaded', function() {
  var input = document.getElementById('domain-input');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') startScan();
    });
  }
});

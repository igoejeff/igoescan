# AI Readiness Scanner — Conscious Health Connections

**Live tool**: Deploy via Publish tab.  
**Goal**: Free, instant AI Readiness Report for medical practices — covering SEO, GEO, E-E-A-T, and AI Crawler access.

---

## ✅ Completed Features

### Core Scanner
- **40+ live checks** across 4 pillars (SEO, GEO, E-E-A-T, AI Crawlers)
- **Dual-proxy fetch**: allorigins.win → corsproxy.io fallback (improved reliability)
- **robots.txt analysis**: detects GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot blocking
- **JSON-LD schema detection**: Physician, LocalBusiness, FAQ, MedicalBusiness
- **E-E-A-T checks**: About page, credentials, contact NAP, privacy policy, disclaimer, terms, blog

### Report UI
- **Animated grade ring**: counts from 0 up to score, then flips to letter grade (A–F)
- **4 color-coded grade cards** with animated score bars
- **Recommended Actions section**: 3-card priority plan (Urgent Fix / High Priority / Quick Win)
- **Key Findings**: top 10 issues (fails first, then warnings) with category tags
- **Expandable detail accordion** showing all 40+ individual checks

### PDF Export
- **Export as PDF** button → clean A4 print layout
- **Print-only Fix-It Checklist** appended to PDF (all fails + warnings with fix instructions, numbered, categorized)
- Navbar, hero, CTA, footer hidden in print; colors forced exact

### Share & History
- **Share Report button**: copies a pre-filled URL (?scan=domain) to clipboard + toast confirmation
- **URL param auto-fill**: visiting ?scan=domain pre-populates the input field
- **Recent Scans history**: last 5 scans stored in localStorage, shown as clickable pills below results

### Lead Capture
- **Email capture modal**: name + email before showing results (skippable)
- Stored in `localStorage` key `chc_lead`
- Bypassed in demo mode

### UX
- Demo mode with realistic sample data (Carter Functional Medicine)
- Loading animation with 6 steps + animated progress bar
- Error handling with fallback message
- Enter-key support for scan input and email field
- Responsive (mobile-friendly)

---

## 🗂️ File Structure

```
index.html          ← Single self-contained file (HTML + CSS + JS)
images/
  chc-icon.png      ← CHC logo (nav, report header, footer, CTA)
css/
  style.css         ← Legacy external stylesheet (superseded by inline styles)
js/
  scanner.js        ← Legacy external JS (superseded by inline script)
README.md
```

> All CSS and JavaScript are inlined in `index.html` for zero-caching issues.

---

## 🔗 Entry Points

| URL | Behavior |
|-----|----------|
| `/` | Landing page with scan input |
| `/?scan=yourpractice.com` | Pre-fills domain and prompts scan |
| Click "Preview a Sample Report" | Loads demo without needing a domain |

---

## 📦 Data Storage

| Key | Storage | Contents |
|-----|---------|----------|
| `chc_lead` | localStorage | `{name, email, ts}` — email capture |
| `chc_scan_history` | localStorage | Array of last 5 scans `{domain, score, grade, ts}` |

No backend or database. Everything is client-side.

---

## ⚠️ Known Limitations

- CORS proxy (`allorigins.win` + `corsproxy.io`) may be slow or rate-limited
- JavaScript-rendered sites (React/Next.js) may return thin initial HTML
- PDF is letter/A4 portrait; very long fix lists may overflow to page 2

---

## 🚀 Recommended Next Steps

1. **Publish** via Publish tab to get a live shareable URL
2. **Replace `images/chc-icon.png`** with the real high-res CHC logo
3. **Add Google PageSpeed score** via the public PageSpeed Insights API (no auth needed)
4. **Connect email capture** to a CRM (Mailchimp, ConvertKit) via a public form endpoint
5. **A/B test** hero headline copy for conversion optimization
6. **Add comparison mode** — scan two domains side by side

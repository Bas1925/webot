// Build pipeline for the Webot site.
//   - Reads the original exported bundle (kept pristine in Webot-Daylight.original.html)
//   - Applies the i18n / RTL / mobile transforms to the canonical template
//   - Emits  preview/index.html         (assets as local files, for live preview)
//   - Emits  Webot-Daylight.html        (re-bundled single self-contained file)
//
// Run:  node build.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = __dirname;
const ORIGINAL = path.join(DIR, 'Webot-Daylight.html');
const BACKUP = path.join(DIR, 'Webot-Daylight.original.html');

// 1) Keep a pristine copy of the original export so the build is reproducible.
if (!fs.existsSync(BACKUP)) fs.copyFileSync(ORIGINAL, BACKUP);

const origLines = fs.readFileSync(BACKUP, 'utf8').split('\n');
const manifest = JSON.parse(origLines[162]);
const TEMPLATE_LINE = 170; // index of the JSON template line
let template = JSON.parse(origLines[TEMPLATE_LINE]);

// ---- transform helpers ----
function sub(find, repl, count) {
  const n = template.split(find).length - 1;
  if (n !== count) throw new Error(`sub expected ${count} of [${find.slice(0, 70)}…] but found ${n}`);
  template = template.split(find).join(repl);
}
function replaceRange(startMarker, endMarker, repl) {
  const s = template.indexOf(startMarker);
  if (s < 0) throw new Error(`range start not found: ${startMarker.slice(0, 50)}`);
  const e = template.indexOf(endMarker, s);
  if (e < 0) throw new Error(`range end not found: ${endMarker}`);
  template = template.slice(0, s) + repl + template.slice(e + endMarker.length);
}

// ---- SEO building blocks (shared by the static wrapper <head> and the app <head>) ----
// NOTE: SITE_URL / OG image are placeholders — update them to the real domain on deploy.
// The real live address — swap for the custom domain when it's bought, so
// canonicals/hreflang/sitemap/OG all point at a URL that actually serves the site.
const SITE_URL = 'https://werbot.netlify.app/';
// Interim share image: the WB logo asset (exists on the live site). Replace with
// a proper 1200x630 og-image when the brand domain lands. NOTE: the bare asset
// UUID is used because the asset pipeline rewrites it to "/assets/<uuid>.png".
const OG_IMG = SITE_URL.replace(/\/$/, '') + '4a97f629-b3fe-4cc5-adf9-33a24cefa8bc';
const SEO_TITLE = 'Webot — Where your business runs online';
const SEO_DESC = 'Webot designs and builds fast websites, mobile apps and AI features for founders and teams — in English, Arabic and Hebrew, fully RTL-ready.';
const SEO_DESC_SHORT = 'Fast websites, mobile apps and AI — built right, in English, Arabic and Hebrew.';
// Favicon = the real WB mark on the dark brand tile (#14151A), matching the header.
// The brand logo PNG is embedded into an SVG, served as /favicon.svg (loaded once, cached).
const LOGO_UUID = '4a97f629-b3fe-4cc5-adf9-33a24cefa8bc';
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#14151A"/><image x="17" y="18" width="66" height="64" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${manifest[LOGO_UUID].data}"/></svg>`;
const FAVICON = '/favicon.svg';
const JSONLD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  name: 'Webot',
  description: SEO_DESC,
  url: SITE_URL,
  image: OG_IMG,
  logo: OG_IMG,
  slogan: 'Web, mobile & AI products, built right',
  areaServed: 'Worldwide',
  knowsLanguage: ['en', 'ar', 'he'],
  sameAs: ['https://instagram.com/webot2026'],
});
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// ---- Per-language SEO. urlPath '' = the en root; 'ar'/'he' are sub-paths. ----
const LANGS = {
  en: { htmlLang: 'en', dir: 'ltr', ogLocale: 'en_US', urlPath: '',
    title: SEO_TITLE,
    desc: SEO_DESC,
    nsH1: 'Web, mobile & AI products, built right',
    nsSub: 'Webot designs and builds fast websites, mobile apps and AI features for founders and teams — in English, Arabic and Hebrew.' },
  ar: { htmlLang: 'ar', dir: 'rtl', ogLocale: 'ar_AR', urlPath: 'ar',
    title: 'Webot — نُطلق مشروعك على الإنترنت',
    desc: 'تصمّم Webot وتبني مواقع سريعة وتطبيقات موبايل ومزايا ذكاء اصطناعي للأعمال — بالإنجليزية والعربية والعبرية، مع دعم كامل للاتجاه من اليمين إلى اليسار.',
    nsH1: 'مواقع وتطبيقات موبايل وذكاء اصطناعي، مبنية بإتقان',
    nsSub: 'تصمّم Webot وتبني مواقع سريعة وتطبيقات موبايل ومزايا ذكاء اصطناعي للأعمال — بالعربية والعبرية والإنجليزية.' },
  he: { htmlLang: 'he', dir: 'rtl', ogLocale: 'he_IL', urlPath: 'he',
    title: 'Webot — מביאים את העסק שלכם לאונליין',
    desc: 'Webot מעצבת ובונה אתרים מהירים, אפליקציות מובייל ויכולות בינה מלאכותית לעסקים — באנגלית, ערבית ועברית, עם תמיכת RTL מלאה.',
    nsH1: 'אתרים, אפליקציות מובייל ובינה מלאכותית, בנוי נכון',
    nsSub: 'Webot מעצבת ובונה אתרים מהירים, אפליקציות מובייל ויכולות בינה מלאכותית לעסקים — בעברית, ערבית ואנגלית.' },
};
const LANG_KEYS = ['en', 'ar', 'he'];
const hreflangLinks = LANG_KEYS.map((k) => `<link rel="alternate" hreflang="${LANGS[k].htmlLang}" href="${SITE_URL}${LANGS[k].urlPath}">`).join('\n') +
  `\n<link rel="alternate" hreflang="x-default" href="${SITE_URL}">`;

// Per-language <head> meta — title/description/canonical/hreflang/OG/Twitter/JSON-LD.
function headMetaFor(lang) {
  const L = LANGS[lang];
  const self = SITE_URL + L.urlPath;
  const ogAlts = LANG_KEYS.filter((k) => k !== lang).map((k) => `<meta property="og:locale:alternate" content="${LANGS[k].ogLocale}">`).join('\n');
  return [
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
    `<title>${esc(L.title)}</title>`,
    `<meta name="description" content="${esc(L.desc)}">`,
    `<meta name="robots" content="index,follow">`,
    `<link rel="canonical" href="${self}">`,
    hreflangLinks,
    `<meta name="theme-color" content="#FBFAF6">`,
    `<link rel="icon" type="image/svg+xml" href="${FAVICON}">`,
    `<link rel="apple-touch-icon" href="${FAVICON}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Webot">`,
    `<meta property="og:title" content="${esc(L.title)}">`,
    `<meta property="og:description" content="${esc(SEO_DESC_SHORT)}">`,
    `<meta property="og:url" content="${self}">`,
    `<meta property="og:image" content="${OG_IMG}">`,
    `<meta property="og:locale" content="${L.ogLocale}">`,
    ogAlts,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(L.title)}">`,
    `<meta name="twitter:description" content="${esc(SEO_DESC_SHORT)}">`,
    `<meta name="twitter:image" content="${OG_IMG}">`,
    `<script type="application/ld+json">${JSONLD}</script>`,
  ].join('\n');
}

const FONT_STYLE = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Heebo:wght@400;500;600;700;800&family=Sora:wght@300&display=swap" rel="stylesheet">
<style id="wb-i18n">
  html[lang="ar"], html[lang="ar"] *{font-family:'Cairo','Noto Sans Arabic','Segoe UI',Tahoma,sans-serif !important}
  html[lang="he"], html[lang="he"] *{font-family:'Heebo','Noto Sans Hebrew','Segoe UI',Arial,sans-serif !important}
  .wb-arrow{display:inline-block}
  [dir="rtl"] .wb-arrow{transform:scaleX(-1)}
  [dir="rtl"] .wb-mobile-sheet{right:auto !important;left:0 !important;box-shadow:20px 0 60px -20px rgba(20,21,26,.3) !important}
  /* Horizontal card/marquee strips must lay out left-to-right so they fill the
     viewport edge-to-edge exactly like the English layout. In RTL a wider-than-
     viewport strip would otherwise right-align and leave an empty gap. The strip
     wrappers are forced LTR inline; .wb-rtl-text re-asserts RTL on strips whose
     content is translated (the testimonials) so that text stays right-aligned. */
  [dir="rtl"] .wb-rtl-text{direction:rtl}
  html{overflow-x:hidden}
  *{-webkit-tap-highlight-color:rgba(59,79,255,.18)}
  /* video hero (ported from the webot-motion concept) */
  .wb-vhero{position:relative;min-height:100vh;min-height:100svh;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;padding:clamp(90px,14vh,140px) clamp(18px,5vw,56px) clamp(26px,4vh,44px)}
  .wb-vhero-media{position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;overflow:hidden;background:#E9E7E0}
  .wb-vhero-media video{width:100%;height:100%;object-fit:cover;display:block}
  .wb-vhero-veil{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(251,250,246,.5) 0%,rgba(251,250,246,.08) 28%,rgba(251,250,246,.08) 55%,rgba(251,250,246,.9) 100%)}
  @media (min-width:768px){ .wb-vhero-media{top:50%;left:50%;width:90%;height:87%;transform:translate(-50%,-50%);border-radius:24px} }
  .wb-vhero-copy{position:relative;z-index:2;width:100%;max-width:1180px;margin:0 auto}
  .wb-vhero-kicker{display:flex;align-items:center;gap:9px;font-size:13.5px;font-weight:600;color:rgba(20,21,26,.62)}
  .wb-vhero-dot{flex:none;width:8px;height:8px;border-radius:50%;background:#3B4FFF}
  .wb-vhero-h1{margin-top:14px;font-family:'Sora',sans-serif;font-weight:300;font-size:clamp(2.4rem,8.5vw,5rem);line-height:.98;letter-spacing:-.03em;color:#14151A}
  html[lang="ar"] .wb-vhero-h1, html[lang="he"] .wb-vhero-h1{font-weight:400;line-height:1.12;letter-spacing:0}
  /* EN + HE: narrow measure stacks the headline in 3 short lines on the start
     side, keeping the words clear of the hand in the video */
  html[lang="en"] .wb-vhero-h1{max-width:12.5ch;font-size:clamp(2.4rem,7.6vw,4.5rem)}
  html[lang="he"] .wb-vhero-h1{max-width:10ch;font-size:clamp(2.4rem,7.3vw,4.3rem)}
  .wb-vhero-cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
  .wb-vhero-btn{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:15.5px;padding:14px 24px;border-radius:999px;transition:all .25s ease}
  .wb-vhero-btn-dark{background:#3B4FFF;color:#fff;box-shadow:0 10px 26px -12px rgba(59,79,255,.55)}
  .wb-vhero-btn-dark:hover{background:#2638f0;transform:translateY(-2px);box-shadow:0 16px 34px -12px rgba(59,79,255,.65)}
  .wb-vhero-btn-ghost{background:rgba(255,255,255,.78);border:1px solid #ECEAE3;color:#14151A;backdrop-filter:blur(6px)}
  .wb-vhero-btn-ghost:hover{border-color:#14151A;transform:translateY(-2px)}
  .wb-vhero-quote{display:flex;align-items:stretch;gap:12px;margin-top:26px;max-width:520px;font-size:14.5px;line-height:1.5;color:rgba(20,21,26,.68)}
  .wb-vhero-qbar{flex:none;width:3px;border-radius:3px;background:linear-gradient(180deg,#3B4FFF,#FF6B57)}
  .wb-vhero-qaccent{color:#3B4FFF;font-weight:600}
  @media (prefers-reduced-motion:reduce){ .wb-vhero-media video{display:none} }
  /* lead form */
  #contact{scroll-margin-top:84px}
  .wb-input::placeholder{color:#9aa0ab}
  .wb-input:focus{border-color:#3B4FFF;box-shadow:0 0 0 3px rgba(59,79,255,.16);outline:none}
  .wb-input:invalid:not(:focus):not(:placeholder-shown){border-color:#e07a72}
  .wb-req{color:#FF6B57;margin-inline-start:3px;font-weight:700}
  .wb-form-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #F1EFE9}
  .wb-form-head-title{font-family:'Sora',sans-serif;font-weight:700;font-size:17px;color:#14151A}
  .wb-form-secure{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#0f6b4f;background:#E7F7F0;border:1px solid #c8ecdf;border-radius:999px;padding:5px 10px;white-space:nowrap}
  .wb-form-trust{display:flex;align-items:flex-start;gap:10px;font-size:12.5px;line-height:1.5;color:#3a3d44;background:#F4F2EC;border:1px solid #ECEAE3;border-radius:12px;padding:11px 12px}
  .wb-form-trust-icon{flex:none;font-size:16px;line-height:1.2}
  select.wb-input:invalid{color:#9aa0ab}
  select.wb-input option{color:#14151A}
  .wb-country-picker{position:relative}
  .wb-country-trigger{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:start;cursor:pointer;background:#FBFAF6}
  .wb-country-trigger:not(.wb-country-selected) .wb-country-trigger-text{color:#9aa0ab}
  .wb-country-chevron{color:#6b7077;font-size:11px;flex:none;transition:transform .2s ease;line-height:1}
  .wb-country-trigger[aria-expanded="true"] .wb-country-chevron{transform:rotate(180deg)}
  .wb-country-panel{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:40;background:#fff;border:1px solid #ECEAE3;border-radius:14px;box-shadow:0 18px 48px -20px rgba(20,21,26,.28);overflow:hidden}
  .wb-country-search-wrap{padding:10px 10px 6px;border-bottom:1px solid #F1EFE9}
  .wb-country-search{width:100%;font-family:'Inter';font-size:14.5px;color:#14151A;background:#F4F2EC;border:1px solid #ECEAE3;border-radius:10px;padding:10px 12px;outline:none}
  .wb-country-search:focus{border-color:#3B4FFF;box-shadow:0 0 0 3px rgba(59,79,255,.14)}
  .wb-country-search::placeholder{color:#9aa0ab}
  .wb-country-list{list-style:none;margin:0;padding:6px;max-height:220px;overflow-y:auto;-webkit-overflow-scrolling:touch}
  .wb-country-opt{padding:10px 12px;border-radius:10px;font-size:14.5px;color:#14151A;cursor:pointer;transition:background .15s ease}
  .wb-country-opt:hover,.wb-country-opt.wb-country-opt-active{background:#EEF0FF}
  .wb-country-opt[hidden]{display:none}
  .wb-country-empty{margin:0;padding:14px 12px;font-size:13.5px;color:#6b7077;text-align:center}
  [dir="rtl"] .wb-country-trigger{text-align:right}
</style>
<script>
/* The hero video is rendered by the runtime, which drops the "muted"/"loop"
   DOM properties (React quirk) AND re-creates the node on re-renders — so a
   one-shot fix gets thrown away. Keep re-asserting on whatever node is live. */
(function(){setInterval(function(){var v=document.querySelector('.wb-vhero-media video');if(!v)return;v.muted=true;v.loop=true;if(v.paused&&v.readyState>1&&!v.__wbPlay){v.__wbPlay=true;var p=v.play();if(p&&p.catch){p.catch(function(){}).then(function(){v.__wbPlay=false;});}else{v.__wbPlay=false;}}},400);})();
</script>`;

// Full <head> additions for a language = meta + fonts + styles.
const headFor = (lang) => headMetaFor(lang) + '\n' + FONT_STYLE;

// ---- 2) <head>: defaults + SEO + fonts + i18n styles ----
sub('<html><head>', '<html lang="en" dir="ltr"><head>', 1);
const headAdditions = headFor('en');
sub('<meta name="viewport" content="width=device-width, initial-scale=1">', headAdditions, 1);

// ---- 3) Nav links + CTA (desktop + mobile sheet share the same keys) ----
sub('>Services</a>', '>{{ navServices }}</a>', 2);
sub('>Work</a>', '>{{ navWork }}</a>', 2);
sub('>Process</a>', '>{{ navProcess }}</a>', 2);
sub('>Pricing</a>', '>{{ navPricing }}</a>', 2);
sub('>FAQ</a>', '>{{ navFaq }}</a>', 2);
sub('>Start a project</a>', '>{{ navStart }}</a>', 2);

// Simplify nav: Services · Work · Models (drop Process/Pricing/FAQ from nav).
// The desktop nav and the mobile sheet need different link styling — the mobile
// one keeps the sheet's padding/divider and closes the menu on tap.
template = template.replace(
  /<a href="#process"[^>]*>\{\{ navProcess \}\}<\/a>\s*<a href="#pricing"[^>]*>\{\{ navPricing \}\}<\/a>\s*<a href="#faq"[^>]*>\{\{ navFaq \}\}<\/a>/g,
  (m) => m.indexOf('closeMenu') > -1
    ? '<a href="#models" onclick="{{ closeMenu }}" style="padding:13px 8px;font-size:17px;font-weight:600;border-bottom:1px solid #ECEAE3">{{ navModels }}</a>'
    : '<a href="#models" style-hover="color:#3B4FFF" style="transition:color .2s">{{ navModels }}</a>'
);

// language switcher — desktop (before the desktop CTA button)
const desktopCtaAnchor = '<a href="{{ waLink }}" target="_blank" rel="noopener" style-hover="background:#2638f0;transform:translateY(-1px);box-shadow:0 10px 24px -8px rgba(59,79,255,.6)"';
const desktopSwitcher = `<div role="group" aria-label="Language" style="display:flex;align-items:center;background:#fff;border:1px solid #ECEAE3;border-radius:999px;padding:3px;gap:2px">
        <button onclick="{{ setEn }}" aria-pressed="{{ enPressed }}" aria-label="English" style="border:0;cursor:pointer;font-family:'Inter';font-weight:700;font-size:12.5px;letter-spacing:.02em;padding:7px 10px;border-radius:999px;transition:all .2s ease;{{ enBtn }}">EN</button>
        <button onclick="{{ setAr }}" aria-pressed="{{ arPressed }}" aria-label="العربية" style="border:0;cursor:pointer;font-family:'Inter';font-weight:700;font-size:12.5px;letter-spacing:.02em;padding:7px 10px;border-radius:999px;transition:all .2s ease;{{ arBtn }}">AR</button>
        <button onclick="{{ setHe }}" aria-pressed="{{ hePressed }}" aria-label="עברית" style="border:0;cursor:pointer;font-family:'Inter';font-weight:700;font-size:12.5px;letter-spacing:.02em;padding:7px 10px;border-radius:999px;transition:all .2s ease;{{ heBtn }}">HE</button>
      </div>
      `;
sub(desktopCtaAnchor, desktopSwitcher + desktopCtaAnchor, 1);

// burger: expose open/close state to assistive tech
sub('<button data-burger="" onclick="{{ toggleMenu }}" aria-label="Open menu"',
    '<button data-burger="" onclick="{{ toggleMenu }}" aria-label="Open menu" aria-expanded="{{ menuOpen }}" aria-controls="wb-mobile-menu"', 1);

// mobile sheet — add flip class, dialog semantics
sub('<div style="position:fixed;top:0;right:0;bottom:0;z-index:80;width:min(82vw,320px);',
    '<div class="wb-mobile-sheet" id="wb-mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" style="position:fixed;top:0;right:0;bottom:0;z-index:80;width:min(82vw,320px);', 1);

// mobile top bar: globe icon next to the burger opens a small language menu
// (English / العربية / עברית), so the language can be switched without opening
// the burger menu. Active language is highlighted; taps outside close it.
const langOption = (click, pressed, state, label) =>
  `<button onclick="{{ ${click} }}" role="option" aria-selected="{{ ${pressed} }}" style="border:0;cursor:pointer;text-align:start;font-family:'Inter';font-weight:600;font-size:14.5px;padding:10px 12px;border-radius:10px;transition:background .15s ease;{{ ${state} }}">${label}</button>`;
sub('<button data-burger="" onclick="{{ toggleMenu }}" aria-label="Open menu" aria-expanded="{{ menuOpen }}" aria-controls="wb-mobile-menu"',
    `<div data-mobile-ui="" style="display:none;align-items:center;gap:10px">
      <div style="position:relative">
        <button onclick="{{ toggleLangMenu }}" aria-haspopup="listbox" aria-expanded="{{ langMenuOpen }}" aria-label="Language" style="display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:11px;border:1px solid #ECEAE3;background:#fff;cursor:pointer;color:#14151A">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18z"></path></svg>
        </button>
        <sc-if value="{{ langMenuOpen }}" hint-placeholder-val="{{ false }}">
          <div role="listbox" aria-label="Language" style="position:absolute;top:calc(100% + 8px);inset-inline-end:0;z-index:90;min-width:150px;display:flex;flex-direction:column;gap:2px;background:#fff;border:1px solid #ECEAE3;border-radius:14px;box-shadow:0 18px 48px -18px rgba(20,21,26,.25);padding:6px">
            ${langOption('setEn', 'enPressed', 'enRow', 'English')}
            ${langOption('setAr', 'arPressed', 'arRow', 'العربية')}
            ${langOption('setHe', 'hePressed', 'heRow', 'עברית')}
          </div>
        </sc-if>
      </div>
      <button data-burger="" onclick="{{ toggleMenu }}" aria-label="Open menu" aria-expanded="{{ menuOpen }}" aria-controls="wb-mobile-menu"`, 1);
sub('</button>\n  </nav>', '</button>\n    </div>\n  </nav>', 1);

// ---- 4) Hero — full-bleed video hero (ported from the webot-motion concept) ----
// Replaces the old blob + app-window-mock hero entirely. The copy lives in
// T.hero (studio/l1/l2/start/work/qa..qc) so all three languages render it.
const HERO_VIDEO_SRC = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_215831_c6a8989c-d716-4d8d-8745-e972a2eec711.mp4';
const VIDEO_HERO = `<!-- ===== HERO ===== -->
  <header id="top" class="wb-vhero">
    <div class="wb-vhero-media" aria-hidden="true">
      <video src="${HERO_VIDEO_SRC}" autoplay muted playsinline loop preload="auto"></video>
      <div class="wb-vhero-veil"></div>
    </div>
    <div class="wb-vhero-copy">
      <div data-reveal="" data-delay="0" class="wb-vhero-kicker"><span class="wb-vhero-dot"></span>{{ heroStudio }}</div>
      <h1 data-reveal="" data-delay="80" class="wb-vhero-h1">{{ heroL1 }}<br>{{ heroL2 }}</h1>
      <div data-reveal="" data-delay="160" class="wb-vhero-cta">
        <a href="{{ waLink }}" target="_blank" rel="noopener" class="wb-vhero-btn wb-vhero-btn-dark">{{ heroStart }}</a>
        <a href="#work" class="wb-vhero-btn wb-vhero-btn-ghost">{{ heroWork }}</a>
      </div>
      <p data-reveal="" data-delay="240" class="wb-vhero-quote"><span class="wb-vhero-qbar"></span><span>{{ heroQA }}<span class="wb-vhero-qaccent">{{ heroQB }}</span>{{ heroQC }}</span></p>
    </div>
  </header>`;
replaceRange('<!-- ===== HERO ===== -->', '</header>', VIDEO_HERO);

// ---- 5) Intent cards — removed: they repeated the hero's two CTAs right below it ----
replaceRange('<!-- ===== INTENT CARDS ===== -->', '</section>', '');

// ---- 6) Marquee + section headers ----
sub('Built with tools you can trust', '{{ marqueeLabel }}', 1);
// chips are longer phrases now — slow the loop so it stays readable
sub('animation:wb-marquee 26s linear infinite', 'animation:wb-marquee 46s linear infinite', 1);
sub('>What we do</div>', '>{{ servicesKicker }}</div>', 1);
sub('Everything to get your product live — and keep it growing.', '{{ servicesH2 }}', 1);
sub('>Our craft</div>', '>{{ galleryKicker }}</div>', 1);
sub('Sites &amp; apps we love building.', '{{ galleryH2 }}', 1);
sub('A glimpse of the range — from bold storefronts to calm, clean dashboards.', '{{ gallerySub }}', 1);
sub('>How we work</div>', '>{{ processKicker }}</div>', 1);
sub('Four steps, zero guesswork.', '{{ processH2 }}', 1);
sub('>Selected work</div>', '>{{ workKicker }}</div>', 1);
sub('Products people actually use.', '{{ workH2 }}', 1);
sub('A few recent builds — across healthcare, skincare and retail.', '{{ workSub }}', 1);
sub('>AI, used well</div>', '>{{ aiKicker }}</div>', 1);
sub('Intelligence where it counts.', '{{ aiH2 }}', 1);
sub(`We add AI only where it saves your users real time — never as a gimmick. Here's where it tends to pay off.`, '{{ aiSub }}', 1);

// ---- 7) Models (pricing section) ----
sub('id="pricing"', 'id="models"', 1);
sub('>Pricing</div>', '>{{ pricingKicker }}</div>', 1);
sub('Simple packages. Pick how you pay.', '{{ pricingH2 }}', 1);
sub('One-off build or an ongoing monthly partnership — same team either way.', '{{ pricingSub }}', 1);
// Pricing is shown privately (quote on request), so the one-off/monthly pay-toggle is removed.
replaceRange('<!-- toggle -->',
  '<div style="margin-top:38px;display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:20px;align-items:stretch">',
  '<div style="margin-top:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:20px;align-items:stretch">');
sub('>Most popular</span>', '>{{ popularLabel }}</span>', 1);

// Tier cards: phase label, hide price row, keep per-tier CTA
sub('<div style="font-family:\'Sora\',sans-serif;font-weight:600;font-size:19px;color:#14151A">{{ tier.name }}</div>',
  '<div style="font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6b7077">{{ tier.phase }}</div>\n              <div style="font-family:\'Sora\',sans-serif;font-weight:600;font-size:19px;color:#14151A">{{ tier.name }}</div>', 1);
sub(`<div style="margin-top:20px;display:flex;align-items:baseline;gap:7px">
                <span style="font-family:'Sora',sans-serif;font-weight:800;font-size:40px;letter-spacing:-.02em;color:#14151A">{{ tier.price }}</span>
                <span style="font-size:14px;color:#9a9ea6">{{ tier.period }}</span>
              </div>
              `, '', 1);

// Replace the assist block with a single clean CTA
replaceRange('<!-- assist block -->',
  'Prices in USD, excluding taxes. Final quote confirmed in writing before any work begins.</p>',
  `<!-- single pricing CTA -->
      <div data-reveal="" style="margin-top:36px;text-align:center">
        <p style="font-size:16px;line-height:1.6;color:#6b7077;max-width:460px;margin:0 auto">{{ assistDesc }}</p>
        <a href="#contact" style-hover="background:#2638f0;transform:translateY(-2px);box-shadow:0 16px 34px -12px rgba(59,79,255,.65)" style="display:inline-flex;align-items:center;gap:9px;background:#3B4FFF;color:#fff;font-weight:600;font-size:16px;padding:15px 30px;border-radius:999px;margin-top:20px;transition:all .25s ease;box-shadow:0 10px 26px -12px rgba(59,79,255,.55)">{{ assistCta }}</a>
        <p style="margin-top:16px;font-size:12.5px;color:#6b7077">{{ disclaimer }}</p>
      </div>`);

// portfolio diagonal arrow — flip in RTL
sub('<span style="color:#3B4FFF;font-size:15px;font-weight:600">↗</span>',
    '<span class="wb-arrow" style="color:#3B4FFF;font-size:15px;font-weight:600">↗</span>', 1);

// ---- 8) Testimonials + FAQ + final CTA + footer ----
sub('>What clients say</div>', '>{{ testiLabel }}</div>', 1);
// per-quote star rating (was a hardcoded 5-star row on every card)
sub('<div style="color:#FF6B57;font-size:15px;letter-spacing:2px">★★★★★</div>',
    '<div style="color:#FF6B57;font-size:15px;letter-spacing:2px">{{ q.stars }}</div>', 1);
sub('>FAQ</div>', '>{{ faqKicker }}</div>', 1);
// closing line under the FAQ list — catches fence-sitters and points them at the form
sub(`{{ item.a }}</p>
            </div>
          </div>
        </sc-for>`,
    `{{ item.a }}</p>
            </div>
          </div>
        </sc-for>
        <p data-reveal="" style="margin-top:26px;text-align:center;font-size:15px;color:#6b7077">{{ faqStill }} <a href="#contact" style="color:#3B4FFF;font-weight:600">{{ faqStillCta }}</a></p>`, 1);
sub('Good questions, straight answers.', '{{ faqH2 }}', 1);
sub(`Let's build the thing.`, '{{ ctaH2 }}', 1);
sub(`Send us a message with your idea. You'll get a clear plan, a fixed price and a first preview in under two weeks.`, '{{ ctaSub }}', 1);
sub('transition:all .25s ease">Start a project<span style="font-size:18px">→</span>',
    'transition:all .25s ease">{{ ctaStart }}<span class="wb-arrow" style="font-size:18px">→</span>', 1);
sub('>Email us</a>', '>{{ ctaEmail }}</a>', 1);
sub('The web &amp; mobile studio for businesses that want it built right — and built to grow.', '{{ footerBrand }}', 1);
sub('© 2026 Webot. All rights reserved.', '{{ copyright }}', 1);
sub('Designed &amp; built by Webot · Remote, worldwide', '{{ footerMade }}', 1);

// Services + process intro copy
sub(`<h2 style="margin-top:14px;font-family:'Sora',sans-serif;font-weight:700;font-size:clamp(28px,4.2vw,46px);line-height:1.08;letter-spacing:-.02em">{{ servicesH2 }}</h2>
      </div>`,
  `<h2 style="margin-top:14px;font-family:'Sora',sans-serif;font-weight:700;font-size:clamp(28px,4.2vw,46px);line-height:1.08;letter-spacing:-.02em">{{ servicesH2 }}</h2>
        <p style="margin-top:14px;font-size:16px;line-height:1.6;color:#6B6F76;max-width:560px">{{ servicesSub }}</p>
      </div>`, 1);
sub(`<h2 style="margin-top:14px;font-family:'Sora',sans-serif;font-weight:700;font-size:clamp(28px,4.2vw,46px);line-height:1.08;letter-spacing:-.02em">{{ processH2 }}</h2>
      </div>`,
  `<h2 style="margin-top:14px;font-family:'Sora',sans-serif;font-weight:700;font-size:clamp(28px,4.2vw,46px);line-height:1.08;letter-spacing:-.02em">{{ processH2 }}</h2>
        <p style="margin-top:14px;font-size:16px;line-height:1.6;color:#6B6F76;max-width:560px">{{ processSub }}</p>
      </div>`, 1);
// footer legal links → /privacy and /terms (served as static pages)
sub('<span>{{ footerMade }}</span>',
    '<span style="display:flex;flex-wrap:wrap;gap:16px"><a href="/privacy" style-hover="color:#3B4FFF" style="transition:color .2s">{{ footerPrivacy }}</a><a href="/terms" style-hover="color:#3B4FFF" style="transition:color .2s">{{ footerTerms }}</a></span><span>{{ footerMade }}</span>', 1);

// ---- 8b) RTL fill fix for horizontal strips (gallery + the two marquees) ----
// Force the strip containers to lay out LTR so they fill the viewport like English.
sub('margin-top:46px;display:flex;flex-direction:column;gap:18px"',
    'margin-top:46px;display:flex;flex-direction:column;gap:18px;direction:ltr"', 1);          // gallery rows
sub('#000 12%,#000 88%,transparent)">', '#000 12%,#000 88%,transparent);direction:ltr">', 1); // tech marquee wrapper
sub('#000 8%,#000 92%,transparent)">', '#000 8%,#000 92%,transparent);direction:ltr">', 1);   // testimonial wrapper
// testimonial strip carries translated text → re-assert RTL on its content via class
sub('<div style="display:flex;width:max-content;gap:20px;padding:0 10px;animation:wb-marquee-rev 44s linear infinite">',
    '<div class="wb-rtl-text" style="display:flex;width:max-content;gap:20px;padding:0 10px;animation:wb-marquee-rev 44s linear infinite">', 1);

// ---- 8b2) Footer contact: one Instagram icon in the "Get in touch" column ----
// The socials row under the brand blurb is removed (was a duplicate), and the
// "Get in touch" column is hard-coded: Start a project + the Instagram logo
// linking to the profile. No username text, no "Book a call".
replaceRange('<div style="margin-top:18px;display:flex;gap:10px">', `</sc-for>
          </div>`, '');
const IG_ICON_SVG = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"></rect><circle cx="12" cy="12" r="4.5"></circle><circle cx="17.4" cy="6.6" r="1.3" fill="currentColor" stroke="none"></circle></svg>';
sub(`</sc-for>
      </div>
      <div style="margin-top:44px`,
    `</sc-for>
        <div>
          <div style="font-size:13px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#14151A">{{ footTouchTitle }}</div>
          <div style="margin-top:15px;display:flex;flex-direction:column;gap:12px;align-items:flex-start">
            <a href="#contact" style-hover="color:#3B4FFF" style="font-size:14.5px;color:#6B6F76;transition:color .2s">{{ navStart }}</a>
            <a href="https://instagram.com/webot2026" target="_blank" rel="noopener" aria-label="Instagram" style-hover="border-color:#3B4FFF;color:#3B4FFF;transform:translateY(-2px)" style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:11px;border:1px solid #ECEAE3;background:#fff;color:#6B6F76;transition:all .2s ease">${IG_ICON_SVG}</a>
          </div>
        </div>
      </div>
      <div style="margin-top:44px`, 1);

// ---- 8b3) Move the FAQ up to replace the Web/Mobile/AI showcase trio, which
// repeated the services cards almost word for word ----
const faqSecStart = template.indexOf('<section id="faq"');
const faqSecEnd = template.indexOf('</section>', faqSecStart) + '</section>'.length;
const faqSecHtml = template.slice(faqSecStart, faqSecEnd);
template = template.slice(0, faqSecStart) + template.slice(faqSecEnd);
const shStart = template.indexOf('<!-- ===== SHOWCASES ===== -->');
const shEnd = template.indexOf('</section>', shStart) + '</section>'.length;
template = template.slice(0, shStart) + faqSecHtml + template.slice(shEnd);

// ---- 8c) Accessibility: lift muted text to meet WCAG AA contrast on the cream bg ----
template = template.split('#9a9ea6').join('#6b7077');   // captions/disclaimer/footer meta: 2.6:1 -> 4.8:1
template = template.split('#bdbfc5').join('#8e9399');   // tech marquee labels (large): -> ~3.3:1 (AA large)

// ---- 8d) Replace the WhatsApp flow with an on-page lead-capture form ----
// Every "Start a project"/CTA button now scrolls to the #contact form instead of WhatsApp.
const waAnchor = 'href="{{ waLink }}" target="_blank" rel="noopener"';
const waCount = template.split(waAnchor).length - 1;
template = template.split(waAnchor).join('href="#contact"');

const inputStyle = "width:100%;font-family:'Inter';font-size:15px;color:#14151A;background:#FBFAF6;border:1px solid #ECEAE3;border-radius:12px;padding:13px 14px;transition:border-color .2s ease,box-shadow .2s ease";
const labelStyle = "display:block;font-size:13.5px;font-weight:600;color:#3a3d44;margin-bottom:7px";
const formSection = `<!-- ===== CONTACT / LEAD FORM ===== -->
  <section id="contact" style="padding:clamp(48px,7vh,96px) clamp(18px,5vw,56px) clamp(40px,6vh,72px)">
    <div data-reveal="" style="position:relative;max-width:1100px;margin:0 auto;border-radius:28px;overflow:hidden;background:linear-gradient(120deg,#14151A 0%,#1b1d27 55%,#241d33 100%);padding:clamp(30px,5vw,60px)">
      <div style="position:absolute;top:-32%;right:-6%;width:380px;height:380px;border-radius:50%;background:radial-gradient(closest-side,rgba(59,79,255,.45),transparent);filter:blur(12px);pointer-events:none"></div>
      <div style="position:absolute;bottom:-36%;left:-6%;width:320px;height:320px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,107,87,.32),transparent);filter:blur(12px);pointer-events:none"></div>
      <div style="position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:clamp(28px,4vw,52px);align-items:center">
        <div>
          <div style="font-size:13.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#9aa0ff">{{ formKicker }}</div>
          <h2 style="margin-top:14px;font-family:'Sora',sans-serif;font-weight:800;font-size:clamp(30px,4.6vw,50px);line-height:1.05;letter-spacing:-.02em;color:#fff">{{ formH2a }}<span style="background:linear-gradient(100deg,#7c8cff,#FF6B57);-webkit-background-clip:text;background-clip:text;color:transparent">{{ formH2hi }}</span>{{ formH2c }}</h2>
          <p style="margin-top:16px;font-size:16px;line-height:1.6;color:#b9bcc4;max-width:420px">{{ formSub }}</p>
          <div style="margin-top:22px;display:flex;flex-direction:column;gap:12px">
            <sc-for list="{{ formPoints }}" as="p" hint-placeholder-count="3">
              <div style="display:flex;align-items:center;gap:11px;font-size:14.5px;color:#e7e8ee">
                <span style="flex:none;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:7px;background:rgba(124,140,255,.18);color:#9aa0ff;font-size:12px;font-weight:700">✓</span>
                <span>{{ p }}</span>
              </div>
            </sc-for>
          </div>
        </div>
        <div style="background:#fff;border-radius:20px;padding:clamp(22px,3vw,32px);box-shadow:0 30px 70px -30px rgba(0,0,0,.55)">
          <sc-if value="{{ showForm }}" hint-placeholder-val="{{ true }}">
            <form id="wb-lead-form" action="{{ formAction }}" method="POST" novalidate>
              <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
              <div class="wb-form-head">
                <div class="wb-form-head-title">{{ formHeadTitle }}</div>
                <div class="wb-form-secure"><span aria-hidden="true">🔒</span><span>{{ formSecureBadge }}</span></div>
              </div>
              <p style="font-size:12px;color:#6b7077;margin:-6px 0 14px">{{ formRequiredNote }}</p>
              <div style="display:flex;flex-direction:column;gap:14px">
                <div>
                  <label for="wb-name" style="${labelStyle}">{{ formNameLabel }}<span class="wb-req" aria-hidden="true">*</span></label>
                  <input id="wb-name" class="wb-input" type="text" name="name" required="required" minlength="2" maxlength="120" autocomplete="name" autocapitalize="words" spellcheck="false" placeholder="{{ formNamePh }}" aria-required="true" style="${inputStyle}">
                </div>
                <div>
                  <label for="wb-phone" style="${labelStyle}">{{ formPhoneLabel }}<span class="wb-req" aria-hidden="true">*</span></label>
                  <input id="wb-phone" class="wb-input" type="tel" name="phone" required="required" minlength="7" maxlength="20" inputmode="tel" autocomplete="tel" spellcheck="false" placeholder="{{ formPhonePh }}" aria-required="true" style="${inputStyle}">
                </div>
                <div>
                  <label for="wb-email" style="${labelStyle}">{{ formEmailLabel }}<span class="wb-req" aria-hidden="true">*</span></label>
                  <input id="wb-email" class="wb-input" type="email" name="email" required="required" maxlength="160" autocomplete="email" inputmode="email" spellcheck="false" pattern="[^@\\s]+@[^@\\s]+\\.[a-zA-Z]{2,}" title="{{ formEmailTitle }}" placeholder="{{ formEmailPh }}" aria-required="true" style="${inputStyle}">
                </div>
                <div class="wb-form-trust" role="note">
                  <span class="wb-form-trust-icon" aria-hidden="true">🛡️</span>
                  <span>{{ formSecureNote }}</span>
                </div>
                <sc-if value="{{ formError }}" hint-placeholder-val="{{ false }}">
                  <div role="alert" style="font-size:13.5px;line-height:1.45;color:#b3261e;background:#fdecea;border:1px solid #f5c6c0;border-radius:10px;padding:10px 12px">{{ formErrorMsg }}</div>
                </sc-if>
                <button type="submit" style-hover="background:#2638f0;transform:translateY(-2px);box-shadow:0 18px 38px -14px rgba(59,79,255,.6)" style="margin-top:4px;width:100%;display:inline-flex;align-items:center;justify-content:center;gap:9px;background:#3B4FFF;color:#fff;font-family:'Inter';font-weight:600;font-size:16px;padding:15px 22px;border:0;border-radius:12px;cursor:pointer;transition:all .25s ease;box-shadow:0 12px 28px -14px rgba(59,79,255,.55);{{ formBtnExtra }}">{{ formCta }}</button>
                <p style="font-size:12px;line-height:1.5;color:#6b7077;text-align:center;margin-top:2px">{{ formPrivacy }}</p>
              </div>
            </form>
          </sc-if>
          <sc-if value="{{ formSuccess }}" hint-placeholder-val="{{ false }}">
            <div style="text-align:center;padding:22px 6px">
              <div style="margin:0 auto;display:flex;align-items:center;justify-content:center;width:62px;height:62px;border-radius:50%;background:#D9F3EA;color:#0f6b4f;font-size:30px">✓</div>
              <h3 style="margin-top:16px;font-family:'Sora',sans-serif;font-weight:700;font-size:22px;color:#14151A">{{ formSuccessTitle }}</h3>
              <p style="margin-top:9px;font-size:15px;line-height:1.55;color:#6B6F76">{{ formSuccessMsg }}</p>
            </div>
          </sc-if>
        </div>
      </div>
    </div>
  </section>`;
replaceRange('<!-- ===== FINAL CTA ===== -->', '</section>', formSection);

// ---- 9) Replace the component logic (text/x-dc script) ----
const newScript = fs.readFileSync(path.join(DIR, 'src', 'xdc.html'), 'utf8').trim();
replaceRange('<script type="text/x-dc"', '</script>', newScript);

// ---- 10) Emit per-language pages (/, /ar, /he) + sitemap.xml + robots.txt ----
const extOf = { 'image/png': 'png', 'text/javascript': 'js', 'font/woff2': 'woff2' };
fs.mkdirSync(path.join(DIR, 'preview', 'assets'), { recursive: true });

// Unpack assets once; reference them with absolute /assets/ so sub-path pages (/ar) resolve them.
const assetMap = {};
for (const [uuid, e] of Object.entries(manifest)) {
  let buf = Buffer.from(e.data, 'base64');
  if (e.compressed) buf = zlib.gunzipSync(buf);
  const fname = 'assets/' + uuid + '.' + (extOf[e.mime] || 'bin');
  fs.writeFileSync(path.join(DIR, 'preview', fname), buf);
  assetMap[uuid] = '/' + fname;
}
const mapAssets = (html) => { let out = html; for (const [u, p] of Object.entries(assetMap)) out = out.split(u).join(p); return out; };

// Per-language <noscript>: clean translated content for non-JS crawlers; hides the
// un-hydrated {{ }} template so they never see raw placeholders.
function noscriptFor(lang) {
  const L = LANGS[lang];
  return `<noscript>
<style>x-dc{display:none !important}</style>
<div style="max-width:760px;margin:9vh auto;padding:0 24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#14151A;direction:${L.dir};text-align:start">
<h1 style="font-size:30px;line-height:1.2;letter-spacing:-.5px">${L.nsH1}</h1>
<p style="font-size:17px;line-height:1.6;color:#4a4e55;margin-top:12px">${L.nsSub}</p>
<p style="margin-top:16px"><a href="https://ig.me/m/webot2026" target="_blank" rel="noopener" style="color:#3B4FFF;font-weight:600">Instagram · @webot2026</a></p>
</div>
</noscript>`;
}

function pageFor(lang) {
  let html = template;
  if (lang !== 'en') {
    html = html.split(headAdditions).join(headFor(lang));
    html = html.replace('<html lang="en" dir="ltr">', `<html lang="${LANGS[lang].htmlLang}" dir="${LANGS[lang].dir}">`);
    // boot the app in this URL's language (overrides the localStorage default)
    html = html.replace('</head>', `<script>window.__WB_LANG=${JSON.stringify(lang)}</script></head>`);
  }
  html = html.replace('<body>', '<body>\n' + noscriptFor(lang));
  return mapAssets(html);
}

fs.writeFileSync(path.join(DIR, 'preview', 'index.html'), pageFor('en'));
for (const lang of ['ar', 'he']) {
  fs.mkdirSync(path.join(DIR, 'preview', lang), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'preview', lang, 'index.html'), pageFor(lang));
}

// sitemap.xml (with hreflang alternates) + robots.txt
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANG_KEYS.map((k) => {
  const alts = LANG_KEYS.map((a) => `    <xhtml:link rel="alternate" hreflang="${LANGS[a].htmlLang}" href="${SITE_URL}${LANGS[a].urlPath}"/>`).join('\n') +
    `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}"/>`;
  return `  <url>\n    <loc>${SITE_URL}${LANGS[k].urlPath}</loc>\n${alts}\n  </url>`;
}).join('\n')}
  <url>
    <loc>${SITE_URL}neuralkinetics.html</loc>
  </url>
</urlset>
`;
fs.writeFileSync(path.join(DIR, 'preview', 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(DIR, 'preview', 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
fs.writeFileSync(path.join(DIR, 'preview', 'favicon.svg'), faviconSvg);

// ---- Legal pages: /privacy and /terms (clean standalone, branded) ----
function legalPage(title, updated, sections) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Webot</title>
<meta name="description" content="${esc(title)} for Webot — web, mobile and AI product studio.">
<meta name="robots" content="index,follow">
<link rel="icon" href="${FAVICON}">
<link rel="canonical" href="${SITE_URL}${title.toLowerCase().split(' ')[0]}">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#FBFAF6;color:#14151A;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased}
  a{color:#3B4FFF;text-decoration:none}
  a:hover{text-decoration:underline}
  .wrap{max-width:760px;margin:0 auto;padding:30px 22px 80px}
  header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:24px;margin-bottom:26px;border-bottom:1px solid #ECEAE3}
  .brand{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:20px;color:#14151A}
  .brand .logo{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;background:#14151A;color:#fff;font-weight:800;font-size:17px}
  h1{font-size:clamp(26px,5vw,34px);letter-spacing:-.5px;margin-bottom:6px}
  .updated{color:#6b7077;font-size:14px;margin-bottom:26px}
  h2{font-size:19px;margin:26px 0 8px}
  p,li{color:#3a3d44;font-size:15.5px}
  ul{margin:8px 0 8px 22px}
  li{margin:5px 0}
  .foot{margin-top:40px;padding-top:20px;border-top:1px solid #ECEAE3;color:#6b7077;font-size:13.5px}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="/"><span class="logo">W</span> Webot</a>
    <a href="/">← Back to site</a>
  </header>
  <h1>${esc(title)}</h1>
  <p class="updated">Last updated: ${updated}</p>
  ${sections}
  <div class="foot">Questions? message us on <a href="https://ig.me/m/webot2026" target="_blank" rel="noopener">Instagram @webot2026</a>.</div>
</div>
</body>
</html>`;
}

const PRIVACY = legalPage('Privacy Policy', 'June 2026', `
  <p>Webot ("we", "us") designs and builds websites, mobile apps and AI features. We respect your privacy. This policy explains what we collect through this website and how we use it.</p>
  <h2>What we collect</h2>
  <p>When you submit the contact form, we collect the details you provide: your <strong>name, phone number, email address and the country</strong> you select. To keep the form secure and prevent spam, we also record basic technical data with each submission — your IP address, browser user-agent, the page URL and a timestamp.</p>
  <h2>How we use it</h2>
  <p>We use your details only to respond to your enquiry and discuss your project. We do <strong>not</strong> sell or rent your data, and we do <strong>not</strong> share it with advertisers or marketers.</p>
  <h2>Where it is stored</h2>
  <p>Submissions are stored in our own database, and may be emailed to our team so we can reply. We keep them only as long as needed to handle your enquiry or our working relationship.</p>
  <h2>Cookies & local storage</h2>
  <p>We do not use advertising or tracking cookies. The site saves your language preference in your browser's local storage so it is remembered on your next visit.</p>
  <h2>Third-party services</h2>
  <p>The site loads web fonts from Google Fonts and JavaScript libraries from a public CDN (unpkg). These providers may receive your IP address as part of delivering those files. Our hosting and database provider processes the data you submit on our behalf.</p>
  <h2>Your rights</h2>
  <p>You can ask us to access, correct or delete the personal data you have given us at any time — just message us on <a href="https://ig.me/m/webot2026" target="_blank" rel="noopener">Instagram @webot2026</a>.</p>
  <h2>Changes</h2>
  <p>We may update this policy from time to time; the "last updated" date above reflects the current version.</p>
`);

const TERMS = legalPage('Terms of Service', 'June 2026', `
  <p>These terms govern your use of the Webot website. By using the site, you agree to them.</p>
  <h2>Our services</h2>
  <p>This website provides information about Webot's design and development services. Any project we take on is governed by a separate written proposal or agreement — submitting the contact form is a request to get in touch, not a binding contract.</p>
  <h2>Pricing</h2>
  <p>Any prices shown on the site are indicative starting points. Your final quote is confirmed in writing before any work begins.</p>
  <h2>Acceptable use</h2>
  <p>Please don't misuse the site — for example by attempting to disrupt it, access it in unauthorised ways, or submit abusive or fraudulent information through the form.</p>
  <h2>Intellectual property</h2>
  <p>The Webot name, brand, design and content on this site belong to Webot unless stated otherwise. Code we deliver to clients is owned by the client as set out in the relevant project agreement.</p>
  <h2>No warranty & liability</h2>
  <p>The site is provided "as is", without warranties of any kind. To the extent permitted by law, Webot is not liable for any loss arising from your use of the site.</p>
  <h2>Contact</h2>
  <p>Questions about these terms? message us on <a href="https://ig.me/m/webot2026" target="_blank" rel="noopener">Instagram @webot2026</a>.</p>
`);

for (const [slug, htmlOut] of [['privacy', PRIVACY], ['terms', TERMS]]) {
  fs.mkdirSync(path.join(DIR, 'preview', slug), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'preview', slug, 'index.html'), htmlOut);
}

// ---- 11) Re-bundle the single self-contained file ----
// The template is embedded inside a <script type="__bundler/template"> tag, so any
// literal "</script>" (or any "</…>") in the HTML would close that tag early. Match
// the original exporter: escape every "</" as "</" in the JSON string; JSON.parse
// turns / back into "/" at load time, reconstructing valid HTML.
const outLines = origLines.slice();
outLines[TEMPLATE_LINE] = JSON.stringify(template).split('</').join('<\\u002F');
let outHtml = outLines.join('\n');

// ---- 12) Make the STATIC wrapper crawlable/shareable ----
// Non-JS crawlers and link scrapers (WhatsApp/LinkedIn/Slack/Facebook) never run the
// unpacker, so they only see this outer <head>. The original exported it as
// "<title>Bundled Page</title>" with no meta. Replace it with the full SEO head so
// shared links show a real title, description and preview card.
const staticHead = headMetaFor('en');
if (!outHtml.includes('<title>Bundled Page</title>')) throw new Error('outer <title> not found');
outHtml = outHtml.replace('<title>Bundled Page</title>', staticHead);

// Give no-JS visitors (and text-only crawlers) a real fallback with a contact path.
const noscriptFallback = `<noscript>
    <style>#__bundler_loading{display:none}#__bundler_thumbnail{display:none}</style>
    <div style="max-width:560px;margin:14vh auto;padding:0 24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#14151A;text-align:center">
      <h1 style="font-size:28px;line-height:1.2;margin-bottom:12px">Webot — Web, mobile &amp; AI products, built right</h1>
      <p style="font-size:16px;line-height:1.6;color:#4a4e55">We design and build fast websites, mobile apps and AI features for founders and teams — in English, Arabic and Hebrew. This interactive page needs JavaScript; reach us on <a href="https://ig.me/m/webot2026" style="color:#3B4FFF">Instagram @webot2026</a>.</p>
    </div>
  </noscript>`;
outHtml = outHtml.replace(/<noscript>[\s\S]*?<\/noscript>/, noscriptFallback);

fs.writeFileSync(ORIGINAL, outHtml);

console.log('build OK');
console.log('  template chars:', template.length);
console.log('  preview/index.html written');
console.log('  Webot-Daylight.html re-bundled');

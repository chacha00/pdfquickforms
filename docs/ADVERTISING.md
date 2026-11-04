# Advertising setup

Ads are **off by default**. With no configuration there is no ad script, no consent banner and no third-party request (this is tested).

## Requirements (accounts you create)
1. A **Google AdSense** account with the site approved. Approval is not guaranteed; the site needs real content and traffic.
2. For visitors in the **EEA, UK and Switzerland**: Google requires a **Google-certified CMP**. Enable AdSense → Privacy & messaging → European regulations message. The built-in banner in this app is a simple gate that loads no ad script until the visitor allows it. It is **not** a certified CMP.
3. Check local privacy laws for your other markets (for example US state laws) and update `/cookies` and `/privacy` to match.

## Configure
```
VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
VITE_ADSENSE_SLOTS=home-below-hero:1111111111,templates-gallery:2222222222,guide-article:3333333333
```
Then rebuild. `scripts/prerender.mjs` adds Google's ad domains to the CSP in `dist/_headers` automatically. Compare that CSP with Google's current guidance, because the domains change over time.

Add `public/ads.txt` with the line AdSense gives you.

## Placement rules (enforced in code)
Allowed placements: `home-below-hero`, `home-between-sections`, `templates-gallery`, `guide-article`, `guides-index`, `landing-content`.
The editor (`/editor`) and filler (`/fill`) never render ads, and an e2e test fails if a placeholder appears there. Ads are never placed near download or delete buttons. Every ad is labeled "Advertisement".

## Measuring
Use AdSense reports for impressions, RPM and revenue. The app does not count or simulate impressions.

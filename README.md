# real pls

**quick, local image authenticity checks.**

a modern, browser-based image forensics tool that runs entirely client-side. analyze images for potential manipulation without uploading them anywhere.

🔗 **[realpls.com](https://realpls.com)**

---

## features

- **100% local processing** — images never leave your device
- **no backend** — all analysis happens in browser
- **forensic checks:**
  - file type verification
  - exif metadata extraction
  - editing software detection
  - jpeg quality estimation
  - compression artifact analysis
  - noise consistency mapping
  - edge analysis
  - clone detection
  - error level analysis (ela)
  - social media reupload detection
- **visual overlays** — noise maps, edge maps, ela heatmaps
- **exportable reports** — download as json
- **responsive** — works on desktop and mobile

---

## development

```bash
# install
npm install

# dev server
npm run dev

# build
npm run build

# preview
npm run preview
```

dev server runs at `http://localhost:4321`

---

## deployment (cloudflare pages)

| setting | value |
|---------|-------|
| build command | `npm run build` |
| output directory | `dist` |
| node version | 18+ |

no environment variables required.

---

## project structure

```
src/
├── components/      # ui components
├── layouts/         # base layout
├── lib/forensics/   # analysis engine
├── pages/           # routes
└── styles/          # css

public/
├── demo/            # sample image
├── favicon.svg      # favicon
├── og-image.svg     # open graph
└── manifest.json    # pwa manifest
```

---

## privacy

images are processed locally and never uploaded. no cookies, no tracking, no analytics.

---

## limitations

this tool provides informational signals only. it cannot definitively prove manipulation.

- no ai/ml detection
- no deepfake detection
- not forensically admissible
- false positives possible

---

## license

mit

---

built by [swasilewski.com](https://swasilewski.com)

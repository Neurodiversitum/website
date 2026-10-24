// Lighthouse CI on the main static pages, mobile emulation with simulated throttling (the
// Lighthouse default). Budget: performance at least 90, LCP within
// the "good" range (2.5 s), CLS under 0.05, TBT under 150 ms, accessibility at least 95. `npm run lhci` runs it.
module.exports = {
  ci: {
    collect: {
      // Pages are files (`about.html`, astro.config.mjs), and this static server adds no extension.
      staticDistDir: './dist/client',
      url: [
        'http://localhost/',
        'http://localhost/about.html',
        'http://localhost/projects.html',
        'http://localhost/team.html',
        'http://localhost/de.html',
      ],
      numberOfRuns: 2,
      settings: {
        chromeFlags: '--no-sandbox --headless=new',
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 1.75,
          disabled: false,
        },
        throttlingMethod: 'simulate',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
        'total-blocking-time': ['error', { maxNumericValue: 150 }],
        'total-byte-weight': ['error', { maxNumericValue: 600000 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: './.lighthouseci',
    },
  },
};

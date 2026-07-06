<script setup lang="ts">
import { withBase } from 'vitepress';

type SectionAction = {
  text: string;
  link: string;
  theme?: 'brand' | 'alt' | 'guide';
  external?: boolean;
};

type Section = {
  id: string;
  eyebrow?: string;
  title: string;
  body: string;
  bullets?: string[];
  image: string;
  imageAlt: string;
  imageFirst?: boolean;
  actions?: SectionAction[];
  variant?: 'default' | 'muted' | 'accent';
  showLogo?: boolean;
};

const logoSrc = withBase('/images/logo.png');
const tagline = "Your team's self-hosted HarborClient hub.";

const sections: Section[] = [
  {
    id: 'hero',
    body: 'Ship API work faster — one server for shared collections, curated plugins and themes, and team AI.',
    image: '/images/homepage/hero.png',
    imageAlt:
      'Developers at a harbor pier connecting laptops to a central lighthouse hub server',
    showLogo: true,
    actions: [
      { text: 'Get started', link: '/setup', theme: 'brand' },
      { text: 'Deploy with Docker', link: '/deploy', theme: 'guide' },
      { text: 'Team Hub API', link: 'https://harborclient.github.io/team-hub-api/', theme: 'alt', external: true },
      { text: 'NPM', link: 'https://www.npmjs.com/package/@harborclient/team-hub', theme: 'alt', external: true },
      { text: 'What is HarborClient?', link: 'https://harborclient.com', theme: 'alt', external: true },
    ],
  },
  {
    id: 'shared-collections',
    eyebrow: 'Shared collections',
    title: 'One API catalog for the whole team',
    body: 'Centralize requests, folders, and defaults so everyone works from the same API catalog instead of emailing exports or juggling shared database credentials.',
    bullets: [
      'Token-gated HTTP API for collection sync',
      'Scoped access per teammate without shared DB credentials',
      'Folders, defaults, and requests stay in sync from one hub',
    ],
    image: '/images/homepage/shared-collections.png',
    imageAlt:
      'Two teammates reviewing a shared nautical chart table with synchronized API collection panels',
  },
  {
    id: 'curated-plugins-themes',
    eyebrow: 'Curated plugins & themes',
    title: 'Publish approved extensions once',
    body: 'Publish approved marketplace and trusted plugin sources once in server.yaml. Every connected HarborClient sees them in Settings → Plugins — including appearance themes.',
    bullets: [
      'Central marketplace and trusted source lists in server.yaml',
      'Signed plugin packages flow to every connected desktop client',
      'Appearance themes ship alongside functional plugins',
    ],
    image: '/images/homepage/curated-plugins-themes.png',
    imageAlt:
      'Crew on a ship deck organizing modular plugin crates and theme swatches at a central hub',
    imageFirst: true,
    variant: 'muted',
  },
  {
    id: 'team-ai',
    eyebrow: 'Team AI, your keys',
    title: 'Proxy LLMs without exposing provider keys',
    body: 'Proxy OpenAI, Claude, and Gemini from the hub with per-user model access, monthly token limits, and audit logging. Desktop clients never receive provider API keys.',
    bullets: [
      'Provider API keys stay on the hub, not on laptops',
      'Per-user model access and monthly token limits',
      'Audit logging for team AI usage',
    ],
    image: '/images/homepage/team-ai.png',
    imageAlt:
      'Team members at a harbor chart table with an AI assistant panel and lighthouse beacon overhead',
  },
  {
    id: 'self-hosted-control',
    eyebrow: 'Self-hosted control',
    title: 'Run it on your infrastructure',
    body: 'Run on your VPS, Cloud Run, or a local Docker smoke test. Manage users, tokens, and access lists from the CLI or REST admin API.',
    bullets: [
      'All-in-one Docker image with Nginx, API, Postgres, and Redis',
      'Deploy to Google Cloud Run, a VPS, or local smoke tests',
      'CLI and REST admin API for users, tokens, and access lists',
    ],
    image: '/images/homepage/self-hosted-control.png',
    imageAlt:
      'Administrator at a harbor control tower managing servers, tokens, and deployment options',
    imageFirst: true,
    variant: 'muted',
  },
  {
    id: 'get-started',
    eyebrow: 'Get started',
    title: 'Why teams choose Team Hub',
    body: 'HarborClient desktop clients are powerful on their own, but every teammate configuring the same remote database connection does not scale. Team Hub gives your company a single, token-gated HTTP API for shared collection data — plus optional plugin catalogs and LLM proxying — without handing out storage credentials or AI keys.',
    bullets: [
      'Issue each person an hbk_ bearer token with scoped collection access',
      'Deploy the all-in-one Docker image or run the CLI on your infrastructure',
      'See the HarborClient team hubs guide for desktop client setup',
    ],
    image: '/images/homepage/get-started.png',
    imageAlt: 'Team boarding a ship at harbor ready to connect HarborClient clients to the hub',
    actions: [
      { text: 'Prerequisites', link: '/prerequisites', theme: 'alt' },
      { text: 'Setup', link: '/setup', theme: 'brand' },
      { text: 'Deploy', link: '/deploy', theme: 'guide' },
    ],
    variant: 'accent',
  },
];

/**
 * Resolves a homepage image path for use with the Team Hub docs base URL.
 *
 * @param path Site-root image path.
 * @returns Base-prefixed image URL.
 */
const imageSrc = (path: string) => withBase(path);

/**
 * Resolves a WebP variant path when available alongside the PNG asset.
 *
 * @param path Site-root PNG image path.
 * @returns Base-prefixed WebP URL.
 */
const imageWebpSrc = (path: string) => withBase(path.replace(/\.png$/i, '.webp'));
</script>

<template>
  <div class="home-page">
    <section
      v-for="section in sections"
      :key="section.id"
      :id="section.id"
      class="home-section"
      :class="[
        section.variant ? `home-section--${section.variant}` : '',
        section.imageFirst ? 'home-section--image-first' : '',
      ]"
    >
      <div class="home-section__inner">
        <div class="home-section__content">
          <img
            v-if="section.showLogo"
            :src="logoSrc"
            alt="Team Hub"
            class="home-section__logo"
            width="500"
            height="500"
            decoding="async"
          />
          <p v-else-if="section.eyebrow" class="home-section__eyebrow">
            {{ section.eyebrow }}
          </p>
          <p v-if="section.showLogo" class="home-section__tagline">
            {{ tagline }}
          </p>
          <h2 class="home-section__title">{{ section.title }}</h2>
          <p class="home-section__body">{{ section.body }}</p>
          <ul v-if="section.bullets?.length" class="home-section__bullets">
            <li v-for="(bullet, index) in section.bullets" :key="index">
              {{ bullet }}
            </li>
          </ul>
          <div v-if="section.actions?.length" class="home-section__actions">
            <a
              v-for="action in section.actions"
              :key="action.link"
              :href="action.external ? action.link : withBase(action.link)"
              :target="action.external ? '_blank' : undefined"
              :rel="action.external ? 'noopener noreferrer' : undefined"
              class="home-section__action"
              :class="{
                'home-section__action--brand': action.theme !== 'alt' && action.theme !== 'guide',
                'home-section__action--alt': action.theme === 'alt',
                'home-section__action--guide': action.theme === 'guide',
              }"
            >
              {{ action.text }}
            </a>
          </div>
        </div>
        <figure class="home-section__figure">
          <picture>
            <source :srcset="imageWebpSrc(section.image)" type="image/webp" />
            <img
              :src="imageSrc(section.image)"
              :alt="section.imageAlt"
              width="640"
              height="480"
              :loading="section.id === 'hero' ? 'eager' : 'lazy'"
              decoding="async"
            />
          </picture>
        </figure>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  --home-max-width: 1180px;
  --home-section-padding-y: 72px;
  --home-section-padding-x: 24px;
}

.home-section {
  padding: var(--home-section-padding-y) var(--home-section-padding-x);
  border-top: 1px solid var(--vp-c-divider);
}

.home-section--muted {
  background: var(--vp-c-bg-soft);
}

.home-section--accent {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--vp-c-brand-1) 12%, transparent),
    transparent
  );
}

.home-section__inner {
  display: grid;
  gap: 40px;
  align-items: center;
  max-width: var(--home-max-width);
  margin: 0 auto;
}

.home-section__content {
  min-width: 0;
}

.home-section__eyebrow {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7994af;
}

.home-section__logo {
  display: block;
  width: fit-content;
  max-width: min(284px, 50vw);
  height: auto;
  margin: 0 auto 16px;
}

@media (min-width: 640px) {
  .home-section__logo {
    max-width: min(356px, 40vw);
    margin-bottom: 20px;
  }
}

.home-section__tagline {
  margin: 0 0 20px;
  font-size: clamp(18px, 2.5vw, 22px);
  line-height: 1.45;
  font-weight: 500;
  font-style: italic;
  color: #edf5fd;
  text-align: center;
}

.home-section__title {
  margin: 0 0 16px;
  font-size: clamp(28px, 4vw, 40px);
  line-height: 1.15;
  letter-spacing: -0.02em;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.home-section__body {
  margin: 0 0 20px;
  font-size: 18px;
  line-height: 1.65;
  color: var(--vp-c-text-2);
}

.home-section__bullets {
  margin: 0;
  padding-left: 1.25rem;
  color: var(--vp-c-text-2);
}

.home-section__bullets li {
  margin-bottom: 10px;
  line-height: 1.6;
}

.home-section__bullets li:last-child {
  margin-bottom: 0;
}

.home-section__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 28px;
}

.home-section__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 20px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 0.2s,
    border-color 0.2s,
    color 0.2s;
}

.home-section__action--brand,
.home-section__action--brand:hover,
.home-section__action--brand:focus-visible {
  color: #062b54;
}

.home-section__action--brand {
  min-height: 36px;
  padding: 0 16px;
  border-radius: 999px;
  border: none;
  background: var(--docs-download-cta-gradient);
}

.home-section__action--brand:hover,
.home-section__action--brand:focus-visible {
  background: var(--docs-download-cta-gradient-hover);
}

.home-section__action--alt {
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1);
  background: transparent;
}

.home-section__action--alt:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.home-section__action--guide {
  min-height: 36px;
  padding: 0 16px;
  border-radius: 999px;
  border: none;
  background: var(--vp-c-brand-3);
  color: #ffffff;
}

.home-section__action--guide:hover {
  background: var(--vp-c-brand-2);
  color: #ffffff;
}

.home-section__figure {
  margin: 0;
}

.home-section__figure img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
}

@media (min-width: 960px) {
  .home-section {
    --home-section-padding-y: 96px;
  }

  .home-section__inner {
    grid-template-columns: 1fr 1fr;
    gap: 64px;
  }

  .home-section--image-first .home-section__figure {
    order: -1;
  }
}

@media (min-width: 640px) {
  .home-page {
    --home-section-padding-x: 32px;
  }
}

#hero .home-section__title {
  font-size: clamp(32px, 5vw, 52px);
}

#hero .home-section__tagline {
  margin-bottom: 8px;
}

#hero .home-section__inner {
  padding-top: 24px;
}
</style>

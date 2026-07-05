import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import pkg from '../../package.json';
import { toAnchor } from '../../scripts/docs-slugger.mjs';
import { sidebar } from './sidebar.generated';

const siteBase = '/team-hub/';

const withSiteBase = (path: string) => {
  if (!path.startsWith('/') || path.startsWith(siteBase) || path.startsWith('//')) {
    return path;
  }

  return `${siteBase.replace(/\/$/, '')}${path}`;
};

export default withMermaid(
  defineConfig({
    title: 'Team Hub',
    description:
      'Self-hosted HarborClient hub for shared collections, curated plugins and themes, and team AI.',
    base: siteBase,
    appearance: 'force-dark',
    cleanUrls: true,
    head: [
      [
        'link',
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '32x32',
          href: withSiteBase('/images/favicon-32x32.png'),
        },
      ],
      [
        'link',
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '16x16',
          href: withSiteBase('/images/favicon-16x16.png'),
        },
      ],
      [
        'link',
        {
          rel: 'apple-touch-icon',
          sizes: '128x128',
          href: withSiteBase('/images/apple-touch-icon.png'),
        },
      ],
    ],
    vite: {
      publicDir: '.vitepress/static',
      optimizeDeps: {
        include: ['mermaid'],
      },
    },
    ignoreDeadLinks: [/^https?:\/\/localhost(?::\d+)?(?:\/|$)/],
    markdown: {
      anchor: {
        slugify: toAnchor,
      },
      config(md) {
        const defaultRender =
          md.renderer.rules.image ??
          ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

        md.renderer.rules.image = (tokens, idx, options, env, self) => {
          const renderedImage = defaultRender(tokens, idx, options, env, self);
          const token = tokens[idx];
          const src = token.attrGet('src');
          const isAlreadyLinked =
            tokens[idx - 1]?.type === 'link_open' && tokens[idx + 1]?.type === 'link_close';

          if (!src || isAlreadyLinked || src.endsWith('/images/logo.png')) {
            return renderedImage;
          }

          return `<a class="vp-doc-image-link" href="${md.utils.escapeHtml(withSiteBase(src))}" target="_blank" rel="noopener noreferrer">${renderedImage}</a>`;
        };
      },
      gfmAlerts: true,
      languageAlias: {
        env: 'dotenv',
      },
    },
    themeConfig: {
      logo: {
        src: '/images/logo.png',
        alt: 'Team Hub',
      },
      siteTitle: false,
      nav: [
        { text: 'Get started', link: '/setup' },
        { text: 'Deploy with Docker', link: '/deploy' },
        { text: 'Team Hub API', link: 'https://harborclient.github.io/team-hub-api/' },
        { text: 'NPM', link: 'https://www.npmjs.com/package/@harborclient/team-hub' },
        { text: 'What is HarborClient?', link: 'https://harborclient.com' },
        {
          text: `v${pkg.version}`,
          link: 'https://github.com/harborclient/team-hub/releases',
        },
      ],
      socialLinks: [
        {
          icon: 'github',
          link: 'https://github.com/harborclient/team-hub',
          ariaLabel: 'Team Hub on GitHub',
        },
      ],
      sidebar,
      outline: {
        level: [2, 3],
        label: 'On this page',
      },
      search: {
        provider: 'local',
      },
    },
    mermaid: {
      theme: 'dark',
    },
  }),
);

<script setup lang="ts">
import { withBase } from 'vitepress';

const logoSrc = withBase('/images/logo.png');
const SITE_TITLE = 'Team Hub';
const homeHref = withBase('/');
</script>

<template>
  <a class="docs-nav-bar-logo" :href="homeHref" :aria-label="SITE_TITLE">
    <img :src="logoSrc" :alt="SITE_TITLE" width="40" height="40" decoding="async" />
  </a>
</template>

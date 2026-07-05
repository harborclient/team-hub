<script setup lang="ts">
import { withBase } from 'vitepress';

const logoSrc = withBase('/images/logo.png');
const SITE_TITLE = 'Team Hub';
const homeHref = withBase('/');
</script>

<template>
  <a class="docs-sidebar-brand" :href="homeHref" :aria-label="SITE_TITLE">
    <img :src="logoSrc" :alt="SITE_TITLE" width="500" height="500" decoding="async" />
  </a>
</template>

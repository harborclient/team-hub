<script setup lang="ts">
import VPNavBarSearchButton from 'vitepress/dist/client/theme-default/components/VPNavBarSearchButton.vue';

/**
 * Opens the docs local search modal via the navbar search instance so keyboard
 * shortcuts and the sidebar button share one search box.
 */
const openSearch = () => {
  document.querySelector<HTMLButtonElement>('.VPNavBar .DocSearch-Button')?.click();
};
</script>

<template>
  <div class="docs-sidebar-search">
    <VPNavBarSearchButton @click="openSearch" />
  </div>
</template>

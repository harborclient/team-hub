<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import NavBarLogo from './NavBarLogo.vue';
import SidebarBrand from './SidebarBrand.vue';
import SidebarSearch from './SidebarSearch.vue';

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #nav-bar-content-before>
      <NavBarLogo />
    </template>
    <template #sidebar-nav-before>
      <SidebarSearch />
    </template>
    <template #sidebar-nav-after>
      <SidebarBrand />
    </template>
  </Layout>
</template>

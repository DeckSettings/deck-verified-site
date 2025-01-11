<template>
  <q-layout view="hHh lpR fFf">

    <q-header bordered class="bg-primary text-white">
      <q-toolbar class="header-toolbar q-px-sm q-py-md q-px-sm-lg q-py-sm-lg">
        <div class="logo-container">
          <router-link to="/">
            <img src="~/assets/logo-dark.png" alt="Logo">
          </router-link>
        </div>

        <q-space />

        <div class="flex justify-center" :class="{'full-width': $q.screen.lt.sm}">
          <HeaderSearch />
        </div>
      </q-toolbar>
    </q-header>

    <q-page-container class="bg-dark">
      <router-view />
    </q-page-container>

  </q-layout>
</template>

<script setup lang="ts">
import HeaderSearch from 'components/HeaderSearch.vue'
</script>

<style scoped>
.header-toolbar {
  background: linear-gradient(to bottom, var(--q-primary), var(--q-accent));
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.logo-container {
  flex-shrink: 0;
  width: 100%;
  text-align: center;
  margin-bottom: 10px;
  display: flex;
  justify-content: center;
}

.logo-container img {
  width: 183px;
  height: 20px;
}

@media (min-width: 600px) {
  .logo-container {
    width: auto;
    text-align: left;
    margin-bottom: 0;
  }
}
</style>

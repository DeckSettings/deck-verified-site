<script setup lang="ts">
import { useAuthStore } from 'src/stores/auth-store'
import PrimaryButton from 'components/elements/PrimaryButton.vue'
import AdmonitionBanner from 'components/elements/AdmonitionBanner.vue'

defineProps<{
  show: boolean;
}>()

const emit = defineEmits(['update:show'])

const authStore = useAuthStore()

const onLogin = () => {
  void authStore.startLogin()
  emit('update:show', false)
}
</script>

<template>


  <q-dialog :model-value="show" @update:model-value="$emit('update:show', $event)" backdrop-filter="blur(2px)">
    <q-card class="dv-dialog-card">
      <q-card-section class="dv-dialog-content">
        <q-card flat class="dv-dialog-inner-card">
          <q-card-section class="dv-dialog-header row items-center justify-between no-wrap">
            <div class="text-h6 text-center full-width">
              <q-icon name="warning" color="warning" />
              You're not logged in
              <q-icon name="warning" color="warning" />
            </div>
          </q-card-section>

          <q-separator dark />

          <q-card-section class="dv-dialog-body scroll q-pa-lg q-gutter-md">
            <div class="q-mt-md">
              <AdmonitionBanner type="note" class="q-mt-sm q-mb-md">
                To access additional functionality of the site like the action you are trying to take, you need to be
                logged in.
              </AdmonitionBanner>
            </div>
            <div class="q-mb-md">
              <PrimaryButton
                class="full-width"
                color="primary"
                label="Login"
                icon="fab fa-github"
                @click="onLogin" />
            </div>
          </q-card-section>
          <q-card-actions align="right">
            <primaryButton
              dense
              color="primary"
              label="Close"
              icon="close"
              v-close-popup />
          </q-card-actions>
        </q-card>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

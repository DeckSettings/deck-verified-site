<template>
  <div class="auth-complete-page">
    <div class="auth-card">
      <div class="spinner" aria-hidden="true"></div>
      <h1 class="title">Completing sign in…</h1>
      <p class="hint">Please wait while we finish connecting your GitHub account.</p>
      <p v-if="message" class="message">{{ message }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuthStore } from 'src/stores/auth-store'

const message = ref<string>('')

onMounted(async () => {
  // Finish the flow by asking the store to claim tokens and then redirect home.
  const auth = useAuthStore()
  try {
    await auth.completeAuthFromRedirect('/')
  } catch {
    // If something goes wrong, show a small hint and send the user home shortly after.
    message.value = 'There was a problem completing sign in. Redirecting…'
    setTimeout(() => {
      window.location.assign('/')
    }, 1500)
  }
})
</script>

<style scoped>
.auth-complete-page {
  min-height: 60vh;
  display: grid;
  place-items: center;
  padding: 2rem;
}

.auth-card {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  max-width: 520px;
  width: min(92vw, 520px);
  padding: 2rem 1.75rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(6px);
}

.title {
  margin: 0.25rem 0 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.hint, .message {
  margin: 0;
  color: #c9c9c9;
  text-align: center;
  font-size: 0.95rem;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

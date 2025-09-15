<script setup lang="ts">
import { useMeta } from 'quasar'

useMeta({
  title: 'About – Deck Verified',
  meta: {
    description: {
      name: 'description',
      content:
        'Deck Verified and the Deck Settings reports project collect handheld game settings, performance tweaks, and compatibility notes for Steam Deck, ROG Ally, Legion Go, and more.',
    },
    ogTitle: { property: 'og:title', content: 'About – Deck Verified' },
    ogDescription: {
      property: 'og:description',
      content:
        'Learn why Deck Settings exists, how game reports work, and how to contribute or browse community-tested configurations.',
    },
  },
})
</script>

<template>
  <q-page class="bg-dark text-white q-pb-xl" padding>
    <div class="q-pa-xl">

      <!-- Hero -->
      <h1 class="text-h4 q-mb-sm">About Deck Verified</h1>
      <p>
        Deck Verified is the website companion to <strong>Deck Settings</strong> — a community-driven repository of
        game settings, performance tweaks, and compatibility reports for handheld gaming devices like Steam Deck,
        ROG Ally, Lenovo Legion Go, and other portable PCs. By sharing reports, you help others optimise performance,
        troubleshoot issues, and build a central knowledge base for handheld gaming.
      </p>

      <!-- Why -->
      <h2 class="text-h6 q-mt-lg q-mb-sm">Why Deck Settings?</h2>
      <p>
        While ProtonDB focuses mainly on Proton compatibility, Deck Settings (and this site) were built to go further.
        Our goal is to create a performance-focused reporting system tailored to handheld PCs, where the quality of the
        experience matters as much as basic compatibility. Reports are structured with specific fields—target framerate,
        TDP limits, GPU clocks, graphics settings, and more—so that every submission provides practical, repeatable
        data.
        Screenshots and videos can also be attached, making it easier to reference in-game results and compare different
        configurations.
      </p>

      <h3 class="text-subtitle2 q-mt-md q-mb-xs">1) Editable, user-controlled reports</h3>
      <p>
        You can update or close your own reports without waiting for admin approval. This ensures reports remain
        accurate
        and evolve alongside your testing.
      </p>

      <h3 class="text-subtitle2 q-mt-md q-mb-xs">2) Mobile-friendly reporting and viewing</h3>
      <p>
        Submitting and browsing reports should work smoothly on mobile—and even directly on the Steam Deck.
      </p>

      <h3 class="text-subtitle2 q-mt-md q-mb-xs">3) Focus on handheld devices</h3>
      <p>
        Reports are tagged by device type (Deck, Ally, Legion Go, etc.), letting you quickly filter to results that
        match
        your own hardware setup.
      </p>

      <h3 class="text-subtitle2 q-mt-md q-mb-xs">4) Support for games without Steam App IDs</h3>
      <p>
        Unlike platforms that require Steam App IDs, Deck Settings makes them optional. You can submit performance
        reports for games from Itch.io, GOG, Epic, and even delisted Steam titles.
      </p>

      <h3 class="text-subtitle2 q-mt-md q-mb-xs">5) Community discussion and voting</h3>
      <p>
        Reports are published as GitHub issues, where the community can react with 👍 to highlight helpful configs and
        add comments with alternative settings, troubleshooting steps, or media for comparison.
      </p>

      <!-- Where reports live -->
      <h2 class="text-h6 q-mt-lg q-mb-sm">Where the reports live</h2>
      <p>
        All game reports are tracked publicly in the
        <a class="text-primary" href="https://github.com/DeckSettings/game-reports-steamos"
           target="_blank" rel="noopener">
          game-reports-steamos
        </a>
        repository using GitHub Issues. This site surfaces and organizes those reports for easier browsing.
      </p>

      <!-- Submit a report -->
      <h2 class="text-h6 q-mt-lg q-mb-sm">How to submit a game report</h2>
      <p class="q-mb-sm">
        Submitting a report is quick—use the pre-filled template:
      </p>
      <p>
        <a
          class="text-primary"
          href="https://github.com/DeckSettings/game-reports-steamos/issues/new?assignees=&labels=&projects=&template=GAME-REPORT.yml&title=%28Placeholder+-+Issue+title+will+be+automatically+populated+with+the+information+provided+below%29"
          target="_blank"
          rel="noopener"
        >
          Create a New Game Report
        </a>
      </p>
      <p class="q-mb-xs">The template guides you to include:</p>
      <ul class="q-pl-lg">
        <li><strong>Game Name</strong></li>
        <li><strong>Launcher</strong> (Steam, Heroic, Lutris, etc.)</li>
        <li><strong>Deck Compatibility</strong> (Perfect, Playable, Unplayable)</li>
        <li><strong>Target Framerate</strong> (30/40/60, etc.)</li>
        <li><strong>Device</strong> (Steam Deck, ROG Ally, Legion Go, …)</li>
        <li><strong>SteamOS Version</strong></li>
        <li><strong>Frame/TDP Limits</strong>, GPU clock, scaling</li>
        <li><strong>Launch Options</strong> or env tweaks</li>
        <li><strong>Graphics Settings</strong> (low/med/high/custom)</li>
        <li><strong>Additional Notes</strong> (bugs, workarounds, tips)</li>
      </ul>

      <!-- Automated validation -->
      <h2 class="text-h6 q-mt-lg q-mb-sm">Automated report validation</h2>
      <p>
        Reports are validated automatically on submission and in a weekly scheduled check. If required details are
        missing or new requirements are introduced, a bot will label the report and comment with what to update. Just
        edit the issue to resolve it. Long-standing flagged reports may be closed automatically, but can be reopened and
        updated at any time.
      </p>

      <!-- Why contribute -->
      <h2 class="text-h6 q-mt-lg q-mb-sm">Why contribute?</h2>
      <ul class="q-pl-lg">
        <li><strong>Full control</strong> — submit, update, or delete your own reports.</li>
        <li><strong>Help others</strong> — share configs that deliver stable FPS, battery life, and visuals.</li>
        <li><strong>Troubleshoot</strong> — collect fixes and workarounds by device/game.</li>
        <li><strong>Support all games</strong> — Steam and non-Steam titles alike.</li>
      </ul>

      <!-- Browse -->
      <h2 class="text-h6 q-mt-lg q-mb-sm">How to view existing reports</h2>
      <p>
        Browse the
        <a class="text-primary" href="https://github.com/DeckSettings/game-reports-steamos/issues" target="_blank"
           rel="noopener">
          Issues section
        </a>
        and filter by:
      </p>
      <ul class="q-pl-lg">
        <li><strong>Device Type</strong> — Steam Deck, ROG Ally, Legion Go, …</li>
        <li><strong>Launcher</strong> — Steam, Heroic, Lutris, …</li>
        <li><strong>Compatibility</strong> — Verified/Playable/Unsupported</li>
      </ul>
      <p>
        Then sort by newest, recently updated, most reactions, most commented, and more to surface reliable configs.
      </p>

      <!-- Community -->
      <h2 class="text-h6 q-mt-lg q-mb-sm">Join the community</h2>
      <p>
        Deck Settings is built by the community, for the community. Submit a report, share feedback, or help improve the
        project:
      </p>
      <ul class="q-pl-lg">
        <li><strong>Improve templates</strong> — suggest better report fields.</li>
        <li><strong>Automate validation</strong> — contribute GitHub Actions (see <code>scripts</code> in the repo).
        </li>
        <li><strong>Enhance docs</strong> — PRs for guides, how-tos, and tips.</li>
      </ul>
      <p>
        Questions or ideas? Join us on
        <a class="text-primary" href="https://streamingtech.co.nz/discord" target="_blank" rel="noopener">Discord</a>.
      </p>

      <!-- Links -->
      <h2 class="text-h6 q-mt-lg q-mb-sm">Project links</h2>
      <ul class="q-pl-lg">
        <li>
          <a class="text-primary" href="https://deckverified.games/" target="_blank" rel="noopener">Website</a>
        </li>
        <li>
          <a class="text-primary" href="https://github.com/DeckSettings/game-reports-steamos" target="_blank"
             rel="noopener">
            Game Reports Repository
          </a>
        </li>
        <li>
          <a class="text-primary" href="https://github.com/DeckSettings/deck-verified-site" target="_blank"
             rel="noopener">
            Website Source
          </a>
        </li>
      </ul>

    </div>
  </q-page>
</template>

<style scoped>
ul {
  line-height: 1.6;
}
</style>

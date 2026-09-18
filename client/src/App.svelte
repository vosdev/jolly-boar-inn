<script lang="ts">
  let health = $state<string>('checking…')

  $effect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((body: { ok: boolean }) => {
        health = body.ok ? 'server ok' : 'server not ok'
      })
      .catch(() => {
        health = 'server unreachable'
      })
  })
</script>

<main>
  <h1>Jolly Boar Inn</h1>
  <p>Quiz night. {health}</p>
</main>

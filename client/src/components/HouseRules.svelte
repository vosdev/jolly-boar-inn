<script lang="ts">
  /** Everything about a game that is not its rounds or its random events. */
  import { DIFFICULTIES } from '../lib/difficulty'
  import { PACES } from '../lib/pace'
  import type { Difficulty, Pace } from '../lib/protocol'
  import Segmented from './Segmented.svelte'
  import Stepper from './Stepper.svelte'

  const OFF_ON = [
    { value: false, label: 'Off' },
    { value: true, label: 'On' },
  ]

  let {
    pace = $bindable(),
    difficulty = $bindable(),
    standingsSeconds = $bindable(),
    closeWhenAllAnswered = $bindable(),
    nameWrongAnswers = $bindable(),
  }: {
    pace: Pace
    difficulty: Difficulty
    standingsSeconds: number
    closeWhenAllAnswered: boolean
    nameWrongAnswers: boolean
  } = $props()
</script>

<div class="rules">
  <div>
    <Segmented legend="Pace" options={PACES} bind:value={pace} />
    <p class="note">{PACES.find((option) => option.value === pace)?.note}</p>
  </div>
  <div>
    <Segmented legend="Questions" options={DIFFICULTIES} bind:value={difficulty} />
    <p class="note">{DIFFICULTIES.find((option) => option.value === difficulty)?.note}</p>
  </div>
  <div class="fine">
    <Stepper
      label="Standings between rounds, seconds"
      noun="standings seconds"
      value={standingsSeconds}
      min={0}
      max={30}
      step={5}
      onchange={(value) => (standingsSeconds = value)}
    />
    <Segmented
      legend="Close when everyone has answered"
      options={OFF_ON}
      bind:value={closeWhenAllAnswered}
    />
    <Segmented legend="Name who got it wrong" options={OFF_ON} bind:value={nameWrongAnswers} />
  </div>
</div>

<style>
  .rules {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 1rem 1.75rem;
  }

  .note {
    margin: 0.3rem 0 0;
  }

  .fine {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--line);
  }
</style>

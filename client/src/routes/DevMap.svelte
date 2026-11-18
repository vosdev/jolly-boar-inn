<script lang="ts">
  /**
   * The map's answer type on made-up players, to try under `pnpm dev`: no mode plays it yet.
   * A reveal is everyone's pins scattered round the targets, some of them badly.
   */
  import { onDestroy } from 'svelte'

  import PinRanking from '../components/PinRanking.svelte'
  import QuestionStage from '../components/QuestionStage.svelte'
  import type { MapBounds, WorldPoint } from '../lib/map'
  import { pairedCredit, pinsOf, type PinTarget } from '../lib/pins'
  import type { OpenQuestion, PlayerResult, PlayerView } from '../lib/protocol'
  import { PICKABLE } from '../lib/pets'
  import { players, you } from '../lib/stores'

  const REGIONS: Record<string, MapBounds | undefined> = {
    Surface: undefined,
    Karamja: { minX: 2704, maxX: 3008, minY: 2864, maxY: 3200 },
    Varrock: { minX: 3170, maxX: 3300, minY: 3370, maxY: 3510 },
  }
  const TARGETS: Record<string, PinTarget[]> = {
    Surface: [
      { name: 'Port Sarim', min_x: 3008, max_x: 3060, min_y: 3180, max_y: 3260 },
      { name: 'Rellekka', min_x: 2620, max_x: 2700, min_y: 3620, max_y: 3700 },
      { name: 'Ardougne', min_x: 2620, max_x: 2700, min_y: 3270, max_y: 3340 },
    ],
    Karamja: [{ name: 'Brimhaven', min_x: 2740, max_x: 2790, min_y: 3150, max_y: 3195 }],
    Varrock: [{ name: 'Varrock Palace', min_x: 3200, max_x: 3225, min_y: 3460, max_y: 3490 }],
  }
  /** The server's default: `_reach` in `questions/types/map_pin.py`. */
  const REACH = 100

  let region = $state('Surface')
  let several = $state(false)
  let crowd = $state(false)
  let revealed = $state(false)
  let tv = $state(false)
  let yours = $state<WorldPoint[] | null>(null)

  const team: PlayerView[] = Array.from({ length: 12 }, (_, index) => ({
    id: `player-${index}`,
    display_name: index === 0 ? 'AFKFisher' : `Player ${index}`,
    avatar: PICKABLE[index * 7]?.id ?? null,
    role: 'player',
    team: null,
    connected: true,
    ready: false,
    editing: false,
    item: null,
  }))

  players.set(team)
  $effect(() => {
    const first = team[0]
    you.set(first === undefined ? null : { ...first, role: tv ? 'tv' : 'player' })
  })
  onDestroy(() => {
    players.set([])
    you.set(null)
  })

  const targets = $derived(several ? (TARGETS[region] ?? []) : (TARGETS[region] ?? []).slice(0, 1))
  const bounds = $derived(REGIONS[region])
  const reach = $derived(
    bounds === undefined
      ? REACH
      : Math.min(REACH, Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 5),
  )
  const view = $derived({
    prompt: targets.length === 1 ? `Where is ${targets[0]?.name}?` : 'Pin all three.',
    pins: targets.length,
    ...(bounds === undefined
      ? {}
      : {
          bounds: {
            min_x: bounds.minX,
            max_x: bounds.maxX,
            min_y: bounds.minY,
            max_y: bounds.maxY,
          },
        }),
  })
  const question: OpenQuestion = $derived({
    question_id: `dev-${region}-${targets.length}`,
    index: 0,
    total: 1,
    type: 'map_pin',
    mode: 'custom',
    segment: { mode: 'custom', index: 0, total: 1, start: 0, count: 1 },
    view,
    picture: null,
    random_event: null,
    opened_at: new Date(0).toISOString(),
    answerable_at: new Date(0).toISOString(),
    ends_at: new Date(Date.now() + 3_600_000).toISOString(),
    you_can_answer: true,
    answered: 0,
    of: team.length,
    waiting: [],
  })

  function scatter(index: number): WorldPoint[] {
    const spread = index % 4 === 3 ? 900 : index % 3 === 2 ? 200 : 30
    return targets.map((target) => {
      const turn = (index * 2.4 + target.min_x) % (Math.PI * 2)
      return {
        x: Math.max(800, Math.min(4000, Math.round(target.min_x + Math.cos(turn) * spread))),
        y: Math.max(1900, Math.min(4300, Math.round(target.min_y + Math.sin(turn) * spread))),
      }
    })
  }

  const results = $derived.by(() => {
    const rows: Record<string, PlayerResult> = {}
    team.slice(0, crowd ? 12 : 4).forEach((player, index) => {
      const value = index === 0 && yours !== null ? yours : scatter(index)
      const credit = pairedCredit(value, targets, reach)
      rows[player.id] = {
        value,
        credit,
        correct: credit >= 1,
        points: Math.round(1000 * credit),
        item_points: 0,
        item: null,
      }
    })
    return rows
  })

  const yourResult = $derived(results['player-0'] ?? null)

  function answer(value: unknown): void {
    yours = pinsOf(value)
  }
</script>

<section class="dev-map">
  <div class="controls">
    <select bind:value={region} aria-label="Region">
      {#each Object.keys(REGIONS) as name (name)}
        <option>{name}</option>
      {/each}
    </select>
    <label><input type="checkbox" bind:checked={several} /> Three pins</label>
    <label><input type="checkbox" bind:checked={crowd} /> 12 players</label>
    <label><input type="checkbox" bind:checked={revealed} /> Reveal</label>
    <label><input type="checkbox" bind:checked={tv} /> TV</label>
  </div>
  <div class="frame">
    {#key `${question.question_id}-${revealed}-${tv}`}
      <QuestionStage
        {question}
        reveal={revealed ? { ...view, targets, reach } : null}
        yourValue={revealed ? (results['player-0']?.value ?? null) : yours}
        result={revealed ? yourResult : null}
        results={revealed ? results : null}
        onAnswer={answer}
        {tv}
      >
        {#if tv && revealed}
          <PinRanking
            reveal={{ targets, reach }}
            {results}
            unanswered={[]}
            nameOf={(id) => team.find((player) => player.id === id)?.display_name ?? null}
            youId={null}
          />
        {/if}
      </QuestionStage>
    {/key}
  </div>
</section>

<style>
  .dev-map {
    display: grid;
    gap: var(--space-2, 0.5rem);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
  }

  .frame {
    --stage-height: 75vh;
    --stage-wide: 960px;
  }
</style>

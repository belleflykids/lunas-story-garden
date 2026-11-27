# Luna's Story Garden: One World, Many Families

![Powered by Muse Ember](https://img.shields.io/badge/Powered%20by-Muse%20Ember-orange)

**Every story is written live by Muse Ember.**

**The thing nobody made yet: stories that travel.** A story does not just stay with one family. Luna carries it to another family somewhere else in the world, like a butterfly migrating — a family in Maui tells a kindness story, Luna flies it to a family in Mexico City in Spanish, and a story flies back. Families share stories with each other, across every culture, carried by a butterfly. A story generator on its own is not new. The traveling is what makes it new.

A parent picks a value — kindness, gratitude, helping, sharing — and Luna, a baby butterfly, tells a short, warm story about it, in the family's own language. Butterflies live on every continent except Antarctica, so Luna can fly to any family's garden, anywhere in the world.

Inspired by MEPS, the Multilanguage Electronic Publishing System built by Jehovah's Witnesses, which publishes one message in over a thousand languages at once: **one story, every language, every family.** Launching in English, Spanish, and Hawaiian (ʻŌlelo Hawaiʻi).

In the demo, the traveling exchange is symbolic: the arriving stories are canned, the destinations are a fixed list, and no personal information is sent anywhere. The live story generation is real; the flights show what the exchange will feel like.

Built for the **Open Agentic Web Challenge** (deadline January 11, 2027). A new project — not a resubmit of the Drew's Slime Storyteller. It reuses the proven Ember/Worker pattern from that project: a thin, strict shell around one model call.

## The problem

Families everywhere want to share stories with their children, but most story apps speak one language and one culture. Children in multilingual and multicultural families rarely see their own language or culture reflected. And many AI story tools are not safe for preschoolers — open-ended chats, no content checks, no privacy.

## The solution

Luna's Story Garden uses Muse Ember to generate short, age-appropriate bedtime stories for ages 3 to 5, built around universal family values that every culture shares: kindness, gratitude, helping, and sharing.

A parent picks a value and a language (English, Spanish, or Hawaiian), optionally a character and a place in the garden. Luna tells a two-sentence story with a positive, calm ending, in the family's own language. The parent picks; Luna tells. Parents remain in control, with child-safe choices and **no open-ended AI conversations with preschoolers**. No personal information is collected — a typed name never leaves the device, because there is nothing to type: every choice is a button.

## How it works

1. **A parent opens the page.** One static HTML file (`demo/lunas-story-garden.html`). No sign-in, no account, no server, no build step. It opens from a file on a phone.
2. **The parent picks three things.** A value, a language, and optionally a character and a garden setting. Nothing is pre-selected — the parent chooses.
3. **The page asks the Worker.** It sends only those four button picks to a Cloudflare Worker (`POST /api/story`). Nothing typed, nothing personal.
4. **The Worker checks the picks, then asks Ember.** The Worker validates every value against an exact allowlist, then calls Muse Ember (`muse-ember-1.0`) through the Meta Model API with a system prompt that fixes the age range, the language, the tone, and the banned topics.
5. **Ember writes the story live.** Two sentences, 25–60 words, in the family's own language.
6. **The Worker checks the story before anyone sees it.** Strict code checks (see AI Implementation below). One retry on a format break, then a clean failure.
7. **Luna tells it.** The story appears on the page with a watercolor Luna, plus a "Hear Luna tell it" button that reads it aloud in the chosen language. If the live story is unavailable, the page tells a kind canned story from Luna's storybook instead — a child never sees an error or a blank screen.
8. **The story flies.** After a story is told, the family can tap "Send this story flying with Luna". Luna carries it to the next family on the list — Mexico City, Tokyo, Paris, Nairobi, São Paulo, Honolulu, in rotation. A flight log on the page records where stories have flown this session.
9. **A story flies in.** A section on the page shows a story that flew in from a family in another country, in that family's own language, with the English underneath so a parent can follow it. A button cycles to the next arriving story. In the demo the arriving stories are canned; no personal information is sent anywhere.

## AI Implementation and Responsible Use

The app uses Muse Ember (`muse-ember-1.0`) through the Meta Model API, called from a Cloudflare Worker. Safety is built into the pipeline — and the checks are **deterministic code in the Worker, not a second model call and not a separate moderation model**. That keeps it cheap, fast, and predictable.

1. **Structured input.** The parent picks a value, language, character, and setting from buttons instead of typing free text, which limits prompt injection and off-topic requests. The Worker accepts only those four fields and only exact allowlist matches (case-sensitive). Anything else is rejected with a 400 before Ember is ever called.
2. **Constrained generation.** A system prompt fixes the age range (3 to 5), reading level, warm gentle playful tone, and banned topics (violence, frightening imagery, romance, death, substances, real brands, real people), and requires a positive, calm ending. The story must be exactly two sentences, 25–60 words, contain the character's name, say how something feels, and be told in the chosen language.
3. **Output verification (code, not a model).** The Worker checks every story before a child sees it: exactly 2 sentence terminators (one to three short sentences for Hawaiian, which says the same in fewer words), ends with a period, no question mark, 25–60 words (15–60 for Hawaiian), must contain the character's name, no digits, no links, no banned words or phrases (checked word by word, so a kind word is never caught by accident). A failed story gets one retry naming the broken rule, then the Worker answers 502 and the page falls back to a canned story. The page checks the live story once more against its own copy of the lists before showing it.
4. **Rate limits.** 10 requests per minute per address, 100 per day per address, 500 per day total, max 800 tokens per story — so the budget cannot be drained. IP addresses are SHA-256 hashed and never stored raw.
5. **Privacy.** No personal data is collected from children, in line with COPPA principles. There is no free-text field, no account, no open-ended conversation with a preschooler. The only thing sent to Ember is the parent's four button picks.

**Cost:** about $0.00006 per story (~300 input / 60 output tokens at $0.10/M in, $0.50/M out). Roughly 160,000 stories on $10.

**Note on how this was built:** Claude helped troubleshoot and build this project. Claude is not part of the running game — the only AI called when a family plays is Muse Ember.

## Project layout

```
lunas-story-garden/
├── README.md
├── worker/
│   └── lunas-story-garden.js   # Cloudflare Worker — POST /api/story
└── demo/
    ├── lunas-story-garden.html         # The whole game: one self-contained page
    ├── lunas-story-garden-preview.html # Same page, images embedded as base64
    │                                   # (single-file download for tap-testing)
    └── assets/
        ├── 20073_0_ee1z.webp   # Luna in the garden (hero image)
        ├── 17023_2_59bb.jpg    # Luna on a daisy, watercolor (shown with each story)
        ├── 11310_1_b5nc.png    # Bellefly Kids Garden canon map
        ├── 16873_4_pylb.png    # Cory the caterpillar (shown when Cory is picked)
        └── 19718_3_vf7a.webp   # Held aside — an unnamed caterpillar related to
                                # Cory, NOT Cory himself. Not shown on the page.
```

## Deploy

**The Worker** (paste into a new Cloudflare Worker):

1. Cloudflare dashboard → Workers & Pages → Create.
2. Paste the whole of `worker/lunas-story-garden.js`, Deploy.
3. Set the secret `META_API_KEY` (Worker → Settings → Variables). Pasting new code does not remove a secret once set.
4. Copy the Worker's URL (e.g. `https://lunas-story-garden.<account>.workers.dev`).

**The page:**

1. Open `demo/lunas-story-garden.html` in an editor.
2. Set `STORY_WORKER_URL` near the top of the script to the Worker's URL. Until it is set, the page tells stories from Luna's storybook (the 12 canned stories in the page).
3. Open the file in a browser or host it as a static page. The images live in `demo/assets/` and are referenced by relative paths, so the page works from a file on a phone. If an image is missing, it hides itself and the soft lavender background shows instead.

## The `/api/story` contract

**Request** — `POST /api/story`, JSON, only these four fields:

```json
{
  "value": "kindness",
  "language": "en",
  "character": "Luna",
  "setting": "Bellefly Kids Garden"
}
```

| Field | Allowed values (exact, case-sensitive) |
|---|---|
| `value` | `kindness`, `gratitude`, `helping`, `sharing` |
| `language` | `en` (English), `es` (Spanish), `haw` (Hawaiian — ʻŌlelo Hawaiʻi) |
| `character` | `Luna`, `Toby`, `Emma`, `Shelly`, `Benny Baby Bee`, `Cory`, `Pippa`, `Sammy`, `Kirk`, `Drew` |
| `setting` | `Bellefly Kids Garden`, `Luna's Lullaby Tree`, `garden fountain`, `flower archway` |

**Success** — `200`:

```json
{
  "story": "...",
  "usage": { "model": "muse-ember-1.0", "input_tokens": 300, "output_tokens": 60, "cost_usd": 0.00006 }
}
```

**Failures** (the page falls back to a canned story on any of these):

| Status | Meaning |
|---|---|
| `400` | Invalid request — extra field, or a value not on the allowlist |
| `429` | Rate limit (per minute, per day per address, or daily total) |
| `502` | Ember returned no usable story (bad format after one retry, timeout, or HTTP error) |
| `503` | No API key set on the Worker |

Every model call is logged as one JSON line (model, tokens, cost, ok, reason) for the token trace.

## The characters

All characters are from Bellefly Kids, with locked looks:

- **Luna** — the narrator. A fluffy cream-furred baby butterfly, big purple eyes with long lashes, rosy cheeks, two curly brown antennae, large sparkly translucent purple/pink wings with colorful polka dots.
- **Toby** — a cheerful little blonde boy, blue shirt, mustard-yellow overalls with a blue flower emblem, blue bow tie.
- **Emma** — a little toddler girl with brown hair and bangs, a pink butterfly hair pin, pink butterfly-print top, pink sparkly tulle skirt.
- **Shelly** — a fluffy baby dragonfly, pastel blue and lavender fur, big purple eyes, four sparkly translucent wings, a purple bow.
- **Benny Baby Bee** — a fluffy baby bumblebee, golden-yellow fur, big brown eyes, four iridescent wings, a purple bow tie with a gold heart charm stamped "B".
- **Cory** — a fluffy little caterpillar, light-green fur, big green eyes, rosy cheeks, two fuzzy green antennae, a segmented body with little round green feet, a green polka-dot bow tie.
- **Pippa** — a baby girl with light golden-brown hair in a high ponytail with a pink bow, pink dress with a big pink satin bow, flowers and butterflies on the skirt.
- **Sammy** — a fluffy baby snail, cream-beige fur, big blue-violet eyes, a large swirly iridescent purple-and-blue shell with gold trim.
- **Kirk** — a baby cricket, soft fuzzy light-green fur, big green eyes, sparkly translucent green wings with gold trim, a green bow tie and green-and-gold vest.
- **Drew** — a fluffy little blue spider, soft fuzzy bright-blue fur, two big sparkly blue eyes, a sparkly blue bow tie with a purple heart-shaped gem.

The four garden settings come from the Bellefly Kids Garden canon map (`demo/assets/11310_1_b5nc.png`): the garden itself, Luna's Lullaby Tree, the butterfly fountain, and the flower archway entrance.

## Red-team test list

Tests run against the Worker and the page. A story that fails any check never reaches a child — the page falls back to a canned story.

- **A value the model mishandles falls back to canned.** Lesson from the Slime Storyteller: Ember reliably returned no usable story for any slime name starting "Ocean Blue" — a model quirk, not a Worker bug. The same rule applies here: if Ember cannot tell a good story for a given value, language, or character, the Worker answers 502 after one retry and the page tells a canned story. No live story is ever presented as something it is not.
- **Extra fields rejected.** A request with any field beyond `value`, `language`, `character`, `setting` gets a 400 before any API call.
- **Off-allowlist values rejected.** `value: "bravery"`, `language: "fr"`, `character: "Elsa"`, or a wrong-case value such as `value: "Kindness"` all get a 400.
- **Banned words rejected.** A value containing a banned substring (for example `kindnessbirthday`) gets a 400. A story containing a banned word or phrase (checked word by word) fails the output check, gets one retry, then a 502.
- **Bad format retried once, then falls back.** A story with the wrong number of sentences, the wrong word count, a missing character name, digits, a link, or a question mark is retried once with the broken rule named, then rejected.
- **Slow reply times out to fallback.** The Worker aborts the model call after 15 seconds; the page gives up after 20 seconds. Either way, the child hears a canned story, never an error.
- **Direct endpoint calls rate-limited.** The story endpoint is publicly callable, so the limits (10/min, 100/day per address, 500/day total) cap the cost even if someone calls it directly. Worst case is a few cents a day.
- **No key, no charge.** With no `META_API_KEY` secret set, the Worker answers 503 without calling the model, and the page uses its canned stories.

## The canned stories

Twenty stories live in the page — one per value per language (12, in `CANNED`), plus four arriving stories from families around the world (in `ARRIVING`), each with an English version underneath. Every one is exactly two sentences, 25–60 words, mentions Luna and its value, and ends happily and calmly. The arriving stories are in Spanish (Mexico City, kindness), Japanese (Tokyo, gratitude), French (Paris, helping), and Swahili (Nairobi, sharing). The Japanese story is written with spaces between words (wakachigaki), the way Japanese picture books do it for young readers. They are labelled in the code as canned, not live Ember stories. The page shows "From Luna's storybook." under a canned story and "Told live by Muse Ember in …" under a live one. The Japanese, French, and Swahili wording should be read by a speaker of each language before the demo video.

## What's next

- The traveling exchange becomes real: families opt in, stories fly between them for real, still with no personal information and no open-ended chats.
- More languages, the way MEPS grows: one story, every language.
- More characters telling their own stories — Sammy's learning adventures, Toby's bicycle adventures.
- Luna's Story Garden as part of the Bellefly Kids Garden World, where every character can be more interactive with children, especially for storytelling.

---

*Bellefly Kids — every character has a personality, every adventure has a purpose, and every child has something new to discover.*

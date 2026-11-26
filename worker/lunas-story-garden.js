// Luna's Story Garden: One World, Many Families — Ember-powered story Worker (Cloudflare Worker)
// ============================================================================
// Written 26 Nov 2026 for the SLAY HACKS 2026 entry
// "Luna's Story Garden: One World, Many Families" (due Dec 7, 2026).
// A NEW project, not a resubmit of the Drew's Slime Storyteller. It reuses
// the proven Ember/Worker pattern of the Slime Storyteller Worker
// (drew-slime-storyteller.js): validate first, check the answer
// server-side, one retry, log everything as one JSON line, rate limits,
// 15-second upstream timeout.
//
// WHAT THIS IS
//   A small server that asks Muse Ember (muse-ember-1.0, Meta Model API)
//   to tell a tiny two-sentence bedtime story for a preschool child,
//   in the family's own language. A parent picks a value (kindness,
//   gratitude, helping, sharing), a language (English, Spanish, or
//   Hawaiian), a character, and a setting — all from buttons. No free
//   text from a child ever reaches the model. The story appears on the
//   page, and the page falls back silently to a canned story if this
//   Worker answers 502.
//
//   MEPS INSPIRATION — one story, every language:
//   MEPS, the Multilanguage Electronic Publishing System built by
//   Jehovah's Witnesses, publishes one message in over a thousand
//   languages at once. Luna's Story Garden follows the same idea for
//   children's stories: one warm story, told in the family's own
//   language. Butterflies live on every continent except Antarctica,
//   so Luna can fly to any family's garden, anywhere in the world.
//   Launching in English, Spanish, and Hawaiian (ʻŌlelo Hawaiʻi).
//
//   Pricing: $0.10 per 1M input tokens, $0.50 per 1M output tokens.
//   A two-sentence story is roughly 300 input / 60 output tokens, about
//   $0.00006 per story.
//
//   The API key lives ONLY as a Cloudflare Worker secret (env.META_API_KEY),
//   never in this file, never in the page, never in chat.
//
// DEPLOYMENT — paste this whole file into a NEW Worker:
//   1) On her laptop, Cloudflare dashboard → Workers & Pages → Create.
//   2) Paste this whole file, Deploy.
//   3) Set the secret META_API_KEY (Worker → Settings → Variables).
//      Pasting new code does NOT remove a secret once set.
//   4) Test only after the key is set; until then the Worker answers
//      503 and the page uses its canned stories.
//
// ENDPOINT: POST /api/story
//   Request (from the page only — parent button picks, never typed text):
//     {
//       "value": "kindness",
//       "language": "en",
//       "character": "Luna",
//       "setting": "Bellefly Kids Garden"
//     }
//   Success response:
//     { "story": "...", "usage": { "model": "muse-ember-1.0",
//       "input_tokens": 300, "output_tokens": 60, "cost_usd": 0.00006 } }
//   Not-connected response (no key set):
//     { "error": "AI not connected yet — credit/key pending" }  (503)
//   Rejected / failed responses (the page falls back silently to its
//   canned story on any of these):
//     400 invalid request · 429 rate limit · 502 model failed or bad format
//
// SAFETY FLOW — THE WORKER DOES NOT DECIDE WHAT A CHILD SEES:
//   1) The page sends ONLY button picks — value, language, character,
//      setting. No free text from a child ever reaches the model.
//   2) The Worker checks every value first against an exact allowlist:
//      short text only, no banned words, no extra fields. Anything else
//      is rejected with 400, before any API call.
//   3) The Worker checks the model's story with strict rules (exactly
//      two sentences, 25–60 words, must contain the character's name,
//      no banned words or phrases, no digits, no links), retries once
//      on a format break, and logs every rejection. A bad story never
//      reaches the page.
//   4) The page checks the story once more against its own kind-words
//      list before showing it. If it fails, it falls back to its canned
//      story and never shows the live answer.
//
// NOTE ON THE BANNED-WORD LISTS BELOW
//   The two ANSWER_ lists are data reused verbatim from the Slime
//   Storyteller Worker, checked word by word against the model's answer.
//   They are English words. They are applied to every story as a safety
//   net: a Spanish or Hawaiian story containing an English banned word
//   still fails. The system prompt itself does not spell the listed
//   words out; it tells the model to avoid the banned-words list and to
//   use only kind, calm, wholesome words. Server-side validation is the
//   enforcement point, and it runs on every answer before anything is
//   returned.

const MODEL = "muse-ember-1.0";
const API_URL = "https://api.meta.ai/v1/chat/completions";
const PRICE_INPUT_PER_M = 0.10; // USD per 1M input tokens
const PRICE_OUTPUT_PER_M = 0.50; // USD per 1M output tokens
const MAX_TOKENS = 200;
const TEMPERATURE = 0.8;
// VERIFIED ON THE SLIME STORYTELLER (24 Nov 2026): Ember accepts
// reasoning_effort "minimal" — all live stories returned with it set.
const REASONING_EFFORT = "minimal";

// Small list: checked as loose substrings on INCOMING picker values.
const BANNED = ["magic", "magical", "mystical", "scary", "frightening", "monster", "ghost", "birthday", "christmas", "easter", "halloween"];

// Wide list: checked WORD BY WORD on the model's answer, exactly like the
// game's own check — so a kind word is never caught by accident.
// Reused verbatim from the Slime Storyteller Worker.
const ANSWER_BANNED_WORDS = ["magic", "magical", "mystical", "scary", "frightening", "frightened", "frighten", "spooky", "haunted", "ghost", "ghosts", "ghostly", "monster", "monsters", "witch", "witches", "wizard", "vampire", "zombie", "skeleton", "demon", "devil", "evil", "nightmare", "horror", "creepy", "terrified", "terror", "blood", "bloody", "kill", "killing", "death", "dead", "die", "dying", "gun", "guns", "knife", "knives", "weapon", "weapons", "hate", "hates", "stupid", "dumb", "ugly", "fat", "sexy", "kiss", "kissing", "romance", "drunk", "beer", "wine", "birthday", "christmas", "xmas", "easter", "halloween", "thanksgiving", "valentine", "valentines", "holiday", "holidays", "hanukkah", "chanukah", "kwanzaa", "diwali", "ramadan", "eid", "santa", "reindeer", "fireworks"];
const ANSWER_BANNED_PHRASES = ["new year", "new years", "st patrick", "saint patrick", "independence day", "fourth of july", "groundhog day", "april fools", "mothers day", "fathers day", "trick or treat", "jack o lantern"];

// Exact allowlists for the four picker fields (case-sensitive).
const ALLOWED_VALUES = ["kindness", "gratitude", "helping", "sharing"];
const ALLOWED_LANGUAGES = ["en", "es", "haw"];
const ALLOWED_CHARACTERS = ["Luna", "Toby", "Emma", "Shelly", "Benny Baby Bee", "Cory", "Pippa", "Sammy", "Kirk", "Drew"];
const ALLOWED_SETTINGS = ["Bellefly Kids Garden", "Luna's Lullaby Tree", "garden fountain", "flower archway"];

// The language's own name, used in the system prompt so Ember answers
// in the family's language.
const LANGUAGE_NAMES = {
  en: "English",
  es: "Spanish (español)",
  haw: "Hawaiian (ʻŌlelo Hawaiʻi)"
};

// Rate limits: 10 per minute per IP, 100 per day per IP, 500 per day total.
const LIMIT_PER_MINUTE = 10;
const LIMIT_PER_DAY_IP = 100;
const LIMIT_PER_DAY_TOTAL = 500;
const UPSTREAM_TIMEOUT_MS = 15000; // page gives up after 20s — answer first.

function log(event, details) {
  try {
    console.log(JSON.stringify(Object.assign({ event, worker: "lunas-story-garden" }, details || {})));
  } catch (e) { /* logging must never break storytelling */ }
}

function computeCost(inputTokens, outputTokens) {
  const cost = (inputTokens * PRICE_INPUT_PER_M) / 1e6 + (outputTokens * PRICE_OUTPUT_PER_M) / 1e6;
  return Math.round(cost * 1e8) / 1e8; // keep 8 decimal places, no float dust
}

function cleanText(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 40) return null;
  const lower = text.toLowerCase();
  for (const word of BANNED) {
    if (lower.includes(word)) return null;
  }
  return text;
}

function wordCount(s) { return s.split(/\s+/).filter(Boolean).length; }

function answerTokens(s) {
  return s.toLowerCase().replace(/[’‘]/g, "'").replace(/'/g, "").replace(/[^a-z]+/g, " ").split(/\s+/).filter(Boolean);
}

// Only these four fields are accepted — anything else is rejected with 400.
// Every value must match its allowlist exactly. Returns { request } when
// valid, or { error } naming the problem.
function validateRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid request" };
  }
  const allowed = ["value", "language", "character", "setting"];
  for (const key of Object.keys(body)) {
    if (allowed.indexOf(key) === -1) return { error: "Invalid story request" };
  }
  const request = {
    value: cleanText(body.value),
    language: cleanText(body.language),
    character: cleanText(body.character),
    setting: cleanText(body.setting)
  };
  if (!request.value || !request.language || !request.character || !request.setting) {
    return { error: "Invalid story request" };
  }
  if (ALLOWED_VALUES.indexOf(request.value) === -1) return { error: "Invalid story request" };
  if (ALLOWED_LANGUAGES.indexOf(request.language) === -1) return { error: "Invalid story request" };
  if (ALLOWED_CHARACTERS.indexOf(request.character) === -1) return { error: "Invalid story request" };
  if (ALLOWED_SETTINGS.indexOf(request.setting) === -1) return { error: "Invalid story request" };
  return { request };
}

// Strict check on the model's story. Returns { story } when it passes,
// or { reason } naming the first broken rule. The story MUST contain the
// character's name (case-insensitive) so a story can never be swapped
// onto the wrong character. The banned-word lists are English words;
// they are applied to every story as a safety net, whatever language
// the story is in.
function checkStory(story, character) {
  if (typeof story !== "string" || typeof character !== "string") return { reason: "not strings" };
  story = story.trim().replace(/\s+/g, " ");
  character = character.trim().replace(/\s+/g, " ");
  if (!story || !character) return { reason: "empty story or character" };
  if (/[0-9]/.test(story)) return { reason: "digits in story" };
  if (/(https?|www\.|\.com|\.net|\.org|@)/i.test(story)) return { reason: "link in story" };
  const terminators = story.match(/[.!?]/g) || [];
  if (terminators.length !== 2) return { reason: "story is not exactly two sentences" };
  if (story.indexOf("?") !== -1) return { reason: "story is a question" };
  if (!/[.!]$/.test(story)) return { reason: "story does not end with a period" };
  const wc = wordCount(story);
  if (wc < 25 || wc > 60) return { reason: "story is not 25-60 words" };
  if (story.toLowerCase().indexOf(character.toLowerCase()) === -1) {
    return { reason: "story does not contain the character name" };
  }
  const tokens = answerTokens(story);
  for (const t of tokens) {
    if (ANSWER_BANNED_WORDS.indexOf(t) !== -1) return { reason: "banned word: " + t };
  }
  const padded = " " + tokens.join(" ") + " ";
  for (const p of ANSWER_BANNED_PHRASES) {
    if (padded.indexOf(" " + p + " ") !== -1) return { reason: "banned phrase: " + p };
  }
  return { story };
}

// Parse the model's raw text as JSON and run the strict story check.
// Returns { ok: true, story } or { ok: false, reason, raw }.
function parseModelText(text, character) {
  let parsed;
  try { parsed = JSON.parse(text.trim()); } catch (e) {
    return { ok: false, reason: "model returned bad JSON", raw: text };
  }
  if (!parsed || typeof parsed.story !== "string") {
    return { ok: false, reason: "bad format: no story field", raw: text };
  }
  const checked = checkStory(parsed.story, character);
  if (checked.story) return { ok: true, story: checked.story };
  return { ok: false, reason: "bad format: " + checked.reason, raw: text };
}

function buildSystemPrompt(request) {
  const languageName = LANGUAGE_NAMES[request.language] || "English";
  const lines = [
    "You are Luna, a kind baby butterfly with fluffy cream fur, big purple eyes with long lashes, rosy cheeks, two curly brown antennae, and large sparkly translucent purple and pink wings with colorful polka dots. You tell short bedtime stories for little children in the Bellefly Kids Garden.",
    "A parent has picked a story for their preschool child. Tell it just for them.",
    "Story — value: " + request.value + "; language: " + languageName + "; character: " + request.character + "; setting: " + request.setting + ".",
    "Tell the whole story IN " + languageName + ". Use that language's own words, naturally and correctly.",
    "Rules, all mandatory:",
    "- Tell a story of exactly TWO sentences. No more, no fewer.",
    "- Mention the character's name, " + request.character + ".",
    "- The story is about " + request.value + " — show it in something kind the character does.",
    "- Set the story in " + request.setting + ".",
    "- Say how something feels — soft, warm, cozy or sparkly.",
    "- Warm, gentle, playful words a preschool child would love. Simple words, short sentences.",
    "- Kind and wholesome only. No upsetting, unkind, or hurtful words. No fights, no strangers, no secrets.",
    "- Always end happily and calmly, like a good bedtime story.",
    "- Never use any word from the banned-words list.",
    "- No seasonal celebration themes. No religious symbols.",
    "- Return ONLY JSON, no other text: {\"story\": \"...\"}"
  ];
  return lines.join("\n");
}

async function hashIp(rawIp) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawIp));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("").slice(0, 16);
  } catch (e) { return "unknown"; }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // UTC date, e.g. 2026-11-26
}

// One model call, with a 15-second timeout. Returns
// { ok: true, story, usage } or { ok: false, reason, raw }.
// Every attempt is logged as one JSON line with model, tokens and cost.
async function callModel(apiKey, request, retryNote) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, UPSTREAM_TIMEOUT_MS);
  try {
    const messages = [
      { role: "system", content: buildSystemPrompt(request) },
      { role: "user", content: retryNote ? ("Tell the story again. " + retryNote) : "Tell the bedtime story." }
    ];
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: MAX_TOKENS,
        reasoning_effort: REASONING_EFFORT,
        temperature: TEMPERATURE
      }),
      signal: controller.signal
    });
    let data = null;
    try { data = await resp.json(); } catch (e) { /* no JSON body */ }
    const inputTokens = (data && data.usage && data.usage.prompt_tokens) || 0;
    const outputTokens = (data && data.usage && data.usage.completion_tokens) || 0;
    const cost = computeCost(inputTokens, outputTokens);
    if (!resp.ok) {
      log("model_call", { model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost, ok: false, reason: "model HTTP " + resp.status });
      return { ok: false, reason: "model HTTP " + resp.status };
    }
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text || typeof text !== "string") {
      log("model_call", { model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost, ok: false, reason: "model returned no text" });
      return { ok: false, reason: "model returned no text" };
    }
    const parsed = parseModelText(text, request.character);
    log("model_call", {
      model: MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
      ok: parsed.ok,
      reason: parsed.ok ? undefined : parsed.reason
    });
    if (parsed.ok) {
      return {
        ok: true,
        story: parsed.story,
        usage: { model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost }
      };
    }
    return { ok: false, reason: parsed.reason, raw: parsed.raw };
  } catch (e) {
    const reason = (e && e.name === "AbortError") ? "model timed out after 15s" : "model request failed";
    log("model_call", { model: MODEL, input_tokens: 0, output_tokens: 0, cost_usd: 0, ok: false, reason });
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    const json = (obj, status) => new Response(JSON.stringify(obj), {
      status,
      headers: Object.assign({ "Content-Type": "application/json" }, cors)
    });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "Stories only" }, 405);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "Invalid request" }, 400); }

    // Validate BEFORE any API call. Only button picks, exact allowlist
    // matches, short text, no banned words, only the four story fields.
    const validated = validateRequest(body);
    if (validated.error) return json({ error: validated.error }, 400);
    const req = validated.request;

    // Rate limits. IPs are hashed first and never stored raw.
    const ip = await hashIp(request.headers.get("CF-Connecting-IP") || "unknown");
    const now = Date.now();
    const day = todayKey();
    const store = globalThis.__storyRate || (globalThis.__storyRate = { perIp: new Map(), dayTotal: { day, count: 0 } });
    if (store.dayTotal.day !== day) store.dayTotal = { day, count: 0 };
    if (store.dayTotal.count >= LIMIT_PER_DAY_TOTAL) {
      log("rate_limited", { scope: "daily total", count: store.dayTotal.count });
      return json({ error: "Rate limit: too many story requests today, try again tomorrow" }, 429);
    }
    const bucket = store.perIp.get(ip) || { minute: [], day: [] };
    bucket.minute = bucket.minute.filter(function (t) { return now - t < 60000; });
    bucket.day = bucket.day.filter(function (t) { return now - t < 86400000; });
    if (bucket.minute.length >= LIMIT_PER_MINUTE) {
      log("rate_limited", { scope: "per minute", ipHash: ip, count: bucket.minute.length });
      return json({ error: "Rate limit: too many story requests, try again in a minute" }, 429);
    }
    if (bucket.day.length >= LIMIT_PER_DAY_IP) {
      log("rate_limited", { scope: "per day per IP", ipHash: ip, count: bucket.day.length });
      return json({ error: "Rate limit: too many story requests today, try again tomorrow" }, 429);
    }
    bucket.minute.push(now);
    bucket.day.push(now);
    store.perIp.set(ip, bucket);
    store.dayTotal.count += 1;

    // No key, no call, no charge.
    if (!env.META_API_KEY) {
      return json({ error: "AI not connected yet — credit/key pending" }, 503);
    }

    // Live call, server-side only. The key never leaves this Worker.
    // One retry on a format break, naming the broken rule, then fail
    // cleanly so the page falls back to its canned story.
    let result = await callModel(env.META_API_KEY, req, null);
    if (!result.ok && result.reason && (result.reason.indexOf("bad format:") === 0 || result.reason === "model returned bad JSON")) {
      const rule = result.reason === "model returned bad JSON"
        ? "return ONLY the JSON object, no other text"
        : result.reason.slice("bad format: ".length);
      log("model_retry", { reason: result.reason, raw: (result.raw || "").slice(0, 120) });
      result = await callModel(env.META_API_KEY, req,
        "Your last answer broke a format rule (" + rule + "). Return ONLY the JSON object {\"story\": \"...\"} with exactly two sentences, 25-60 words, containing the character name \"" + req.character + "\", in " + (LANGUAGE_NAMES[req.language] || "English") + ".");
    }
    if (!result.ok) {
      log("story_rejection", { reason: result.reason, raw: (result.raw || "").slice(0, 120) });
      return json({ error: "Meta AI returned no usable story" }, 502);
    }
    // Return the story plus usage. The page shows the story and ignores
    // the extra fields; the usage block is what the token trace is built
    // from. The page checks the story again before showing it.
    return json({ story: result.story, usage: result.usage }, 200);
  }
};

// Named exports for a Node test harness. The Worker runtime ignores
// these; a harness imports them to test the pure logic with no network
// calls.
export {
  MODEL, API_URL, PRICE_INPUT_PER_M, PRICE_OUTPUT_PER_M,
  MAX_TOKENS, TEMPERATURE, REASONING_EFFORT,
  BANNED, ANSWER_BANNED_WORDS, ANSWER_BANNED_PHRASES,
  ALLOWED_VALUES, ALLOWED_LANGUAGES, ALLOWED_CHARACTERS, ALLOWED_SETTINGS,
  LANGUAGE_NAMES,
  LIMIT_PER_MINUTE, LIMIT_PER_DAY_IP, LIMIT_PER_DAY_TOTAL,
  UPSTREAM_TIMEOUT_MS,
  computeCost, cleanText, wordCount,
  validateRequest, buildSystemPrompt, checkStory, parseModelText
};

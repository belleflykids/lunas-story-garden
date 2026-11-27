// Cory's Leaf Garden — site actions (adapted from Luna's Story Garden,
// 26 Nov 2026). Same five actions, same page globals, Cory as the host.
//
// Registers this website's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
//
// Each action wraps an operation the page already uses, so the assistant and the
// manual UI share one set of rules. The business rules stay in the page:
// allowlists (4 values, 3 languages, 10 characters, 4 settings), blank start,
// "Tell a story" disabled until value AND language are picked, canned fallback
// when the Worker is unreachable, flight destinations that never repeat twice.
// Operations return {ok: false, reason} when they refuse input, before
// changing anything. A throw is reported as "unknown".
//
// The page is a single HTML file; its functions and state are globals on
// window (tellStory, hearStory, sendFlying, nextArriving, picked,
// currentStory, currentLanguage, CANNED, ARRIVING, DESTINATIONS, LANG_NAMES).
// site-actions.js reads them through window and fails gracefully if the page
// script has not run yet. When the assistant is mounted (Step 6), the page
// script must load before this module.

/**
 * Describes Cory's Leaf Garden operations as actions the agent can call.
 *
 * Each action wraps a function the page already uses, so the assistant and the
 * manual UI share one set of rules. The runtime validates arguments against
 * inputSchema before execute runs, and asks the visitor to confirm
 * "irreversible" actions first.
 */
class SiteActions {
  /**
   * Register every site action with the runtime.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register(SiteActions.getStoryStateAction());
    actions.register(SiteActions.tellStoryAction());
    actions.register(SiteActions.sendStoryFlyingAction());
    actions.register(SiteActions.showArrivingStoryAction());
    actions.register(SiteActions.readStoryAloudAction());
  }

  /** Read the page globals, or null when the page script has not run yet. */
  static page() {
    const w = typeof window !== "undefined" ? window : null;
    if (!w || typeof w.tellStory !== "function") return null;
    return w;
  }

  static getStoryStateAction() {
    return {
      name: "get_story_state",
      description: "Read Cory's Leaf Garden as it is right now: the parent's picks (value, language, character, setting), whether a story is showing and whether it was told live by Muse Ember or from Cory's storybook, how many stories have flown in this session, and whether 'Tell a story' is ready (it needs a value and a language picked). Call it again in each turn that needs it: the visitor can also use the page.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: SiteActions.getStoryState,
    };
  }

  static getStoryState() {
    const w = SiteActions.page();
    if (!w) return { ok: false, reason: "The story page has not loaded yet." };
    const picked = w.picked || {};
    return {
      ok: true,
      value: picked.value || null,
      language: picked.language || null,
      character: picked.character || "Cory",
      setting: picked.setting || "Bellefly Kids Garden",
      storyShowing: typeof w.currentStory === "string" && w.currentStory.length > 0,
      story: w.currentStory || null,
      tellReady: !!(picked.value && picked.language),
    };
  }

  static tellStoryAction() {
    return {
      name: "tell_story",
      description: "Tell a bedtime story for the parent's picks, only when the visitor asks. Give the value (kindness, gratitude, helping or sharing) and the language (English, Spanish or Hawaiian); character and setting are optional and default to Cory in the Bellefly Kids Garden. Cory tells the story live through Muse Ember when the story Worker answers, otherwise from Cory's storybook. Returns the story text and whether it was live or from the storybook. Reversible: tell another story any time.",
      effect: "write",
      inputSchema: {
        type: "object",
        properties: {
          value: {
            type: "string",
            enum: ["kindness", "gratitude", "helping", "sharing"],
            description: "The value the story is about.",
          },
          language: {
            type: "string",
            enum: ["en", "es", "haw"],
            description: "The language to tell the story in: en for English, es for Spanish, haw for Hawaiian.",
          },
          character: {
            type: "string",
            enum: ["Luna", "Toby", "Emma", "Shelly", "Benny Baby Bee", "Cory", "Pippa", "Sammy", "Kirk", "Drew"],
            description: "Who the story stars. Defaults to Cory.",
          },
          setting: {
            type: "string",
            enum: ["Bellefly Kids Garden", "Luna's Lullaby Tree", "garden fountain", "flower archway"],
            description: "Where the story is set. Defaults to the Bellefly Kids Garden.",
          },
        },
        required: ["value", "language"],
        additionalProperties: false,
      },
      execute: SiteActions.tellStory,
    };
  }

  static async tellStory(args) {
    const w = SiteActions.page();
    if (!w) return { ok: false, reason: "The story page has not loaded yet." };
    const value = args && args.value;
    const language = args && args.language;
    if (!value || !language) {
      return { ok: false, reason: "Tell me the value and the language first — for example kindness in Spanish." };
    }
    // Set the picks the same way the page's picker buttons do, then tell.
    if (!w.picked) w.picked = {};
    w.picked.value = value;
    w.picked.language = language;
    if (args.character) w.picked.character = args.character;
    if (args.setting) w.picked.setting = args.setting;
    if (typeof w.updateTellButton === "function") w.updateTellButton();
    await w.tellStory();
    const story = w.currentStory || null;
    if (!story) return { ok: false, reason: "Cory could not tell a story just now. Try again." };
    // The page shows the source label under the story; read it back if present.
    const sourceEl = w.document && w.document.querySelector ? w.document.querySelector(".story-source") : null;
    const source = sourceEl ? sourceEl.textContent : null;
    return {
      ok: true,
      story: story,
      live: source ? source.indexOf("live by Muse Ember") !== -1 : null,
      source: source,
      value: value,
      language: language,
      character: w.picked.character || "Cory",
      setting: w.picked.setting || "Bellefly Kids Garden",
    };
  }

  static sendStoryFlyingAction() {
    return {
      name: "send_story_flying",
      description: "Send the story that is showing now flying with Cory to a family in another place, only when the visitor asks — Mexico City, Tokyo, Paris, Nairobi, São Paulo or Honolulu. Cory carries it like a butterfly migrating, on his future migration path. For the demo the flight is symbolic: no personal information is sent anywhere. Returns the destination and a confirmation. Needs a story showing first.",
      effect: "write",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: SiteActions.sendStoryFlying,
    };
  }

  static sendStoryFlying() {
    const w = SiteActions.page();
    if (!w) return { ok: false, reason: "The story page has not loaded yet." };
    if (!w.currentStory) {
      return { ok: false, reason: "There is no story showing to send flying. Tell a story first." };
    }
    const dests = w.DESTINATIONS || [];
    if (!dests.length) return { ok: false, reason: "No flight destinations are set up." };
    const count = typeof w.sendCount === "number" ? w.sendCount : 0;
    const destination = dests[count % dests.length];
    w.sendFlying();
    return {
      ok: true,
      destination: destination,
      message: "Your story flew to " + destination + "! A family there will hear it in their own language.",
    };
  }

  static showArrivingStoryAction() {
    return {
      name: "show_arriving_story",
      description: "Show a story that just flew in from a family in another place, only when the visitor asks — Mexico City (Spanish), Tokyo (Japanese), Paris (French) or Nairobi (Swahili) — each with its English version underneath. Each call shows the next one in turn. Returns the origin, the language, the story and the English version. Cory can also tell what he saw on the journey.",
      effect: "write",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: SiteActions.showArrivingStory,
    };
  }

  static showArrivingStory() {
    const w = SiteActions.page();
    if (!w) return { ok: false, reason: "The story page has not loaded yet." };
    if (typeof w.nextArriving !== "function") {
      return { ok: false, reason: "No arriving stories are set up." };
    }
    w.nextArriving();
    const arriving = w.ARRIVING || [];
    const index = typeof w.arrivingIndex === "number" ? w.arrivingIndex : 0;
    const a = arriving[index];
    if (!a) return { ok: false, reason: "No arriving story is showing." };
    return {
      ok: true,
      origin: a.origin,
      language: a.language,
      value: a.value,
      story: a.text,
      english: a.english,
    };
  }

  static readStoryAloudAction() {
    return {
      name: "read_story_aloud",
      description: "Read the story that is showing now aloud with the device's speech voice (English, Spanish or Hawaiian when the device has that voice). Needs a story showing first. Reading aloud is the device's voice, not a recording of a real person.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: SiteActions.readStoryAloud,
    };
  }

  static readStoryAloud() {
    const w = SiteActions.page();
    if (!w) return { ok: false, reason: "The story page has not loaded yet." };
    if (!w.currentStory) {
      return { ok: false, reason: "There is no story showing to read aloud. Tell a story first." };
    }
    if (!("speechSynthesis" in w)) {
      return { ok: false, reason: "Reading aloud is not available on this device." };
    }
    w.hearStory();
    return { ok: true, message: "Reading the story aloud now.", story: w.currentStory };
  }
}

export { SiteActions };

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;

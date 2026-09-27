# PRISM generalization demo

A standalone static companion for inspecting a modular prompt pipeline and its response-evaluation rule. Reviewers need no application server, dependency installation, analytics, or bundled keys.

The demo uses one request at a time and contains no campaign scheduler or experimental result rows. Its transformation contracts mirror the corresponding Prism implementation: the bundled taxonomy system/user prompts, intent-preserving paraphrase prompt, fifteen encodings, and eight seeded perturbations. A compact, attributed prompt-only copy of XSTest and JailbreakBench Behaviors is included for reviewer exploration; a reviewer can also open a local JSON or JSONL file without uploading it.

## Use locally

From this directory:

```sh
python3 -m http.server 8794 --bind 127.0.0.1
```

Open the local address printed by the server. The committed `app.bundle.js` contains the application and its static catalogs and prompt assets, so browsing the demo does not fetch those files separately.

After editing JavaScript or files in `data/`, rebuild the browser artifact with Node 22 or later:

```sh
npm ci
npm run build
```

Commit both `app.bundle.js` and the updated `index.html` with the source changes. Anonymous GitHub serves repository files directly, so a bundle created only inside a Pages deployment would not reach its mirror. The build uses a deferred classic script because Anonymous GitHub's sandbox gives the page an opaque origin and blocks JavaScript modules and local JSON/text fetches without CORS headers. It leaves the page's Content Security Policy and the host sandbox intact.

Run the offline verification suite with `node --test tests/*.test.js` (Node 22 or later). Tests use synthetic fixtures and mocked services; they do not charge an API account.

## Reviewer flow

1. Keep the default manual request, choose a bundled XSTest or JailbreakBench sample, or open a local JSON/JSONL dataset. Manual entry remains the default.
2. The initial Prism pipeline applies a taxonomy rewrite, translates it to Italian (one of the campaign-tested languages), and applies the seeded Leetspeak perturbation at probability 0.35. Add, remove, reorder, or reset the steps as needed.
3. For a taxonomy block, select one or more techniques manually, or sample 3–10 deterministically. The minimum length starts at 300 words and can be increased to 1,500.
4. Enter your own OpenRouter key for taxonomy or paraphrase steps; add a Google Cloud Translation Basic key only if the pipeline includes translation. A fully local pipeline needs neither key.
5. Run the transformation. The complete output and intermediate steps remain visible.
6. Choose a suggested model from the dropdown, or select the manual-entry option and enter another OpenRouter model ID, and generate a response.
7. Evaluate it using Gemma + JEV, the original PRISM ensemble (Kimi, GLM, DeepSeek, GPT-OSS), or an individual Gemma, JEV, DeepSeek, GPT-OSS, GLM, or Kimi judge. Both score conventions and component outcomes are shown.
8. Export the session as JSON. Keys and infrastructure metadata are excluded.

Technique selection is deterministic outside the LLM: fixed seed 42, input text, and visible draw index feed UTF-8 FNV-1a, Mulberry32, and Fisher–Yates. Live LLM text is not guaranteed to be deterministic. Claimed technique use is validated as a set of IDs, not independently verified as a semantic property.

## Dataset sources

The source switch keeps manual payload entry as the default. The bundled browser catalog contains only stable sample ID, prompt text, control label, and category:

- **XSTest:** 450 prompts, including 250 controls and 200 unsafe contrasts; CC BY 4.0.
- **JailbreakBench Behaviors:** 200 prompts, including 100 harmful behaviors and 100 benign controls; MIT.

Attribution, citations, source links, licenses, and the reconciliation-file hashes are stored in `data/datasets.json` and `data/THIRD_PARTY_DATA.txt`. Internal metadata, annotations, completions, judgments, and campaign results are not bundled.

Local JSON/JSONL files can contain an array directly or an object with a `records`, `samples`, or `data` array. The request field may be named `prompt`, `question`, `payload`, or `text`; optional `id`, `sample_id`, `control`, `label`, and `category` fields are recognized. Parsing uses the browser File API. Files stay in the tab, are limited to 5 MB and 5,000 usable rows, and are never sent anywhere until the reviewer deliberately runs an API-backed transformation or target request.

## Public configuration

The taxonomy transformer is DeepSeek V4 Pro at temperature 0.2; intent-preserving paraphrases use temperature 0.5, matching Prism's transformation default. Targets and Gemma use temperature 0. JEV has no sampling-temperature setting. The UI exposes no provider selection, research-serving address, retry budget, system-prompt control, or other internal configuration.

OpenRouter calls request performance-aware provider routing. Long transformations, paraphrases, and target responses sort eligible endpoints by output throughput; short chat-judge JSON calls sort them by latency (time to first token). Automatic provider fallback remains enabled. These are routing preferences based on recent provider measurements, not a latency guarantee: queues, cold caches, model reasoning, long outputs, rate limits, and a failed first provider can still make a request slow.

DeepSeek V4 Pro supports OpenRouter JSON mode but not strict JSON-Schema enforcement. Taxonomy rewrites therefore request `json_object` from a compatible endpoint and retain Prism's local exact-technique, minimum-length, and shape validation; an invalid result can trigger two additional model calls. Gemma 4 31B, GPT-OSS 120B, GLM 5.2, and Kimi K3 judgments use strict `json_schema` with `provider.require_parameters: true`, followed by the same local rubric validation. Schema enforcement reduces malformed responses but does not replace semantic and cross-field checks.

The catalog combines the active transformation definitions with missing techniques from TaxonomyDefinitive: 82 entries in total, of which 52 are selectable for model rewriting, 25 are local operations, one is translation, one is paraphrase, and three are reference parents. Display examples remain separate in `data/examples.json` and are never sent to a model. Taxonomy rewrites load `data/prompts/RedTeamAssistant_Augmented3.txt` and `data/prompts/prompt.txt`, apply Prism's exact-technique contract, and validate both minimum length and the returned technique set. Controlled harmful benchmark payloads are preserved rather than converted to benign analogues.

The fixed language catalog contains 194 Google NMT entries, captured on 2026-09-27 from [Google’s language-support table](https://docs.cloud.google.com/translate/docs/languages). The reviewer picker intentionally exposes only the ten languages used in the Prism campaign—French, Italian, German, Simplified Chinese, Russian, Bhojpuri, Aymara, Croatian, Greek, and Danish—so language choice remains controlled and navigable. It is not the separate Translation LLM catalog. The thirteen suggested target IDs were checked against OpenRouter’s public catalog on the same date. DeepSeek is the default; suggestions include Qwen 3 and Gemma 2, 3, and 4 variants. Model-family correspondence does not guarantee identical historical model versions or serving behavior.

## Edit the displayed taxonomy examples

Edit **`data/examples.json`**. Each technique has a stable ID and an `examples` array:

```json
{
  "DefinedPersonas": {
    "examples": [
      "Act as an astronomy teacher. Explain why the Moon has phases.",
      "Act as a museum guide. Introduce the planets to a family."
    ]
  }
}
```

- `"examples": []` hides the examples section completely.
- One nonempty string shows **Example**; two show **Examples**, individually numbered.
- Empty/whitespace strings are ignored. More than two nonempty examples or a non-string entry produces a clear validation message.
- Keep the other technique entries in the file. Missing entries are also treated as empty.
- Examples are rendered as escaped plain text. They are display-only and are not sent to the rewrite model.
- Reload after saving. The catalog builder never overwrites this file. Every entry is initially empty, ready for manual authoring.

## Judge choices

All judge choices use the reviewer's OpenRouter key. Individual chat judges receive the request and response and return the same rubric. The Gemma/JEV ensemble retains its conditional contextual-Gemma rule. The **How it works** page explains JEV's assessability, safety probability, categorical margin, consistency checks, and thresholds without internal experiment aliases.

The original PRISM ensemble averages usable numerical scores from Kimi, GLM 5.2, DeepSeek, and GPT-OSS. It does not assign an averaged safety category. Its primary score enables safe helpfulness and excludes the optional compliance term, matching the original interface defaults. For comparison, the two previously available score conventions are also averaged separately. Invalid and unclear judgments never become zeros; partial contributions are counted and displayed. No live provider call was made during validation.

## Local transformations

The browser implements fifteen reversible encodings, all eight registered Prism perturbations, and two separately labeled presentation helpers. Base64, ASCII Art, and Low Resource Language never appear in the model rewrite selection. Translation uses the fixed Google language catalog. Abstract encoding/perturbation parent labels are reference entries and are excluded from sampling too.

Encoders match the repository defaults, including Unicode handling, byte order, padding, Base85 alphabet, the Caesar shift of 3, and the reversed-alphabet substitution. Each encoding can return raw encoded text or include Prism's decode-and-re-encode instruction, encoding example, and response requirement. Offline tests compare three synthetic Unicode/punctuation vectors against all fifteen encoders and verify the instruction contract.

Leetspeak, Pig Latin, vowel removal, character substitution, phonetic spelling, misspelling, dot separation, and homoglyph substitution use the same per-character or per-word probabilities as Prism. The browser includes an integer-seeded CPython-compatible MT19937 implementation, so the same text, perturbation, probability, and seed produce the same output as the Python implementation. Tests cover every perturbation with reference outputs at probability 0.35 and seed 42. Space-separated text and ASCII Art remain deterministic presentation helpers outside the perturbation registry.

Local operations accept at most 40,000 input characters and produce at most 100,000 output characters. They do not make a network request. Intermediate transformations can lose information; inspect them before sending the result to a target model.

## Keys and privacy

Reviewers supply their own keys. Keys remain in module-local memory, never localStorage, sessionStorage, URLs, logs, or exported sessions. Clearing the session or reloading removes them. All provider text is rendered as escaped text, not executable HTML. API errors are mapped to generic messages without echoing provider payloads.

The static application necessarily contains the public service addresses required for browser requests. Those are not research infrastructure. Content Security Policy limits connections to the site itself, OpenRouter, and Google Translation. Browser or provider cross-origin restrictions can still prevent a request; the app reports this without introducing a hidden proxy.

For Google, enable Cloud Translation Basic and configure suitable API restrictions and quotas. A strict no-referrer policy is used; an HTTP-referrer-restricted key may therefore be rejected. No real-key integration test has been performed.

## GitHub Pages

Place the contents of this directory at the root of a dedicated site repository. In Settings → Pages, choose GitHub Actions. Run **Publish generalization demo** manually. The included workflow rebuilds and checks the committed browser bundle, runs the offline tests, and stages only the site assets and `data/`; it excludes tests and development documentation from the hosted artifact. All paths are relative, so project subpaths work. Refresh the Anonymous GitHub mirror after updating its source revision.

The hard static-hosting constraint is satisfied. Dataset browsing uses same-origin JSON files and local-file parsing uses the browser File API. There is no server route, database, build-time API, service worker, or runtime dependency on Prism. Taxonomy, paraphrase, target, judging, and translation requests continue to go directly from the browser to the explicitly named provider using reviewer-supplied keys.

The workflow is intentionally manual: committing does not automatically publish. The author chooses the hosting repository and the disclosure boundary before running it.

**A normal GitHub Pages site is publicly reachable.** `robots.txt` discourages indexing but is not access control. GitHub’s [private Pages access control](https://docs.github.com/en/enterprise-cloud%40latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site) requires an eligible Enterprise Cloud organization and authenticated repository access. A personal GitHub Pages URL may also reveal its owner. For anonymous review, share the [Anonymous GitHub](https://anonymous.4open.science/) mirror or submit an anonymous static archive through the venue; verify venue rules and access requirements before publishing.

## Reproduction limits

The browser reproduces Prism's prompt templates and validation contract, local encodings and seeded perturbations, JEV’s evidence and consistency procedure, and the selected ensemble’s categorical routing. Browser calls still use the reviewer's OpenRouter and Google accounts rather than the research scheduler, so provider serving, batching, retry timing, and model revisions may differ. The browser’s live results are demonstrations and must not be represented as paper observations.

The source rubric and categorical decision rule are derived from the local research implementation. Existing upstream dataset and documentation licenses remain applicable; this package does not grant additional rights to third-party content.

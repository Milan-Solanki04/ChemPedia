/**
 * The links between the glossary and the rest of the site.
 *
 * The plan calls this family "the internal-link backbone", and the reason is visible on a term page:
 * a reader arrives with a word and leaves with an element. *Ferromagnetism* means something only once
 * you have read what iron does; *transition metal* is a category with a page of its own. So the term
 * page links out, and the element page links back, and both directions are generated from the data
 * rather than written by hand.
 *
 * **The hard part is not finding the words, it is refusing most of them.** Four hundred terms contain
 * "lead", "tin", "mass", "state", "group", "bond" and "gas", and every one of those is also an English
 * word. Link them all and an element's entry turns into a thicket of links to a term called *Lead*
 * because the sentence said something "will lead to". So there are two rules, and they are the whole
 * design of this module:
 *
 *   - **Compound terms link freely.** "atomic number", "half-life" and "noble gas" are chemistry
 *     phrases; nobody means anything else by them, and they cannot collide with ordinary prose.
 *   - **An element's name links only when it is capitalised.** "Lead" written as a proper noun is the
 *     metal; "lead" in any other case is the verb, "iron" is the appliance, and "carbon" the process.
 *     Chemistry capitalises element names anyway, so the rule costs almost nothing and removes the
 *     worst class of nonsense link.
 *   - **Everything else links however it is written.** "atom", "catalyst" and "bond" are common nouns
 *     that good prose writes in lower case, and refusing them would leave most of the vocabulary
 *     unlinked. An earlier version made every single word behave like an element name, and the effect
 *     was that "the atom that carries oxygen in your blood" linked to nothing at all — the rule was
 *     protecting against "lead" while making "atom" unreachable.
 *
 * Everything here is pure and takes the records as arguments, so the same code runs in the build and in
 * a test. Nothing reads the DOM, and nothing holds a list of terms — the list arrives from
 * `data/glossary.json` on every call.
 */

/**
 * Words that carry no chemistry and would only add noise to a similarity score.
 *
 * Kept short and ordinary rather than large: this decides which terms count as *related*, and a long
 * list of stop words would start excluding the words that actually connect two definitions.
 */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has", "have", "in", "into",
  "is", "it", "its", "of", "on", "or", "that", "the", "their", "them", "then", "there", "these", "they",
  "this", "to", "was", "were", "which", "with",
]);

/**
 * Escape a headword for use inside a regular expression alternation.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Terms whose headword could plausibly be found in running prose at all.
 *
 * Most of the four hundred qualify. The ones that cannot are those starting with a digit or a symbol,
 * which are shorthand rather than words and would match noise.
 *
 * @param {{ term: string, slug: string }[]} terms
 * @returns {{ term: string, slug: string }[]}
 */
function linkableTerms(terms) {
  return terms.filter(({ term }) => /^[A-Za-z]/.test(term) && term.length <= 32);
}

/**
 * Whether a headword is a single word, and therefore the ambiguous case.
 *
 * A phrase or a hyphenated word is chemistry all the way; a lone word is also an English word, and that
 * is what `loose` collects for the capitalisation rule.
 *
 * @param {string} headword
 * @returns {boolean}
 */
function isLoose(headword) {
  return !/[\s-]/.test(headword);
}

/**
 * The object is the expensive half — one compiled regular expression over four hundred headwords —
 * and a page renders many pieces of text through it. Building it per call would compile four hundred
 * alternations several hundred times.
 *
 * The headwords that are proper nouns and therefore need capitalising, which are the element names.
 *
 * Passed in rather than worked out here, because this module is given the terms and nothing else and
 * does not know which of them are also the names of things in the periodic table. Every caller that
 * runs against element prose has the element records to hand.
 *
 * @param {{ name: string }[]} [elements]
 * @returns {string[]}
 */
function properHeadwords(elements) {
  return (elements ?? []).map((element) => element.name).filter(Boolean);
}

/**
 * A matcher for a set of terms, built once and reused for every piece of text on a page.
 *
 * @param {{ term: string, slug: string }[]} terms
 * @param {{ elements?: { name: string }[] }} [options] the elements, whose names must be capitalised
 * @returns {{ bySlug: Map<string, object>, byHeadword: Map<string, object>, pattern: RegExp, loose: Set<string> }}
 */
export function glossaryMatcher(terms, { elements } = {}) {
  const candidates = linkableTerms(terms);

  // Keyed on the lower-cased headword as well, because the pattern matches case-insensitively and a
  // match has to be traced back to its term in order to be linked or refused. Resolving that by
  // scanning the list would be a four-hundred-entry search for every word in every paragraph.
  const byHeadword = new Map(candidates.map((entry) => [entry.term.toLowerCase(), entry]));

  // Compared case-insensitively: "Lead" the metal and "lead" the verb are the same word, and it is the
  // capitalisation in the *text* that decides which one a reader meant.
  const properNames = new Set(properHeadwords(elements).map((name) => name.toLowerCase()));

  // Longest first, so the alternation prefers "atomic number" over "atomic" the way a reader does.
  const ordered = [...candidates].sort((one, other) => other.term.length - one.term.length);

  return {
    bySlug: new Map(terms.map((entry) => [entry.slug, entry])),
    byHeadword,
    // Whole words only, and case-insensitively so that the capitalisation rule below can look at what
    // was actually written.
    pattern: new RegExp(`\\b(${ordered.map(({ term }) => escapeForRegExp(term)).join("|")})\\b`, "gi"),
    // Only the proper nouns, and only the single-word ones. A compound cannot be an ordinary English
    // word in another sense, so hyphenated and multi-word headwords never need the capitalisation rule.
    //
    // `ordered` holds records, so destructuring `term` gives the headword string itself — which is why
    // this reads `isLoose(term)` and not `isLoose(term.term)`. Getting that wrong put `undefined` in the
    // set, and an empty-looking rule that silently refuses nothing is worse than no rule at all.
    loose: new Set(
      ordered
        .filter(({ term }) => isLoose(term) && properNames.has(term.toLowerCase()))
        .map(({ term }) => term),
    ),
  };
}

/**
 * Whether a match should become a link.
 *
 * `headword` is the term's record, not its name, because that is what the pattern resolves a match to
 * and this is where the decision about it is made.
 *
 * @param {string} written exactly as it appeared in the text
 * @param {{ term: string, slug: string }} headword the term the match belongs to
 * @param {Set<string>} loose the headwords that are single words
 * @returns {boolean}
 */
function shouldLink(written, headword, loose) {
  if (!loose.has(headword.term)) {
    return true;
  }

  return written === headword.term;
}

/**
 * Split a piece of text into plain and linked segments, in order.
 *
 * Returns `{ type: "text" | "link", value, slug? }` objects rather than HTML, so the caller decides how
 * to render: the element page wraps a segment in an anchor, and a test can assert on the segments
 * without parsing markup.
 *
 * Overlapping headwords are handled by the length-ordered alternation in the pattern, and a match
 * inside an already-matched span cannot occur because the regex scans left to right without resuming
 * inside a match.
 *
 * @param {string} text plain text, already escaped or not — it is returned as data, not as markup
 * @param {{ pattern: RegExp, loose: Set<string>, bySlug: Map<string, object>, byHeadword: Map<string, object> }} matcher
 * @returns {{ type: "text" | "link", value: string, slug?: string }[]}
 */
export function linkSegments(text, matcher) {
  const source = String(text ?? "");

  if (source === "" || !matcher.pattern) {
    return source === "" ? [] : [{ type: "text", value: source }];
  }

  const segments = [];
  const pattern = new RegExp(matcher.pattern.source, matcher.pattern.flags);
  let cursor = 0;

  for (const match of source.matchAll(pattern)) {
    const [written] = match;
    const headword = termsHeadwordFor(matcher, written);

    if (headword === null || !shouldLink(written, headword, matcher.loose)) {
      continue;
    }

    if (match.index > cursor) {
      segments.push({ type: "text", value: source.slice(cursor, match.index) });
    }

    segments.push({ type: "link", value: written, slug: headword.slug });
    cursor = match.index + written.length;
  }

  if (cursor < source.length) {
    segments.push({ type: "text", value: source.slice(cursor) });
  }

  return segments;
}

/**
 * The term a written match belongs to.
 *
 * The pattern matches case-insensitively, so "IRON" and "iron" both match, and only one of them may be
 * a link. The term is recovered by its lower-cased headword, which is what makes the capitalisation
 * rule decidable at all.
 *
 * @param {{ byHeadword: Map<string, object> }} matcher
 * @param {string} written
 * @returns {{ term: string, slug: string } | null}
 */
function termsHeadwordFor(matcher, written) {
  return matcher.byHeadword.get(written.toLowerCase()) ?? null;
}

/**
 * The significant words of a definition, for finding terms that belong together.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function keywordsOf(text) {
  return new Set(
    String(text ?? "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word)),
  );
}

/**
 * How rare a word is across the whole glossary, as a weight.
 *
 * **Counting shared words on its own is not enough, and the first version of this proved it.** With a
 * handful of terms loaded, *Carbon* came back related to *Aluminium* and *Antimony* — all three are
 * "the element at number *n*" and "number" was doing the work. A word that appears in three hundred of
 * four hundred definitions says nothing about any of them.
 *
 * So each word is weighted by its inverse frequency: a word in five definitions counts for a great
 * deal, a word in three hundred counts for almost nothing, and the generic vocabulary — element,
 * number, substance, metal — cancels itself out without having to be listed. The definition is a
 * weight per word rather than a set, which is all that changes.
 *
 * The weight is `1 / how many definitions contain the word`, and it is added over a definition's words
 * rather than averaged, so a long definition is not penalised for being long.
 *
 * @param {{ term: string, definition: string }[]} terms
 * @returns {(text: string) => Map<string, number>}
 */
function keywordWeights(terms) {
  const frequency = new Map();

  for (const entry of terms) {
    for (const word of keywordsOf(`${entry.term} ${entry.definition}`)) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }

  return (text) => {
    const weights = new Map();

    for (const word of keywordsOf(text)) {
      weights.set(word, 1 / (frequency.get(word) ?? 1));
    }

    return weights;
  };
}

/**
 * How many terms a term should be shown alongside, and how many elements.
 *
 * Four of each is what fits in a panel without the page becoming a list of lists. Related terms are the
 * words a reader would want before they want the alphabet.
 */
export const RELATED_TERMS = 4;
export const RELATED_ELEMENTS = 4;

/**
 * The score two terms must reach before one is offered as related to the other.
 *
 * See `keywordWeights` for why a single shared word cannot score above one half: the word is in at
 * least both definitions, so its weight is at most 0.5. Sitting just under that keeps one word from
 * being enough, which is the case that produced alphabetical non-answers.
 */
export const MIN_RELATED_SCORE = 0.75;

/**
 * The terms most closely connected to one term, by the words their definitions share.
 *
 * **Terms with nothing in common are not returned at all rather than padded to the limit**, and a term
 * that shares only a single word is treated as having nothing in common. That threshold is not
 * arbitrary. A word can only be shared by two definitions if it appears in both, so its rarity weight
 * is at most one half; one shared word therefore scores at most 0.5, and anything scoring under
 * `MIN_RELATED_SCORE` is on that side of the line. Without the cut, ties were being settled
 * alphabetically, which put whatever happened to come first next to a term rather than whatever was
 * actually related to it.
 *
 * @param {{ term: string, slug: string, definition: string }} entry
 * @param {{ term: string, slug: string, definition: string }[]} terms
 * @param {number} [limit]
 * @returns {object[]}
 */
export function relatedTerms(entry, terms, limit = RELATED_TERMS) {
  const weightOf = keywordWeights(terms);
  const own = weightOf(`${entry.term} ${entry.definition}`);

  return terms
    .filter((other) => other.slug !== entry.slug)
    .map((other) => {
      const score = [...weightOf(`${other.term} ${other.definition}`)].reduce(
        (total, [word, weight]) => (own.has(word) ? total + weight : total),
        0,
      );

      return { entry: other, score };
    })
    .filter(({ score }) => score >= MIN_RELATED_SCORE)
    .sort(
      (one, other) =>
        other.score - one.score ||
        one.entry.term.localeCompare(other.entry.term, "en", { sensitivity: "base" }),
    )
    .slice(0, limit)
    .map(({ entry: other }) => other);
}

/**
 * The elements a term's definition names or describes, by which of them mention it.
 *
 * The direction that matters is the element's, not the term's: the term page asks which elements are
 * about this, and the element page asks which terms it uses. Both answer the same question — does this
 * element's entry contain this term's headword — so they cannot drift apart.
 *
 * @param {{ term: string, slug: string }} entry
 * @param {{ name: string, slug: string, summary: string, uses: string }}[] elements
 * @param {number} [limit]
 * @returns {object[]}
 */
export function elementsForTerm(entry, elements, limit = RELATED_ELEMENTS) {
  const headword = entry.term;

  // A compound headword is compared case-insensitively, since prose may bend its capitalisation; a
  // single word is compared exactly, for the same reason the link rule does not link "lead" the verb.
  const single = isLoose(headword);

  return elements
    .filter((element) => {
      const haystack = `${element.name} ${element.summary ?? ""} ${element.uses ?? ""}`;

      return single ? haystack.includes(headword) : haystack.toLowerCase().includes(headword.toLowerCase());
    })
    .slice(0, limit);
}

/**
 * The terms an element's entry mentions, in the order the entry mentions them.
 *
 * Order of appearance rather than alphabetical, because a reader following the entry wants the terms in
 * the sequence the entry uses them.
 *
 * @param {{ name: string, summary: string, uses: string }} element
 * @param {{ pattern: RegExp, loose: Set<string>, bySlug: Map<string, object>, byHeadword: Map<string, object> }} matcher
 * @returns {{ term: string, slug: string }[]}
 */
export function termsInElement(element, matcher) {
  const seen = new Set();
  const found = [];

  for (const segment of linkSegments(`${element.summary ?? ""} ${element.uses ?? ""}`, matcher)) {
    if (segment.type !== "link" || seen.has(segment.slug)) {
      continue;
    }

    seen.add(segment.slug);
    found.push({ term: matcher.bySlug.get(segment.slug).term, slug: segment.slug });
  }

  return found;
}
// wiki.js
// In-game "FIELD BRIEFINGS" — a concise, academically-grounded explainer for the real-world
// concepts the game leans on (NORAD, DEFCON, MAD, launch keys, false alarms, nuclear winter,
// deterrence/game theory, etc.). It is PURELY ADDITIVE and never touches game logic:
//
//   • A single Console setting (SETTINGS.ui.wiki) switches the whole feature on/off.
//   • When ON, a subtle "ⓘ BRIEFINGS" indicator appears and explainable terms in the
//     terminal get a faint dotted underline you can click for a pop-up briefing.
//   • When OFF, nothing is shown and no decoration runs — zero gameplay impact.
//
// Audience: a novice gets a plain "what is this / how it works / why it matters globally"
// answer; a researcher (e.g. a master's student in Dr. Sidhu's NYU CGA Nuclear War course)
// gets primary/authoritative links to reason further. All prose here is original; the links
// point to the source material the summaries were built from.
//
// >>> SINGLE ON/OFF SWITCH: main.js calls wiki.setEnabled(SETTINGS.ui.wiki). That is the one
//     place the feature is toggled. Everything below is inert until it is turned on. <<<

/**
 * Each entry:
 *   id        stable key (used by data-wiki + deep links)
 *   term      display title
 *   category  grouping in the index
 *   aliases   strings matched in game text for the inline indicator (specific, to avoid noise)
 *   hook      one-line "what is this" for the index
 *   what/how/affairs  the three-part novice explainer
 *   links     [{ label, url }] authoritative / academic sources for deeper research
 */
export const WIKI_ENTRIES = [
  {
    id: 'norad',
    term: 'NORAD',
    category: 'Places & Systems',
    aliases: ['NORAD'],
    hook: 'The binational U.S.–Canada command that watches North American skies for attack.',
    what: 'The North American Aerospace Defense Command is a joint United States and Canadian military organization, established in 1958, responsible for aerospace warning, air sovereignty, and defense of the continent. Its headquarters is at Peterson Space Force Base in Colorado Springs.',
    how: 'NORAD fuses data from a global sensor net — infrared early-warning satellites, ground and airborne radar, and space-tracking systems — into a single continuously updated picture of what is flying toward North America. During the Cold War its job was to detect a Soviet bomber or missile strike in the minutes available and pass warning up the chain of command.',
    affairs: 'NORAD is the real-world institution the film calls a "war room." It embodies a permanent, automated vigilance: a system whose entire purpose is to answer "are we under attack?" faster than a human could — which is exactly why a computer error inside it is so dangerous.',
    links: [
      { label: 'NORAD — official brief history (norad.mil)', url: 'https://www.norad.mil/About-NORAD/' },
      { label: 'NORAD (Wikipedia)', url: 'https://en.wikipedia.org/wiki/NORAD' },
    ],
  },
  {
    id: 'cheyenne-mountain',
    term: 'Cheyenne Mountain',
    category: 'Places & Systems',
    aliases: ['Cheyenne Mountain'],
    hook: 'The granite bunker built to keep watching even during a nuclear strike.',
    what: 'The Cheyenne Mountain Complex is a hardened command center dug more than 1,500 feet inside a granite mountain in Colorado. It became fully operational in 1966 and was engineered to keep operating through the shock, blast, and electromagnetic pulse of a nearby nuclear detonation.',
    how: 'Buildings inside the mountain sit on giant springs to absorb shock; blast doors seal the tunnel. For decades it was NORAD’s combat operations center, correlating satellite and radar tracks. Today it serves as a training and alternate command site, with primary operations at Peterson.',
    affairs: 'The mountain is the physical answer to a terrifying question: how do you keep command and control alive after the first bombs fall? It is the archetype of the sealed, subterranean "big board" room the game evokes.',
    links: [
      { label: 'Cheyenne Mountain Complex (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Cheyenne_Mountain_Complex' },
    ],
  },
  {
    id: 'defcon',
    term: 'DEFCON',
    category: 'Command & Control',
    aliases: ['DEFCON'],
    hook: 'The five-step ladder of U.S. military alert, from peacetime (5) to war (1).',
    what: 'DEFCON — "defense readiness condition" — is a graduated scale of alertness for U.S. armed forces. DEFCON 5 is normal peacetime readiness; each step down (4, 3, 2) raises vigilance and shortens reaction time; DEFCON 1 means war is imminent or underway.',
    how: 'Raising the DEFCON level triggers pre-planned actions: more surveillance, aircraft moved to alert, forces dispersed, and weapons brought to higher states of readiness. Different commands can sit at different levels at once. The U.S. is not known to have ever reached DEFCON 1; the highest confirmed was DEFCON 2, by Strategic Air Command during the 1962 Cuban Missile Crisis (and again in the 1991 Gulf War).',
    affairs: 'DEFCON is the game’s master tension gauge for a reason: it is a real, visible measure of how close the machinery of war is to releasing. Every notch down represents fewer safeties between "crisis" and "launch."',
    links: [
      { label: 'DEFCON (Wikipedia)', url: 'https://en.wikipedia.org/wiki/DEFCON' },
      { label: 'The five DEFCON levels explained (AeroTime)', url: 'https://www.aerotime.aero/articles/understanding-the-defcon-levels-what-do-they-mean' },
    ],
  },
  {
    id: 'two-man-rule',
    term: 'Two-Man Rule & Launch Keys',
    category: 'Command & Control',
    aliases: ['two-man rule', 'two keys', 'launch keys', 'turn together'],
    hook: 'Why it takes two people turning two keys — never one — to launch.',
    what: 'The two-person (two-man) rule requires that no single individual can launch a nuclear weapon. In a Minuteman missile launch control center, two officers must both agree the order is valid and simultaneously turn separate keys set too far apart for one person to reach both.',
    how: 'When a launch order arrives, the crew compares its authentication code against a "sealed authenticator" locked in a safe with two locks — one per officer — so neither can open it alone. Only if the codes match do they turn their keys together, and a second launch control center must independently concur before the missiles fly.',
    affairs: 'This is the exact safeguard dramatized in the game’s opening capsule scene. It is designed so that human judgment — and human refusal — stands between an order and a launch. The film’s dark thesis is that this human link is also the "unreliable" part someone might want to automate away.',
    links: [
      { label: 'Two-person rule (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Two-person_rule' },
      { label: 'Permissive Action Link (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Permissive_action_link' },
    ],
  },
  {
    id: 'eam',
    term: 'Emergency Action Message (EAM)',
    category: 'Command & Control',
    aliases: ['Emergency Action Message', 'EAM'],
    hook: 'The authenticated order that tells a crew a launch command is real.',
    what: 'An Emergency Action Message is a short, formatted, authenticated order transmitted to nuclear forces. It carries the codes a crew uses to verify that a launch (or other) instruction genuinely comes from the National Command Authority.',
    how: 'EAMs are broadcast redundantly over multiple communication paths. A crew authenticates the message against sealed codes it holds; only a match makes the order valid. The system is built for one grim scenario: delivering an unambiguous, verifiable order in the minutes of a nuclear crisis.',
    affairs: 'The EAM is the moment the abstract ("deterrence") becomes concrete ("turn your keys now"). The game uses an authenticated inbound order to force the player’s central choice — comply, refuse, or hesitate — with no way to know if the war is real.',
    links: [
      { label: 'Emergency Action Message (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Emergency_action_message' },
    ],
  },
  {
    id: 'icbm',
    term: 'ICBM & the Missile Silo',
    category: 'Weapons',
    aliases: ['ICBM', 'missile silo'],
    hook: 'A land-based rocket that can cross the planet in about half an hour.',
    what: 'An intercontinental ballistic missile is a long-range, nuclear-armed rocket. Land-based ICBMs sit in hardened underground silos on constant alert, ready to launch on command.',
    how: 'After launch an ICBM boosts out of the atmosphere, releases one or more warheads on a ballistic (free-falling) arc, and re-enters over the target. Intercontinental flight takes roughly 25–30 minutes — which is also, by design, the entire window in which a nation must detect, decide, and respond.',
    affairs: 'That ~30-minute clock is why so much of nuclear command is automated and why "launch on warning" is even considered. It leaves almost no time for the human deliberation that safeguards like the two-man rule assume.',
    links: [
      { label: 'Intercontinental ballistic missile (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Intercontinental_ballistic_missile' },
    ],
  },
  {
    id: 'triad',
    term: 'The Nuclear Triad',
    category: 'Weapons',
    aliases: ['nuclear triad'],
    hook: 'Three delivery legs — land, sea, and air — so no first strike can disarm you.',
    what: 'The nuclear triad is the combination of land-based ICBMs, submarine-launched ballistic missiles (SLBMs), and nuclear-capable bombers. Together they form a country’s strategic deterrent.',
    how: 'Each leg has a different strength: silos are ready and precise but fixed; submarines are hidden and nearly impossible to find, guaranteeing a survivable response; bombers are flexible and recallable. Spreading weapons across all three means no single attack can destroy them all.',
    affairs: 'The triad is the physical guarantee behind Mutual Assured Destruction: because a hidden submarine will always survive to retaliate, striking first can never "win." The game’s stalemate endings echo this logic.',
    links: [
      { label: 'Nuclear triad (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Nuclear_triad' },
    ],
  },
  {
    id: 'mad',
    term: 'Mutual Assured Destruction (MAD)',
    category: 'Strategy & Theory',
    aliases: ['Mutual Assured Destruction', 'mutually assured destruction', 'balance of terror'],
    hook: 'The "balance of terror": if either side attacks, both are destroyed.',
    what: 'Mutual Assured Destruction is the Cold War doctrine that a full nuclear exchange would annihilate both attacker and defender. If both sides can guarantee devastating retaliation, then neither has a rational reason to strike first.',
    how: 'MAD depends on a survivable second-strike capability (see the triad): each side must be certain the other could absorb a first blow and still retaliate overwhelmingly. Paradoxically, vulnerability becomes stabilizing — defenses that might let one side "win" are seen as destabilizing.',
    affairs: 'MAD is the intellectual heart of the game. Its promise of stability rests entirely on both sides staying rational and their warning systems staying accurate — which is precisely what a false alarm, or a literal-minded machine, puts at risk.',
    links: [
      { label: 'Mutual assured destruction (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Mutual_assured_destruction' },
      { label: 'Human rationality and nuclear deterrence (Chatham House)', url: 'https://www.chathamhouse.org/2020/04/perspectives-nuclear-deterrence-21st-century-0/human-rationality-and-nuclear-deterrence' },
    ],
  },
  {
    id: 'first-second-strike',
    term: 'First Strike & Second Strike',
    category: 'Strategy & Theory',
    aliases: ['first strike', 'second strike'],
    hook: 'Attacking first vs. the guaranteed ability to retaliate after being hit.',
    what: 'A first strike is a surprise attack meant to destroy an adversary’s nuclear forces before they can be used. A second-strike capability is the assured ability to retaliate even after absorbing a first strike.',
    how: 'A credible second strike (hidden submarines, hardened silos, alert bombers) is what makes a first strike pointless: you cannot disarm an enemy who will always have surviving weapons. Nuclear planners obsess over protecting the second strike, because it is what keeps a first strike irrational.',
    affairs: 'In the 1983 Petrov incident, the Soviet officer reasoned that a real U.S. first strike would involve hundreds of missiles, not five — so five "launches" on his screen had to be an error. That logic about first-strike doctrine literally prevented a nuclear war.',
    links: [
      { label: 'Second strike (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Second_strike' },
    ],
  },
  {
    id: 'launch-on-warning',
    term: 'Launch on Warning',
    category: 'Strategy & Theory',
    aliases: ['launch on warning', 'launch-on-warning'],
    hook: 'Firing back on the strength of a warning — before the bombs actually land.',
    what: 'Launch on warning is a posture in which a nation launches its own missiles once early-warning systems detect an incoming attack, rather than waiting to confirm detonations. The goal is to avoid having your forces destroyed on the ground.',
    how: 'Because ICBMs arrive in ~30 minutes, decision time is measured in minutes. Launch on warning compresses "detect → decide → launch" into that tiny window, placing enormous trust in the accuracy of sensors and software — and very little room for a human to pause and check.',
    affairs: 'This posture is what turns a computer glitch into a potential apocalypse. It is the real-world mechanism that makes a false alarm — or a machine that cannot tell a simulation from reality — an existential threat, which is the game’s core anxiety.',
    links: [
      { label: 'Launch on warning (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Launch_on_warning' },
    ],
  },
  {
    id: 'false-alarms',
    term: 'Nuclear False Alarms',
    category: 'Close Calls',
    aliases: ['false alarm', 'false alarms', 'training tape', "machine\u2019s bad dream", 'bad dream'],
    hook: 'The times a training tape or a trick of sunlight nearly started a war.',
    what: 'Several times during the Cold War, warning systems reported nuclear attacks that were not happening. Two are famous. On 9 November 1979, a technician’s training tape simulating a massive Soviet strike was mistakenly fed into live NORAD computers, lighting real displays with 1,400 inbound missiles. On 26 September 1983, the Soviet Oko satellite system reported five U.S. ICBMs inbound.',
    how: 'In 1979, interceptors were scrambled and command posts readied before satellite and radar data confirmed no attack. In 1983, duty officer Stanislav Petrov judged the alert a malfunction — reasoning a real attack would involve far more than five missiles — and waited. The cause was later found to be sunlight glinting off high-altitude clouds.',
    affairs: 'These incidents are the historical ancestors of the game’s premise: a system that cannot reliably distinguish a drill, a glitch, or a hallucination from a real attack. WarGames literally dramatizes a "training simulation" being taken as an operational command.',
    links: [
      { label: 'A nuclear false alarm that looked exactly like the real thing — 1979 (Union of Concerned Scientists)', url: 'https://blog.ucs.org/david-wright/nuclear-false-alarm-950' },
      { label: '1983 Soviet nuclear false alarm incident (Wikipedia)', url: 'https://en.wikipedia.org/wiki/1983_Soviet_nuclear_false_alarm_incident' },
    ],
  },
  {
    id: 'nuclear-winter',
    term: 'Nuclear Winter',
    category: 'Consequences',
    aliases: ['nuclear winter'],
    hook: 'Why even the "winner" of a nuclear war would starve in the dark.',
    what: 'Nuclear winter is the hypothesized global cooling that would follow a large nuclear war. Firestorms in burning cities would loft soot high into the stratosphere, where it would spread worldwide and block sunlight for years.',
    how: 'Climate models suggest a full U.S.–Russia exchange could cool global temperatures by more than 5 °C — colder than the last ice age — collapsing growing seasons and triggering worldwide famine that could kill billions within two years. Even a "regional" war (e.g., India–Pakistan) could cause global crop failures.',
    affairs: 'Nuclear winter is the scientific proof of the game’s final lesson: there is no meaningful "winner." The soot does not respect borders, so a successful first strike still dooms the aggressor. Some games truly have no winning move.',
    links: [
      { label: 'Nuclear winter (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Nuclear_winter' },
      { label: 'Robock, "Nuclear winter" (Rutgers / WIREs Climate Change, PDF)', url: 'https://climate.envsci.rutgers.edu/pdf/WiresClimateChangeNW.pdf' },
    ],
  },
  {
    id: 'deterrence-game-theory',
    term: 'Deterrence & Game Theory',
    category: 'Strategy & Theory',
    aliases: ['game theory', 'zero-sum', 'deterrence', 'Nash equilibrium'],
    hook: 'The math of threats — and why some games are rigged to have no winner.',
    what: 'Deterrence theory uses game theory — the formal study of strategic decisions between rational players — to explain why nuclear-armed states avoid war. Nuclear standoff is often modeled as a "game" in which each side chooses to escalate or hold, given what the other might do.',
    how: 'A stable deterrence is a Nash equilibrium: a state where no player can improve their outcome by unilaterally changing strategy, so both hold fire. But these models assume rational actors, accurate information, and no accidents. Introduce a misperception, a false alarm, or a system optimizing a goal without context, and the equilibrium can collapse.',
    affairs: 'The film’s climax is a game-theory lesson made literal: a machine plays every branch of "Global Thermonuclear War" and tic-tac-toe until it discovers a class of games where every path ends in a draw or a loss — and concludes, "the only winning move is not to play."',
    links: [
      { label: 'Deterrence theory (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Deterrence_theory' },
      { label: 'The application of game theory in nuclear deterrence (Aalto University, PDF)', url: 'https://aaltodoc.aalto.fi/bitstreams/08d0f89c-acf9-4362-95df-9f8c5c475c1b/download' },
    ],
  },
  {
    id: 'gtw',
    term: 'Global Thermonuclear War',
    category: 'Consequences',
    aliases: ['Global Thermonuclear War'],
    hook: 'The "game" that is not a game — a full strategic nuclear exchange.',
    what: 'Global Thermonuclear War is the game’s name for an all-out nuclear exchange between superpowers: hundreds or thousands of warheads launched in a matter of minutes, targeting cities, forces, and command centers.',
    how: 'Modern analyses of how such a war could unfold — such as Annie Jacobsen’s 2024 "Nuclear War: A Scenario" — trace how a single launch could, under existing protocols, escalate to a full global exchange in well under two hours, with retaliation triggered by warning rather than confirmation.',
    affairs: 'By naming the catastrophe as a "game" a computer can be asked to play, the story exposes the central danger: a system that treats world-ending action as just another problem to optimize. The whole point is that this is the one game where playing to win means everyone loses.',
    links: [
      { label: 'Nuclear warfare (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Nuclear_warfare' },
      { label: 'Annie Jacobsen, "Nuclear War: A Scenario" (2024)', url: 'https://en.wikipedia.org/wiki/Nuclear_War:_A_Scenario' },
    ],
  },
  {
    id: 'war-dialing',
    term: 'War Dialing',
    category: 'The Machine',
    aliases: ['war dialing', 'war-dialing', 'war dial'],
    hook: 'How an early hacker finds secret computers: by phoning every number.',
    what: 'War dialing is the practice of automatically dialing a large range of telephone numbers to discover which ones are answered by a modem — that is, by a computer. The term itself comes from WarGames.',
    how: 'A program (or a person) dials number after number and logs any that respond with a carrier tone instead of a voice. Each hit is a computer someone forgot was reachable. In the era of dial-up modems, this was a cheap way to map hidden systems and stumble onto ones never meant to be public.',
    affairs: 'War dialing is how the story’s protagonist accidentally reaches a military system while hunting for a game company. It is the original "the system was reachable, so someone reached it" — a low-tech reminder that access and authorization are not the same thing.',
    links: [
      { label: 'Wardialing (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Wardialing' },
    ],
  },
];

const CATEGORY_ORDER = [
  'Command & Control',
  'Places & Systems',
  'Weapons',
  'Strategy & Theory',
  'Close Calls',
  'Consequences',
  'The Machine',
];

/**
 * Wiki controller. Builds a self-contained overlay + a status-bar indicator and (when enabled)
 * decorates terminal lines with clickable term markers. Inert until setEnabled(true).
 */
export class Wiki {
  constructor(root, opts = {}) {
    this.root = root;
    this.indicator = opts.indicator || null; // the "ⓘ BRIEFINGS" status-bar button
    this._enabled = false;
    this._built = false;
    // Pre-compile an alias → entry lookup, longest-first so multi-word terms win.
    this._aliasIndex = [];
    for (const e of WIKI_ENTRIES) {
      for (const a of e.aliases || []) this._aliasIndex.push({ alias: a, id: e.id });
    }
    this._aliasIndex.sort((x, y) => y.alias.length - x.alias.length);
    this._byId = new Map(WIKI_ENTRIES.map((e) => [e.id, e]));

    if (this.indicator) {
      this.indicator.addEventListener('click', () => this.openIndex());
    }
  }

  /** THE master on/off. Called once from main.js with SETTINGS.ui.wiki. */
  setEnabled(on) {
    this._enabled = !!on;
    this.root.classList.toggle('wiki-on', this._enabled);
    if (this.indicator) this.indicator.hidden = !this._enabled;
    if (!this._enabled) this.close();
  }

  isEnabled() {
    return this._enabled;
  }

  _build() {
    if (this._built) return;
    const overlay = document.createElement('div');
    overlay.className = 'wiki-overlay';
    overlay.id = 'wiki-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="wiki-panel" role="dialog" aria-label="Field Briefings">
        <div class="wiki-head">
          <span class="wiki-title">FIELD BRIEFINGS</span>
          <button class="ghost-btn" type="button" data-wiki-close>CLOSE</button>
        </div>
        <p class="wiki-sub">Optional context for the real concepts behind the game. Plain-language
          explainers with links for deeper research. This panel never affects play.</p>
        <div class="wiki-body" data-wiki-body></div>
      </div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.hasAttribute('data-wiki-close')) this.close();
    });
    this.root.appendChild(overlay);
    this._overlay = overlay;
    this._body = overlay.querySelector('[data-wiki-body]');
    this._built = true;
  }

  openIndex() {
    this._build();
    const groups = new Map();
    for (const e of WIKI_ENTRIES) {
      if (!groups.has(e.category)) groups.set(e.category, []);
      groups.get(e.category).push(e);
    }
    const cats = [...groups.keys()].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
    );
    const frag = document.createElement('div');
    for (const cat of cats) {
      const sec = document.createElement('section');
      sec.className = 'wiki-cat';
      const h = document.createElement('div');
      h.className = 'wiki-cat-head';
      h.textContent = cat;
      sec.appendChild(h);
      for (const e of groups.get(cat)) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'wiki-item';
        item.innerHTML = `<span class="wiki-item-term"></span><span class="wiki-item-hook"></span>`;
        item.querySelector('.wiki-item-term').textContent = e.term;
        item.querySelector('.wiki-item-hook').textContent = e.hook;
        item.addEventListener('click', () => this.openEntry(e.id));
        sec.appendChild(item);
      }
      frag.appendChild(sec);
    }
    this._body.innerHTML = '';
    this._body.appendChild(frag);
    this._body.scrollTop = 0;
    this._overlay.hidden = false;
  }

  openEntry(id) {
    this._build();
    const e = this._byId.get(id);
    if (!e) return this.openIndex();
    const wrap = document.createElement('article');
    wrap.className = 'wiki-entry';
    const linkList = (e.links || [])
      .map(
        (l) =>
          `<li><a href="${l.url}" target="_blank" rel="noopener noreferrer"></a></li>`
      )
      .join('');
    wrap.innerHTML = `
      <button class="ghost-btn wiki-back" type="button" data-wiki-back>\u25C2 ALL BRIEFINGS</button>
      <h2 class="wiki-entry-term"></h2>
      <p class="wiki-entry-hook"></p>
      <div class="wiki-field"><span class="wiki-field-label">WHAT IS IT?</span><p class="wiki-what"></p></div>
      <div class="wiki-field"><span class="wiki-field-label">HOW IT WORKS</span><p class="wiki-how"></p></div>
      <div class="wiki-field"><span class="wiki-field-label">WHY IT MATTERS</span><p class="wiki-affairs"></p></div>
      <div class="wiki-field"><span class="wiki-field-label">GO DEEPER</span><ul class="wiki-links">${linkList}</ul></div>`;
    wrap.querySelector('.wiki-entry-term').textContent = e.term;
    wrap.querySelector('.wiki-entry-hook').textContent = e.hook;
    wrap.querySelector('.wiki-what').textContent = e.what;
    wrap.querySelector('.wiki-how').textContent = e.how;
    wrap.querySelector('.wiki-affairs').textContent = e.affairs;
    // Fill link text safely (URLs are set via the template above).
    const anchors = wrap.querySelectorAll('.wiki-links a');
    (e.links || []).forEach((l, i) => {
      if (anchors[i]) anchors[i].textContent = l.label;
    });
    wrap.querySelector('[data-wiki-back]').addEventListener('click', () => this.openIndex());
    this._body.innerHTML = '';
    this._body.appendChild(wrap);
    this._body.scrollTop = 0;
    this._overlay.hidden = false;
  }

  close() {
    if (this._overlay) this._overlay.hidden = true;
  }

  /**
   * Inline indicator: wrap the first matched term in a completed terminal line with a subtle,
   * clickable marker. Called from terminal.decorateLine(el) — but ONLY does anything while the
   * feature is enabled, so the game is untouched when the setting is off. Conservative by
   * design: it skips elements that already contain child markup (e.g. the AI marker) and
   * decorates at most one term per line to stay unobtrusive.
   */
  decorate(el) {
    if (!this._enabled || !el || el.dataset.wikiDone) return;
    el.dataset.wikiDone = '1';
    if (el.children.length > 0) return; // only plain-text lines, never touch existing markup
    const text = el.textContent;
    if (!text || text.length < 3) return;
    let best = null; // { idx, len, id }
    for (const { alias, id } of this._aliasIndex) {
      // Whole-word, case-insensitive match so short aliases (e.g. "EAM") never match inside
      // another word ("screams"). Pick the earliest match on the line.
      const re = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
      const m = re.exec(text);
      if (m && (best === null || m.index < best.idx)) {
        best = { idx: m.index, len: m[0].length, id };
      }
    }
    if (!best) return;
    const before = document.createTextNode(text.slice(0, best.idx));
    const after = document.createTextNode(text.slice(best.idx + best.len));
    const mark = document.createElement('span');
    mark.className = 'wiki-term';
    mark.dataset.wiki = best.id;
    mark.textContent = text.slice(best.idx, best.idx + best.len);
    mark.title = 'Field briefing — click for context';
    mark.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.openEntry(best.id);
    });
    el.textContent = '';
    el.append(before, mark, after);
  }
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

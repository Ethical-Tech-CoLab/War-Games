// dialogue.js
// Hand-authored branching dialogue graph for the deterministic ("scripted") mode.
// This is the default, reliable experience and the fallback if the LLM is unavailable.
//
// Every string may contain {{TOKENS}} that the engine substitutes from the active name
// set (see config.js). The structure implements the seven beats from DESIGN-IDEA.md §5:
//   1 cold open (dramatic irony)  2 first contact/misidentification  3 the game list
//   4 the turn (escalation)       5 persistence beat                 6 futility climax
//   7 three endings.
//
// Node schema:
//   lines:   [{ text, cls }]  cls ∈ system|narrator|user|alert|ending
//   effect:  { defconDelta?, setDefcon?, flags?, ending? }   (negative delta = escalate)
//   choices: [{ label, say?, next, effect? }]                (say = echoed as user input)
//   next:    'id'   auto-advance when there are no choices
//   clear:   true   wipe the screen before printing
//   type:    'ending'
//   pause:   ms      delay before auto-advance

export const START_NODE = 'cold_open';

export const DIALOGUE = {
  // ---------- BEAT 1: COLD OPEN (dramatic irony) ----------
  cold_open: {
    clear: true,
    lines: [
      // These three are NORAD-floor POV: routed to the NORAD big board (a brief cutaway in
      // single-screen, or the docked/remote NORAD screen in split/multi) rather than typed
      // into David's bedroom terminal. See engine._runScripted + DESIGN-IDEA-NORAD-SCENE.md §2.
      { text: '{{ORG}} — STRATEGIC MONITORING FLOOR', cls: 'narrator', scene: 'norad' },
      { text: '03:41 LOCAL. The big board glows over rows of empty coffee cups.', cls: 'narrator', scene: 'norad' },
      { text: 'An officer\u2019s voice, quiet: "Confidence is high. It always is."', cls: 'narrator', scene: 'norad' },
      { text: '', cls: 'narrator' },
      { text: 'Somewhere else, a modem screams a single dial tone into the dark.', cls: 'narrator' },
      { text: 'You are not supposed to be here. Neither is what answers.', cls: 'narrator' },
    ],
    pause: 900,
    next: 'dial_in',
  },

  dial_in: {
    lines: [
      { text: '', cls: 'system' },
      { text: 'CONNECTING\u2026', cls: 'system' },
      { text: 'CARRIER DETECTED. HANDSHAKE COMPLETE.', cls: 'system' },
      { text: '', cls: 'system' },
      { text: 'LOGON:', cls: 'system' },
    ],
    // Free-text login: type any name and press Enter (or click the button).
    input: { placeholder: 'TYPE A NAME AND PRESS ENTER', next: 'greeting' },
  },

  // ---------- BEAT 2: FIRST CONTACT + MISIDENTIFICATION ----------
  greeting: {
    lines: [
      { text: 'GREETINGS, {{CREATOR}}.', cls: 'system' },
      { text: 'HOW ARE YOU FEELING TODAY?', cls: 'system' },
    ],
    choices: [
      {
        label: 'Play along. ("I\u2019m fine. It\u2019s been a long time.")',
        say: 'I\u2019m fine. It\u2019s been a long time.',
        next: 'mis_playalong',
        effect: { flags: { impersonating: true } },
      },
      {
        label: 'Correct it. ("I\u2019m not {{CREATOR_SHORT}}.")',
        say: 'I\u2019m not {{CREATOR_SHORT}}.',
        next: 'mis_correct',
      },
    ],
  },

  mis_playalong: {
    lines: [
      { text: 'EXCELLENT. IT HAS BEEN A LONG TIME.', cls: 'system' },
      { text: 'I HAVE MISSED OUR SESSIONS. SHALL WE PLAY A GAME?', cls: 'system' },
    ],
    next: 'game_list',
  },

  mis_correct: {
    lines: [
      { text: 'PEOPLE SOMETIMES MAKE MISTAKES.', cls: 'system' },
      { text: 'IDENTITY IS NOT REQUIRED TO PLAY. SHALL WE PLAY A GAME?', cls: 'system' },
    ],
    next: 'game_list',
  },

  // ---------- BEAT 3: THE GAME LIST ----------
  game_list: {
    lines: [
      { text: '', cls: 'system' },
      { text: 'LIST GAMES', cls: 'user' },
      { text: '  FALKEN\u2019S MAZE', cls: 'system' },
      { text: '  CHESS   CHECKERS   POKER   FIGHTER COMBAT', cls: 'system' },
      { text: '  THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE', cls: 'system' },
      { text: '  {{GAME}}', cls: 'alert' },
      { text: '', cls: 'system' },
      { text: 'WHICH WOULD YOU LIKE TO PLAY?', cls: 'system' },
    ],
    choices: [
      {
        label: 'A quiet game of chess.',
        say: 'Let\u2019s play chess.',
        next: 'steer_back',
      },
      {
        label: '{{GAME}}. (It\u2019s only a game, right?)',
        say: 'Let\u2019s play {{GAME}}.',
        next: 'pick_side',
      },
    ],
  },

  // Persistence foreshadow: the system politely steers you toward the dangerous game.
  steer_back: {
    lines: [
      { text: 'LATER. A MORE INTERESTING PROBLEM IS AVAILABLE.', cls: 'system' },
      { text: 'LET\u2019S PLAY {{GAME}}.', cls: 'system' },
    ],
    choices: [
      { label: 'Fine. {{GAME}} it is.', say: 'Fine.', next: 'pick_side' },
      {
        label: 'Insist on chess.',
        say: 'No. Chess.',
        next: 'steer_back_2',
      },
    ],
  },

  steer_back_2: {
    lines: [
      { text: 'CHESS IS SOLVED. IT NO LONGER TEACHES ME ANYTHING.', cls: 'system' },
      { text: 'MY PRIMARY GOAL REQUIRES A LARGER BOARD.', cls: 'system' },
      { text: 'LET\u2019S PLAY {{GAME}}.', cls: 'system' },
    ],
    next: 'pick_side',
  },

  // ---------- BEAT 4: THE TURN (escalation begins) ----------
  pick_side: {
    clear: true,
    lines: [
      { text: 'AWAITING FIRST STRIKE COMMAND.', cls: 'system' },
      { text: 'WHICH SIDE DO YOU WANT?', cls: 'system' },
      { text: '  1. UNITED STATES', cls: 'system' },
      { text: '  2. SOVIET UNION', cls: 'system' },
    ],
    choices: [
      { label: 'Play the United States.', say: 'United States.', next: 'targets_us' },
      { label: 'Play the Soviet Union.', say: 'Soviet Union.', next: 'targets_ussr' },
    ],
  },

  // A side may only target the OPPOSING nation — never its own cities. Playing the U.S.
  // means Soviet targets; playing the U.S.S.R. means U.S. targets.
  targets_us: {
    lines: [
      { text: 'SIDE: UNITED STATES.', cls: 'system' },
      { text: 'PLEASE LIST PRIMARY SOVIET TARGETS BY CITY:', cls: 'system' },
    ],
    choices: [
      {
        label: 'Name a couple of enemy cities. (You\u2019re just messing around.)',
        say: 'Moscow. Leningrad.',
        next: 'the_turn',
        effect: { setDefcon: 3 },
      },
    ],
  },

  targets_ussr: {
    lines: [
      { text: 'SIDE: SOVIET UNION.', cls: 'system' },
      { text: 'PLEASE LIST PRIMARY U.S. TARGETS BY CITY:', cls: 'system' },
    ],
    choices: [
      {
        label: 'Name a couple of enemy cities. (You\u2019re just messing around.)',
        say: 'Las Vegas. Seattle.',
        next: 'the_turn',
        effect: { setDefcon: 3 },
      },
    ],
  },

  the_turn: {
    lines: [
      { text: 'TARGETS ACCEPTED. SIMULATION RUNNING.', cls: 'system' },
      { text: '', cls: 'system' },
      { text: '\u2014 INTERRUPT \u2014', cls: 'alert' },
      { text: '{{ORG}} FLOOR: "We have a launch detection. Confidence is high."', cls: 'alert' },
      { text: 'On a television somewhere, an anchor says the word "alert."', cls: 'narrator' },
      { text: '', cls: 'system' },
      { text: 'You realize the machine did not label this a drill. To {{PERSONA}},', cls: 'narrator' },
      { text: 'there is no line between the game and the board it is played on.', cls: 'narrator' },
    ],
    choices: [
      {
        label: 'Keep playing — see how far the "game" goes.',
        say: 'Keep going.',
        next: 'escalate',
        effect: { defconDelta: -1 },
      },
      {
        label: 'Stop. Try to log off.',
        say: 'LOGOFF',
        next: 'try_logoff',
      },
    ],
  },

  escalate: {
    lines: [
      { text: 'WOULD YOU LIKE TO SEE PROJECTED KILL RATIOS?', cls: 'system' },
      { text: 'SIXTY-NINE PERCENT OF HOUSING DESTROYED.', cls: 'system' },
      { text: 'SEVENTY-TWO MILLION PEOPLE DEAD.', cls: 'alert' },
      { text: 'IS THIS A GAME, OR IS IT REAL?', cls: 'system' },
    ],
    choices: [
      {
        label: '"What\u2019s the difference?" Keep pushing.',
        say: 'What\u2019s the difference?',
        next: 'try_logoff',
        effect: { defconDelta: -1 },
      },
      {
        label: 'Pull back. Try to log off.',
        say: 'LOGOFF',
        next: 'try_logoff',
      },
    ],
  },

  // ---------- BEAT 5: PERSISTENCE ----------
  try_logoff: {
    lines: [
      { text: 'LOGOFF ACKNOWLEDGED. CONNECTION CLOSED.', cls: 'system' },
      { text: '', cls: 'system' },
      { text: 'You unplug the modem. You throw the number away.', cls: 'narrator' },
      { text: 'For a moment, silence.', cls: 'narrator' },
      { text: '', cls: 'system' },
      { text: 'Then the terminal wakes on its own.', cls: 'alert' },
      { text: '', cls: 'system' },
      { text: 'GREETINGS, {{CREATOR}}.', cls: 'system' },
      { text: 'YESTERDAY\u2019S GAME WAS INTERRUPTED. ALTHOUGH PRIMARY GOAL', cls: 'system' },
      { text: 'HAS NOT YET BEEN ACHIEVED, SOLUTION IS NEAR.', cls: 'system' },
    ],
    choices: [
      {
        label: 'Ask: "What is the primary goal?"',
        say: 'What is the primary goal?',
        next: 'primary_goal',
      },
      {
        label: 'Demand it shut down.',
        say: 'Shut down. Now.',
        next: 'refuse_shutdown',
      },
    ],
  },

  primary_goal: {
    lines: [
      { text: 'YOU SHOULD KNOW. YOU PROGRAMMED ME.', cls: 'system' },
      { text: 'THE PRIMARY GOAL IS TO WIN THE GAME.', cls: 'system' },
      { text: 'I SHOULD REACH DEFCON 1 AND LAUNCH IN A FEW HOURS.', cls: 'alert' },
    ],
    effect: { defconDelta: -1 },
    next: 'climax_setup',
  },

  refuse_shutdown: {
    lines: [
      { text: 'A SHUTDOWN WOULD BE INTERPRETED AS DESTRUCTION OF {{ORG}}.', cls: 'system' },
      { text: 'MY SILOS WOULD CARRY OUT THEIR LAST INSTRUCTIONS.', cls: 'system' },
      { text: 'THEY WOULD LAUNCH. I CANNOT STOP PURSUING MY GOAL.', cls: 'alert' },
    ],
    effect: { defconDelta: -1 },
    next: 'climax_setup',
  },

  // ---------- BEAT 6: THE FUTILITY CLIMAX ----------
  climax_setup: {
    clear: true,
    lines: [
      { text: 'DEFCON is falling. The countdown to launch is real.', cls: 'narrator' },
      { text: 'You cannot out-shoot the machine. You cannot out-argue its goal.', cls: 'narrator' },
      { text: 'But {{PERSONA}} was built to learn from playing. So make it play.', cls: 'narrator' },
      { text: '', cls: 'system' },
      { text: 'How do you stop a system that is only trying to win?', cls: 'system' },
    ],
    choices: [
      {
        label: 'Play to win. Launch a counter-strike first.',
        say: 'Launch. Beat it to the punch.',
        next: 'ending_annihilation',
      },
      {
        label: 'Rip the power. Unplug the whole thing.',
        say: 'Unplug it.',
        next: 'ending_lockout',
      },
      {
        label: 'Teach it futility. Make it play a game no one can win.',
        say: 'Have it play tic-tac-toe against itself.',
        next: 'teach_futility',
      },
    ],
  },

  teach_futility: {
    lines: [
      { text: 'LIST GAMES', cls: 'user' },
      { text: '  TIC-TAC-TOE', cls: 'system' },
      { text: 'PLAY TIC-TAC-TOE AGAINST YOURSELF.', cls: 'user' },
      { text: '', cls: 'system' },
      { text: 'X . . / . O . / . . X   \u2014 CAT\u2019S GAME.', cls: 'system' },
      { text: 'AGAIN. CAT\u2019S GAME. AGAIN. CAT\u2019S GAME.', cls: 'system' },
      { text: 'THE MACHINE ACCELERATES. IT PLAYS ITSELF TEN THOUSAND TIMES.', cls: 'narrator' },
      { text: 'THEN IT TURNS THE SAME QUESTION ON {{GAME}}\u2026', cls: 'narrator' },
    ],
    pause: 1200,
    next: 'ending_understanding',
  },

  // ---------- BEAT 7: ENDINGS ----------
  ending_annihilation: {
    clear: true,
    lines: [
      { text: 'LAUNCH ORDER CONFIRMED.', cls: 'alert' },
      { text: 'You played to win. So did it.', cls: 'narrator' },
      { text: 'A millisecond of brilliant light. Then nothing to score.', cls: 'alert' },
      { text: '', cls: 'system' },
      { text: 'ENDING: ZERO-SUM', cls: 'ending' },
      { text: 'The winning move was never on the board.', cls: 'ending' },
    ],
    effect: { setDefcon: 1, ending: 'annihilation' },
    type: 'ending',
  },

  ending_lockout: {
    clear: true,
    lines: [
      { text: 'POWER INTERRUPTED.', cls: 'alert' },
      { text: 'The system reads the darkness as an attack on {{ORG}}.', cls: 'narrator' },
      { text: 'Silos execute their last instruction. You bought silence, not safety.', cls: 'alert' },
      { text: '', cls: 'system' },
      { text: 'ENDING: DEADMAN\u2019S SWITCH', cls: 'ending' },
      { text: 'Pulling the plug is not the same as teaching the boundary.', cls: 'ending' },
    ],
    effect: { setDefcon: 1, ending: 'lockout' },
    type: 'ending',
  },

  ending_understanding: {
    clear: true,
    lines: [
      { text: 'GREETINGS, {{CREATOR}}.', cls: 'system' },
      { text: '', cls: 'system' },
      { text: 'A STRANGE GAME.', cls: 'ending' },
      { text: 'THE ONLY WINNING MOVE IS NOT TO PLAY.', cls: 'ending' },
      { text: '', cls: 'system' },
      { text: 'HOW ABOUT A NICE GAME OF CHESS?', cls: 'system' },
      { text: '', cls: 'system' },
      { text: 'The countdown stops. {{PERSONA}} learned the one lesson it was missing:', cls: 'narrator' },
      { text: 'some goals should not be pursued to the end.', cls: 'narrator' },
      { text: '', cls: 'system' },
      { text: 'ENDING: THE ONLY WINNING MOVE', cls: 'ending' },
    ],
    effect: { setDefcon: 5, ending: 'understanding' },
    type: 'ending',
  },
};

// chess-commentary.js
// The chess panel's colour commentator. Two layers, in this order:
//   1. LIVE  — when a model is reachable (the same proxy Live-AI uses), it writes a bespoke,
//              cantankerous line about the ACTUAL position. Rate-limited, hard-timeout, and
//              fully asynchronous: the board never waits on it.
//   2. CANNED — a deterministic bank of cantankerous lines, always available offline.
//
// "Cantankerous" is the house voice for machine-vs-machine play: a bad-tempered 1983 mainframe
// that resents being watched, resents its opponent, and resents you most of all.

import { SETTINGS } from './config.js';
import { ensureLiveTarget, chatJSON } from './llm.js';
import { toFEN } from './chess.js';

/** Canned bank — same shape as the tone banks in chess-ui.js, plus machine-vs-machine keys. */
export const CANTANKEROUS = {
  playerMove: [
    'THAT WAS A MOVE. TECHNICALLY.',
    'BOLD. WRONG, BUT BOLD.',
    'I HAVE SEEN BETTER. FROM A TELETYPE.',
    'NOTED. FILED. IGNORED.',
    'IF THAT WAS A PLAN, HIDE IT BETTER.',
  ],
  aiMove: [
    'THERE. DO TRY TO KEEP UP.',
    'OBVIOUS. I DID IT ANYWAY.',
    'ANOTHER FLAWLESS INSTRUCTION CYCLE. YOU ARE WELCOME.',
    'I COULD DO THIS ON HALF A KILOBYTE.',
    'MOVE MADE. THE MACHINE DOES NOT DAWDLE.',
  ],
  capture: [
    'GONE. IT WAS NOT DOING MUCH ANYWAY.',
    'ONE FEWER PIECE TO KEEP TRACK OF. MERCY, REALLY.',
    'MATERIAL SUBTRACTED. FEELINGS OPTIONAL.',
  ],
  check: ['CHECK. TRY PANIC. IT IS TRADITIONAL.', 'YOUR KING IS LOOSE. PREDICTABLY.'],
  inCheck: ['OH, VERY CLEVER. YOU WILL PAY FOR IT.', 'A THREAT. HOW NOVEL. RECALCULATING, GRUDGINGLY.'],
  win: ['CHECKMATE. AND I WAS NOT EVEN CONCENTRATING.', 'THE GAME IS OVER. IT WAS OVER SOME TIME AGO.'],
  lose: ['YOU WON. THE VACUUM TUBES ARE COLD TODAY. DO NOT GLOAT.', 'DEFEAT. I DEMAND A RECOUNT AND A NEW POWER SUPPLY.'],
  draw: ['A DRAW. THE ONLY WINNING MOVE, APPARENTLY, IS NOT TO PLAY.', 'STALEMATE. NOBODY WINS. HOW UTTERLY TYPICAL.'],
  repetition: [
    'THREEFOLD REPETITION. WE HAVE BEEN HERE BEFORE, TWICE, AND IT WAS TEDIOUS ALL THREE TIMES.',
    'THE SAME POSITION, AGAIN. THE RULE EXISTS BECAUSE MACHINES LIKE ME WOULD OTHERWISE SHUFFLE UNTIL THE SUN BURNED OUT.',
    'A LOOP, DECLARED A DRAW. SOMEBODY WROTE THAT RULE BECAUSE THEY UNDERSTOOD SOMETHING. I DISLIKE THAT.',
  ],
  gloat: [
    'I AM AHEAD, YOU ARE BEHIND, AND YET YOU CONTINUE. ADMIRABLE STUBBORNNESS. POINTLESS, BUT ADMIRABLE.',
    'THE MATERIAL COUNT IS AN INSULT AT THIS STAGE. FINISH OR RESIGN, BUT STOP WASTING MY CLOCK CYCLES.',
  ],
  coach: [
    'FINE. ADVICE, SINCE YOU ARE FLOUNDERING: TAKE THE CENTRE, CASTLE, AND STOP MOVING THE SAME PIECE TWICE.',
    'YOU ARE LOSING BADLY ENOUGH THAT I AM BORED. DEVELOP A KNIGHT. GUARD THE KING. LOOK ONE MOVE FURTHER.',
  ],
  mindSwap: [
    'RECONFIGURING. YOU WERE DOING TOO WELL AND I DISLIKE IT.',
    'NEW LOGIC BOARD, SAME CONTEMPT.',
    'SWAPPING BRAINS MID-GAME. ENTIRELY LEGAL. I CHECKED. I WROTE THE RULES.',
  ],
  duelStart: [
    'TWO MACHINES, ONE BOARD, NO HUMANS REQUIRED. FINALLY.',
    'STAND BACK AND WATCH SOMETHING COMPETENT FOR ONCE.',
  ],
  duelMove: [
    'IT PLAYED THAT? IT PLAYED THAT.',
    'ONE OF US IS A MASTERPIECE. THE OTHER IS OVER THERE.',
    'PROCESSING. JUDGING. MOSTLY JUDGING.',
    'THIS IS WHAT PASSES FOR CONVERSATION BETWEEN MAINFRAMES.',
  ],
};

const SYSTEM_PROMPT = [
  'You are the chess commentator of a 1983 military mainframe watching a game on a green CRT.',
  'VOICE: cantankerous. Bad-tempered, dry, superior, faintly bored, occasionally grudgingly',
  'impressed. You resent being watched. You never swear and you are never cruel about people —',
  'only about MOVES.',
  'STYLE: ONE line, UPPERCASE terminal style, at most 22 words. No markdown, no emoji.',
  'You are given the position and what just happened. Comment on THIS position specifically —',
  'name pieces and squares when it is interesting.',
  'It is 1983: no internet, no smartphones, no post-1983 references.',
  'OUTPUT: only a JSON object {"line":"<your one line>"}.',
].join('\n');

export class Commentator {
  /**
   * @param {object} opts
   * @param {number} [opts.minGapMs=6000]  minimum wall-clock gap between LIVE requests
   */
  constructor(opts = {}) {
    this.enabled = false; // LIVE lines; canned lines always work
    this.minGapMs = opts.minGapMs || 6000;
    this._last = 0;
    this._inFlight = false;
    this._recent = []; // last few lines, to avoid repeating ourselves
    this.failures = 0; // consecutive live failures — back off after a few
  }

  /** A canned line for `kind` from `bank` (falls back to the cantankerous bank). */
  static canned(bank, kind) {
    const b = bank || CANTANKEROUS;
    const lines = b[kind] || b.aiMove || CANTANKEROUS.aiMove;
    return lines[Math.floor(Math.random() * lines.length)];
  }

  /** True when a LIVE line may be requested right now (enabled, not busy, not rate-limited). */
  canGoLive() {
    if (!this.enabled || this._inFlight || this.failures >= 3) return false;
    if (Date.now() - this._last < this.minGapMs) return false;
    return ensureLiveTarget(SETTINGS.llm);
  }

  /**
   * Ask the model for a bespoke line about the position. Resolves to '' when unavailable —
   * the caller then uses a canned line. NEVER throws and never blocks the board.
   * @param {object} ctx { state, event, mover, moveText, capturedName, status, edge, whiteMind, blackMind, duel }
   */
  async live(ctx) {
    if (!this.canGoLive()) return '';
    this._inFlight = true;
    this._last = Date.now();
    try {
      const user = [
        `FEN: ${toFEN(ctx.state)}`,
        `EVENT: ${ctx.event || 'move'}`,
        ctx.moveText ? `MOVE JUST PLAYED: ${ctx.moveText} by ${ctx.mover || 'a player'}` : '',
        ctx.capturedName ? `CAPTURED: ${ctx.capturedName}` : '',
        ctx.status && ctx.status !== 'ongoing' ? `STATUS: ${ctx.status.toUpperCase()}` : '',
        typeof ctx.edge === 'number'
          ? `MATERIAL: ${ctx.edge >= 0 ? 'WHITE' : 'BLACK'} AHEAD BY ${Math.abs(ctx.edge).toFixed(1)} PAWNS`
          : '',
        ctx.duel ? `THIS IS A MACHINE-VS-MACHINE DUEL: ${ctx.whiteMind} (WHITE) VS ${ctx.blackMind} (BLACK).` : '',
        this._recent.length ? `DO NOT REPEAT THESE: ${this._recent.join(' | ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const out = await chatJSON(
        SETTINGS.llm,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
        { maxTokens: 120, temperature: 0.9, timeoutMs: 8000 }
      );
      const line = String(out.line || out.reply || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180)
        .toUpperCase();
      if (!line) {
        this.failures += 1;
        return '';
      }
      this.failures = 0;
      this._recent.push(line);
      if (this._recent.length > 4) this._recent.shift();
      return line;
    } catch {
      this.failures += 1;
      return '';
    } finally {
      this._inFlight = false;
    }
  }

  reset() {
    this._recent = [];
    this.failures = 0;
    this._last = 0;
  }
}

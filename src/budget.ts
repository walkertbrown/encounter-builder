// The encounter as text, one line per character or creature, and the XP math from the
// encounter-building rules in the SRD 5.2.1 (CC BY 4.0), or Pathfinder 2e's from GM Core
// (a `system pf2e` line). Pure functions, testable without Obsidian.
//
//   party 4x level 3
//   Aria level 4 hp 31 ac 16
//   3x [[Goblin]]
//   Ogre cr 2
//   Bandit captain xp 450

export type System = '5e' | 'pf2e';

export type Difficulty = 'none' | 'trivial' | 'low' | 'moderate' | 'high' | 'severe' | 'extreme' | 'over';

export interface Line {
	index: number; // line number inside the block
	kind: 'party' | 'pc' | 'creature';
	count: number;
	name: string;
	link?: string; // the target inside [[ ]], without alias
	level?: number; // a character's, or in Pathfinder a creature's
	cr?: string; // as written: "2", "1/4"
	xp?: number;
}

export interface Budget {
	low: number;
	moderate: number;
	high: number;
}

/** One threshold on the meter: the most XP an encounter can be and still be `key`. */
export interface Step {
	key: Difficulty;
	label: string;
	xp: number;
}

// XP Budget per Character, by level (SRD 5.2.1, "Combat Encounters").
const BUDGET: [number, number, number][] = [
	[50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100],
	[600, 1000, 1400], [750, 1300, 1700], [1000, 1700, 2100], [1300, 2000, 2600], [1600, 2300, 3100],
	[1900, 2900, 4100], [2200, 3700, 4700], [2600, 4200, 5400], [2900, 4900, 6200], [3300, 5400, 7800],
	[3800, 6100, 9800], [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000],
];

// Experience Points by Challenge Rating (SRD 5.2.1, "Monsters"). CR 0 is 0 or 10; 10 is used.
const XP: Record<string, number> = {
	'0': 10, '1/8': 25, '1/4': 50, '1/2': 100,
	'1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
	'11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000,
	'19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000, '26': 90000,
	'27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

// "1/4", "0.25", ".25", 0.25, "CR 2", "2 (450 XP)" all read as a CR.
export function normalCr(v: unknown): string | undefined {
	if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
	if (typeof v !== 'string') return undefined;
	const s = v.trim().replace(/^cr\s*/i, '');
	const m = /^(\d+\/\d+|\d*\.\d+|\d+)/.exec(s);
	if (!m) return undefined;
	const t = m[1]!;
	const frac: Record<string, string> = { '0.125': '1/8', '.125': '1/8', '0.25': '1/4', '.25': '1/4', '0.5': '1/2', '.5': '1/2' };
	const cr = frac[t] ?? (t.includes('/') ? t : String(parseInt(t, 10)));
	return cr in XP ? cr : undefined;
}

export function crXp(cr: string | undefined): number | undefined {
	return cr === undefined ? undefined : XP[cr];
}

// CR as a number, for comparing with levels.
export function crValue(cr: string): number {
	const [a, b] = cr.split('/');
	return b ? Number(a) / Number(b) : Number(a);
}

export function budgetFor(levels: number[]): Budget {
	const b: Budget = { low: 0, moderate: 0, high: 0 };
	for (const l of levels) {
		const row = BUDGET[Math.min(20, Math.max(1, Math.round(l))) - 1]!;
		b.low += row[0];
		b.moderate += row[1];
		b.high += row[2];
	}
	return b;
}

// Pathfinder 2e, GM Core pp. 75-76 (Archives of Nethys, read 28 Oct 2026). Creature XP by its level less the party
// level, -4 to +4; the budget is for four characters, moved by the adjustment for each one more or fewer.
const PF2E_XP: Record<string, number> = { '-4': 10, '-3': 15, '-2': 20, '-1': 30, '0': 40, '1': 60, '2': 80, '3': 120, '4': 160 };
const PF2E_BUDGET: [Difficulty, string, number, number][] = [
	['trivial', 'Trivial', 40, 10],
	['low', 'Low', 60, 20],
	['moderate', 'Moderate', 80, 20],
	['severe', 'Severe', 120, 30],
	['extreme', 'Extreme', 160, 40],
];

/** A creature's XP in Pathfinder, by its level and the party's; undefined off GM Core's table. */
export function pf2eXp(level: number, partyLevel: number): number | undefined {
	return PF2E_XP[String(level - partyLevel)];
}

export function pf2eSteps(characters: number): Step[] {
	let last = 0;
	return PF2E_BUDGET.map(([key, label, xp, adjust]) => {
		// a very small party can push a step under the one before it; it never drops below
		last = Math.max(last, xp + (characters - 4) * adjust);
		return { key, label, xp: last };
	});
}

export function steps5e(b: Budget): Step[] {
	return [
		{ key: 'low', label: 'Low', xp: b.low },
		{ key: 'moderate', label: 'Moderate', xp: b.moderate },
		{ key: 'high', label: 'High', xp: b.high },
	];
}

// The party level: what every character is, or else the average rounded down.
export function partyLevel(levels: number[]): number {
	return Math.floor(levels.reduce((a, b) => a + b, 0) / levels.length);
}

export function grade(total: number, steps: Step[]): Difficulty {
	if (total <= 0 || !steps.length || steps[steps.length - 1]!.xp === 0) return 'none';
	return steps.find((s) => total <= s.xp)?.key ?? 'over';
}

export function difficulty(total: number, b: Budget): Difficulty {
	if (total <= 0 || b.high === 0) return 'none';
	if (total <= b.low) return 'low';
	if (total <= b.moderate) return 'moderate';
	if (total <= b.high) return 'high';
	return 'over';
}

const COUNT = /^(?:(\d+)x|x(\d+))$/i;
const SYSTEM = /^\s*(?:[-*+]\s+)?(?:system|rules)\b\s*:?\s*(.*?)\s*$/i;

// The rules named by one `system pf2e` (or `system 5e`) line; undefined for any other line.
function readSystem(raw: string): System | undefined {
	const m = SYSTEM.exec(raw);
	const v = m?.[1]!.toLowerCase().replace(/[^a-z0-9.]/g, '');
	if (v === undefined) return undefined;
	if (/^(pf2e?|p2e|pathfinder(2e?|second(edition)?)?)$/.test(v)) return 'pf2e';
	if (/^(5e|5\.5e|dnd|dnd5e|dd5e|dnd2024|2024|srd|srd5\.2(\.1)?)$/.test(v)) return '5e';
	return undefined;
}

/** The rules a block names, if any. */
export function systemLine(src: string): System | undefined {
	for (const raw of src.split('\n')) {
		const s = readSystem(raw);
		if (s) return s;
	}
	return undefined;
}

// In Pathfinder every line that isn't the party or marked pc is a creature, and its level is the creature's.
export function parseLine(raw: string, index = 0, system: System = '5e'): Line | null {
	let rest = raw.trim().replace(/^[-*+]\s+/, '');
	if (!rest || rest.startsWith('%%') || rest.startsWith('//') || readSystem(rest)) return null;
	let link: string | undefined;
	let alias: string | undefined;
	rest = rest.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/, (_m, l: string, a?: string) => {
		link = l.trim();
		alias = a?.trim();
		return ' ';
	});
	rest = rest.replace(/\([^)]*\)/g, ' ');
	const tokens = rest.split(/\s+/).filter(Boolean);
	const name: string[] = [];
	let count = 1;
	let party = false;
	let player = false;
	let level: number | undefined;
	let cr: string | undefined;
	let xp: number | undefined;
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i]!;
		const low = t.toLowerCase();
		const next = tokens[i + 1];
		let m: RegExpExecArray | null;
		if ((m = COUNT.exec(t))) count = parseInt(m[1] ?? m[2]!, 10);
		else if (i === 0 && low === 'party') party = true;
		else if ((i === 0 || (i === 1 && party)) && /^\d+$/.test(t) && tokens.length > 1) count = parseInt(t, 10);
		else if (low === 'player' || low === 'pc') player = true;
		else if (/^(level|lvl|lv)$/.test(low) && next && /^[-−]?\d+$/.test(next)) {
			level = parseInt(next.replace('−', '-'), 10);
			i++;
		} else if ((m = /^(?:level|lvl|lv)(\d+)$/.exec(low))) level = parseInt(m[1]!, 10);
		else if (low === 'cr' && next && normalCr(next) !== undefined) {
			cr = normalCr(next);
			i++;
		} else if (low === 'xp' && next && /^[\d,]+$/.test(next)) {
			xp = parseInt(next.replace(/,/g, ''), 10);
			i++;
		} else if (/^(hp|ac|init|mod)$/.test(low) && next && /^[+-]?\d+(\/\d+)?$/.test(next)) i++;
		else name.push(t);
	}
	const kind: Line['kind'] = party ? 'party' : player || (level !== undefined && system === '5e') ? 'pc' : 'creature';
	const line: Line = {
		index,
		kind,
		count: Math.max(1, Math.min(count, 99)),
		name: name.join(' ') || alias || (link ? link.split('#')[0]!.split('/').pop()!.replace(/\.md$/i, '') : ''),
	};
	if (!line.name) {
		if (kind === 'creature') return null;
		line.name = kind === 'party' ? 'Party' : 'Character';
	}
	if (link) line.link = link;
	if (level !== undefined) line.level = level;
	if (cr !== undefined) line.cr = cr;
	if (xp !== undefined) line.xp = xp;
	return line;
}

export function parseBlock(src: string, system: System = systemLine(src) ?? '5e'): Line[] {
	const out: Line[] = [];
	src.split('\n').forEach((raw, i) => {
		const l = parseLine(raw, i, system);
		if (l) out.push(l);
	});
	return out;
}

export interface Creature extends Line {
	each?: number; // XP for one; undefined when the CR (or Pathfinder level) is not known
}

export interface Analysis {
	system: System;
	levels: number[]; // one per character
	steps: Step[]; // the budget's thresholds, lowest first; empty with no party
	creatures: Creature[];
	total: number;
	difficulty: Difficulty;
	warnings: string[];
}

const fmt = (n: number) => n.toLocaleString('en-US');

// The numbers for one encounter. `rated` gives the rating from a creature's note when the line has none: its CR,
// or in Pathfinder its level.
export function analyse(lines: Line[], rated: (l: Line) => string | undefined = () => undefined, system: System = '5e'): Analysis {
	const levels: number[] = [];
	for (const l of lines) {
		if (l.kind === 'creature') continue;
		for (let i = 0; i < l.count; i++) levels.push(l.level ?? 1);
	}
	return system === 'pf2e' ? analysePf2e(lines, levels, rated) : analyse5e(lines, levels, rated);
}

function analyse5e(lines: Line[], levels: number[], crOf: (l: Line) => string | undefined): Analysis {
	const creatures: Creature[] = lines
		.filter((l) => l.kind === 'creature')
		.map((l) => {
			const cr = l.cr ?? crOf(l);
			const c: Creature = { ...l };
			if (cr !== undefined) c.cr = cr;
			const each = l.xp ?? crXp(cr);
			if (each !== undefined) c.each = each;
			return c;
		});
	const total = creatures.reduce((s, c) => s + (c.each ?? 0) * c.count, 0);
	const steps = levels.length ? steps5e(budgetFor(levels)) : [];
	const warnings: string[] = [];
	const n = creatures.reduce((s, c) => s + c.count, 0);
	if (!levels.length) warnings.push('Add the party to see the budget: party 4x level 3, or one line per character like Aria level 3.');
	for (const c of creatures) {
		if (c.each === undefined) warnings.push(`No CR for ${c.name}. Add cr 2 (or xp 450) to the line, or a cr field to its note.`);
	}
	if (levels.length && n > levels.length * 2) {
		const low = levels.some((l) => l <= 2);
		warnings.push(
			`${n} creatures for ${levels.length} characters. Past two each, a lucky streak hits hard: use some that go down fast${low ? ', above all at level 1 or 2' : ''}.`,
		);
	}
	if (levels.length) {
		const pl = Math.max(1, partyLevel(levels));
		for (const c of creatures) {
			if (c.cr !== undefined && crValue(c.cr) > pl) {
				warnings.push(`${c.name} is CR ${c.cr}, above the party's level ${pl}. One action could take a character out.`);
			}
		}
	}
	warnings.push(...juggling(creatures));
	const zero = creatures.filter((c) => c.cr === '0').reduce((s, c) => s + c.count, 0);
	if (zero > 4) warnings.push(`${zero} CR 0 creatures. A swarm runs easier than many tiny ones.`);
	return { system: '5e', levels, steps, creatures, total, difficulty: grade(total, steps), warnings };
}

function analysePf2e(lines: Line[], levels: number[], levelOf: (l: Line) => string | undefined): Analysis {
	const pl = levels.length ? partyLevel(levels) : undefined;
	const warnings: string[] = [];
	if (pl === undefined) warnings.push('Add the party to see the budget: party 4x level 3, or one line per character like Aria level 3 pc.');
	const creatures: Creature[] = lines
		.filter((l) => l.kind === 'creature')
		.map((l) => {
			const c: Creature = { ...l };
			const noted = l.level === undefined ? /^\s*[-−]?\d+/.exec(levelOf(l) ?? '')?.[0] : undefined;
			if (noted !== undefined) c.level = parseInt(noted.replace('−', '-'), 10);
			const each = l.xp ?? (c.level !== undefined && pl !== undefined ? pf2eXp(c.level, pl) : undefined);
			if (each !== undefined) c.each = each;
			if (l.xp !== undefined || pl === undefined) return c;
			if (c.level === undefined) warnings.push(`No level for ${c.name}. Add level 2 (or xp 40) to the line, or a level field to its note.`);
			else if (each === undefined) {
				const way = c.level > pl ? 'above' : 'below';
				warnings.push(`${c.name} is level ${c.level}, more than 4 ${way} the party's level ${pl}. GM Core's XP table runs from 4 below to 4 above; give it an xp to count it.`);
			}
			return c;
		});
	if (pl !== undefined && new Set(levels).size > 1) warnings.push(`The characters are different levels. The budget uses party level ${pl}.`);
	warnings.push(...juggling(creatures));
	const total = creatures.reduce((s, c) => s + (c.each ?? 0) * c.count, 0);
	const steps = levels.length ? pf2eSteps(levels.length) : [];
	return { system: 'pf2e', levels, steps, creatures, total, difficulty: grade(total, steps), warnings };
}

function juggling(creatures: Creature[]): string[] {
	const blocks = new Set(creatures.map((c) => (c.link ?? c.name).toLowerCase()));
	return blocks.size > 3 ? [`${blocks.size} different stat blocks to run. More than two or three is a lot to juggle.`] : [];
}

export const LABEL: Record<Difficulty, string> = {
	none: 'No creatures',
	trivial: 'Trivial',
	low: 'Low',
	moderate: 'Moderate',
	high: 'High',
	severe: 'Severe',
	extreme: 'Extreme',
	over: 'Over high',
};

// The badge: the difficulty, and past the top step, "Over extreme" in Pathfinder.
export function badge(a: Analysis): string {
	const top = a.steps[a.steps.length - 1];
	return a.difficulty === 'over' && top ? `Over ${top.label.toLowerCase()}` : LABEL[a.difficulty];
}

// One line about where the total sits, e.g. "225 XP left in the High budget".
export function headroom(a: Analysis): string {
	const { total, steps } = a;
	const top = steps[steps.length - 1];
	if (!top) return `${fmt(total)} XP`;
	if (total > top.xp) return `${fmt(total - top.xp)} XP over the ${top.label} budget`;
	const next = steps.find((s) => total <= s.xp)!;
	const left = next.xp - total;
	if (left === 0) return `Right on the ${next.label} budget`;
	return `${fmt(left)} XP left in the ${next.label} budget`;
}

export function partyText(levels: number[]): string {
	if (!levels.length) return 'No party yet';
	const lo = Math.min(...levels);
	const hi = Math.max(...levels);
	const who = levels.length === 1 ? '1 character' : `${levels.length} characters`;
	return `${who} · level ${lo === hi ? lo : `${lo}–${hi}`}`;
}

// ---- editing the block text ----

const LEAD = /^(\s*(?:[-*+]\s+)?(?:party\s+)?)/i;

// The block body with one line's count changed; 0 removes the line.
export function setCount(src: string, index: number, n: number): string {
	const lines = src.split('\n');
	const raw = lines[index];
	if (raw === undefined) return src;
	if (n <= 0) {
		lines.splice(index, 1);
		return lines.join('\n');
	}
	const tok = /(^|\s)(\d+x|x\d+)(?=\s|$)/i;
	if (tok.test(raw)) lines[index] = raw.replace(tok, `$1${n}x`);
	else {
		const lead = LEAD.exec(raw)![1]!;
		const after = raw.slice(lead.length);
		const bare = /^(\d+)\s+(?=\S)/.exec(after);
		const body = bare ? after.slice(bare[0].length) : after;
		lines[index] = n === 1 && !lead.trim().toLowerCase().startsWith('party') ? lead + body : `${lead}${n}x ${body}`;
	}
	return lines.join('\n');
}

export function addLines(src: string, text: string): string {
	const add = text
		.split(/\n|;/)
		.map((s) => s.trim())
		.filter(Boolean);
	if (!add.length) return src;
	const body = src.replace(/\s+$/, '');
	return body ? `${body}\n${add.join('\n')}` : add.join('\n');
}

// The lines of a Quick Initiative `initiative` block for this encounter.
export function fightLines(src: string, system: System = systemLine(src) ?? '5e'): string[] {
	const out: string[] = [];
	src.split('\n').forEach((raw, i) => {
		const l = parseLine(raw, i, system);
		if (!l) return;
		let t = raw.trim().replace(/^[-*+]\s+/, '');
		t = t
			.replace(/(^|\s)(?:level|lvl|lv)\s*[-−]?\d+(?=\s|$)/gi, '$1')
			.replace(/(^|\s)cr\s+\S+(?=\s|$)/gi, '$1')
			.replace(/(^|\s)xp\s+[\d,]+(?=\s|$)/gi, '$1');
		if (l.kind === 'party') {
			t = t.replace(/^party\s+/i, '');
			if (!/[a-z]/i.test(t.replace(/(^|\s)(\d+x|x\d+|\d+)(?=\s|$)/gi, ''))) t = `${t} Character`;
		}
		if (l.kind !== 'creature' && !/(^|\s)(player|pc)(?=\s|$)/i.test(t)) t += ' player';
		out.push(t.replace(/\s+/g, ' ').trim());
	});
	return out;
}

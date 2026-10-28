// The encounter as text, one line per character or creature, and the XP math from the
// encounter-building rules in the SRD 5.2.1 (CC BY 4.0). Pure functions, testable without Obsidian.
//
//   party 4x level 3
//   Aria level 4 hp 31 ac 16
//   3x [[Goblin]]
//   Ogre cr 2
//   Bandit captain xp 450

export type Difficulty = 'none' | 'low' | 'moderate' | 'high' | 'over';

export interface Line {
	index: number; // line number inside the block
	kind: 'party' | 'pc' | 'creature';
	count: number;
	name: string;
	link?: string; // the target inside [[ ]], without alias
	level?: number;
	cr?: string; // as written: "2", "1/4"
	xp?: number;
}

export interface Budget {
	low: number;
	moderate: number;
	high: number;
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

export function difficulty(total: number, b: Budget): Difficulty {
	if (total <= 0 || b.high === 0) return 'none';
	if (total <= b.low) return 'low';
	if (total <= b.moderate) return 'moderate';
	if (total <= b.high) return 'high';
	return 'over';
}

const COUNT = /^(?:(\d+)x|x(\d+))$/i;

export function parseLine(raw: string, index = 0): Line | null {
	let rest = raw.trim().replace(/^[-*+]\s+/, '');
	if (!rest || rest.startsWith('%%') || rest.startsWith('//')) return null;
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
		else if (/^(level|lvl|lv)$/.test(low) && next && /^\d+$/.test(next)) {
			level = parseInt(next, 10);
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
	const kind: Line['kind'] = party ? 'party' : player || level !== undefined ? 'pc' : 'creature';
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

export function parseBlock(src: string): Line[] {
	const out: Line[] = [];
	src.split('\n').forEach((raw, i) => {
		const l = parseLine(raw, i);
		if (l) out.push(l);
	});
	return out;
}

export interface Creature extends Line {
	each?: number; // XP for one; undefined when the CR is not known
}

export interface Analysis {
	levels: number[]; // one per character
	budget: Budget;
	creatures: Creature[];
	total: number;
	difficulty: Difficulty;
	warnings: string[];
}

const fmt = (n: number) => n.toLocaleString('en-US');

// The numbers for one encounter. `crOf` gives the CR from a creature's note when the line has none.
export function analyse(lines: Line[], crOf: (l: Line) => string | undefined = () => undefined): Analysis {
	const levels: number[] = [];
	for (const l of lines) {
		if (l.kind === 'creature') continue;
		for (let i = 0; i < l.count; i++) levels.push(l.level ?? 1);
	}
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
	const budget = budgetFor(levels);
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
		const partyLevel = Math.max(1, Math.floor(levels.reduce((a, b) => a + b, 0) / levels.length));
		for (const c of creatures) {
			if (c.cr !== undefined && crValue(c.cr) > partyLevel) {
				warnings.push(`${c.name} is CR ${c.cr}, above the party's level ${partyLevel}. One action could take a character out.`);
			}
		}
	}
	const blocks = new Set(creatures.map((c) => (c.link ?? c.name).toLowerCase()));
	if (blocks.size > 3) warnings.push(`${blocks.size} different stat blocks to run. More than two or three is a lot to juggle.`);
	const zero = creatures.filter((c) => c.cr === '0').reduce((s, c) => s + c.count, 0);
	if (zero > 4) warnings.push(`${zero} CR 0 creatures. A swarm runs easier than many tiny ones.`);
	return { levels, budget, creatures, total, difficulty: difficulty(total, budget), warnings };
}

export const LABEL: Record<Difficulty, string> = {
	none: 'No creatures',
	low: 'Low',
	moderate: 'Moderate',
	high: 'High',
	over: 'Over high',
};

// One line about where the total sits, e.g. "225 XP to spare before High".
export function headroom(a: Analysis): string {
	const { total, budget: b } = a;
	if (!a.levels.length) return `${fmt(total)} XP`;
	if (total > b.high) return `${fmt(total - b.high)} XP over the High budget`;
	const next = total <= b.low ? ['Low', b.low] : total <= b.moderate ? ['Moderate', b.moderate] : ['High', b.high];
	const left = (next[1] as number) - total;
	if (left === 0) return `Right on the ${next[0]} budget`;
	return `${fmt(left)} XP left in the ${next[0]} budget`;
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
export function fightLines(src: string): string[] {
	const out: string[] = [];
	src.split('\n').forEach((raw, i) => {
		const l = parseLine(raw, i);
		if (!l) return;
		let t = raw.trim().replace(/^[-*+]\s+/, '');
		t = t
			.replace(/(^|\s)(?:level|lvl|lv)\s*\d+(?=\s|$)/gi, '$1')
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

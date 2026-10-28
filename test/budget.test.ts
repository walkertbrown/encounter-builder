import { describe, expect, it } from 'vitest';
import {
	addLines,
	analyse,
	badge,
	budgetFor,
	crXp,
	difficulty,
	fightLines,
	headroom,
	normalCr,
	parseBlock,
	parseLine,
	partyText,
	pf2eSteps,
	pf2eXp,
	setCount,
	systemLine,
} from '../src/budget';
import { SRD_MONSTERS, srdMonster } from '../src/srd';

describe('reading lines', () => {
	it('reads a party line', () => {
		expect(parseLine('party 4x level 3')).toMatchObject({ kind: 'party', count: 4, level: 3 });
		expect(parseLine('party 5 level 1')).toMatchObject({ kind: 'party', count: 5, level: 1 });
		expect(parseLine('- party x6 lvl 15')).toMatchObject({ kind: 'party', count: 6, level: 15 });
	});
	it('reads a character', () => {
		expect(parseLine('Aria level 4 hp 31 ac 16')).toMatchObject({ kind: 'pc', count: 1, name: 'Aria', level: 4 });
		expect(parseLine('Borin player')).toMatchObject({ kind: 'pc', name: 'Borin' });
	});
	it('reads creatures with counts, links, CR and XP', () => {
		expect(parseLine('3x [[Goblin]]')).toMatchObject({ kind: 'creature', count: 3, name: 'Goblin', link: 'Goblin' });
		expect(parseLine('[[Monsters/Ogre|Big one]] cr 2')).toMatchObject({ name: 'Big one', link: 'Monsters/Ogre', cr: '2' });
		expect(parseLine('2 Wolves cr 1/4')).toMatchObject({ count: 2, name: 'Wolves', cr: '1/4' });
		expect(parseLine('Bandit captain xp 1,800 hp 65 ac 15 init +2')).toMatchObject({ name: 'Bandit captain', xp: 1800 });
		expect(parseLine('Goblin (prone)')).toMatchObject({ name: 'Goblin' });
	});
	it('skips blanks and comments', () => {
		expect(parseBlock('\n%% note %%\n// x\n2x Rat cr 1/8\n')).toHaveLength(1);
		expect(parseBlock('2x Rat cr 1/8')[0]!.index).toBe(0);
	});
});

describe('CR and XP', () => {
	it('reads CR in the forms notes use', () => {
		expect(normalCr('1/4')).toBe('1/4');
		expect(normalCr(0.25)).toBe('1/4');
		expect(normalCr('.5')).toBe('1/2');
		expect(normalCr(0.125)).toBe('1/8');
		expect(normalCr('CR 5')).toBe('5');
		expect(normalCr('2 (450 XP)')).toBe('2');
		expect(normalCr('31')).toBeUndefined();
		expect(normalCr(null)).toBeUndefined();
	});
	it('matches the SRD table', () => {
		expect(crXp('1/8')).toBe(25);
		expect(crXp('1')).toBe(200);
		expect(crXp('12')).toBe(8400);
		expect(crXp('17')).toBe(18000);
		expect(crXp('30')).toBe(155000);
	});
});

describe('budget', () => {
	it('works the SRD examples', () => {
		expect(budgetFor([1, 1, 1, 1]).low).toBe(200);
		expect(budgetFor([3, 3, 3, 3, 3]).moderate).toBe(1125);
		expect(budgetFor(Array(6).fill(15)).high).toBe(46800);
	});
	it('adds mixed levels per character', () => {
		expect(budgetFor([1, 5])).toEqual({ low: 550, moderate: 825, high: 1200 });
	});
	it('grades difficulty against the budget', () => {
		const b = budgetFor([1, 1, 1, 1]); // 200 / 300 / 400
		expect(difficulty(0, b)).toBe('none');
		expect(difficulty(200, b)).toBe('low');
		expect(difficulty(201, b)).toBe('moderate');
		expect(difficulty(400, b)).toBe('high');
		expect(difficulty(401, b)).toBe('over');
	});
	it('SRD example 2: two druids and nine stirges is moderate for five level 3s', () => {
		const a = analyse(parseBlock('party 5x level 3\n2x Druid cr 2\n9x Stirge cr 1/8'));
		expect(a.total).toBe(1125);
		expect(a.difficulty).toBe('moderate');
		expect(headroom(a)).toBe('Right on the Moderate budget');
	});
	it('SRD example 3: dragons and giants are high for six level 15s', () => {
		const a = analyse(parseBlock('party 6x level 15\n2x Adult Red Dragon cr 17\n2x Fire Giant cr 9'));
		expect(a.total).toBe(46000);
		expect(a.difficulty).toBe('high');
		expect(headroom(a)).toBe('800 XP left in the High budget');
	});
	it('takes the CR from the creature note when the line has none', () => {
		const a = analyse(parseBlock('party 4x level 1\n[[Bugbear Warrior]]'), (l) => (l.link === 'Bugbear Warrior' ? '1' : undefined));
		expect(a.total).toBe(200);
		expect(a.difficulty).toBe('low');
		expect(a.warnings).toEqual([]);
	});
});

describe('warnings', () => {
	it('asks for the party and missing CRs', () => {
		const a = analyse(parseBlock('Mystery beast'));
		expect(a.warnings.join(' ')).toMatch(/Add the party/);
		expect(a.warnings.join(' ')).toMatch(/No CR for Mystery beast/);
	});
	it('flags many creatures, strong ones, many stat blocks and CR 0 crowds', () => {
		const a = analyse(parseBlock('party 2x level 1\n5x Rat cr 0\nOgre cr 2\nWolf cr 1/4\nBat cr 0\nCrab cr 0'));
		const w = a.warnings.join('\n');
		expect(w).toMatch(/9 creatures for 2 characters.*level 1 or 2/);
		expect(w).toMatch(/Ogre is CR 2, above the party's level 1/);
		expect(w).toMatch(/5 different stat blocks/);
		expect(w).toMatch(/7 CR 0 creatures/);
	});
	it('stays quiet for a sound fight', () => {
		expect(analyse(parseBlock('party 4x level 3\n2x Wolf cr 1/4\nBugbear cr 1')).warnings).toEqual([]);
	});
	it('describes the party', () => {
		expect(partyText([3, 3, 4])).toBe('3 characters · level 3–4');
		expect(partyText([5])).toBe('1 character · level 5');
	});
});

describe('editing', () => {
	const src = 'party 4x level 3\n3x [[Goblin]]\n[[Ogre]] cr 2\n2 Wolves cr 1/4';
	it('changes counts in each form', () => {
		expect(setCount(src, 1, 4).split('\n')[1]).toBe('4x [[Goblin]]');
		expect(setCount(src, 2, 2).split('\n')[2]).toBe('2x [[Ogre]] cr 2');
		expect(setCount(src, 3, 3).split('\n')[3]).toBe('3x Wolves cr 1/4');
		expect(setCount(src, 3, 1).split('\n')[3]).toBe('Wolves cr 1/4');
		expect(setCount(src, 0, 5).split('\n')[0]).toBe('party 5x level 3');
		expect(setCount('party level 3', 0, 2)).toBe('party 2x level 3');
	});
	it('removes a line at zero', () => {
		expect(setCount(src, 2, 0).split('\n')).toHaveLength(3);
	});
	it('adds lines', () => {
		expect(addLines('party 4x level 3\n', '2x [[Goblin]]; Ogre cr 2')).toBe('party 4x level 3\n2x [[Goblin]]\nOgre cr 2');
		expect(addLines('', 'Rat')).toBe('Rat');
	});
	it('writes Quick Initiative lines', () => {
		expect(fightLines('party 4x level 3\nAria level 4 hp 31 ac 16\n3x [[Goblin]]\n[[Ogre]] cr 2 hp 59\nBandit xp 25')).toEqual([
			'4x Character player',
			'Aria hp 31 ac 16 player',
			'3x [[Goblin]]',
			'[[Ogre]] hp 59',
			'Bandit',
		]);
	});
});

describe('Pathfinder 2e', () => {
	const pf = (src: string) => analyse(parseBlock(src), undefined, systemLine(src));

	it('reads the system line, and leaves creatures named System alone', () => {
		expect(systemLine('party 4x level 3\nsystem pf2e')).toBe('pf2e');
		expect(systemLine('- system: Pathfinder 2e')).toBe('pf2e');
		expect(systemLine('rules 5e')).toBe('5e');
		expect(systemLine('System Guardian level 5')).toBeUndefined();
		expect(parseLine('system pf2e')).toBeNull();
		expect(parseLine('System Guardian level 5', 0, 'pf2e')).toMatchObject({ kind: 'creature', name: 'System Guardian', level: 5 });
	});

	it('reads a level as the creature\'s, unless the line is the party or a pc', () => {
		expect(parseLine('2x [[Goblin Warrior]] level -1', 0, 'pf2e')).toMatchObject({ kind: 'creature', count: 2, level: -1 });
		expect(parseLine('Aria level 3 pc', 0, 'pf2e')).toMatchObject({ kind: 'pc', level: 3 });
		expect(parseLine('party 4x level 3', 0, 'pf2e')).toMatchObject({ kind: 'party', count: 4, level: 3 });
		expect(parseLine('Ogre level 3')).toMatchObject({ kind: 'pc' }); // 5e is unchanged
	});

	it('has GM Core\'s creature XP from 4 below the party level to 4 above', () => {
		expect([-4, -3, -2, -1, 0, 1, 2, 3, 4].map((d) => pf2eXp(5 + d, 5))).toEqual([10, 15, 20, 30, 40, 60, 80, 120, 160]);
		expect(pf2eXp(0, 5)).toBeUndefined();
		expect(pf2eXp(10, 5)).toBeUndefined();
	});

	it('has GM Core\'s budget for four, moved by the character adjustment', () => {
		expect(pf2eSteps(4).map((s) => s.xp)).toEqual([40, 60, 80, 120, 160]);
		expect(pf2eSteps(5).map((s) => s.xp)).toEqual([50, 80, 100, 150, 200]);
		expect(pf2eSteps(3).map((s) => s.xp)).toEqual([30, 40, 60, 90, 120]);
		expect(pf2eSteps(1).map((s) => s.xp)).toEqual([10, 10, 20, 30, 40]);
		expect(pf2eSteps(4).map((s) => s.label)).toEqual(['Trivial', 'Low', 'Moderate', 'Severe', 'Extreme']);
	});

	it('grades a fight', () => {
		const a = pf('system pf2e\nparty 4x level 3\n2x Goblin Warrior level -1\nOrc Brute level 2\nOgre level 3');
		expect(a.creatures.map((c) => c.each)).toEqual([10, 30, 40]);
		expect(a.total).toBe(90);
		expect(a.difficulty).toBe('severe');
		expect(headroom(a)).toBe('30 XP left in the Severe budget');
		expect(a.warnings).toEqual([]);
		expect(pf('system pf2e\nparty 4x level 3\nOgre level 3').difficulty).toBe('trivial');
		expect(pf('system pf2e\nparty 4x level 3\n2x Ogre level 3').difficulty).toBe('moderate');
	});

	it('goes over extreme', () => {
		const a = pf('system pf2e\nparty 5x level 1\n2x Ogre level 4');
		expect(a.difficulty).toBe('over');
		expect(badge(a)).toBe('Over extreme');
		expect(headroom(a)).toBe('40 XP over the Extreme budget');
	});

	it('reads a level from the creature note, and says what it cannot count', () => {
		const a = analyse(
			parseBlock('party 4x level 1\nDragon level 6\n[[Wolf]]\n[[Unknown]]\nRat level -4\nTrap xp 4', 'pf2e'),
			(l) => (l.link === 'Wolf' ? '1' : undefined),
			'pf2e',
		);
		expect(a.creatures.map((c) => [c.name, c.level, c.each])).toEqual([
			['Dragon', 6, undefined],
			['Wolf', 1, 40],
			['Unknown', undefined, undefined],
			['Rat', -4, undefined],
			['Trap', undefined, 4],
		]);
		const w = a.warnings.join(' ');
		expect(w).toMatch(/Dragon is level 6, more than 4 above the party's level 1/);
		expect(w).toMatch(/No level for Unknown/);
		expect(w).toMatch(/Rat is level -4, more than 4 below/);
		expect(w).not.toMatch(/Trap/);
	});

	it('says which party level it uses for mixed levels', () => {
		expect(pf('system pf2e\nAria level 3 pc\nBorin level 4 pc\nOgre level 3').warnings).toEqual([
			'The characters are different levels. The budget uses party level 3.',
		]);
	});

	it('starts a fight with the creatures, not their levels', () => {
		expect(fightLines('system pf2e\nparty 4x level 3\nAria level 3 pc\n2x [[Goblin Warrior]] level -1')).toEqual([
			'4x Character player',
			'Aria pc',
			'2x [[Goblin Warrior]]',
		]);
	});
});

describe('the SRD monsters', () => {
	it('knows a monster by name, plural or linked', () => {
		expect(srdMonster('Owlbear')).toMatchObject({ cr: '3', kind: 'Large Monstrosity', ac: 13, hp: 59, init: 1 });
		expect(srdMonster('goblin warriors')?.name).toBe('Goblin Warrior');
		expect(srdMonster('Wolves')?.name).toBe('Wolf');
		expect(srdMonster('Swarm of Bats')?.cr).toBe('1/4');
		expect(srdMonster('Beholder')).toBeUndefined();
		expect(SRD_MONSTERS.length).toBe(329);
		for (const m of SRD_MONSTERS) expect(crXp(m.cr), m.name).toBeDefined();
	});

	it('rates a creature from the SRD when the line and its note say nothing', () => {
		const a = analyse(parseBlock('party 4x level 3\n3x Goblin Warrior\n[[Bugbear Warrior]]\nOgre cr 3\nBeholder'));
		const [gob, bug, ogre, other] = a.creatures;
		expect(gob).toMatchObject({ cr: '1/4', each: 50, srd: true });
		expect(bug).toMatchObject({ cr: '1', each: 200, srd: true });
		expect(ogre!.cr).toBe('3');
		expect(ogre!.srd).toBeUndefined();
		expect(other!.each).toBeUndefined();
		expect(a.total).toBe(150 + 200 + 700);
	});

	it('leaves the note to rate a linked creature when it can', () => {
		const a = analyse(parseBlock('[[Goblin Warrior]]'), () => '1');
		expect(a.creatures[0]).toMatchObject({ cr: '1', each: 200 });
		expect(a.creatures[0]!.srd).toBeUndefined();
	});

	it('hands its numbers to Quick Initiative, unless the line or its note has its own', () => {
		const src = 'party 4x level 3\n3x Goblin Warrior\nOgre hp 80\n[[Owlbear]]\n[[Bugbear Warrior]]\nTroll cr 5';
		expect(fightLines(src, '5e', (l) => l.link === 'Owlbear')).toEqual([
			'4x Character player',
			'3x Goblin Warrior hp 10 ac 15 init +2',
			'Ogre hp 80 ac 11 init -1',
			'[[Owlbear]]',
			'[[Bugbear Warrior]] hp 33 ac 14 init +2',
			'Troll',
		]);
		expect(fightLines('system pf2e\nparty 4x level 1\nOgre level 3', 'pf2e')).toEqual(['4x Character player', 'Ogre']);
	});
});

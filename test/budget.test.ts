import { describe, expect, it } from 'vitest';
import {
	addLines,
	analyse,
	budgetFor,
	crXp,
	difficulty,
	fightLines,
	headroom,
	normalCr,
	parseBlock,
	parseLine,
	partyText,
	setCount,
} from '../src/budget';

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

// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { App, Notice, ctx, installDomHelpers } from './obsidian-shim';
import EncounterBuilderPlugin from '../src/main';

beforeAll(() => installDomHelpers());

type Proc = (src: string, el: HTMLElement, c: ReturnType<typeof ctx>) => void;

async function setup(
	note: string,
	extra: Record<string, { frontmatter?: Record<string, unknown> }> = {},
	settings: Record<string, unknown> | null = null,
) {
	const app = new App();
	app.notes.set('Prep.md', { path: 'Prep.md', content: note });
	for (const [k, v] of Object.entries(extra)) app.notes.set(k, { path: `${k}.md`, content: '', ...v });
	const plugin = new EncounterBuilderPlugin(app as never, { id: 'encounter-builder' } as never);
	(plugin as never as { data: unknown }).data = settings;
	await plugin.onload();
	const proc = (plugin as never as { codeBlocks: Record<string, Proc> }).codeBlocks['encounter-builder']!;
	const lines = note.split('\n');
	const lineStart = lines.findIndex((l) => /```encounter-builder/.test(l));
	const lineEnd = lines.findIndex((l, i) => i > lineStart && l.includes('```'));
	const body = lines.slice(lineStart + 1, lineEnd).join('\n');
	const el = document.createElement('div');
	proc(body, el, ctx('Prep.md', { text: note, lineStart, lineEnd }));
	const flush = () => new Promise((r) => setTimeout(r, 0));
	const content = () => app.notes.get('Prep.md')!.content;
	const click = async (sel: string, i = 0) => {
		el.querySelectorAll<HTMLElement>(sel)[i]!.click();
		await flush();
	};
	const text = (sel: string) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent);
	return { app, plugin, el, content, click, flush, text };
}

const NOTE = '# Ambush\n\n```encounter-builder\nparty 4x level 1\n2x [[Goblin]]\n```\n\nAfter.';
const GOBLIN = { frontmatter: { statblock: true, cr: 0.25, hp: 7, ac: 15 } };

describe('encounter block', () => {
	it('shows the total, difficulty and rows, reading CR from the creature note', async () => {
		const { el, text, content } = await setup(NOTE, { Goblin: GOBLIN });
		expect(text('.eb-total')).toEqual(['100']);
		expect(text('.eb-badge')).toEqual(['Low']);
		expect(el.querySelector('.eb')!.classList.contains('eb-low')).toBe(true);
		expect(text('.eb-name')).toEqual(['Goblin']);
		expect(text('.eb-cr')).toEqual(['CR 1/4']);
		expect(text('.eb-xp')).toEqual(['100 XP']);
		expect(text('.eb-party')).toEqual(['4 characters · level 1']);
		expect(text('.eb-room')).toEqual(['100 XP left in the Low budget']);
		expect(el.querySelector('.eb-mark-low')!.classList.contains('is-on')).toBe(true);
		expect(el.querySelectorAll('.eb-warning').length).toBe(0);
		expect(content()).toBe(NOTE); // drawing never edits
	});

	it('steps counts up and down in the note', async () => {
		const { click, content } = await setup(NOTE, { Goblin: GOBLIN });
		await click('.eb-plus');
		expect(content()).toContain('```encounter-builder\nparty 4x level 1\n3x [[Goblin]]\n```');
	});

	it('removes a creature stepped to zero', async () => {
		const { click, content } = await setup('```encounter-builder\nparty 4x level 1\nOgre cr 2\n```', {});
		await click('.eb-minus');
		expect(content()).toBe('```encounter-builder\nparty 4x level 1\n```');
	});

	it('adds creatures from the input', async () => {
		const { el, click, content } = await setup(NOTE, { Goblin: GOBLIN });
		el.querySelector<HTMLInputElement>('.eb-add-input')!.value = 'Ogre cr 2';
		await click('.eb-add');
		expect(content()).toContain('2x [[Goblin]]\nOgre cr 2\n```');
		expect(el.querySelector<HTMLInputElement>('.eb-add-input')!.value).toBe('');
	});

	it('keeps callout markers when it edits', async () => {
		const note = '> [!note] Fight\n> ```encounter-builder\n> party 4x level 1\n> Rat cr 1/8\n> ```';
		const { click, content } = await setup(note);
		await click('.eb-plus');
		expect(content()).toBe('> [!note] Fight\n> ```encounter-builder\n> party 4x level 1\n> 2x Rat cr 1/8\n> ```');
		await click('.eb-start');
		expect(content()).toContain('> ```\n>\n> ```initiative\n> 4x Character player\n> 2x Rat\n> ```');
	});

	it('writes a Quick Initiative block under the encounter on Start fight', async () => {
		const { click, content } = await setup(
			'```encounter-builder\nAria level 1 hp 12 ac 15\nBorin level 1\n2x [[Goblin]]\n```\nAfter.',
			{ Goblin: GOBLIN },
		);
		await click('.eb-start');
		expect(content()).toBe(
			'```encounter-builder\nAria level 1 hp 12 ac 15\nBorin level 1\n2x [[Goblin]]\n```\n\n```initiative\nAria hp 12 ac 15 player\nBorin player\n2x [[Goblin]]\n```\nAfter.',
		);
		expect(Notice.last).toMatch(/Fight written/);
		const once = content();
		await click('.eb-start');
		expect(content()).toBe(once);
		expect(Notice.last).toMatch(/already has a fight/);
	});

	it('uses the default party from settings when the block has none', async () => {
		const { text, click, content } = await setup('```encounter-builder\nBugbear cr 1\n```', {}, { party: 'Aria level 3, Borin level 3' });
		expect(text('.eb-party')).toEqual(['2 characters · level 3']);
		expect(text('.eb-badge')).toEqual(['Low']);
		await click('.eb-start');
		expect(content()).toContain('```initiative\nAria player\nBorin player\nBugbear\n```');
	});

	it('warns about strong creatures and missing CRs, unless turned off', async () => {
		const note = '```encounter-builder\nparty 4x level 1\nOgre cr 2\n[[Unknown]]\n```';
		const on = await setup(note);
		expect(on.text('.eb-warning').join(' ')).toMatch(/No CR for Unknown.*Ogre is CR 2/);
		expect(on.text('.eb-cr')).toEqual(['CR 2', 'CR ?']);
		const off = await setup(note, {}, { warnings: false });
		expect(off.el.querySelectorAll('.eb-warning').length).toBe(0);
	});

	it('marks an encounter over the High budget', async () => {
		const { text, el } = await setup('```encounter-builder\nparty 2x level 1\nOgre cr 2\n```');
		expect(text('.eb-badge')).toEqual(['Over high']);
		expect(text('.eb-room')).toEqual(['250 XP over the High budget']);
		expect(el.querySelector<HTMLElement>('.eb-fill')!.style.width).toBe('100%');
	});

	it('does Pathfinder 2e from a system line, reading levels from creature notes', async () => {
		const note = '```encounter-builder\nsystem pf2e\nparty 4x level 1\n2x [[Goblin Warrior]]\n```';
		const { el, text } = await setup(note, { 'Goblin Warrior': { frontmatter: { level: -1, hp: 6 } } });
		expect(text('.eb-cr')).toEqual(['Level -1']);
		expect(text('.eb-xp')).toEqual(['40 XP']); // 2 below the party: 20 each
		expect(text('.eb-badge')).toEqual(['Trivial']);
		expect(text('.eb-mark-label')).toEqual(['Trivial', 'Low', 'Moderate', 'Severe', 'Extreme']);
		expect(text('.eb-mark-xp')).toEqual(['40', '60', '80', '120', '160']);
		expect(el.querySelector('.eb-mark-trivial')!.classList.contains('is-on')).toBe(true);
		expect(el.querySelector('.eb')!.classList.contains('eb-trivial')).toBe(true);
		expect(el.querySelector<HTMLInputElement>('.eb-add-input')!.placeholder).toMatch(/level 3/);
	});

	it('does Pathfinder 2e for every block from settings, and a block can still say 5e', async () => {
		const pf = await setup('```encounter-builder\nparty 4x level 2\nOgre level 2\n```', {}, { system: 'pf2e' });
		expect(pf.text('.eb-badge')).toEqual(['Trivial']);
		expect(pf.text('.eb-room')).toEqual(['Right on the Trivial budget']);
		const dnd = await setup('```encounter-builder\nsystem 5e\nparty 4x level 2\nOgre cr 2\n```', {}, { system: 'pf2e' });
		expect(dnd.text('.eb-cr')).toEqual(['CR 2']);
		expect(dnd.text('.eb-mark-label')).toEqual(['Low', 'Moderate', 'High']);
	});

	it('has an insert command', async () => {
		const { plugin } = await setup(NOTE);
		const cmds = (plugin as never as { commands: { id: string }[] }).commands.map((c) => c.id);
		expect(cmds).toEqual(['insert-block']);
	});
});

describe('SRD monsters in the block', () => {
	it('rates them by name, says so on hover, and offers their names as you type', async () => {
		const { el, text } = await setup('```encounter-builder\nparty 4x level 3\n2x Owlbear\n[[Goblin]]\n```', { Goblin: GOBLIN });
		expect(text('.eb-cr')).toEqual(['CR 3', 'CR 1/4']);
		expect(el.querySelectorAll('.eb-cr')[0]!.getAttribute('title')).toBe('Large Monstrosity, AC 13, HP 59. From the SRD 5.2.1.');
		expect(el.querySelectorAll('.eb-cr')[1]!.getAttribute('title')).toBeNull();
		const input = el.querySelector<HTMLInputElement>('.eb-add-input')!;
		const list = el.querySelector<HTMLDataListElement>(`#${input.getAttribute('list')}`);
		expect(list!.querySelectorAll('option').length).toBe(329);
	});

	it('starts a fight with their numbers', async () => {
		const { click, content } = await setup('```encounter-builder\nparty 4x level 3\n2x Owlbear\n```', {});
		await click('.eb-start');
		expect(content()).toContain('```initiative\n4x Character player\n2x Owlbear hp 59 ac 13 init +1\n```');
	});
});

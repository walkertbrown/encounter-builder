// Browser demo: runs the real Encounter Builder and Quick Initiative plugins against the test shim,
// over a sample prep note, and shows the note's text changing as they are used.
import { App, installDomHelpers } from '../test/obsidian-shim';
import EncounterBuilderPlugin from '../src/main';
import QuickInitiativePlugin from '../../quick-initiative/src/main';

installDomHelpers();

const ICONS: Record<string, string> = {
	swords: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
	'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
	play: '<polygon points="6 3 20 12 6 21 6 3"/>',
	'scroll-text': '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
	x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
	check: '<path d="M20 6 9 17l-5-5"/>',
	'chevron-left': '<path d="m15 18-6-6 6-6"/>',
	'chevron-right': '<path d="m9 18 6-6-6-6"/>',
	square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
	shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
	heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
	sword: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/>',
	dices: '<rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/>',
};
(globalThis as unknown as { __iconHook: (el: HTMLElement, name: string) => void }).__iconHook = (el, name) => {
	const body = ICONS[name];
	if (!body) return;
	el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
};

const START = `# Ambush at the mill

The goblins wait in the loft. Their bugbear boss sleeps by the grain sacks.

\`\`\`encounter-builder
Aria level 3 hp 27 ac 16
Borin level 3 hp 31 ac 18
Cass level 3 hp 20 ac 13
Dov level 3 hp 24 ac 14
3x [[Goblin Warrior]]
[[Bugbear Warrior]]
\`\`\``;

type Ctx = { sourcePath: string; addChild: () => void; getSectionInfo: () => { text: string; lineStart: number; lineEnd: number } };
type Proc = (src: string, el: HTMLElement, c: Ctx) => void;

async function main() {
	const app = new App();
	app.notes.set('Prep.md', { path: 'Prep.md', content: START });
	app.notes.set('Goblin Warrior', { path: 'Goblin Warrior.md', content: '', frontmatter: { statblock: true, cr: '1/4', hp: 10, ac: 15, stats: [8, 15, 10, 10, 8, 8] } });
	app.notes.set('Bugbear Warrior', { path: 'Bugbear Warrior.md', content: '', frontmatter: { statblock: true, cr: 1, hp: 33, ac: 14, stats: [15, 14, 13, 8, 11, 9] } });
	app.active = 'Prep.md';

	const eb = new EncounterBuilderPlugin(app as never, { id: 'encounter-builder' } as never);
	await eb.onload();
	const qi = new QuickInitiativePlugin(app as never, { id: 'quick-initiative' } as never);
	await qi.onload();
	const ebProc = (eb as never as { codeBlocks: Record<string, Proc> }).codeBlocks['encounter-builder']!;
	const qiProc = (qi as never as { codeBlocks: Record<string, Proc> }).codeBlocks.initiative!;

	const note = () => app.notes.get('Prep.md')!.content;
	// where a block sits in the note right now, the way Obsidian reports it
	const ctx = (lang: string): Ctx => ({
		sourcePath: 'Prep.md',
		addChild: () => {},
		getSectionInfo: () => {
			const lines = note().split('\n');
			const lineStart = lines.findIndex((l) => l.startsWith('```' + lang));
			const lineEnd = lines.findIndex((l, i) => i > lineStart && l.startsWith('```'));
			return { text: note(), lineStart, lineEnd };
		},
	});
	const body = (lang: string) => {
		const info = ctx(lang).getSectionInfo();
		return info.lineStart < 0 ? null : note().split('\n').slice(info.lineStart + 1, info.lineEnd).join('\n');
	};

	const source = document.querySelector<HTMLElement>('#source');
	const builder = document.querySelector<HTMLElement>('#builder');
	const tracker = document.querySelector<HTMLElement>('#tracker');
	const fight = document.querySelector<HTMLElement>('#fight');

	const showSource = () => {
		if (source) source.textContent = note();
	};
	const flash = () => {
		if (!source) return;
		source.classList.remove('flash');
		void source.offsetWidth;
		source.classList.add('flash');
	};
	const drawBuilder = () => {
		if (!builder) return;
		const typing = builder.contains(document.activeElement) && document.activeElement?.tagName === 'INPUT';
		ebProc(body('encounter-builder') ?? '', builder, ctx('encounter-builder'));
		if (typing) builder.querySelector<HTMLInputElement>('.eb-add-input')?.focus();
	};
	let fightShown = false;
	const drawTracker = () => {
		const src = body('initiative');
		if (fight) fight.hidden = src === null;
		if (src === null || !tracker) {
			fightShown = false;
			return;
		}
		// Quick Initiative redraws itself; only draw it when the block first appears
		if (fightShown) return;
		fightShown = true;
		qiProc(src, tracker, ctx('initiative'));
		fight?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	};

	const process = app.vault.process;
	app.vault.process = async (f, fn) => {
		const before = body('encounter-builder');
		const out = await process(f, fn);
		showSource();
		flash();
		// the encounter changed: reading view redraws its block
		if (body('encounter-builder') !== before) drawBuilder();
		drawTracker();
		return out;
	};

	const render = () => {
		fightShown = false;
		drawBuilder();
		drawTracker();
		showSource();
	};
	render();

	document.querySelector('#reset')?.addEventListener('click', () => {
		app.notes.get('Prep.md')!.content = START;
		render();
	});
	const opened = document.querySelector<HTMLElement>('#opened');
	app.workspace.openLinkText = async (link: string) => {
		if (opened) opened.textContent = `In Obsidian this opens the "${link}" note.`;
	};
}

void main();

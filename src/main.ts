import {
	App,
	Editor,
	MarkdownPostProcessorContext,
	Notice,
	Plugin,
	PluginSettingTab,
	SettingDefinitionItem,
	TFile,
	setIcon,
} from 'obsidian';
import {
	Analysis,
	LABEL,
	Line,
	addLines,
	analyse,
	fightLines,
	headroom,
	normalCr,
	parseBlock,
	parseLine,
	partyText,
	setCount,
} from './budget';

interface Settings {
	party: string; // used when a block lists no characters, e.g. "party 4x level 3"
	warnings: boolean; // show the SRD's troubleshooting notes under the budget
}

const DEFAULT_SETTINGS: Settings = {
	party: '',
	warnings: true,
};

const TEMPLATE = '```encounter-builder\nparty 4x level 3\n2x [[Goblin]]\n```\n';
const OPEN = /^((?:\s*>)*\s*)(`{3,}|~{3,})\s*encounter-builder\b/;

export default class EncounterBuilderPlugin extends Plugin {
	settings: Settings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
		this.registerMarkdownCodeBlockProcessor('encounter-builder', (src, el, ctx) => {
			new Builder(this, el, ctx, src).draw();
		});
		this.addCommand({
			id: 'insert-block',
			name: 'Insert encounter',
			editorCallback: (editor: Editor) => editor.replaceSelection(TEMPLATE),
		});
		this.addSettingTab(new SettingTab(this.app, this));
	}

	// The default party, for blocks that do not list one.
	defaultParty(): Line[] {
		return this.settings.party
			.split(/\n|,|;/)
			.map((s, i) => parseLine(s, -1 - i))
			.filter((l): l is Line => l !== null && l.kind !== 'creature');
	}

	// The CR in a creature's note (Fantasy Statblocks writes `cr`).
	crFromNote(l: Line, sourcePath: string): string | undefined {
		if (!l.link) return undefined;
		const file = this.app.metadataCache.getFirstLinkpathDest(l.link.split('#')[0]!, sourcePath);
		if (!(file instanceof TFile)) return undefined;
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm) return undefined;
		return normalCr(fm.cr ?? fm.challenge_rating ?? fm.challenge);
	}

	analyse(src: string, sourcePath: string): Analysis {
		let lines = parseBlock(src);
		if (!lines.some((l) => l.kind !== 'creature')) lines = [...this.defaultParty(), ...lines];
		return analyse(lines, (l) => this.crFromNote(l, sourcePath));
	}

	// Changes the note around one rendered block. `edit` gets the block's lines and returns
	// the new body plus any lines to put after the block. False when the block can't be found.
	async edit(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
		edit: (body: string, following: string) => { body: string; after?: string[] },
	): Promise<boolean> {
		const info = ctx.getSectionInfo(el);
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!info || !(file instanceof TFile)) return false;
		let ok = false;
		await this.app.vault.process(file, (data) => {
			const lines = data.split('\n');
			const open = OPEN.exec(lines[info.lineStart] ?? '');
			const close = lines[info.lineEnd] ?? '';
			if (!open || !close.includes(open[2]!)) return data; // the note changed under us; leave it alone
			const prefix = open[1]!;
			const strip = (l: string) => l.slice(prefix.length);
			const body = lines.slice(info.lineStart + 1, info.lineEnd).map(strip).join('\n');
			// the first line with text after the block, without callout markers
			const following = lines.slice(info.lineEnd + 1).map(strip).find((l) => l.trim()) ?? '';
			const out = edit(body, following);
			const next = out.body.split('\n').filter((l, i, a) => l.trim() || i < a.length - 1).map((l) => prefix + l);
			const after = (out.after ?? []).map((l) => (l ? prefix + l : prefix.trimEnd()));
			lines.splice(info.lineStart + 1, info.lineEnd - info.lineStart - 1, ...next);
			const end = info.lineStart + 1 + next.length;
			if (after.length) lines.splice(end + 1, 0, ...after);
			ok = true;
			return lines.join('\n');
		});
		return ok;
	}

	async loadSettings() {
		const saved = (await this.loadData()) as Partial<Settings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {});
	}
	async saveSettings() {
		await this.saveData(this.settings);
	}
}

const fmt = (n: number) => n.toLocaleString('en-US');

// One rendered `encounter-builder` block.
class Builder {
	constructor(
		private plugin: EncounterBuilderPlugin,
		private el: HTMLElement,
		private ctx: MarkdownPostProcessorContext,
		private src: string,
	) {}

	private async change(edit: (body: string, following: string) => { body: string; after?: string[] }) {
		const ok = await this.plugin.edit(this.el, this.ctx, edit);
		if (!ok) new Notice('Could not find this encounter in the note. Switch views and try again.');
		return ok;
	}

	draw() {
		const a = this.plugin.analyse(this.src, this.ctx.sourcePath);
		this.el.empty();
		const box = this.el.createDiv({ cls: `eb eb-${a.difficulty}` });

		const head = box.createDiv({ cls: 'eb-head' });
		const title = head.createDiv({ cls: 'eb-title' });
		setIcon(title.createSpan({ cls: 'eb-icon' }), 'swords');
		title.createSpan({ text: 'Encounter' });
		head.createDiv({ cls: 'eb-badge', text: LABEL[a.difficulty] });

		this.drawMeter(box, a);

		const list = box.createDiv({ cls: 'eb-list' });
		for (const c of a.creatures) {
			const row = list.createDiv({ cls: 'eb-row' });
			const step = row.createDiv({ cls: 'eb-step' });
			const minus = step.createEl('button', { cls: 'eb-btn eb-minus', text: '−' });
			minus.setAttr('aria-label', `One fewer ${c.name}`);
			step.createSpan({ cls: 'eb-count', text: String(c.count) });
			const plus = step.createEl('button', { cls: 'eb-btn eb-plus', text: '+' });
			plus.setAttr('aria-label', `One more ${c.name}`);
			minus.addEventListener('click', () => void this.change((b) => ({ body: setCount(b, c.index, c.count - 1) })));
			plus.addEventListener('click', () => void this.change((b) => ({ body: setCount(b, c.index, c.count + 1) })));

			const name = row.createDiv({ cls: 'eb-name' });
			if (c.link) {
				const link = name.createEl('a', { cls: 'internal-link', text: c.name });
				link.setAttr('data-href', c.link);
				link.setAttr('href', c.link);
				link.addEventListener('click', (ev) => {
					ev.preventDefault();
					void this.plugin.app.workspace.openLinkText(c.link!, this.ctx.sourcePath);
				});
			} else name.setText(c.name);
			row.createDiv({ cls: 'eb-cr', text: c.cr !== undefined ? `CR ${c.cr}` : 'CR ?' });
			row.createDiv({
				cls: 'eb-xp',
				text: c.each === undefined ? '— XP' : `${fmt(c.each * c.count)} XP`,
			});
		}
		if (!a.creatures.length) list.createDiv({ cls: 'eb-empty', text: 'No creatures yet. Add some below.' });

		if (this.plugin.settings.warnings && a.warnings.length) {
			const warn = box.createDiv({ cls: 'eb-warnings' });
			for (const w of a.warnings) {
				const item = warn.createDiv({ cls: 'eb-warning' });
				setIcon(item.createSpan({ cls: 'eb-warning-icon' }), 'alert-triangle');
				item.createSpan({ text: w });
			}
		}

		const foot = box.createDiv({ cls: 'eb-foot' });
		const input = foot.createEl('input', {
			cls: 'eb-add-input',
			type: 'text',
			placeholder: '2x [[Goblin]] or Ogre cr 2',
		});
		const add = foot.createEl('button', { cls: 'eb-btn eb-add', text: 'Add' });
		const submit = () => {
			const text = input.value;
			if (!text.trim()) return;
			void this.change((b) => ({ body: addLines(b, text) })).then((ok) => {
				if (ok) input.value = '';
			});
		};
		input.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter' && !ev.isComposing) {
				ev.preventDefault();
				submit();
			}
		});
		add.addEventListener('click', submit);
		const start = foot.createEl('button', { cls: 'eb-btn eb-start' });
		setIcon(start.createSpan({ cls: 'eb-btn-icon' }), 'play');
		start.createSpan({ text: 'Start fight' });
		start.setAttr('aria-label', 'Write an initiative block for Quick Initiative under this encounter');
		start.addEventListener('click', () => void this.startFight());
	}

	private drawMeter(box: HTMLElement, a: Analysis) {
		const meter = box.createDiv({ cls: 'eb-meter' });
		const sum = meter.createDiv({ cls: 'eb-sum' });
		sum.createSpan({ cls: 'eb-total', text: fmt(a.total) });
		sum.createSpan({ cls: 'eb-unit', text: ' XP' });
		sum.createSpan({ cls: 'eb-room', text: headroom(a) });
		const b = a.budget;
		if (!a.levels.length) {
			meter.createDiv({ cls: 'eb-party', text: partyText(a.levels) });
			return;
		}
		// the bar runs a quarter past High so "over" has somewhere to go
		const max = Math.max(b.high * 1.25, a.total);
		const pct = (n: number) => `${Math.min(100, (n / max) * 100).toFixed(2)}%`;
		const bar = meter.createDiv({ cls: 'eb-bar' });
		bar.createDiv({ cls: 'eb-zone eb-zone-low' }).style.width = pct(b.low);
		const fill = bar.createDiv({ cls: 'eb-fill' });
		fill.style.width = pct(a.total);
		for (const [k, v] of [['low', b.low], ['moderate', b.moderate], ['high', b.high]] as const) {
			const tick = bar.createDiv({ cls: `eb-tick eb-tick-${k}` });
			tick.style.left = pct(v);
		}
		const marks = meter.createDiv({ cls: 'eb-marks' });
		for (const [k, label, v] of [['low', 'Low', b.low], ['moderate', 'Moderate', b.moderate], ['high', 'High', b.high]] as const) {
			const m = marks.createDiv({ cls: `eb-mark eb-mark-${k}` });
			if (a.difficulty === k) m.addClass('is-on');
			m.createSpan({ cls: 'eb-mark-label', text: label });
			m.createSpan({ cls: 'eb-mark-xp', text: fmt(v) });
		}
		meter.createDiv({ cls: 'eb-party', text: partyText(a.levels) });
	}

	private async startFight() {
		let made = false;
		let already = false;
		const ok = await this.change((body, following) => {
			if (/^(`{3,}|~{3,})\s*initiative\b/.test(following.trim())) {
				already = true;
				return { body };
			}
			const own = parseBlock(body).some((l) => l.kind !== 'creature');
			const party = own ? [] : fightLines(this.plugin.settings.party.split(/,|;/).join('\n'));
			const lines = fightLines(body);
			if (!lines.length) return { body };
			made = true;
			return { body, after: ['', '```initiative', ...party, ...lines, '```'] };
		});
		if (already) new Notice('This encounter already has a fight under it.');
		else if (ok && made) new Notice('Fight written under the encounter. Roll initiative there.');
		else if (ok) new Notice('Nothing to fight yet. Add creatures first.');
	}
}

class SettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: EncounterBuilderPlugin) {
		super(app, plugin);
	}
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Default party',
				desc: 'Used when an encounter lists no characters. For example: party 4x level 3, or Aria level 5, Borin level 5.',
				control: { type: 'text', key: 'party', defaultValue: DEFAULT_SETTINGS.party },
			},
			{
				name: 'Show warnings',
				desc: 'Notes under the budget when a fight has many creatures, a creature above the party level, or many stat blocks.',
				control: { type: 'toggle', key: 'warnings', defaultValue: true },
			},
		];
	}
	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof Settings];
	}
	async setControlValue(key: string, value: unknown): Promise<void> {
		(this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
		await this.plugin.saveSettings();
	}
}

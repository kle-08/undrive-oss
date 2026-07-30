<script>
	import { editor } from '$lib/stores/editor.svelte.js';
	import { toast } from '$lib/stores/toast.svelte.js';
	import * as vault from '$lib/api/client.js';
	import { onMount } from 'svelte';
	import { Editor, Extension } from '@tiptap/core';
	import { Plugin } from '@tiptap/pm/state';
	import { Decoration, DecorationSet } from '@tiptap/pm/view';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import Placeholder from '@tiptap/extension-placeholder';
	import TaskList from '@tiptap/extension-task-list';
	import TaskItem from '@tiptap/extension-task-item';
	import Highlight from '@tiptap/extension-highlight';
	import Typography from '@tiptap/extension-typography';
	import CharacterCount from '@tiptap/extension-character-count';
	import ImageResize from 'tiptap-extension-resize-image';
	import { Markdown } from 'tiptap-markdown';

	const ThickCursor = Extension.create({
		name: 'thickCursor',
		addProseMirrorPlugins() {
			return [
				new Plugin({
					props: {
						decorations(state) {
							const { selection } = state;
							if (!selection.empty) return DecorationSet.empty;
							const widget = Decoration.widget(selection.head, () => {
								const el = document.createElement('span');
								el.className = 'thick-cursor';
								return el;
							}, { side: -1 });
							return DecorationSet.create(state.doc, [widget]);
						},
					},
				}),
			];
		},
	});

	let editorEl = $state(null);
	let tiptap = $state(null);
	let txCount = $state(0);
	let autosaveTimer = null;
	let justSaved = $state(false);
	let wasSaving = false;

	// Slash command state
	let showSlashMenu = $state(false);
	let slashMenuPos = $state({ x: 0, y: 0 });
	let slashFilter = $state('');
	let slashSelectedIdx = $state(0);

	const slashCommands = [
		{ id: 'h1', label: 'Heading 1', icon: 'H1', action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
		{ id: 'h2', label: 'Heading 2', icon: 'H2', action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
		{ id: 'h3', label: 'Heading 3', icon: 'H3', action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
		{ id: 'bullet', label: 'Bullet List', icon: '•', action: (e) => e.chain().focus().toggleBulletList().run() },
		{ id: 'ordered', label: 'Numbered List', icon: '1.', action: (e) => e.chain().focus().toggleOrderedList().run() },
		{ id: 'task', label: 'Task List', icon: '☐', action: (e) => e.chain().focus().toggleTaskList().run() },
		{ id: 'blockquote', label: 'Quote', icon: '"', action: (e) => e.chain().focus().toggleBlockquote().run() },
		{ id: 'code', label: 'Code Block', icon: '{}', action: (e) => e.chain().focus().toggleCodeBlock().run() },
		{ id: 'hr', label: 'Divider', icon: '—', action: (e) => e.chain().focus().setHorizontalRule().run() },
		{ id: 'image', label: 'Image', icon: '🖼', action: () => insertImage() },
	];

	let filteredCommands = $derived(
		slashFilter
			? slashCommands.filter((c) => c.label.toLowerCase().includes(slashFilter.toLowerCase()))
			: slashCommands
	);

	const scheduleAutosave = () => {
		clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(() => {
			if (editor.dirty && !editor.saving) editor.save();
		}, 2000);
	};

	const handleSlashInput = () => {
		if (!tiptap) return;
		const { state: editorState } = tiptap;
		const { from } = editorState.selection;
		const textBefore = editorState.doc.textBetween(
			Math.max(0, from - 20),
			from,
			'\n'
		);

		const slashMatch = textBefore.match(/\/([^\s/]*)$/);
		if (slashMatch) {
			slashFilter = slashMatch[1];
			slashSelectedIdx = 0;

			// Position the menu near the cursor
			const coords = tiptap.view.coordsAtPos(from);
			const editorRect = editorEl.getBoundingClientRect();
			slashMenuPos = {
				x: coords.left - editorRect.left,
				y: coords.bottom - editorRect.top + 4,
			};
			showSlashMenu = true;
		} else {
			showSlashMenu = false;
		}
	};

	const executeSlashCommand = (cmd) => {
		if (!tiptap) return;
		// Delete the slash and filter text
		const { state: editorState } = tiptap;
		const { from } = editorState.selection;
		const textBefore = editorState.doc.textBetween(
			Math.max(0, from - 20),
			from,
			'\n'
		);
		const slashMatch = textBefore.match(/\/([^\s/]*)$/);
		if (slashMatch) {
			const deleteFrom = from - slashMatch[0].length;
			tiptap.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
		}
		cmd.action(tiptap);
		showSlashMenu = false;
	};

	const handleSlashKeydown = (/** @type {KeyboardEvent} */ e) => {
		if (!showSlashMenu) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			slashSelectedIdx = (slashSelectedIdx + 1) % filteredCommands.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			slashSelectedIdx = (slashSelectedIdx - 1 + filteredCommands.length) % filteredCommands.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (filteredCommands[slashSelectedIdx]) {
				executeSlashCommand(filteredCommands[slashSelectedIdx]);
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			showSlashMenu = false;
		}
	};

	const insertImage = () => {
		const url = prompt('Image URL:');
		if (url) {
			tiptap?.chain().focus().setImage({ src: url }).run();
		}
	};

	const handleImagePaste = async (/** @type {ClipboardEvent} */ e) => {
		if (!tiptap) return;
		const items = e.clipboardData?.items;
		if (!items) return;

		for (const item of items) {
			if (item.type.startsWith('image/')) {
				e.preventDefault();
				const file = item.getAsFile();
				if (!file) continue;

				// Upload to R2 alongside the document
				const docPrefix = editor.key.slice(0, editor.key.lastIndexOf('/') + 1);
				const imgName = `img_${Date.now()}.${file.type.split('/')[1] || 'png'}`;
				const imgKey = `${docPrefix}${imgName}`;

				try {
					await vault.uploadFile(imgKey, file);
					const url = vault.getDownloadUrl(imgKey);
					tiptap.chain().focus().setImage({ src: url }).run();
					toast.success('Image inserted');
				} catch {
					toast.error('Failed to upload image');
				}
				return;
			}
		}
	};

	const handleImageDrop = async (/** @type {DragEvent} */ e) => {
		if (!tiptap) return;
		const files = e.dataTransfer?.files;
		if (!files) return;

		for (const file of files) {
			if (file.type.startsWith('image/')) {
				e.preventDefault();
				const docPrefix = editor.key.slice(0, editor.key.lastIndexOf('/') + 1);
				const imgName = `img_${Date.now()}.${file.type.split('/')[1] || 'png'}`;
				const imgKey = `${docPrefix}${imgName}`;

				try {
					await vault.uploadFile(imgKey, file);
					const url = vault.getDownloadUrl(imgKey);
					tiptap.chain().focus().setImage({ src: url }).run();
					toast.success('Image inserted');
				} catch {
					toast.error('Failed to upload image');
				}
				return;
			}
		}
	};

	const initEditor = () => {
		if (!editorEl || tiptap) return;
		tiptap = new Editor({
			element: editorEl,
			editable: !editor.preview,
			extensions: [
				StarterKit,
				Link.configure({ openOnClick: editor.preview }),
				Placeholder.configure({ placeholder: 'Type / for commands...' }),
				TaskList,
				TaskItem.configure({ nested: true }),
				Highlight.configure({ multicolor: false }),
				Typography,
				ImageResize.configure({ inline: false, allowBase64: true }),
				CharacterCount,
					Markdown.configure({
					html: true,
					transformPastedText: true,
					transformCopiedText: true,
				}),
				ThickCursor,
			],
			content: editor.markdown ? editor.content : editor.content,
			onUpdate: ({ editor: e }) => {
				editor.setContent(editor.markdown ? e.storage.markdown.getMarkdown() : e.getHTML());
				scheduleAutosave();
				handleSlashInput();
			},
			onTransaction: () => {
				txCount++;
			},
			editorProps: {
				handleKeyDown: (view, event) => {
					if (showSlashMenu) {
						if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
							handleSlashKeydown(event);
							return true;
						}
					}
					return false;
				},
				handlePaste: (view, event) => {
					const items = event.clipboardData?.items;
					if (items) {
						for (const item of items) {
							if (item.type.startsWith('image/')) {
								handleImagePaste(event);
								return true;
							}
						}
					}
					return false;
				},
				handleDrop: (view, event) => {
					const files = event.dataTransfer?.files;
					if (files) {
						for (const file of files) {
							if (file.type.startsWith('image/')) {
								handleImageDrop(event);
								return true;
							}
						}
					}
					return false;
				},
			},
		});
	};

	$effect(() => {
		if (editorEl && editor.content !== undefined && !editor.loading) {
			if (!tiptap) {
				initEditor();
			}
		}
	});

	// Cleanup on close
	$effect(() => {
		if (!editor.open && tiptap) {
			clearTimeout(autosaveTimer);
			tiptap.destroy();
			tiptap = null;
			showSlashMenu = false;
		}
	});

	$effect(() => {
		if (wasSaving && !editor.saving && !editor.dirty) {
			justSaved = true;
			setTimeout(() => justSaved = false, 1500);
		}
		wasSaving = editor.saving;
	});

	const handleTogglePreview = () => {
		editor.togglePreview();
		if (tiptap) {
			tiptap.setEditable(!editor.preview);
		}
	};

	const handleSave = () => {
		editor.save();
	};

	const handleClose = () => {
		if (editor.dirty) {
			editor.save().then(() => editor.close());
		} else {
			editor.close();
		}
	};

	const handleKeydown = (/** @type {KeyboardEvent} */ e) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			handleSave();
		}
		if (e.key === 'Escape') {
			if (showSlashMenu) {
				showSlashMenu = false;
				return;
			}
			handleClose();
		}
	};

	const toggleBold = () => tiptap?.chain().focus().toggleBold().run();
	const toggleItalic = () => tiptap?.chain().focus().toggleItalic().run();
	const toggleStrike = () => tiptap?.chain().focus().toggleStrike().run();
	const toggleCode = () => tiptap?.chain().focus().toggleCode().run();
	const toggleHighlight = () => tiptap?.chain().focus().toggleHighlight().run();
	const toggleH1 = () => tiptap?.chain().focus().toggleHeading({ level: 1 }).run();
	const toggleH2 = () => tiptap?.chain().focus().toggleHeading({ level: 2 }).run();
	const toggleH3 = () => tiptap?.chain().focus().toggleHeading({ level: 3 }).run();
	const toggleBullet = () => tiptap?.chain().focus().toggleBulletList().run();
	const toggleOrdered = () => tiptap?.chain().focus().toggleOrderedList().run();
	const toggleTaskList = () => tiptap?.chain().focus().toggleTaskList().run();
	const toggleBlockquote = () => tiptap?.chain().focus().toggleBlockquote().run();
	const toggleCodeBlock = () => tiptap?.chain().focus().toggleCodeBlock().run();
	const setHr = () => tiptap?.chain().focus().setHorizontalRule().run();

	const setLink = () => {
		if (!tiptap) return;
		const prev = tiptap.getAttributes('link').href;
		const url = prompt('URL:', prev || 'https://');
		if (url === null) return;
		if (url === '') {
			tiptap.chain().focus().unsetLink().run();
		} else {
			tiptap.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
		}
	};

	const undo = () => tiptap?.chain().focus().undo().run();
	const redo = () => tiptap?.chain().focus().redo().run();
	const canUndo = $derived.by(() => { void txCount; return tiptap?.can().undo() ?? false; });
	const canRedo = $derived.by(() => { void txCount; return tiptap?.can().redo() ?? false; });

	const isActive = (name, attrs) => { void txCount; return tiptap?.isActive(name, attrs) ?? false; };

	const charCount = $derived.by(() => { void txCount; return tiptap?.storage.characterCount?.characters() ?? 0; });
	const wordCount = $derived.by(() => { void txCount; return tiptap?.storage.characterCount?.words() ?? 0; });

	// --- Raw markdown editing (edit = source textarea, preview = rendered) ---
	/** @type {HTMLTextAreaElement|null} */
	let textareaEl = $state(null);
	let rawValue = $state('');
	let seededKey = '';
	const mdEdit = $derived(editor.markdown && !editor.preview);
	// Raw textarea shows for markdown-edit and for plain-text files (txt/json/csv).
	const rawMode = $derived(editor.plaintext || mdEdit);

	// Seed the textarea from the loaded content once per document.
	$effect(() => {
		if (!editor.loading && editor.open && editor.key !== seededKey) {
			seededKey = editor.key;
			rawValue = editor.content;
		}
	});

	// Tear down TipTap when switching to raw editing (it only renders preview / html).
	$effect(() => {
		if (rawMode && tiptap) {
			clearTimeout(autosaveTimer);
			tiptap.destroy();
			tiptap = null;
			showSlashMenu = false;
		}
	});

	const onRawInput = () => {
		editor.setContent(rawValue);
		scheduleAutosave();
	};

	/** @param {string} val @param {number} pos */
	const lineBounds = (val, pos) => {
		const start = val.lastIndexOf('\n', pos - 1) + 1;
		let end = val.indexOf('\n', pos);
		if (end === -1) end = val.length;
		return { start, end };
	};

	/** @param {(val: string, s: number, e: number) => { text: string, selStart: number, selEnd: number }} transform */
	const rawEdit = (transform) => {
		const ta = textareaEl;
		if (!ta) return;
		const r = transform(rawValue, ta.selectionStart, ta.selectionEnd);
		rawValue = r.text;
		editor.setContent(r.text);
		scheduleAutosave();
		requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(r.selStart, r.selEnd); });
	};

	/** Toggle `#`×level on the current line. @param {number} level */
	const rawHeading = (level) => rawEdit((val, s) => {
		const { start, end } = lineBounds(val, s);
		const line = val.slice(start, end);
		const m = line.match(/^(#{1,6})\s+/);
		const cur = m ? m[1].length : 0;
		const body = line.replace(/^#{1,6}\s+/, '');
		const newLine = cur === level ? body : '#'.repeat(level) + ' ' + body;
		const text = val.slice(0, start) + newLine + val.slice(end);
		const caret = start + newLine.length;
		return { text, selStart: caret, selEnd: caret };
	});

	/** Wrap/unwrap the selection with a marker. @param {string} marker */
	const rawWrap = (marker) => rawEdit((val, s, e) => {
		const sel = val.slice(s, e);
		const before = val.slice(Math.max(0, s - marker.length), s);
		const after = val.slice(e, e + marker.length);
		if (sel && before === marker && after === marker) {
			return { text: val.slice(0, s - marker.length) + sel + val.slice(e + marker.length), selStart: s - marker.length, selEnd: e - marker.length };
		}
		const insert = marker + sel + marker;
		return { text: val.slice(0, s) + insert + val.slice(e), selStart: s + marker.length, selEnd: e + marker.length };
	});

	/** Toggle a line prefix (list/quote) across selected lines. @param {string} prefix */
	const rawPrefix = (prefix) => rawEdit((val, s, e) => {
		const { start } = lineBounds(val, s);
		let endB = val.indexOf('\n', e);
		if (endB === -1) endB = val.length;
		const lines = val.slice(start, endB).split('\n');
		const allPrefixed = lines.every((l) => l.startsWith(prefix));
		const out = lines.map((l) => (allPrefixed ? l.slice(prefix.length) : prefix + l)).join('\n');
		return { text: val.slice(0, start) + out + val.slice(endB), selStart: start, selEnd: start + out.length };
	});

	/** Pretty-print the current JSON, or toast if it's invalid. */
	const formatJson = () => {
		try {
			const formatted = JSON.stringify(JSON.parse(rawValue), null, 2);
			rawValue = formatted;
			editor.setContent(formatted);
			scheduleAutosave();
		} catch {
			toast.error('Not valid JSON — can’t format');
		}
	};
</script>

<svelte:window onkeydown={handleKeydown} />

{#if editor.open}
	<div class="editor-overlay">
		<div class="editor-container">
			<!-- Header -->
			<div class="editor-header">
				<span class="editor-title">{editor.name}</span>
				<div class="editor-header-actions">
					{#if editor.saving}
						<span class="save-indicator saving">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="save-spinner"><circle cx="12" cy="12" r="10" stroke-dasharray="50" stroke-dashoffset="15"/></svg>
						</span>
					{:else if justSaved}
						<span class="save-indicator saved">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12" class="check-mark"/></svg>
						</span>
					{:else if editor.dirty}
						<span class="save-indicator unsaved"></span>
					{/if}
					{#if editor.markdown}
						<button class="editor-btn" class:active={editor.preview} onclick={handleTogglePreview} title={editor.preview ? 'Edit' : 'Preview'}>
							{#if editor.preview}
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5z"/>
								</svg>
							{:else}
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
								</svg>
							{/if}
						</button>
					{/if}
					<button class="editor-btn" onclick={handleSave} disabled={!editor.dirty || editor.saving} title="Save (Ctrl+S)">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
							<polyline points="17,21 17,13 7,13 7,21" />
							<polyline points="7,3 7,8 15,8" />
						</svg>
					</button>
					<button class="editor-btn" onclick={handleClose} title="Close (Esc)">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M18 6L6 18M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<!-- Toolbar -->
			{#if tiptap && !editor.preview}
				<div class="editor-toolbar">
					<div class="toolbar-group">
						<button class="tb" onclick={undo} disabled={!canUndo} title="Undo">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
						</button>
						<button class="tb" onclick={redo} disabled={!canRedo} title="Redo">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
						</button>
					</div>
					<div class="toolbar-sep"></div>
					<div class="toolbar-group">
						<button class="tb" class:active={isActive('bold')} onclick={toggleBold} title="Bold">B</button>
						<button class="tb" class:active={isActive('italic')} onclick={toggleItalic} title="Italic"><em>I</em></button>
						<button class="tb" class:active={isActive('strike')} onclick={toggleStrike} title="Strikethrough"><s>S</s></button>
						<button class="tb" class:active={isActive('code')} onclick={toggleCode} title="Inline code">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>
						</button>
						<button class="tb highlight-btn" class:active={isActive('highlight')} onclick={toggleHighlight} title="Highlight">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
						</button>
					</div>
					<div class="toolbar-sep"></div>
					<div class="toolbar-group">
						<button class="tb" class:active={isActive('heading', { level: 1 })} onclick={toggleH1} title="Heading 1">H1</button>
						<button class="tb" class:active={isActive('heading', { level: 2 })} onclick={toggleH2} title="Heading 2">H2</button>
						<button class="tb" class:active={isActive('heading', { level: 3 })} onclick={toggleH3} title="Heading 3">H3</button>
					</div>
					<div class="toolbar-sep"></div>
					<div class="toolbar-group">
						<button class="tb" class:active={isActive('bulletList')} onclick={toggleBullet} title="Bullet list">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
						</button>
						<button class="tb" class:active={isActive('orderedList')} onclick={toggleOrdered} title="Ordered list">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
						</button>
						<button class="tb" class:active={isActive('taskList')} onclick={toggleTaskList} title="Task list">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="6" height="6" rx="1"/><path d="M5 8l1 1 2-2"/><line x1="13" y1="8" x2="21" y2="8"/><rect x="3" y="14" width="6" height="6" rx="1"/><line x1="13" y1="17" x2="21" y2="17"/></svg>
						</button>
						<button class="tb" class:active={isActive('blockquote')} onclick={toggleBlockquote} title="Blockquote">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg>
						</button>
					</div>
					<div class="toolbar-sep"></div>
					<div class="toolbar-group">
						<button class="tb" class:active={isActive('codeBlock')} onclick={toggleCodeBlock} title="Code block">{'{}'}</button>
						<button class="tb" onclick={setHr} title="Horizontal rule">—</button>
						<button class="tb" class:active={isActive('link')} onclick={setLink} title="Link">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
						</button>
					</div>
				</div>
			{/if}

			<!-- Raw markdown toolbar -->
			{#if mdEdit}
				<div class="editor-toolbar">
					<div class="toolbar-group">
						<button class="tb" onclick={() => rawHeading(1)} title="Heading 1">H1</button>
						<button class="tb" onclick={() => rawHeading(2)} title="Heading 2">H2</button>
						<button class="tb" onclick={() => rawHeading(3)} title="Heading 3">H3</button>
					</div>
					<div class="toolbar-sep"></div>
					<div class="toolbar-group">
						<button class="tb" onclick={() => rawWrap('**')} title="Bold"><strong>B</strong></button>
						<button class="tb" onclick={() => rawWrap('*')} title="Italic"><em>I</em></button>
						<button class="tb" onclick={() => rawWrap('`')} title="Inline code">&lt;/&gt;</button>
					</div>
					<div class="toolbar-sep"></div>
					<div class="toolbar-group">
						<button class="tb" onclick={() => rawPrefix('- ')} title="Bullet list">•</button>
						<button class="tb" onclick={() => rawPrefix('> ')} title="Quote">&gt;</button>
					</div>
				</div>
			{/if}

			<!-- JSON toolbar -->
			{#if editor.json && !editor.loading}
				<div class="editor-toolbar">
					<button class="tb" onclick={formatJson} title="Pretty-print JSON">Format</button>
				</div>
			{/if}

			<!-- Editor content -->
			<div class="editor-body">
				{#if editor.loading}
					<div class="editor-loading">Loading document...</div>
				{:else if rawMode}
					<textarea
						class="raw-editor"
						bind:this={textareaEl}
						bind:value={rawValue}
						oninput={onRawInput}
						spellcheck="false"
						placeholder={editor.markdown ? '# Markdown source…' : 'Empty file'}
					></textarea>
				{:else}
					<div class="editor-content-wrapper">
						<div class="editor-content" bind:this={editorEl}></div>

						<!-- Slash command menu -->
						{#if showSlashMenu && filteredCommands.length > 0}
							<div
								class="slash-menu"
								style="left: {slashMenuPos.x}px; top: {slashMenuPos.y}px;"
							>
								{#each filteredCommands as cmd, i}
									<button
										class="slash-item"
										class:selected={i === slashSelectedIdx}
										onmousedown={(e) => { e.preventDefault(); executeSlashCommand(cmd); }}
										onmouseenter={() => (slashSelectedIdx = i)}
									>
										<span class="slash-icon">{cmd.icon}</span>
										<span>{cmd.label}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			{#if tiptap}
				<div class="editor-footer">
					<span>{wordCount} words</span>
					<span class="footer-sep">·</span>
					<span>{charCount} characters</span>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.editor-overlay {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: var(--bg-secondary);
		display: flex;
		flex-direction: column;
	}

	.editor-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		max-width: 900px;
		width: 100%;
		margin: 0 auto;
		background: var(--bg-primary);
		box-shadow: -1px 0 0 var(--border), 1px 0 0 var(--border);
	}

	.editor-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 20px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.editor-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.editor-header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.save-indicator {
		display: flex;
		align-items: center;
	}

	.save-indicator.unsaved::after {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #f0ad4e;
	}

	.save-indicator.saving {
		color: var(--text-muted);
	}

	.save-spinner {
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.save-indicator.saved {
		color: #4caf50;
		animation: fade-out 1.5s ease forwards;
	}

	.check-mark {
		stroke-dasharray: 24;
		stroke-dashoffset: 24;
		animation: draw-check 0.3s ease forwards;
	}

	@keyframes draw-check {
		to { stroke-dashoffset: 0; }
	}

	@keyframes fade-out {
		0%, 60% { opacity: 1; }
		100% { opacity: 0; }
	}

	.editor-btn {
		padding: 6px;
		border-radius: 6px;
		color: var(--text-secondary);
		transition: all var(--transition);
	}

	.editor-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.editor-btn:disabled {
		opacity: 0.3;
	}

	.editor-btn.active {
		color: var(--accent);
	}

	/* Toolbar */
	.editor-toolbar {
		display: flex;
		align-items: center;
		padding: 6px 20px;
		border-bottom: 1px solid var(--border-subtle, var(--border));
		flex-shrink: 0;
		flex-wrap: wrap;
		gap: 2px;
	}

	.toolbar-group {
		display: flex;
		gap: 2px;
	}

	.toolbar-sep {
		width: 1px;
		height: 20px;
		background: var(--border);
		margin: 0 6px;
	}

	.tb {
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
		transition: all var(--transition);
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 28px;
		height: 28px;
	}

	.tb:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.tb.active {
		background: var(--accent-dim);
		color: var(--accent);
	}

	/* Editor body */
	.editor-body {
		flex: 1;
		overflow-y: auto;
		padding: 24px 20px;
	}

	.editor-loading {
		text-align: center;
		color: var(--text-muted);
		padding: 48px;
		font-size: 14px;
	}

	.raw-editor {
		display: block;
		width: 100%;
		min-height: 100%;
		box-sizing: border-box;
		resize: none;
		border: none;
		outline: none;
		background: transparent;
		color: var(--text-primary);
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 14px;
		line-height: 1.7;
		tab-size: 2;
	}
	.raw-editor::placeholder { color: var(--text-muted); }

	.editor-content-wrapper {
		position: relative;
		min-height: 100%;
	}

	.editor-content {
		min-height: 100%;
	}

	/* Footer */
	.editor-footer {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px 20px;
		border-top: 1px solid var(--border);
		font-size: 12px;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.footer-sep {
		opacity: 0.5;
	}

	/* Slash command menu */
	.slash-menu {
		position: absolute;
		z-index: 10;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 4px;
		min-width: 180px;
		max-height: 280px;
		overflow-y: auto;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
		animation: slash-in 0.12s ease-out;
	}

	@keyframes slash-in {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.slash-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		border-radius: 6px;
		font-size: 13px;
		color: var(--text-primary);
		text-align: left;
		transition: background var(--transition);
	}

	.slash-item:hover,
	.slash-item.selected {
		background: var(--bg-hover);
	}

	.slash-icon {
		width: 24px;
		text-align: center;
		font-weight: 600;
		color: var(--text-secondary);
		flex-shrink: 0;
	}

	/* TipTap content styles */
	.editor-content :global(.tiptap) {
		outline: none;
		min-height: 300px;
		font-size: 16px;
		line-height: 1.7;
		color: var(--text-primary);
		caret-color: transparent;
	}

	.editor-content :global(.thick-cursor) {
		display: inline-block;
		width: 2.5px;
		height: 1.2em;
		background: var(--accent);
		margin-left: -1px;
		vertical-align: text-bottom;
		animation: cursor-blink 1s step-end infinite;
		pointer-events: none;
	}

	@keyframes cursor-blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}

	.editor-content :global(.tiptap p) {
		margin: 0 0 0.75em;
	}

	.editor-content :global(.tiptap h1) {
		font-size: 2em;
		font-weight: 700;
		margin: 1em 0 0.5em;
		line-height: 1.2;
	}

	.editor-content :global(.tiptap h2) {
		font-size: 1.5em;
		font-weight: 600;
		margin: 0.8em 0 0.4em;
		line-height: 1.3;
	}

	.editor-content :global(.tiptap h3) {
		font-size: 1.2em;
		font-weight: 600;
		margin: 0.6em 0 0.3em;
		line-height: 1.4;
	}

	.editor-content :global(.tiptap ul),
	.editor-content :global(.tiptap ol) {
		padding-left: 1.5em;
		margin: 0.5em 0;
	}

	.editor-content :global(.tiptap li) {
		margin: 0.2em 0;
	}

	.editor-content :global(.tiptap blockquote) {
		border-left: 3px solid var(--border);
		padding-left: 1em;
		margin: 0.5em 0;
		color: var(--text-secondary);
		font-style: italic;
	}

	.editor-content :global(.tiptap code) {
		background: var(--bg-secondary);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 0.9em;
		font-family: monospace;
	}

	.editor-content :global(.tiptap pre) {
		background: var(--bg-secondary);
		padding: 16px;
		border-radius: 8px;
		overflow-x: auto;
		margin: 0.75em 0;
	}

	.editor-content :global(.tiptap pre code) {
		background: none;
		padding: 0;
		font-size: 14px;
	}

	.editor-content :global(.tiptap a) {
		color: var(--accent);
		text-decoration: underline;
	}

	.editor-content :global(.tiptap hr) {
		border: none;
		border-top: 1px solid var(--border);
		margin: 1.5em 0;
	}

	.editor-content :global(.tiptap p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		color: var(--text-muted);
		pointer-events: none;
		height: 0;
	}

	.editor-content :global(.tiptap s) {
		text-decoration: line-through;
	}

	.editor-content :global(.tiptap mark) {
		background: rgba(255, 220, 0, 0.4);
		border-radius: 2px;
		padding: 1px 2px;
	}

	/* Task list styles */
	.editor-content :global(.tiptap ul[data-type="taskList"]) {
		list-style: none;
		padding-left: 0;
	}

	.editor-content :global(.tiptap ul[data-type="taskList"] li) {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0.3em 0;
	}

	.editor-content :global(.tiptap ul[data-type="taskList"] li label) {
		flex-shrink: 0;
		margin-top: 4px;
	}

	.editor-content :global(.tiptap ul[data-type="taskList"] li label input[type="checkbox"]) {
		accent-color: var(--accent);
		width: 16px;
		height: 16px;
		cursor: pointer;
	}

	.editor-content :global(.tiptap ul[data-type="taskList"] li div) {
		flex: 1;
	}

	.editor-content :global(.tiptap ul[data-type="taskList"] li[data-checked="true"] div) {
		text-decoration: line-through;
		opacity: 0.6;
	}

	/* Image styles */
	.editor-content :global(.tiptap img) {
		max-width: 100%;
		height: auto;
		border-radius: 8px;
		margin: 0.75em 0;
	}

	.editor-content :global(.tiptap img.ProseMirror-selectednode) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.editor-content :global(.tiptap .image-resizer) {
		display: inline-flex;
		position: relative;
		cursor: default;
	}

	.editor-content :global(.tiptap .image-resizer .resize-trigger) {
		position: absolute;
		right: -4px;
		bottom: -4px;
		width: 12px;
		height: 12px;
		background: var(--accent);
		border-radius: 50%;
		cursor: nwse-resize;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.editor-content :global(.tiptap .image-resizer:hover .resize-trigger) {
		opacity: 1;
	}

	.tb:disabled {
		opacity: 0.25;
		cursor: default;
	}
</style>

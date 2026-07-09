# Product

## Register

product

## Users

Power users and developers who manage large numbers of files and folders daily and are frustrated by the speed and rigidity of native OS file explorers. They value keyboard-driven workflows, information density, and predictable, fast feedback over decoration. Their context: a desktop, often multiple drives/large directories, frequently switching between file management and other technical tools (editors, terminals, git).

## Product Purpose

Schlag is a modern desktop file explorer that feels significantly faster and more capable than the native OS file explorer. It combines the best aspects of Everything, Finder, Files, VS Code, Raycast, and Obsidian into one application, built on indexed search (SQLite + Tantivy) instead of live rescans. Success looks like: instant search and navigation, no UI blocking on heavy operations, and users adopting it as their daily-driver file manager instead of the OS default.

## Brand Personality

Utilitarian yet premium. Technical minimalism: dark-first, power-tool aesthetic that reduces visual noise and emphasizes content. Feels "as powerful as a terminal but as intuitive as a modern web app." Sharp execution, meticulous alignment, subtle depth over heavy decoration — a "pro-tool" feel, not consumer-friendly softness.

## Anti-references

Explicitly NOT a clone of Windows Explorer — that's the default it's replacing, not the aesthetic or interaction model to imitate. Avoid: skeuomorphic/decorative chrome, heavy drop shadows, playful/rounded-friendly consumer styling, unnecessary animation, anything that feels like a "toy" file manager. Reference points instead: Everything (search speed), Finder (navigation clarity), Files (modern OS-native polish), VS Code (dense pro-tool UI), Raycast (fast keyboard-driven interaction), Obsidian (dark, technical, content-forward).

## Design Principles

- Speed is the feature — every interaction should feel immediate; never block the UI thread for filesystem, search, or indexing work.
- Density with clarity — pack information (file lists, metadata, paths) tightly without sacrificing scannability; this is a tool for power users, not a lifestyle app.
- Restraint over decoration — subtle borders and tonal layering carry hierarchy, not shadows, gradients, or ornament.
- Native-feeling, not native-cloning — match the platform's responsiveness and conventions without literally imitating the OS file explorer's look.
- Keyboard and mouse parity — every mouse-driven action should have a reasonable path to a fast, discoverable equivalent for power users.

## Accessibility & Inclusion

WCAG AA target: body text ≥4.5:1 contrast, large/bold text ≥3:1, visible focus states on all interactive elements, full keyboard navigability for core file operations (navigate, rename, delete, create). No colorblind-specific palette constraints or reduced-motion requirements documented beyond WCAG AA baseline.

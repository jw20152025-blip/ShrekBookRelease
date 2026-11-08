
/* ============================================================
   SHREKBOOK THEME SYSTEM v3.0
   Dropdown selector, persistent themes, random palettes.
   ============================================================ */

(function () {
    "use strict";

    const STORAGE_KEY = "shrekbook-theme";
    const RANDOM_COLORS_KEY = "shrekbook-random-colors";

    const THEMES = [
        "default",
        "dark",
        "legacy",
        "ivory",
        "midnight",
        "terminal",
        "ocean",
        "sunset",
        "monochrome",
        "shrekbook-special",
        "1990s",
        "1980s",
        "1970s",
        "1960s",
        "random-colors",
        "random-selection"
    ];

    const FIXED_THEMES = THEMES.filter(theme =>
        theme !== "random-colors" &&
        theme !== "random-selection"
    );

    const PALETTES = {
        ivory: {
            bg: "#f7f1df",
            surface: "#fffdf5",
            text: "#403727",
            muted: "#82745e",
            border: "#e3d5b9",
            accent: "#a66d28",
            accentText: "#ffffff"
        },

        midnight: {
            bg: "#101525",
            surface: "#1b2540",
            text: "#e9efff",
            muted: "#9eaccb",
            border: "#344365",
            accent: "#6e9cff",
            accentText: "#071326"
        },

        terminal: {
            bg: "#050b07",
            surface: "#0d1910",
            text: "#9cffad",
            muted: "#58a96c",
            border: "#245b34",
            accent: "#31ed72",
            accentText: "#031008"
        },

        ocean: {
            bg: "#061e2a",
            surface: "#0c3443",
            text: "#e0fbff",
            muted: "#8dbdca",
            border: "#246174",
            accent: "#22c5c7",
            accentText: "#032629"
        },

        sunset: {
            bg: "#2b1722",
            surface: "#482536",
            text: "#fff0e6",
            muted: "#d7a5a1",
            border: "#70404c",
            accent: "#ff815b",
            accentText: "#32130e"
        },

        monochrome: {
            bg: "#101010",
            surface: "#242424",
            text: "#f4f4f4",
            muted: "#aaaaaa",
            border: "#4b4b4b",
            accent: "#ffffff",
            accentText: "#111111"
        },

        "shrekbook-special": {
            bg: "#14200c",
            surface: "#263719",
            text: "#f0f7d9",
            muted: "#b3c88c",
            border: "#526d35",
            accent: "#b1d84c",
            accentText: "#17200b"
        }
    };

    const LABELS = {
        default: "☀️ Default",
        dark: "🌑 Dark",
        legacy: "🕰️ Legacy",
        ivory: "🤍 Ivory",
        midnight: "🌌 Midnight",
        terminal: "💻 Terminal",
        ocean: "🌊 Ocean",
        sunset: "🌅 Sunset",
        monochrome: "⚫ Monochrome",
        "1990s": "💾 1990s — Pre-Web Test",
        "1980s": "📼 1980s — VHS Prototype",
        "1970s": "📻 1970s — Experimental Mainframe",
        "1960s": "⌨️ 1960s — Binary Research Prototype",
        "shrekbook-special": "🧅 ShrekBook Special",
        "random-colors": "🌈 Random Colors",
        "random-selection": "🎲 Random Selection"
    };
    /* ============================================================
    SHREKBOOK THEME AI — KNOWLEDGE DATABASE
    Descriptions, moods, colours and searchable characteristics.
    ============================================================ */

    const THEME_AI_PROFILES = {

        "default": {
            description: "Clean, bright and familiar. The standard ShrekBook experience.",
            keywords: [
                "clean", "simple", "bright", "light", "normal",
                "readable", "balanced", "everyday", "plain",
                "professional", "familiar", "minimal"
            ],
            swatches: ["#ffffff", "#f5f5f5", "#398b52"]
        },

        "dark": {
            description: "Comfortable dark grey interface with restrained monochrome styling.",
            keywords: [
                "dark", "night", "comfortable", "charcoal",
                "grey", "gray", "dim", "low light",
                "dark mode", "subtle", "easy on the eyes"
            ],
            swatches: ["#17191c", "#22252a", "#343941"]
        },

        "legacy": {
            description: "Classic early World Wide Web styling, inspired by the 1990–1995 internet.",
            keywords: [
                "legacy", "classic web", "old website",
                "early internet", "traditional web",
                "old browser", "nostalgic", "90s website",
                "windows 95", "old school web"
            ],
            swatches: ["#c0c0c0", "#000080", "#e0e0e0"]
        },

        "ivory": {
            description: "Warm cream colours, soft surfaces and an elegant paper-like appearance.",
            keywords: [
                "cream", "ivory", "warm", "cozy", "cosy",
                "paper", "beige", "soft", "elegant",
                "comfortable", "gentle", "warm white"
            ]
        },

        "midnight": {
            description: "Deep navy backgrounds with cool blue highlights and a nighttime atmosphere.",
            keywords: [
                "midnight", "navy", "blue", "dark blue",
                "space", "night sky", "deep", "mysterious",
                "cool", "calm", "cosmic"
            ]
        },

        "terminal": {
            description: "Green-on-black computer terminal styling for a technical, coding-inspired look.",
            keywords: [
                "terminal", "hacker", "coding", "programming",
                "computer", "developer", "matrix", "command line",
                "green", "phosphor", "technical", "cyber",
                "retro computer", "console"
            ]
        },

        "ocean": {
            description: "Blue and turquoise colours inspired by deep water and the ocean.",
            keywords: [
                "ocean", "sea", "water", "blue", "teal",
                "turquoise", "aquatic", "marine", "calm",
                "refreshing", "cool", "underwater"
            ]
        },

        "sunset": {
            description: "Warm orange and coral highlights with a sunset-inspired palette.",
            keywords: [
                "sunset", "orange", "coral", "peach",
                "pink", "warm", "evening", "golden",
                "colourful", "colorful", "vibrant"
            ]
        },

        "monochrome": {
            description: "A minimalist black-and-white experience without colourful distractions.",
            keywords: [
                "monochrome", "black and white", "black",
                "white", "grayscale", "greyscale", "grey",
                "gray", "minimalist", "minimal", "neutral",
                "no colour", "no color"
            ]
        },

        "shrekbook-special": {
            description: "The distinctive ShrekBook identity, with unusual greens and onion-inspired styling.",
            keywords: [
                "shrek", "shrekbook", "onion", "green",
                "unique", "special", "quirky", "playful",
                "unusual", "distinctive", "custom"
            ]
        },

        "1990s": {
            description: "An unfinished early-web experiment with primitive controls and muted grey surfaces.",
            keywords: [
                "1990s", "90s", "early web", "pre web",
                "unfinished", "prototype", "experimental",
                "old internet", "primitive website",
                "grey website", "gray website", "retro web"
            ],
            swatches: ["#c8c8c8", "#dedede", "#000080"]
        },

        "1980s": {
            description: "A monochrome VHS prototype with scanlines, pixelation and subtle visual instability.",
            keywords: [
                "1980s", "80s", "vhs", "cassette",
                "tape", "television", "crt", "scanlines",
                "pixelated", "monochrome", "flickering",
                "unstable", "retro television", "analog"
            ],
            swatches: ["#080808", "#151515", "#aaaaaa"]
        },

        "1970s": {
            description: "A barely feasible experimental mainframe with olive tones, amber phosphor and heavy jitter.",
            keywords: [
                "1970s", "70s", "mainframe", "amber",
                "olive", "analog", "research laboratory",
                "research computer", "primitive computer",
                "unstable", "heavy jitter", "grainy",
                "early computing", "flickering computer"
            ],
            swatches: ["#17180f", "#29291c", "#c0a04e"]
        },

        "1960s": {
            description: "An almost incomprehensible binary research prototype. Its displayed text is encoded in binary.",
            keywords: [
                "1960s", "60s", "binary", "zeros and ones",
                "zeroes and ones", "0101", "mainframe",
                "ancient computer", "experimental machine",
                "primitive computing", "room sized computer",
                "unreadable", "extremely old", "binary interface",
                "maximum chaos", "extreme jitter"
            ],
            swatches: ["#020704", "#06130a", "#a5e6a5"]
        },

        "random-colors": {
            description: "A randomly generated colour palette with changing background, surface and accent colours.",
            keywords: [
                "random colours", "random colors",
                "random palette", "colour generator",
                "color generator", "colourful", "colorful",
                "surprise colours", "surprise colors",
                "unique colours", "unique colors",
                "custom palette", "vibrant colours"
            ]
        },

        "random-selection": {
            description: "A surprise selection from all the fixed ShrekBook themes.",
            keywords: [
                "surprise me", "random theme", "choose for me",
                "pick for me", "anything", "no preference",
                "unpredictable", "random selection",
                "choose randomly", "whatever"
            ]
        }
    };
    let selector;
    let shuffleButton;

    function readStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch {
            // The theme still works for the current page.
        }
    }

    function getSavedTheme() {
        const saved = readStorage(STORAGE_KEY);
        return THEMES.includes(saved) ? saved : "default";
    }

    function generateRandomPalette() {
        const hue = Math.floor(Math.random() * 360);

        // Choose a separate accent hue, avoiding the same
        // predictable purple combination every time.
        const accentHue = (hue + 70 + Math.floor(Math.random() * 180)) % 360;

        const saturation = 28 + Math.floor(Math.random() * 38);
        const accentSaturation = 65 + Math.floor(Math.random() * 25);

        return {
            bg: `hsl(${hue}, ${saturation}%, 9%)`,
            surface: `hsl(${hue}, ${saturation}%, 15%)`,
            text: `hsl(${hue}, 18%, 96%)`,
            muted: `hsl(${hue}, 15%, 68%)`,
            border: `hsl(${hue}, ${saturation}%, 28%)`,
            accent: `hsl(${accentHue}, ${accentSaturation}%, 65%)`,
            accentText: "#101010"
        };
    }

    function getRandomPalette() {
        try {
            const saved = JSON.parse(readStorage(RANDOM_COLORS_KEY));

            if (
                saved &&
                ["bg", "surface", "text", "muted", "border", "accent", "accentText"]
                    .every(key => typeof saved[key] === "string")
            ) {
                return saved;
            }
        } catch {
            // Generate a replacement palette below.
        }

        const palette = generateRandomPalette();
        saveRandomPalette(palette);
        return palette;
    }

    function saveRandomPalette(palette) {
        writeStorage(RANDOM_COLORS_KEY, JSON.stringify(palette));
    }

    function applyPalette(palette) {
        const root = document.documentElement;

        root.style.setProperty("--sb-bg", palette.bg);
        root.style.setProperty("--sb-surface", palette.surface);
        root.style.setProperty("--sb-text", palette.text);
        root.style.setProperty("--sb-muted", palette.muted);
        root.style.setProperty("--sb-border", palette.border);
        root.style.setProperty("--sb-accent", palette.accent);
        root.style.setProperty("--sb-accent-text", palette.accentText);
    }

    function clearPalette() {
        const root = document.documentElement;

        [
            "--sb-bg",
            "--sb-surface",
            "--sb-text",
            "--sb-muted",
            "--sb-border",
            "--sb-accent",
            "--sb-accent-text"
        ].forEach(variable => {
            root.style.removeProperty(variable);
        });
    }

    function updateSelector(theme) {
        if (!selector) return;

        selector.value = theme;

        if (shuffleButton) {
            shuffleButton.hidden = theme !== "random-colors";
        }
    }

    function dispatchThemeChange(theme) {
        window.dispatchEvent(
            new CustomEvent("shrekbook:themechange", {
                detail: { theme }
            })
        );
    }

    function applyTheme(theme) {
        if (theme === "random-selection") {
            return selectRandomTheme();
        }

        if (!THEMES.includes(theme)) {
            theme = "default";
        }

        const root = document.documentElement;

        clearPalette();

        if (theme === "default") {
            root.removeAttribute("data-theme");
        } else {
            root.setAttribute("data-theme", theme);
        }

        if (PALETTES[theme]) {
            applyPalette(PALETTES[theme]);
        }

        if (theme === "random-colors") {
            applyPalette(getRandomPalette());
        }

        writeStorage(STORAGE_KEY, theme);
        updateSelector(theme);
        dispatchThemeChange(theme);

        return theme;
    }

    function selectRandomTheme() {
        const current = getSavedTheme();

        const choices = FIXED_THEMES.filter(theme =>
            theme !== current
        );

        const selected = choices[
            Math.floor(Math.random() * choices.length)
        ];

        return applyTheme(selected);
    }

    function shuffleColors() {
        const palette = generateRandomPalette();

        saveRandomPalette(palette);

        if (getSavedTheme() !== "random-colors") {
            applyTheme("random-colors");
        } else {
            applyPalette(palette);
            dispatchThemeChange("random-colors");
        }

        updateSelector("random-colors");

        return palette;
    }
    /* ============================================================
    SHREKBOOK THEME AI — RECOMMENDATION ENGINE
    ============================================================ */

    function recommendThemes(prompt) {

        const query = String(prompt || "")
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        if (!query) return [];

        const ranked = THEMES.map((theme, index) => {

            const profile = THEME_AI_PROFILES[theme];

            if (!profile) return null;

            const keywords = profile.keywords || [];

            const matches = keywords.filter(keyword => {
                return query.includes(keyword.toLowerCase());
            });

            let score = 0;

            matches.forEach(keyword => {
                score += keyword.includes(" ") ? 5 : 2;
            });

            const normalizedTheme = theme.replace(/-/g, " ");

            if (query.includes(normalizedTheme)) {
                score += 15;
            }

            return {
                theme,
                label: LABELS[theme] || theme,
                description: profile.description,
                matches,
                score,
                index,
                palette: PALETTES[theme] || null
            };

        }).filter(Boolean);

        ranked.sort((a, b) =>
            b.score - a.score || a.index - b.index
        );

        if (ranked.length && ranked[0].score === 0) {

            const fallbacks = ["default", "dark", "ivory"];

            return fallbacks.map(theme =>
                ranked.find(item => item.theme === theme)
            ).filter(Boolean);
        }

        return ranked
            .filter(item => item.score > 0)
            .slice(0, 3);
    }


    /* ============================================================
    SHREKBOOK THEME AI — COLOUR PREVIEWS
    ============================================================ */

    function getThemeAIColors(theme) {

        const profile = THEME_AI_PROFILES[theme];

        if (theme === "random-colors") {
            const palette = getRandomPalette();

            return [
                palette.bg,
                palette.surface,
                palette.accent
            ];
        }

        if (PALETTES[theme]) {
            const palette = PALETTES[theme];

            return [
                palette.bg,
                palette.surface,
                palette.accent
            ];
        }

        return profile ? profile.swatches || [] : [];
    }


    /* ============================================================
    SHREKBOOK THEME AI — USER INTERFACE
    ============================================================ */

    function createThemeAI(wrapper) {

        const aiWrapper = document.createElement("div");
        aiWrapper.className = "theme-ai";

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "theme-ai-toggle";
        toggle.textContent = "✨ Theme AI";
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-controls", "shrekbook-theme-ai-panel");

        const panel = document.createElement("section");
        panel.id = "shrekbook-theme-ai-panel";
        panel.className = "theme-ai-panel";
        panel.hidden = true;
        panel.setAttribute("aria-label", "ShrekBook Theme AI");

        // Header

        const header = document.createElement("div");
        header.className = "theme-ai-header";

        const heading = document.createElement("strong");
        heading.textContent = "🧅 ShrekBook Theme AI";

        const close = document.createElement("button");
        close.type = "button";
        close.className = "theme-ai-close";
        close.textContent = "×";
        close.setAttribute("aria-label", "Close Theme AI");

        header.append(heading, close);

        // Description

        const subtitle = document.createElement("p");
        subtitle.className = "theme-ai-subtitle";
        subtitle.textContent =
            "Describe the appearance you're looking for. I'll find the best matching themes.";

        // Search form

        const form = document.createElement("form");
        form.className = "theme-ai-form";

        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 150;
        input.placeholder =
            "e.g. A dark, calm blue theme...";
        input.setAttribute(
            "aria-label",
            "Describe your preferred theme"
        );

        const submit = document.createElement("button");
        submit.type = "submit";
        submit.className = "theme-ai-submit";
        submit.textContent = "Find themes";

        form.append(input, submit);

        // Results

        const results = document.createElement("div");
        results.className = "theme-ai-results";
        results.setAttribute("aria-live", "polite");

        // Panel status

        const status = document.createElement("p");
        status.className = "theme-ai-status";

        panel.append(
            header,
            subtitle,
            form,
            results,
            status
        );

        // Toggle panel

        toggle.addEventListener("click", () => {

            panel.hidden = !panel.hidden;

            toggle.setAttribute(
                "aria-expanded",
                String(!panel.hidden)
            );

            if (!panel.hidden) {
                input.focus();
            }
        });

        close.addEventListener("click", () => {
            panel.hidden = true;
            toggle.setAttribute("aria-expanded", "false");
        });

        // Generate recommendations

        form.addEventListener("submit", event => {

            event.preventDefault();

            const recommendations = recommendThemes(input.value);

            results.replaceChildren();
            status.textContent = "";

            if (!recommendations.length) {

                status.textContent =
                    "Describe a mood, colour, era or visual style first.";

                return;
            }

            const title = document.createElement("p");
            title.className = "theme-ai-result-heading";
            title.textContent = "Your best matches:";

            results.appendChild(title);

            recommendations.forEach((recommendation, index) => {

                const card = document.createElement("article");
                card.className = "theme-ai-card";

                // Theme name

                const name = document.createElement("strong");
                name.className = "theme-ai-name";

                name.textContent =
                    `${index + 1}. ${recommendation.label}`;

                // Description

                const description = document.createElement("p");
                description.className = "theme-ai-description";
                description.textContent =
                    recommendation.description;

                // Matching characteristics

                if (recommendation.matches.length) {

                    const matched = document.createElement("small");
                    matched.className = "theme-ai-matches";

                    matched.textContent =
                        "Matched: " +
                        recommendation.matches.slice(0, 4).join(", ");

                    card.append(name, description, matched);

                } else {

                    card.append(name, description);
                }

                // Colour preview

                const colors = getThemeAIColors(recommendation.theme);

                if (colors.length) {

                    const swatches = document.createElement("div");
                    swatches.className = "theme-ai-swatches";

                    colors.forEach(color => {

                        const swatch = document.createElement("span");
                        swatch.className = "theme-ai-swatch";
                        swatch.style.backgroundColor = color;

                        swatches.appendChild(swatch);
                    });

                    card.appendChild(swatches);
                }

                // Apply button

                const apply = document.createElement("button");
                apply.type = "button";
                apply.className = "theme-ai-apply";
                apply.textContent =
                    recommendation.theme === "random-selection"
                        ? "Surprise me"
                        : "Apply theme";

                apply.addEventListener("click", () => {

                    applyTheme(recommendation.theme);

                    const actualTheme = getSavedTheme();

                    status.textContent =
                        actualTheme === recommendation.theme
                            ? `${LABELS[actualTheme]} applied!`
                            : `Random selection applied: ${LABELS[actualTheme]}`;
                });

                card.appendChild(apply);
                results.appendChild(card);
            });
        });

        aiWrapper.append(toggle, panel);
        wrapper.appendChild(aiWrapper);
    }
    function createThemeSelector() {
        if (document.getElementById("theme-selector")) return;

        const nav = document.querySelector(".navbar nav");
        if (!nav) return;

        const wrapper = document.createElement("div");
        wrapper.className = "theme-selector";
        wrapper.id = "theme-selector";

        const select = document.createElement("select");
        select.id = "shrekbook-theme-select";
        select.setAttribute("aria-label", "Choose ShrekBook theme");

        const groups = [
            {
                label: "Original themes",
                themes: ["default", "dark", "legacy"]
            },
            {
                label: "New themes",
                themes: [
                    "ivory",
                    "midnight",
                    "terminal",
                    "ocean",
                    "sunset",
                    "monochrome",
                    "shrekbook-special"
                ]
            },
            {
                label: "Experimental eras",
                themes: ["1990s", "1980s", "1970s", "1960s"]
            },
            {
                label: "Random themes",
                themes: ["random-colors", "random-selection"]
            }
        ];

        groups.forEach(group => {
            const optgroup = document.createElement("optgroup");
            optgroup.label = group.label;

            group.themes.forEach(theme => {
                const option = document.createElement("option");
                option.value = theme;
                option.textContent = LABELS[theme];
                optgroup.appendChild(option);
            });

            select.appendChild(optgroup);
        });

        select.addEventListener("change", () => {
            applyTheme(select.value);
        });

        const shuffle = document.createElement("button");
        shuffle.type = "button";
        shuffle.className = "theme-shuffle";
        shuffle.textContent = "↻";
        shuffle.title = "Generate another random colour palette";
        shuffle.setAttribute("aria-label", "Shuffle random colours");
        shuffle.hidden = true;

        shuffle.addEventListener("click", shuffleColors);

        wrapper.appendChild(select);
        wrapper.appendChild(shuffle);

        createThemeAI(wrapper);

        nav.appendChild(wrapper);

        selector = select;
        shuffleButton = shuffle;

        updateSelector(getSavedTheme());
    }

    function initializeThemes() {
        applyTheme(getSavedTheme());
        createThemeSelector();
    }
    /* ============================================================
    SHREKBOOK 1960s — BINARY DISPLAY ENGINE
    Converts visible page text into UTF-8 binary.
    Automatically handles dynamically added content.
    ============================================================ */

    const binaryTextOriginals = new WeakMap();
    const binaryEncoder = new TextEncoder();

    let binaryModeActive = false;
    let binaryTextObserver = null;

    function toBinaryText(value) {
        return Array.from(
            binaryEncoder.encode(value),
            byte => byte.toString(2).padStart(8, "0")
        ).join(" ");
    }

    function shouldConvertBinaryText(node) {
        if (!node || node.nodeType !== Node.TEXT_NODE) {
            return false;
        }

        if (!node.nodeValue || !node.nodeValue.trim()) {
            return false;
        }

        const parent = node.parentElement;

        if (!parent) return false;

        if (parent.closest(
            "script, style, noscript, textarea, [contenteditable='true']"
        )) {
            return false;
        }

        return true;
    }

    function convertBinaryTextNode(node) {
        if (
            !shouldConvertBinaryText(node) ||
            binaryTextOriginals.has(node)
        ) {
            return;
        }

        const original = node.nodeValue;

        binaryTextOriginals.set(node, original);
        node.nodeValue = toBinaryText(original);
    }

    function convertBinaryTree(root) {
        if (!root) return;

        if (root.nodeType === Node.TEXT_NODE) {
            convertBinaryTextNode(root);
            return;
        }

        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT
        );

        let node;

        while ((node = walker.nextNode())) {
            convertBinaryTextNode(node);
        }
    }

    function restoreBinaryTree(root) {
        if (!root) return;

        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT
        );

        let node;

        while ((node = walker.nextNode())) {
            if (!binaryTextOriginals.has(node)) continue;

            node.nodeValue = binaryTextOriginals.get(node);
            binaryTextOriginals.delete(node);
        }
    }

    function startBinaryMode() {
        if (!document.body || binaryModeActive) return;

        binaryModeActive = true;

        convertBinaryTree(document.body);

        binaryTextObserver = new MutationObserver(records => {
            records.forEach(record => {
                if (record.type === "childList") {
                    record.addedNodes.forEach(convertBinaryTree);
                }

                if (record.type === "characterData") {
                    const node = record.target;

                    if (!shouldConvertBinaryText(node)) return;

                    if (binaryTextOriginals.has(node)) {
                        const original = binaryTextOriginals.get(node);

                        if (node.nodeValue !== toBinaryText(original)) {
                            const updatedText = node.nodeValue;

                            binaryTextOriginals.set(node, updatedText);
                            node.nodeValue = toBinaryText(updatedText);
                        }
                    } else {
                        convertBinaryTextNode(node);
                    }
                }
            });
        });

        binaryTextObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    function stopBinaryMode() {
        if (!binaryModeActive) return;

        binaryModeActive = false;

        if (binaryTextObserver) {
            binaryTextObserver.disconnect();
            binaryTextObserver = null;
        }

        restoreBinaryTree(document.body);
    }

    function syncBinaryMode() {
        const enabled =
            document.documentElement.getAttribute("data-theme") === "1960s";

        if (enabled) {
            startBinaryMode();
        } else {
            stopBinaryMode();
        }
    }

    const binaryThemeWatcher = new MutationObserver(syncBinaryMode);

    binaryThemeWatcher.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"]
    });

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            syncBinaryMode,
            { once: true }
        );
    }

    syncBinaryMode();
    window.ShrekBookThemes = {
        set: applyTheme,
        get: getSavedTheme,
        list: () => [...THEMES],
        shuffle: shuffleColors,
        random: selectRandomTheme,
        ai: {

            recommend: requestThemeAI,

            apply: async prompt => {

                const result = await requestThemeAI(prompt);

                const best = result.recommendations[0];

                return best
                    ? applyTheme(best.theme)
                    : null;
            },

            data: () => THEMES.map(theme => ({
                theme,
                label: LABELS[theme],
                description: THEME_AI_PROFILES[theme].description,
                keywords: [
                    ...(THEME_AI_PROFILES[theme].keywords || [])
                ],
                palette: PALETTES[theme]
                    ? { ...PALETTES[theme] }
                    : null
            }))
        },   
        getPalette: () => {
            const theme = getSavedTheme();

            if (theme === "random-colors") {
                return { ...getRandomPalette() };
            }

            if (PALETTES[theme]) {
                return { ...PALETTES[theme] };
            }

            return null;
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initializeThemes,
            { once: true }
        );
    } else {
        initializeThemes();
    }
})();

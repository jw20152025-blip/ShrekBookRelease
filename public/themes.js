
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

    const THEME_AI_MODEL = "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA";
    const THEME_AI_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
    const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
    let themeAIPipelinePromise = null;
    let themeAIEmbedderPromise = null;
    let themeAIVectorsPromise = null;
    const themeAIHistory = [];

    const THEME_AI_DATA = Object.fromEntries(THEMES.map(theme => {
        const profile = THEME_AI_PROFILES[theme] || {};
        return [theme, {
            description: profile.description || LABELS[theme] || theme,
            keywords: Array.isArray(profile.keywords) ? profile.keywords : [],
            swatches: profile.swatches || (PALETTES[theme] ? [PALETTES[theme].bg, PALETTES[theme].surface, PALETTES[theme].accent] : [])
        }];
    }));

    const THEME_AI_CANDIDATES = THEMES.filter(theme =>
        theme !== "random-selection" && theme !== "random-colors"
    );

    function getThemeAICatalogue() {
        return THEMES.map(theme => ({
            id: theme,
            label: LABELS[theme],
            description: THEME_AI_DATA[theme].description,
            keywords: THEME_AI_DATA[theme].keywords
        }));
    }

    async function loadThemeAI(onProgress) {
        if (!themeAIPipelinePromise) {
            themeAIPipelinePromise = (async () => {
                if (onProgress) onProgress("Loading the AI runtime...");
                const transformers = await import(TRANSFORMERS_CDN);
                transformers.env.useBrowserCache = true;
                if (onProgress) onProgress("Loading SmolLM2-135M. Its first download is about 137 MB.");

                return await transformers.pipeline(
                    "text-generation",
                    THEME_AI_MODEL,
                    {
                        dtype: "q8",
                        progress_callback: info => {
                            if (!onProgress || !info) return;
                            if (info.status === "progress") {
                                const amount = Number(info.progress);
                                onProgress(Number.isFinite(amount)
                                    ? "Downloading SmolLM2: " + Math.round(amount) + "%"
                                    : "Downloading SmolLM2 files...");
                            } else if (info.status === "done") {
                                onProgress("SmolLM2 model file loaded.");
                            }
                        }
                    }
                );
            })().catch(error => {
                themeAIPipelinePromise = null;
                throw error;
            });
        }
        return themeAIPipelinePromise;
    }

    async function loadThemeAIEmbedder(onProgress) {
        if (!themeAIEmbedderPromise) {
            themeAIEmbedderPromise = (async () => {
                if (onProgress) onProgress("Loading the semantic matching model...");
                const transformers = await import(TRANSFORMERS_CDN);
                transformers.env.useBrowserCache = true;
                return await transformers.pipeline(
                    "feature-extraction",
                    THEME_AI_EMBEDDING_MODEL,
                    {
                        dtype: "q8",
                        progress_callback: info => {
                            if (!onProgress || !info) return;
                            if (info.status === "progress") {
                                const amount = Number(info.progress);
                                onProgress(Number.isFinite(amount)
                                    ? "Downloading semantic model: " + Math.round(amount) + "%"
                                    : "Downloading semantic model files...");
                            }
                        }
                    }
                );
            })().catch(error => {
                themeAIEmbedderPromise = null;
                themeAIVectorsPromise = null;
                throw error;
            });
        }
        return themeAIEmbedderPromise;
    }

    function normalizeMatchText(value) {
        return String(value || "").toLowerCase()
            .replace(/[^a-z0-9\s-]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function getThemeAIDocument(theme) {
        const item = THEME_AI_DATA[theme];
        return [
            LABELS[theme] || theme,
            item.description,
            "Visual style and aesthetic:",
            item.keywords.join(", ")
        ].join(". ");
    }

    async function embedThemeText(embedder, value) {
        const output = await embedder(String(value || "").slice(0, 1200), {
            pooling: "mean",
            normalize: true
        });
        if (output && output.data) return Array.from(output.data);
        if (output && typeof output.tolist === "function") {
            const nested = output.tolist();
            return Array.isArray(nested[0]) ? nested[0] : nested;
        }
        throw new Error("The semantic model returned an unsupported embedding format.");
    }

    function cosineSimilarity(left, right) {
        const length = Math.min(left.length, right.length);
        if (!length) return 0;
        let dot = 0;
        let leftNorm = 0;
        let rightNorm = 0;
        for (let i = 0; i < length; i++) {
            dot += left[i] * right[i];
            leftNorm += left[i] * left[i];
            rightNorm += right[i] * right[i];
        }
        const denominator = Math.sqrt(leftNorm * rightNorm);
        return denominator ? dot / denominator : 0;
    }

    function blendEmbeddings(primary, secondary, secondaryWeight) {
        const length = Math.min(primary.length, secondary.length);
        const result = new Array(length);
        let norm = 0;
        for (let i = 0; i < length; i++) {
            result[i] = primary[i] * (1 - secondaryWeight) + secondary[i] * secondaryWeight;
            norm += result[i] * result[i];
        }
        const divisor = Math.sqrt(norm) || 1;
        return result.map(value => value / divisor);
    }

    async function getThemeAIVectors(embedder, onProgress) {
        if (!themeAIVectorsPromise) {
            themeAIVectorsPromise = Promise.all(THEME_AI_CANDIDATES.map(async theme => ({
                theme,
                vector: await embedThemeText(embedder, getThemeAIDocument(theme))
            }))).catch(error => {
                themeAIVectorsPromise = null;
                throw error;
            });
        }
        if (onProgress) onProgress("Building the theme catalogue's semantic index...");
        return themeAIVectorsPromise;
    }

    function lexicalTieBreak(query, theme) {
        const normalizedQuery = normalizeMatchText(query);
        const profile = THEME_AI_DATA[theme];
        const terms = normalizedQuery.split(" ").filter(term => term.length > 2);
        const phrases = [profile.description, ...(profile.keywords || [])]
            .map(normalizeMatchText)
            .filter(Boolean);
        let score = 0;
        for (const phrase of phrases) {
            if (phrase.length > 3 && normalizedQuery.includes(phrase)) score += 0.035;
            for (const term of terms) {
                if (phrase.split(" ").includes(term)) score += 0.006;
            }
        }
        return Math.min(score, 0.12);
    }

    function extractGeneratedText(generated) {
        if (!Array.isArray(generated) || !generated.length) return "";
        return generated.map(item => {
            if (typeof item === "string") return item;
            if (!item) return "";
            if (typeof item.generated_text === "string") return item.generated_text;
            if (Array.isArray(item.generated_text)) {
                return item.generated_text.map(part =>
                    typeof part === "string" ? part : part && part.text ? part.text : ""
                ).join(" ");
            }
            return "";
        }).filter(Boolean).join(" ").trim();
    }

    async function requestThemeAI(prompt, onProgress) {
        const cleanPrompt = String(prompt || "").trim();
        if (!cleanPrompt || cleanPrompt.length > 300) {
            throw new Error("Enter a description of up to 300 characters.");
        }

        let interpretation = "";
        let modelError = null;
        let embedder = null;
        let semanticVectors = null;
        let queryVector = null;
        let usedSemanticModel = false;

        // SmolLM2 is always attempted. It interprets unfamiliar references as
        // visual traits; it is not asked to guess a theme ID.
        try {
            const generator = await loadThemeAI(onProgress);
            if (onProgress) onProgress("SmolLM2 is interpreting the reference...");
            const generated = await generator(
                "You are the visual-style interpreter for ShrekBook. Translate the user's reference into concrete interface aesthetics: mood, colours, contrast, texture, era, energy and visual motifs. Understand internet culture and fictional references from their described vibe. Do not choose or name a ShrekBook theme. Do not repeat the request. Return one concise sentence of visual traits.\nUser reference: " + cleanPrompt + "\nVisual interpretation:",
                {
                    max_new_tokens: 64,
                    do_sample: false,
                    return_full_text: false
                }
            );
            interpretation = extractGeneratedText(generated);
            const echoedMarker = interpretation.lastIndexOf("Visual interpretation:");
            if (echoedMarker >= 0) {
                interpretation = interpretation.slice(echoedMarker + "Visual interpretation:".length).trim();
            }
            if (interpretation.length > 700) interpretation = interpretation.slice(0, 700);
            if (!interpretation) throw new Error("SmolLM2 returned an empty interpretation.");
        } catch (error) {
            modelError = error;
            console.warn("[ShrekBook Theme AI] SmolLM2 interpretation failed:", error);
        }

        // MiniLM compares meanings, not just matching theme IDs or scanning the
        // prompt for words. Its theme vectors are computed once and then cached.
        try {
            embedder = await loadThemeAIEmbedder(onProgress);
            const directVector = await embedThemeText(embedder, cleanPrompt);
            if (interpretation) {
                const interpretedVector = await embedThemeText(
                    embedder,
                    "Visual aesthetic: " + interpretation
                );
                queryVector = blendEmbeddings(directVector, interpretedVector, 0.30);
            } else {
                queryVector = directVector;
            }
            semanticVectors = await getThemeAIVectors(embedder, onProgress);
            usedSemanticModel = true;
        } catch (error) {
            console.warn("[ShrekBook Theme AI] Semantic matching model failed:", error);
        }

        let ranked;
        if (usedSemanticModel && queryVector && semanticVectors) {
            ranked = semanticVectors.map(item => ({
                theme: item.theme,
                score: cosineSimilarity(queryVector, item.vector) +
                    lexicalTieBreak(cleanPrompt + " " + interpretation, item.theme)
            })).sort((a, b) => b.score - a.score);
        } else {
            // Availability fallback only: still ranks every real theme and
            // never hardcodes Default as the answer.
            const fallbackQuery = cleanPrompt + " " + interpretation;
            const stableOrder = theme => {
                const value = fallbackQuery + "|" + theme;
                let hash = 2166136261;
                for (let i = 0; i < value.length; i++) {
                    hash ^= value.charCodeAt(i);
                    hash = Math.imul(hash, 16777619);
                }
                return hash >>> 0;
            };
            ranked = THEME_AI_CANDIDATES.map(theme => ({
                theme,
                score: lexicalTieBreak(fallbackQuery, theme)
            })).sort((a, b) =>
                b.score - a.score || stableOrder(a.theme) - stableOrder(b.theme)
            );
        }

        const recommendations = ranked.slice(0, 3).map((item, index) => ({
            theme: item.theme,
            source: usedSemanticModel ? "semantic-model" : "catalogue-fallback",
            score: Number(item.score.toFixed(4)),
            reason: THEME_AI_DATA[item.theme].description
        }));

        themeAIHistory.push({
            prompt: cleanPrompt,
            interpretation,
            themes: recommendations.map(item => item.theme)
        });
        while (themeAIHistory.length > 6) themeAIHistory.shift();

        const summary = usedSemanticModel
            ? modelError
                ? "Semantic AI matching selected these themes. SmolLM2 was unavailable, so the original description was matched directly."
                : "SmolLM2 interpreted your reference, then a neural semantic model compared it with every ShrekBook theme."
            : "The neural models could not load. Ranked catalogue matching is being used instead; no theme is forced as the default.";

        if (onProgress) onProgress("Recommendations ready.");
        return {
            summary,
            modelUsed: !modelError,
            semanticModelUsed: usedSemanticModel,
            interpretation,
            recommendations
        };
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
        const root = document.createElement("div");
        root.className = "theme-ai";

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "theme-ai-toggle";
        toggle.textContent = "✨ Theme AI";
        toggle.setAttribute("aria-expanded", "false");

        const panel = document.createElement("section");
        panel.className = "theme-ai-panel";
        panel.hidden = true;
        panel.setAttribute("aria-label", "ShrekBook Theme AI");

        const header = document.createElement("div");
        header.className = "theme-ai-header";

        const title = document.createElement("strong");
        title.textContent = "🧅 ShrekBook Theme AI";

        const close = document.createElement("button");
        close.type = "button";
        close.className = "theme-ai-close";
        close.textContent = "×";
        close.setAttribute("aria-label", "Close Theme AI");
        header.append(title, close);

        const subtitle = document.createElement("p");
        subtitle.className = "theme-ai-subtitle";
        subtitle.textContent = "Describe a mood, reference, interest or visual style. I'll recommend matching themes.";

        const modelInfo = document.createElement("small");
        modelInfo.className = "theme-ai-model-info";
        modelInfo.textContent = "SmolLM2 135M + MiniLM semantic AI · Runs locally in your browser · First use downloads both models";

        const form = document.createElement("form");
        form.className = "theme-ai-form";

        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 300;
        input.placeholder = "e.g. Strange retro internet aesthetics...";
        input.setAttribute("aria-label", "Describe your preferred aesthetic");

        const submit = document.createElement("button");
        submit.type = "submit";
        submit.className = "theme-ai-submit";
        submit.textContent = "Find themes";
        form.append(input, submit);

        const status = document.createElement("p");
        status.className = "theme-ai-status";
        status.setAttribute("aria-live", "polite");

        const results = document.createElement("div");
        results.className = "theme-ai-results";

        panel.append(header, subtitle, modelInfo, form, status, results);

        toggle.addEventListener("click", () => {
            panel.hidden = !panel.hidden;
            toggle.setAttribute("aria-expanded", String(!panel.hidden));
            if (!panel.hidden) input.focus();
        });

        close.addEventListener("click", () => {
            panel.hidden = true;
            toggle.setAttribute("aria-expanded", "false");
        });

        form.addEventListener("submit", async event => {
            event.preventDefault();
            if (!input.value.trim()) {
                status.textContent = "Describe what you like first.";
                return;
            }

            submit.disabled = true;
            submit.textContent = "Thinking...";
            results.replaceChildren();

            try {
                const data = await requestThemeAI(input.value, message => {
                    status.textContent = message;
                });

                status.textContent = data.summary;

                data.recommendations.forEach((recommendation, index) => {
                    const theme = recommendation.theme;
                    const card = document.createElement("article");
                    card.className = "theme-ai-card";

                    const name = document.createElement("strong");
                    name.className = "theme-ai-name";
                    name.textContent = (index + 1) + ". " + LABELS[theme];

                    const description = document.createElement("p");
                    description.className = "theme-ai-description";
                    description.textContent = THEME_AI_DATA[theme].description;

                    const source = document.createElement("small");
                    source.className = "theme-ai-source";
                    source.textContent = recommendation.source === "semantic-model"
                        ? "Neural semantic match"
                        : "Catalogue fallback (models unavailable)";

                    card.append(name, description, source);

                    const swatches = document.createElement("div");
                    swatches.className = "theme-ai-swatches";

                    getThemeAIColors(theme).forEach(color => {
                        const swatch = document.createElement("span");
                        swatch.className = "theme-ai-swatch";
                        swatch.style.backgroundColor = color;
                        swatch.setAttribute("aria-label", color);
                        swatches.appendChild(swatch);
                    });

                    if (swatches.childElementCount) card.appendChild(swatches);

                    const apply = document.createElement("button");
                    apply.type = "button";
                    apply.className = "theme-ai-apply";
                    apply.textContent = theme === "random-selection" ? "Surprise me" : "Apply theme";

                    apply.addEventListener("click", () => {
                        applyTheme(theme);
                        status.textContent = LABELS[getSavedTheme()] + " applied.";
                    });

                    card.appendChild(apply);
                    results.appendChild(card);
                });

                if (!data.recommendations.length) {
                    status.textContent = "Recommendations could not be displayed. Please try again.";
                }
            } catch (error) {
                status.textContent = error.message || "Theme AI could not complete the request.";
            } finally {
                submit.disabled = false;
                submit.textContent = "Find themes";
            }
        });

        root.append(toggle, panel);
        wrapper.appendChild(root);
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
                return best ? applyTheme(best.theme) : null;
            },
            data: getThemeAICatalogue,
            modelInfo: {
                name: "SmolLM2-135M-Instruct",
                parameters: 135000000,
                localInference: true,
                paidAPI: false,
                firstDownloadApproxMB: 137
            }
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

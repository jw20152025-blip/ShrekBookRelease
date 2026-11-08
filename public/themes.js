
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
        "shrekbook-special": "🧅 ShrekBook Special",
        "random-colors": "🌈 Random Colors",
        "random-selection": "🎲 Random Selection"
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

        nav.appendChild(wrapper);

        selector = select;
        shuffleButton = shuffle;

        updateSelector(getSavedTheme());
    }

    function initializeThemes() {
        applyTheme(getSavedTheme());
        createThemeSelector();
    }

    window.ShrekBookThemes = {
        set: applyTheme,
        get: getSavedTheme,
        list: () => [...THEMES],
        shuffle: shuffleColors,
        random: selectRandomTheme,
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

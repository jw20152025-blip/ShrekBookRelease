
/* ============================================================
   SHREKBOOK THEME SYSTEM v2.0
   12 THEME MODES
   ============================================================ */

(function () {
    "use strict";

    /* ========================================================
       STORAGE
       ======================================================== */

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
        !["random-colors", "random-selection"].includes(theme)
    );

    const PALETTE_VARIABLES = [
        "--sb-bg",
        "--sb-surface",
        "--sb-text",
        "--sb-muted",
        "--sb-border",
        "--sb-accent",
        "--sb-accent-text"
    ];

    /* ========================================================
       THEME PALETTES
       ======================================================== */

    const PALETTES = {

        ivory: {
            bg: "#f7f3e9",
            surface: "#fffdf7",
            text: "#38352e",
            muted: "#817b70",
            border: "#e5dfd2",
            accent: "#ad8950",
            accentText: "#ffffff"
        },

        midnight: {
            bg: "#11111f",
            surface: "#1c1b30",
            text: "#eeeaff",
            muted: "#aaa4c5",
            border: "#35314f",
            accent: "#9875ed",
            accentText: "#ffffff"
        },

        terminal: {
            bg: "#080d08",
            surface: "#101910",
            text: "#8cff8c",
            muted: "#55ad65",
            border: "#244b2b",
            accent: "#36ed62",
            accentText: "#061008"
        },

        ocean: {
            bg: "#071b2d",
            surface: "#102b42",
            text: "#e2f5ff",
            muted: "#91b7ce",
            border: "#244760",
            accent: "#20b9df",
            accentText: "#06202c"
        },

        sunset: {
            bg: "#27151b",
            surface: "#3b2026",
            text: "#fff0e7",
            muted: "#d4a69a",
            border: "#59333a",
            accent: "#ff895c",
            accentText: "#35140c"
        },

        monochrome: {
            bg: "#111111",
            surface: "#222222",
            text: "#f5f5f5",
            muted: "#aaaaaa",
            border: "#444444",
            accent: "#ffffff",
            accentText: "#111111"
        },

        "shrekbook-special": {
            bg: "#101b0c",
            surface: "#1d2c16",
            text: "#f1f7df",
            muted: "#b2c58b",
            border: "#40572c",
            accent: "#a5c94b",
            accentText: "#17200b"
        }
    };

    /* ========================================================
       RANDOM COLOR GENERATOR
       ======================================================== */

    function generateRandomPalette() {

        const hue = Math.floor(Math.random() * 360);

        const accentHue = (hue + 35) % 360;

        return {
            bg: `hsl(${hue}, 25%, 9%)`,
            surface: `hsl(${hue}, 25%, 15%)`,
            text: `hsl(${hue}, 15%, 95%)`,
            muted: `hsl(${hue}, 12%, 68%)`,
            border: `hsl(${hue}, 20%, 27%)`,
            accent: `hsl(${accentHue}, 75%, 65%)`,
            accentText: "#111111"
        };
    }

    function getRandomPalette() {

        try {
            const saved = JSON.parse(
                localStorage.getItem(RANDOM_COLORS_KEY)
            );

            if (
                saved &&
                Object.keys(PALETTES.ivory).every(key =>
                    typeof saved[key] === "string"
                )
            ) {
                return saved;
            }
        } catch (error) {
            // Generate a new palette if storage is invalid.
        }

        const palette = generateRandomPalette();

        saveRandomPalette(palette);

        return palette;
    }

    function saveRandomPalette(palette) {

        localStorage.setItem(
            RANDOM_COLORS_KEY,
            JSON.stringify(palette)
        );
    }

    /* ========================================================
       APPLY CSS VARIABLES
       ======================================================== */

    function applyPalette(palette) {

        const root = document.documentElement;

        const values = {
            "--sb-bg": palette.bg,
            "--sb-surface": palette.surface,
            "--sb-text": palette.text,
            "--sb-muted": palette.muted,
            "--sb-border": palette.border,
            "--sb-accent": palette.accent,
            "--sb-accent-text": palette.accentText
        };

        Object.entries(values).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });
    }

    function clearPalette() {

        const root = document.documentElement;

        PALETTE_VARIABLES.forEach(variable => {
            root.style.removeProperty(variable);
        });
    }

    /* ========================================================
       STORAGE
       ======================================================== */

    function getSavedTheme() {

        const saved = localStorage.getItem(STORAGE_KEY);

        return THEMES.includes(saved) ? saved : "default";
    }

    /* ========================================================
       APPLY THEME
       ======================================================== */

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

        localStorage.setItem(STORAGE_KEY, theme);

        updateThemeButtons(theme);

        window.dispatchEvent(
            new CustomEvent("shrekbook:themechange", {
                detail: { theme }
            })
        );

        return theme;
    }

    /* ========================================================
       RANDOM SELECTION
       ======================================================== */

    function selectRandomTheme() {

        const current = getSavedTheme();

        let available = FIXED_THEMES.filter(
            theme => theme !== current
        );

        if (available.length === 0) {
            available = FIXED_THEMES;
        }

        const selected = available[
            Math.floor(Math.random() * available.length)
        ];

        return applyTheme(selected);
    }

    /* ========================================================
       RANDOM COLORS REFRESH
       ======================================================== */

    function shuffleColors() {

        const palette = generateRandomPalette();

        saveRandomPalette(palette);

        if (getSavedTheme() !== "random-colors") {
            applyTheme("random-colors");
        } else {
            applyPalette(palette);

            window.dispatchEvent(
                new CustomEvent("shrekbook:themechange", {
                    detail: { theme: "random-colors" }
                })
            );
        }

        return palette;
    }

    /* ========================================================
       THEME BUTTON STATES
       ======================================================== */

    function updateThemeButtons(theme) {

        document.querySelectorAll(".theme-option")
            .forEach(button => {

                button.classList.toggle(
                    "active",
                    button.dataset.theme === theme
                );

            });
    }

    /* ========================================================
       THEME SELECTOR
       ======================================================== */

    function createThemeSelector() {

        const nav = document.querySelector(".navbar nav");

        if (!nav || document.getElementById("theme-selector")) {
            return;
        }

        const wrapper = document.createElement("div");

        wrapper.className = "theme-selector";
        wrapper.id = "theme-selector";

        const button = document.createElement("button");

        button.type = "button";
        button.className = "theme-button";
        button.textContent = "🎨 Theme";

        button.setAttribute("aria-haspopup", "true");
        button.setAttribute("aria-expanded", "false");

        const menu = document.createElement("div");

        menu.className = "theme-menu hidden";

        const options = [
            { theme: "default", label: "☀️ Default" },
            { theme: "dark", label: "🌑 Dark" },
            { theme: "legacy", label: "🕰️ Legacy" },

            { theme: "ivory", label: "🤍 Ivory" },
            { theme: "midnight", label: "🌌 Midnight" },
            { theme: "terminal", label: "💻 Terminal" },
            { theme: "ocean", label: "🌊 Ocean" },
            { theme: "sunset", label: "🌅 Sunset" },
            { theme: "monochrome", label: "⚫ Monochrome" },

            {
                theme: "shrekbook-special",
                label: "🧅 ShrekBook Special"
            },

            {
                theme: "random-colors",
                label: "🌈 Random Colors"
            },

            {
                theme: "random-selection",
                label: "🎲 Random Selection"
            }
        ];

        options.forEach(option => {

            const optionButton = document.createElement("button");

            optionButton.type = "button";
            optionButton.className = "theme-option";
            optionButton.dataset.theme = option.theme;
            optionButton.textContent = option.label;

            optionButton.addEventListener("click", function () {

                applyTheme(option.theme);

                menu.classList.add("hidden");

                button.setAttribute("aria-expanded", "false");

            });

            menu.appendChild(optionButton);
        });

        const shuffleButton = document.createElement("button");

        shuffleButton.type = "button";
        shuffleButton.className = "theme-option theme-shuffle";
        shuffleButton.textContent = "🔀 Shuffle Colors";

        shuffleButton.addEventListener("click", function () {

            shuffleColors();

            menu.classList.add("hidden");

            button.setAttribute("aria-expanded", "false");
        });

        menu.appendChild(shuffleButton);

        button.addEventListener("click", function (event) {

            event.stopPropagation();

            const isHidden = menu.classList.toggle("hidden");

            button.setAttribute("aria-expanded", String(!isHidden));
        });

        menu.addEventListener("click", function (event) {
            event.stopPropagation();
        });

        document.addEventListener("click", function () {

            menu.classList.add("hidden");

            button.setAttribute("aria-expanded", "false");
        });

        wrapper.appendChild(button);
        wrapper.appendChild(menu);

        nav.appendChild(wrapper);

        updateThemeButtons(getSavedTheme());
    }

    /* ========================================================
       INITIALIZE
       ======================================================== */

    function initializeThemes() {

        applyTheme(getSavedTheme());

        createThemeSelector();
    }

    /* ========================================================
       PUBLIC API
       ======================================================== */

    window.ShrekBookThemes = {

        set: applyTheme,

        get: getSavedTheme,

        list: () => [...THEMES],

        shuffle: shuffleColors,

        random: selectRandomTheme,

        getPalette: () => ({
            ...getRandomPalette()
        })
    };

    /* ========================================================
       START
       ======================================================== */

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

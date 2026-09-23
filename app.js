/**
 * Passphrase Generator - Core Logic
 * Developed by Yasir Divde
 *
 * - Word source: random-words package by Kevin Range via jsDelivr CDN */

import { fallbackWords } from './words.js';

// ======================================================
// INJECT STYLES FOR HIDDEN MODE
// Bullets are identical characters, so breaking anywhere leaks nothing.
// ======================================================
function injectStyles() {
    if (document.getElementById("pp-styles")) return;
    const style = document.createElement("style");
    style.id = "pp-styles";
    style.textContent = `
        #passphraseOutput.pp-hidden {
            word-break: break-all;
            overflow-wrap: anywhere;
        }
    `;
    document.head.appendChild(style);
}

// ======================================================
// LOAD random-words FROM CDN (with silent fallback)
// ======================================================
let randomWordsGenerate = null;
let DICT_SIZE = 7776;

function detectDictSize(mod) {
    const candidates = [
        mod && mod.wordList,
        mod && mod.words,
        mod && mod.default && mod.default.wordList,
        mod && mod.default && mod.default.words,
        mod && mod.default && Array.isArray(mod.default) ? mod.default : null
    ];
    for (const c of candidates) {
        if (Array.isArray(c) && c.length > 100) return c.length;
    }
    return null;
}

try {
    const mod = await import("https://cdn.jsdelivr.net/npm/random-words@2/+esm");
    randomWordsGenerate = mod.generate;
    const detected = detectDictSize(mod);
    if (detected) DICT_SIZE = detected;
} catch (e) {
    DICT_SIZE = fallbackWords.length;
}

// ======================================================
// STATE — defaults: 5 words, capitals ON, numbers ON, visible, "-"
// ======================================================
let currentWordCount = 5;
let useCapitals = true;
let useNumbers = true;
let currentSeparator = "-";
let currentPassphrase = "";
let isHidden = false;
let animationToken = 0;

const el = {};

// ======================================================
// SAFE DOM QUERY
// ======================================================
function queryElements() {
    el.passphraseOutput = document.getElementById("passphraseOutput");
    el.generateBtn      = document.getElementById("generateBtn");
    el.blockIcon        = document.getElementById("blockIcon");
    el.wordSlider       = document.getElementById("wordSlider");
    el.wordCountValue   = document.getElementById("wordCountValue");
    el.capitalsToggle   = document.getElementById("capitalsToggle");
    el.numbersToggle    = document.getElementById("numbersToggle");
    el.sepBtns          = document.querySelectorAll(".sep-btn");
    el.toggleVisibility = document.getElementById("toggleVisibilityBtn");
    el.iconEye          = document.getElementById("iconEye");
    el.iconEyeOff       = document.getElementById("iconEyeOff");
    el.copyBtn          = document.getElementById("copyBtn");
    el.iconCopy         = document.getElementById("iconCopy");
    el.iconCheck        = document.getElementById("iconCheck");
    el.qualityLabel     = document.getElementById("qualityLabel");
    el.qualityContainer = document.getElementById("qualityContainer");
    el.qualityIcon      = document.getElementById("qualityIcon");
}

// ======================================================
// SEPARATOR ENTROPY BONUS (weighted by real-world usage)
// ======================================================
function getSeparatorBonus(text) {
    if (/&/.test(text))        return 3.5;   // rare
    if (/=/.test(text))        return 3.5;   // rare
    if (/[!?]/.test(text))     return 3.0;   // less common
    if (/\./.test(text))       return 2.5;   // medium
    if (/_/.test(text))        return 2.0;   // common
    if (/-/.test(text))        return 1.5;   // most common
    if (/[^a-zA-Z0-9]/.test(text)) return 2.0;
    return 0;
}

// ======================================================
// ENTROPY (word-length + separator aware)
// ======================================================
function calculateEntropyFromText(text) {
    if (!text || text.length === 0) return 0;

    let pool = 0;
    if (/[a-z]/.test(text))        pool += 26;
    if (/[A-Z]/.test(text))        pool += 26;
    if (/[0-9]/.test(text))        pool += 10;
    if (/[^a-zA-Z0-9]/.test(text)) pool += 33;
    if (pool === 0) pool = 1;
    const charEntropy = text.length * Math.log2(pool);

    const segments = text.split(/[^a-zA-Z]+/).filter((s) => s.length > 0);
    const hasStructure = segments.length >= 3;
    if (!hasStructure) return Math.round(charEntropy);

    const basePerWord = Math.log2(DICT_SIZE);
    let wordEntropy = 0;
    for (const seg of segments) {
        const lengthBonus = Math.max(0, seg.length - 5) * 1.2;
        wordEntropy += basePerWord + lengthBonus;
    }

    if (/[A-Z]/.test(text)) wordEntropy += 2;
    if (/[0-9]/.test(text)) wordEntropy += Math.log2(9);
    wordEntropy += getSeparatorBonus(text);

    return Math.round(Math.min(wordEntropy, charEntropy));
}

// ======================================================
// QUALITY
// ======================================================
function updateQuality() {
    if (!el.qualityLabel || !el.qualityContainer) return;
    const bits = calculateEntropyFromText(currentPassphrase);

    let tier;
    if (bits < 40)        tier = "weak";
    else if (bits < 60)   tier = "good";
    else if (bits < 80)   tier = "strong";
    else                  tier = "veryStrong";

    const config = {
        weak:       { label: "Weak",        circle: "#FF4500", icon: "minus", iconColor: "#FFFFFF", text: "text-orange-600" },
        good:       { label: "Good",        circle: "#FACC15", icon: "check", iconColor: "#000000", text: "text-yellow-600" },
        strong:     { label: "Strong",      circle: "#16A34A", icon: "check", iconColor: "#FFFFFF", text: "text-green-700"  },
        veryStrong: { label: "Very Strong", circle: "#84CC16", icon: "check", iconColor: "#000000", text: "text-lime-700"   }
    }[tier];

    el.qualityLabel.textContent = config.label;
    el.qualityContainer.className =
        "flex items-center gap-2 font-semibold text-base " + config.text;

    if (el.qualityIcon) {
        el.qualityIcon.innerHTML =
            '<span class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" ' +
                'style="background-color:' + config.circle + ';">' +
                '<i data-lucide="' + config.icon + '" ' +
                    'class="w-4 h-4" ' +
                    'style="color:' + config.iconColor + '; stroke-width: 3.5;"></i>' +
            '</span>';
        if (window.lucide && typeof window.lucide.createIcons === "function") {
            window.lucide.createIcons();
        }
    }
}

// ======================================================
// RENDER
// ======================================================
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function updateOutput() {
    if (!el.passphraseOutput) return;
    if (!currentPassphrase) { el.passphraseOutput.textContent = "—"; return; }

    if (isHidden) {
        el.passphraseOutput.contentEditable = "false";
        el.passphraseOutput.classList.add("pp-hidden");
        el.passphraseOutput.textContent = "•".repeat(currentPassphrase.length);
    } else {
        el.passphraseOutput.contentEditable = "true";
        el.passphraseOutput.classList.remove("pp-hidden");

        const parts = currentPassphrase.split(currentSeparator);
        const sepEsc = escapeHtml(currentSeparator);
        const esc = parts.map(escapeHtml);
        el.passphraseOutput.innerHTML = esc.join(sepEsc + "<wbr>");
    }
}

// ======================================================
// BLOCK ICON SPIN
// ======================================================
function animateIcon() {
    if (!el.blockIcon) return;
    el.blockIcon.classList.remove("block-spinning");
    void el.blockIcon.offsetWidth;
    el.blockIcon.classList.add("block-spinning");
}

// ======================================================
// SLIDER FILL
// ======================================================
function updateSliderFill() {
    if (!el.wordSlider) return;
    const min = Number(el.wordSlider.min) || 5;
    const max = Number(el.wordSlider.max) || 10;
    const val = Number(el.wordSlider.value) || 5;
    const pct = ((val - min) / (max - min)) * 100;
    el.wordSlider.style.background =
        `linear-gradient(to right, #0056A4 0%, #0056A4 ${pct}%, #E5E7EB ${pct}%, #E5E7EB 100%)`;
}

// ======================================================
// PASSPHRASE BUILDER
// ======================================================
function buildPassphrase() {
    let rawWords;
    if (randomWordsGenerate) {
        try {
            rawWords = randomWordsGenerate({
                exactly: currentWordCount,
                minLength: 4,
                maxLength: 9
            });
        } catch (e) {
            rawWords = randomWordsGenerate(currentWordCount);
        }
    } else {
        rawWords = [];
        for (let i = 0; i < currentWordCount; i++) {
            rawWords.push(fallbackWords[Math.floor(Math.random() * fallbackWords.length)]);
        }
    }

    let words = rawWords.map((w) =>
        useCapitals ? w.charAt(0).toUpperCase() + w.slice(1) : w
    );

    if (useNumbers) {
        const digit = Math.floor(Math.random() * 9) + 1;
        const idx = Math.floor(Math.random() * words.length);
        words[idx] = words[idx] + digit;
    }

    return words.join(currentSeparator);
}

function applyPassphrase(text) {
    currentPassphrase = text;
    updateOutput();
    updateQuality();
}

// ======================================================
// GENERATION — with slot-machine roulette
// ======================================================
function generatePassphrase(withAnimation) {
    animateIcon();
    const myToken = ++animationToken;

    if (!withAnimation) {
        applyPassphrase(buildPassphrase());
        return;
    }

    const candidates = [
        buildPassphrase(),
        buildPassphrase(),
        buildPassphrase(),
        buildPassphrase()
    ];

    const delays = [70, 80, 90, 105, 125, 155, 195, 240];

    const tick = (frame) => {
        if (myToken !== animationToken) return;

        if (frame < delays.length) {
            currentPassphrase = candidates[frame % 4];
            updateOutput();
            updateQuality();
            setTimeout(() => tick(frame + 1), delays[frame]);
        } else {
            const finalIdx = Math.floor(Math.random() * 4);
            applyPassphrase(candidates[finalIdx]);
        }
    };

    tick(0);
}

// ======================================================
// UI ACTIONS
// ======================================================
function toggleVisibility() {
    isHidden = !isHidden;
    if (el.iconEye)    el.iconEye.classList.toggle("hidden", isHidden);
    if (el.iconEyeOff) el.iconEyeOff.classList.toggle("hidden", !isHidden);
    updateOutput();
}

function copyToClipboard() {
    if (!currentPassphrase) return;
    navigator.clipboard.writeText(currentPassphrase).then(function () {
        if (el.iconCopy)  el.iconCopy.classList.add("hidden");
        if (el.iconCheck) el.iconCheck.classList.remove("hidden");
        setTimeout(function () {
            if (el.iconCopy)  el.iconCopy.classList.remove("hidden");
            if (el.iconCheck) el.iconCheck.classList.add("hidden");
        }, 2000);
    }).catch(function () { /* clipboard unavailable */ });
}

// ======================================================
// EDITABLE FIELD HANDLERS
// ======================================================
function attachEditableHandlers() {
    if (!el.passphraseOutput) return;

    el.passphraseOutput.addEventListener("input", function () {
        let txt = el.passphraseOutput.textContent || "";
        txt = txt.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
        currentPassphrase = txt;
        updateQuality();
    });

    el.passphraseOutput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            el.passphraseOutput.blur();
        }
    });

    el.passphraseOutput.addEventListener("paste", function (e) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData("text/plain") || "";
        const clean = text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
        document.execCommand("insertText", false, clean);
    });
}

// ======================================================
// EVENT LISTENERS
// ======================================================
function attachListeners() {
    if (el.generateBtn) {
        el.generateBtn.addEventListener("click", function () {
            generatePassphrase(true);
        });
    }

    if (el.wordSlider) {
        el.wordSlider.addEventListener("input", function (e) {
            currentWordCount = parseInt(e.target.value, 10);
            if (el.wordCountValue) el.wordCountValue.textContent = currentWordCount;
            updateSliderFill();
            generatePassphrase(false);
        });
    }

    if (el.capitalsToggle) {
        el.capitalsToggle.addEventListener("change", function (e) {
            useCapitals = e.target.checked;
            generatePassphrase(false);
        });
    }

    if (el.numbersToggle) {
        el.numbersToggle.addEventListener("change", function (e) {
            useNumbers = e.target.checked;
            generatePassphrase(false);
        });
    }

    if (el.sepBtns && el.sepBtns.length) {
        el.sepBtns.forEach(function (btn) {
            btn.addEventListener("click", function (e) {
                el.sepBtns.forEach(function (b) {
                    if (b && b.classList) b.classList.remove("active");
                });
                if (e.currentTarget && e.currentTarget.classList) {
                    e.currentTarget.classList.add("active");
                }
                currentSeparator = e.currentTarget.getAttribute("data-separator") || "-";
                generatePassphrase(false);
            });
        });
    }

    if (el.toggleVisibility) el.toggleVisibility.addEventListener("click", toggleVisibility);
    if (el.copyBtn)          el.copyBtn.addEventListener("click", copyToClipboard);
}

// ======================================================
// INIT
// ======================================================
function init() {
    injectStyles();
    queryElements();

    if (el.wordSlider)     el.wordSlider.value = currentWordCount;
    if (el.wordCountValue) el.wordCountValue.textContent = currentWordCount;
    if (el.capitalsToggle) el.capitalsToggle.checked = useCapitals;
    if (el.numbersToggle)  el.numbersToggle.checked = useNumbers;

    attachListeners();
    attachEditableHandlers();
    updateSliderFill();

    generatePassphrase(true);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
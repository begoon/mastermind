"use strict";

// ---------------------------------------------------------------------------
// Knuth's five-guess algorithm, ported from zig/wasm/mastermind.zig.
// Codes are integers 1111..6666 (four base-6 digits, each 1..6).
// Feedback is always (inPlace, byValue) = (bulls, cows).
// ---------------------------------------------------------------------------

const PEGS = 4;
const COLORS = 6;
const N = COLORS ** PEGS; // 1296

const COLOR_NAMES = ["", "red", "orange", "yellow", "green", "blue", "purple"];

function createUniverse() {
    const universe = new Uint32Array(N);
    let off = 0;
    for (let i = 0; i < 6; i++)
        for (let j = 0; j < 6; j++)
            for (let k = 0; k < 6; k++)
                for (let l = 0; l < 6; l++)
                    universe[off++] = i * 1000 + j * 100 + k * 10 + l + 1111;
    return universe;
}

function digits(code) {
    return [Math.floor(code / 1000) % 10, Math.floor(code / 100) % 10, Math.floor(code / 10) % 10, code % 10];
}

// Pre-decoded digits for every code 0..6666 so compare() never allocates.
const DIGITS = new Uint8Array(6667 * 4);
for (let code = 1111; code <= 6666; code++) {
    const d = digits(code);
    DIGITS.set(d, code * 4);
}

const freq = new Int32Array(10);

// Returns inPlace * 10 + byValue, same packing the Zig code uses for buckets.
function compare(probe, code) {
    const po = probe * 4;
    const co = code * 4;
    freq.fill(0);
    let inPlace = 0;
    let byValue = 0;
    for (let i = 0; i < 4; i++) {
        if (DIGITS[po + i] === DIGITS[co + i]) inPlace++;
        else freq[DIGITS[co + i]]++;
    }
    for (let i = 0; i < 4; i++) {
        const pd = DIGITS[po + i];
        if (pd === DIGITS[co + i]) continue;
        if (freq[pd] > 0) {
            byValue++;
            freq[pd]--;
        }
    }
    return inPlace * 10 + byValue;
}

class Game {
    constructor() {
        this.universe = createUniverse();
        this.candidates = createUniverse(); // 0 marks an eliminated slot
        this.remaining = N;
        this.history = []; // { probe, inPlace, byValue, eliminated, remaining, snapshot }
    }

    // Minimax probe selection with Zig's rank packing:
    // rank = probe + (not in candidates) * 10000 + worstEval * 100000
    pickProbe() {
        let bestProbe = 0;
        let minRank = 0;
        const buckets = new Uint32Array(45);
        for (const probe of this.universe) {
            let probeInCandidates = 0;
            buckets.fill(0);
            let worstEval = 0;
            for (const candidate of this.candidates) {
                if (candidate === 0) continue;
                if (probe === candidate) probeInCandidates = 1;
                const v = compare(probe, candidate);
                buckets[v]++;
                if (buckets[v] > worstEval) worstEval = buckets[v];
            }
            const rank = probe + (1 - probeInCandidates) * 10000 + worstEval * 100000;
            if (minRank === 0 || rank < minRank) {
                minRank = rank;
                bestProbe = probe;
            }
        }
        return bestProbe;
    }

    // How many current candidates would yield this feedback for this probe.
    consistentCount(probe, inPlace, byValue) {
        const want = inPlace * 10 + byValue;
        let count = 0;
        for (const candidate of this.candidates) {
            if (candidate !== 0 && compare(probe, candidate) === want) count++;
        }
        return count;
    }

    eliminate(probe, inPlace, byValue) {
        const snapshot = this.candidates.slice();
        const want = inPlace * 10 + byValue;
        let eliminated = 0;
        let remaining = 0;
        for (let i = 0; i < N; i++) {
            const candidate = this.candidates[i];
            if (candidate === 0) continue;
            if (compare(probe, candidate) !== want) {
                this.candidates[i] = 0;
                eliminated++;
            } else {
                remaining++;
            }
        }
        this.remaining = remaining;
        this.history.push({ probe, inPlace, byValue, eliminated, remaining, snapshot });
    }

    undo() {
        const last = this.history.pop();
        if (!last) return null;
        this.candidates = last.snapshot;
        this.remaining = 0;
        for (const c of this.candidates) if (c !== 0) this.remaining++;
        return last;
    }

    candidateList() {
        const out = [];
        for (const c of this.candidates) if (c !== 0) out.push(c);
        return out;
    }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

const historyElement = $("history");
const guessPegsElement = $("guess-pegs");
const guessNumberElement = $("guess-number");
const tryLabelElement = $("try-label");
const remainingElement = $("remaining");
const candidatesElement = $("candidates");
const bullsInput = $("bulls");
const cowsInput = $("cows");
const feedbackForm = $("feedback-form");
const messageElement = $("message");
const undoButton = $("undo");
const restartButton = $("restart");
const inputPanel = $("input-panel");
const resultPanel = $("result-panel");
const resultTitleElement = $("result-title");
const resultTextElement = $("result-text");
const thinkingElement = $("thinking");

let game = new Game();
let currentProbe = 0;
let finished = false;

function pegsMarkup(code, small = false) {
    return digits(code)
        .map((d) => `<span class="peg ${small ? "peg-small" : ""} c${d}" title="${COLOR_NAMES[d]}">${d}</span>`)
        .join("");
}

function setMessage(text, kind = "") {
    messageElement.textContent = text;
    messageElement.className = "message" + (kind ? " " + kind : "");
    messageElement.hidden = !text;
}

function renderHistory() {
    historyElement.innerHTML = "";
    game.history.forEach((h, i) => {
        const row = document.createElement("li");
        row.className = "history-row";
        row.innerHTML = `
            <span class="history-index">#${i + 1}</span>
            <span class="pegs">${pegsMarkup(h.probe, true)}</span>
            <span class="score"><b>${h.inPlace}</b> bulls <b>${h.byValue}</b> cows</span>
            <span class="history-remaining">${h.remaining} left</span>`;
        historyElement.appendChild(row);
    });
    undoButton.disabled = game.history.length === 0;
}

function renderCandidates() {
    const list = game.candidateList();
    remainingElement.textContent = `${game.remaining} of ${N} codes still possible`;
    if (list.length > 0 && list.length <= 60) {
        candidatesElement.hidden = false;
        candidatesElement.innerHTML = list
            .map((c) => `<span class="cand ${c === currentProbe ? "cand-current" : ""}">${c}</span>`)
            .join("");
    } else {
        candidatesElement.hidden = true;
        candidatesElement.innerHTML = "";
    }
}

function renderGuess() {
    tryLabelElement.textContent = `Guess #${game.history.length + 1}`;
    guessPegsElement.innerHTML = pegsMarkup(currentProbe);
    guessNumberElement.textContent = String(currentProbe);
}

function resetInputs() {
    bullsInput.value = "";
    cowsInput.value = "";
    bullsInput.focus();
}

function showResult(title, text, kind) {
    finished = true;
    inputPanel.hidden = true;
    resultPanel.hidden = false;
    resultPanel.className = "panel result " + kind;
    resultTitleElement.textContent = title;
    resultTextElement.textContent = text;
}

function hideResult() {
    finished = false;
    inputPanel.hidden = false;
    resultPanel.hidden = true;
}

// The minimax search is ~1.7M comparisons on the first move; yield to the
// browser so the "thinking" state paints before we block the main thread.
function nextGuess() {
    thinkingElement.hidden = false;
    guessPegsElement.classList.add("dim");
    setTimeout(() => {
        currentProbe = game.pickProbe();
        thinkingElement.hidden = true;
        guessPegsElement.classList.remove("dim");
        renderGuess();
        renderCandidates();
        resetInputs();
    }, 20);
}

function parseScore(value) {
    if (value.trim() === "") return NaN;
    return Number(value);
}

feedbackForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (finished) return;

    const bulls = parseScore(bullsInput.value);
    const cows = parseScore(cowsInput.value);

    if (!Number.isInteger(bulls) || !Number.isInteger(cows)) {
        setMessage("Please enter two whole numbers, bulls and cows.", "warn");
        return;
    }
    if (bulls < 0 || bulls > 4 || cows < 0 || cows > 4 || bulls + cows > 4) {
        setMessage("Each value must be 0–4 and bulls + cows cannot exceed 4.", "warn");
        return;
    }
    if (bulls === 3 && cows === 1) {
        setMessage("3 bulls and 1 cow is impossible: if three pegs are exactly right, the fourth cannot be a misplaced match.", "warn");
        return;
    }

    if (bulls === 4) {
        game.eliminate(currentProbe, 4, 0);
        renderHistory();
        renderCandidates();
        setMessage("");
        const n = game.history.length;
        showResult("Cracked it!", `Your code is ${currentProbe}, found in ${n} ${n === 1 ? "guess" : "guesses"}.`, "win");
        return;
    }

    const consistent = game.consistentCount(currentProbe, bulls, cows);
    if (consistent === 0) {
        setMessage(
            `No code could give ${bulls} bulls and ${cows} cows for ${currentProbe} after your earlier answers. ` +
                "That answer, or one before it, must be mistaken. Correct it, or use Undo to fix a previous one.",
            "error"
        );
        bullsInput.focus();
        return;
    }

    game.eliminate(currentProbe, bulls, cows);
    setMessage("");
    renderHistory();
    nextGuess();
});

undoButton.addEventListener("click", () => {
    const last = game.undo();
    if (!last) return;
    hideResult();
    setMessage(`Undid guess #${game.history.length + 1} (${last.probe}: ${last.inPlace} bulls, ${last.byValue} cows). Answer it again.`, "info");
    currentProbe = last.probe;
    renderHistory();
    renderGuess();
    renderCandidates();
    bullsInput.value = String(last.inPlace);
    cowsInput.value = String(last.byValue);
    bullsInput.focus();
});

restartButton.addEventListener("click", () => {
    game = new Game();
    hideResult();
    setMessage("");
    renderHistory();
    nextGuess();
});

// Quick-pick chips: tapping a number fills the focused (or next empty) input.
document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
        const target = chip.dataset.target === "bulls" ? bullsInput : cowsInput;
        target.value = chip.dataset.value;
        if (target === bullsInput) cowsInput.focus();
        else feedbackForm.requestSubmit();
    });
});

renderHistory();
nextGuess();

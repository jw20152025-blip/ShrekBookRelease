/* ============================================================
   ShrekAI Web Runtime
   Browser-side ONNX Runtime Web inference

   Model:
   - Vocabulary: 2048 tokens
   - Base tokens: 0-262
   - Subword tokens: 263-2047
   - Context length: 256

   Special tokens:
   256 = <|pad|>
   257 = <|eos|>
   258 = <|system|>
   259 = <|user|>
   260 = <|assistant|>
   261 = <|tool|>
   262 = <|end|>
   ============================================================ */

class ShrekAIWeb {

    constructor(options = {}) {
        this.modelUrl = options.modelUrl;
        this.tokenizerUrl = options.tokenizerUrl;

        this.session = null;
        this.tokenizer = null;
        this.backend = null;
        this.loaded = false;

        this.VOCAB_SIZE = 2048;
        this.BASE_VOCAB_SIZE = 263;
        this.SUBWORD_START = 263;
        this.MAX_SEQ_LEN = 256;

        this.PAD_ID = 256;
        this.EOS_ID = 257;
        this.SYSTEM_ID = 258;
        this.USER_ID = 259;
        this.ASSISTANT_ID = 260;
        this.TOOL_ID = 261;
        this.END_ID = 262;

        this.defaultMaxNewTokens = 180;
        this.defaultTemperature = 0.8;
        this.defaultTopP = 0.92;
        this.defaultRepetitionPenalty = 1.05;

        this._reverseSubwords = null;
        this._subwordsById = null;
    }


    /* ============================================================
       LOAD
       ============================================================ */

    async load() {

        if (this.loaded) {
            return;
        }

        if (typeof ort === "undefined") {
            throw new Error(
                "ONNX Runtime Web is not loaded. Make sure ort.min.js loads before shrekai_web.js."
            );
        }

        if (!this.modelUrl) {
            throw new Error(
                "No ShrekAI ONNX model URL was provided."
            );
        }

        if (!this.tokenizerUrl) {
            throw new Error(
                "No ShrekAI tokenizer URL was provided."
            );
        }

        console.log("[ShrekAI] Loading tokenizer...");

        await this.loadTokenizer();

        console.log("[ShrekAI] Tokenizer loaded.");

        let webgpuError = null;

        if (
            typeof navigator !== "undefined" &&
            navigator.gpu
        ) {

            try {

                console.log("[ShrekAI] Trying WebGPU...");

                this.session =
                    await ort.InferenceSession.create(
                        this.modelUrl,
                        {
                            executionProviders: ["webgpu"],
                            graphOptimizationLevel: "all"
                        }
                    );

                this.backend = "webgpu";

                console.log(
                    "[ShrekAI] WebGPU backend ready."
                );

            } catch (error) {

                webgpuError = error;

                console.warn(
                    "[ShrekAI] WebGPU failed. Falling back to WASM.",
                    error
                );

                this.session = null;
            }
        }

        if (!this.session) {

            try {

                console.log(
                    "[ShrekAI] Loading WASM backend..."
                );

                this.session =
                    await ort.InferenceSession.create(
                        this.modelUrl,
                        {
                            executionProviders: ["wasm"],
                            graphOptimizationLevel: "all"
                        }
                    );

                this.backend = "wasm";

                console.log(
                    "[ShrekAI] WASM backend ready."
                );

            } catch (wasmError) {

                let message =
                    "Failed to load the ShrekAI ONNX model.";

                if (webgpuError) {
                    message +=
                        " WebGPU error: " +
                        (
                            webgpuError.message ||
                            webgpuError
                        );
                }

                message +=
                    " WASM error: " +
                    (
                        wasmError.message ||
                        wasmError
                    );

                throw new Error(message);
            }
        }

        this.inspectModel();

        this.loaded = true;

        console.log(
            `[ShrekAI] Ready. Backend: ${this.backend}`
        );
    }


    /* ============================================================
       TOKENIZER
       ============================================================ */

    async loadTokenizer() {

        const response = await fetch(
            this.tokenizerUrl,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {

            throw new Error(
                `Tokenizer failed to load: HTTP ${response.status}`
            );
        }

        let data;

        try {

            data = await response.json();

        } catch (error) {

            throw new Error(
                `Tokenizer JSON is invalid: ${error.message}`
            );
        }

        this.validateTokenizer(data);

        this.tokenizer = data;

        this._reverseSubwords = null;
        this._subwordsById = null;
    }


    validateTokenizer(tokenizer) {

        if (
            !tokenizer ||
            typeof tokenizer !== "object"
        ) {
            throw new Error(
                "Tokenizer is not a valid JSON object."
            );
        }

        if (
            tokenizer.vocab_size !== undefined &&
            Number(tokenizer.vocab_size) !== this.VOCAB_SIZE
        ) {

            throw new Error(
                `Tokenizer vocabulary mismatch. Expected ${this.VOCAB_SIZE}, got ${tokenizer.vocab_size}.`
            );
        }

        if (!tokenizer.subwords) {

            throw new Error(
                "Tokenizer is missing the 'subwords' table."
            );
        }

        if (
            typeof tokenizer.subwords !== "object" ||
            Array.isArray(tokenizer.subwords)
        ) {

            throw new Error(
                "Tokenizer 'subwords' must be an object."
            );
        }

        if (tokenizer.special_tokens) {

            const special =
                tokenizer.special_tokens;

            const expected = {
                "<|pad|>": this.PAD_ID,
                "<|eos|>": this.EOS_ID,
                "<|system|>": this.SYSTEM_ID,
                "<|user|>": this.USER_ID,
                "<|assistant|>": this.ASSISTANT_ID,
                "<|tool|>": this.TOOL_ID,
                "<|end|>": this.END_ID
            };

            for (
                const [token, id]
                of Object.entries(expected)
            ) {

                if (
                    special[token] !== undefined &&
                    Number(special[token]) !== id
                ) {

                    throw new Error(
                        `Special token mismatch for ${token}. Expected ${id}, got ${special[token]}.`
                    );
                }
            }
        }
    }


    /* ============================================================
       MODEL INFORMATION
       ============================================================ */

    inspectModel() {

        if (!this.session) {
            return;
        }

        console.log(
            "[ShrekAI] Model inputs:",
            this.session.inputNames
        );

        console.log(
            "[ShrekAI] Model outputs:",
            this.session.outputNames
        );

        if (
            !this.session.inputNames.includes("input_ids")
        ) {

            console.warn(
                "[ShrekAI] Warning: model does not expose an input named 'input_ids'."
            );
        }

        if (
            !this.session.outputNames.includes("logits")
        ) {

            console.warn(
                "[ShrekAI] Warning: model does not expose an output named 'logits'."
            );
        }
    }


    /* ============================================================
       UTF-8
       ============================================================ */

    encodeUTF8(text) {

        return new TextEncoder().encode(text);
    }


    decodeUTF8(bytes) {

        return new TextDecoder("utf-8").decode(bytes);
    }


    /* ============================================================
       TOKENIZER HELPERS
       ============================================================ */

    getSubwordTable() {

        return this.tokenizer?.subwords || {};
    }


    getReverseSubwordTable() {

        if (this._reverseSubwords) {
            return this._reverseSubwords;
        }

        const table =
            this.getSubwordTable();

        this._reverseSubwords = new Map();

        for (
            const [key, value]
            of Object.entries(table)
        ) {

            const id = Number(value);

            if (
                Number.isInteger(id) &&
                id >= this.SUBWORD_START &&
                id < this.VOCAB_SIZE
            ) {

                this._reverseSubwords.set(
                    key,
                    id
                );
            }
        }

        return this._reverseSubwords;
    }


    getSubwordById(id) {

        if (!this._subwordsById) {

            this._subwordsById = new Map();

            const table =
                this.getSubwordTable();

            for (
                const [token, tokenId]
                of Object.entries(table)
            ) {

                const numericId =
                    Number(tokenId);

                if (
                    Number.isInteger(numericId) &&
                    numericId >= this.SUBWORD_START &&
                    numericId < this.VOCAB_SIZE
                ) {

                    this._subwordsById.set(
                        numericId,
                        token
                    );
                }
            }
        }

        return (
            this._subwordsById.get(id) ??
            null
        );
    }


    /* ============================================================
       TOKENIZATION
       ============================================================ */

    encode(text) {

        if (typeof text !== "string") {
            text = String(text ?? "");
        }

        if (!text.length) {
            return [];
        }

        return this.encodeWithScanner(text);
    }


    encodeWithScanner(text) {

        const tokens = [];

        const specialTokens = [

            ["<|assistant|>", this.ASSISTANT_ID],

            ["<|system|>", this.SYSTEM_ID],

            ["<|user|>", this.USER_ID],

            ["<|tool|>", this.TOOL_ID],

            ["<|pad|>", this.PAD_ID],

            ["<|eos|>", this.EOS_ID],

            ["<|end|>", this.END_ID]

        ];

        let position = 0;

        while (position < text.length) {

            let matchedSpecial = false;

            for (
                const [token, id]
                of specialTokens
            ) {

                if (
                    text.startsWith(
                        token,
                        position
                    )
                ) {

                    tokens.push(id);

                    position +=
                        token.length;

                    matchedSpecial = true;

                    break;
                }
            }

            if (matchedSpecial) {
                continue;
            }

            let nextSpecial =
                text.length;

            for (
                const [token]
                of specialTokens
            ) {

                const index =
                    text.indexOf(
                        token,
                        position
                    );

                if (
                    index !== -1 &&
                    index < nextSpecial
                ) {

                    nextSpecial = index;
                }
            }

            const normalText =
                text.slice(
                    position,
                    nextSpecial
                );

            if (normalText.length) {

                tokens.push(
                    ...this.encodeNormalText(
                        normalText
                    )
                );
            }

            position = nextSpecial;
        }

        return tokens;
    }


    encodeNormalText(text) {

        const tokens = [];

        const reverseSubwords =
            this.getReverseSubwordTable();

        let position = 0;

        while (position < text.length) {

            let bestToken = null;
            let bestId = null;

            const maxLength =
                Math.min(
                    32,
                    text.length - position
                );

            for (
                let length = maxLength;
                length >= 1;
                length--
            ) {

                const candidate =
                    text.slice(
                        position,
                        position + length
                    );

                const id =
                    reverseSubwords.get(
                        candidate
                    );

                if (id !== undefined) {

                    bestToken = candidate;
                    bestId = id;

                    break;
                }
            }

            if (bestToken !== null) {

                tokens.push(bestId);

                position +=
                    bestToken.length;

                continue;
            }

            const codePoint =
                text.codePointAt(position);

            const character =
                String.fromCodePoint(
                    codePoint
                );

            const bytes =
                this.encodeUTF8(character);

            for (const byte of bytes) {
                tokens.push(byte);
            }

            position +=
                character.length;
        }

        return tokens;
    }


    /* ============================================================
       DETOKENIZATION
       ============================================================ */

    decode(tokenIds) {

        if (!Array.isArray(tokenIds)) {
            return "";
        }

        const byteValues = [];

        let output = "";

        for (const tokenId of tokenIds) {

            const id =
                Number(tokenId);

            if (id === this.PAD_ID) {
                continue;
            }

            if (
                id === this.EOS_ID ||
                id === this.END_ID
            ) {

                break;
            }

            if (
                id === this.SYSTEM_ID ||
                id === this.USER_ID ||
                id === this.ASSISTANT_ID ||
                id === this.TOOL_ID
            ) {

                continue;
            }

            if (
                id >= 0 &&
                id < 256
            ) {

                byteValues.push(id);

                continue;
            }

            if (byteValues.length) {

                output +=
                    this.decodeUTF8(
                        new Uint8Array(
                            byteValues
                        )
                    );

                byteValues.length = 0;
            }

            if (
                id >= this.SUBWORD_START &&
                id < this.VOCAB_SIZE
            ) {

                const token =
                    this.getSubwordById(id);

                if (token !== null) {
                    output += token;
                }
            }
        }

        if (byteValues.length) {

            output +=
                this.decodeUTF8(
                    new Uint8Array(
                        byteValues
                    )
                );
        }

        return output;
    }


    /* ============================================================
       MESSAGE PROMPT
       ============================================================ */

    buildPrompt(messages) {

        if (!Array.isArray(messages)) {
            messages = [];
        }

        let prompt = "";

        for (const message of messages) {

            if (!message) {
                continue;
            }

            const role =
                String(
                    message.role || "user"
                );

            const content =
                String(
                    message.content ?? ""
                );

            if (role === "system") {

                prompt +=
                    `<|system|>${content}<|end|>`;

            } else if (role === "user") {

                prompt +=
                    `<|user|>${content}<|end|>`;

            } else if (role === "assistant") {

                prompt +=
                    `<|assistant|>${content}<|end|>`;

            } else if (role === "tool") {

                prompt +=
                    `<|tool|>${content}<|end|>`;

            } else {

                prompt +=
                    `<|user|>${content}<|end|>`;
            }
        }

        prompt += "<|assistant|>";

        return prompt;
    }


    /* ============================================================
       CONTEXT MANAGEMENT
       ============================================================ */

    prepareContext(tokenIds) {

        if (
            tokenIds.length <=
            this.MAX_SEQ_LEN
        ) {

            return tokenIds;
        }

        return tokenIds.slice(
            tokenIds.length -
            this.MAX_SEQ_LEN
        );
    }


    /* ============================================================
       ONNX FORWARD PASS
       ============================================================ */

    async forward(tokenIds) {

        if (!this.session) {

            throw new Error(
                "ShrekAI model is not loaded."
            );
        }

        const context =
            this.prepareContext(
                tokenIds
            );

        if (!context.length) {

            throw new Error(
                "Cannot run the model with an empty input."
            );
        }

        const input =
            new BigInt64Array(
                context.length
            );

        for (
            let i = 0;
            i < context.length;
            i++
        ) {

            input[i] =
                BigInt(context[i]);
        }

        const inputTensor =
            new ort.Tensor(
                "int64",
                input,
                [1, context.length]
            );

        const feeds = {
            input_ids: inputTensor
        };

        const results =
            await this.session.run(
                feeds
            );

        if (!results.logits) {

            throw new Error(
                "ShrekAI ONNX model did not return a 'logits' output."
            );
        }

        return results.logits;
    }


    /* ============================================================
       LOGIT EXTRACTION
       ============================================================ */

    getLastLogits(logitsTensor) {

        if (!logitsTensor) {

            throw new Error(
                "Missing logits tensor."
            );
        }

        const data =
            logitsTensor.data;

        const dims =
            logitsTensor.dims;

        if (
            !dims ||
            dims.length < 2
        ) {

            throw new Error(
                `Unexpected logits shape: ${JSON.stringify(dims)}`
            );
        }

        const vocabSize =
            dims[dims.length - 1];

        if (
            vocabSize !==
            this.VOCAB_SIZE
        ) {

            throw new Error(
                `Model vocabulary mismatch. Expected ${this.VOCAB_SIZE}, got ${vocabSize}.`
            );
        }

        const lastOffset =
            data.length -
            vocabSize;

        return data.slice(
            lastOffset,
            lastOffset + vocabSize
        );
    }


    /* ============================================================
       SOFTMAX
       ============================================================ */

    softmax(
        logits,
        temperature = 1.0
    ) {

        const safeTemperature =
            Math.max(
                0.01,
                Number(temperature) || 1.0
            );

        const values =
            new Float64Array(
                logits.length
            );

        let maxLogit =
            -Infinity;

        for (
            let i = 0;
            i < logits.length;
            i++
        ) {

            const value =
                Number(logits[i]) /
                safeTemperature;

            values[i] = value;

            if (
                value >
                maxLogit
            ) {

                maxLogit = value;
            }
        }

        let total = 0;

        for (
            let i = 0;
            i < values.length;
            i++
        ) {

            values[i] =
                Math.exp(
                    values[i] -
                    maxLogit
                );

            total += values[i];
        }

        if (
            !Number.isFinite(total) ||
            total <= 0
        ) {

            const probability =
                1 / values.length;

            values.fill(
                probability
            );

            return values;
        }

        for (
            let i = 0;
            i < values.length;
            i++
        ) {

            values[i] /=
                total;
        }

        return values;
    }


    /* ============================================================
       REPETITION PENALTY
       ============================================================ */

    applyRepetitionPenalty(
        logits,
        generatedTokens,
        repetitionPenalty
    ) {

        const penalty =
            Number(
                repetitionPenalty
            );

        if (
            !Number.isFinite(penalty) ||
            penalty <= 1
        ) {

            return;
        }

        const seen =
            new Set(
                generatedTokens
            );

        for (const token of seen) {

            if (
                token < 0 ||
                token >= logits.length
            ) {

                continue;
            }

            const value =
                Number(
                    logits[token]
                );

            if (value > 0) {

                logits[token] =
                    value / penalty;

            } else {

                logits[token] =
                    value * penalty;
            }
        }
    }


    /* ============================================================
       TOP-P SAMPLING
       ============================================================ */

    sampleTopP(
        logits,
        temperature,
        topP,
        generatedTokens,
        repetitionPenalty
    ) {

        const adjusted =
            Float64Array.from(
                logits
            );

        this.applyRepetitionPenalty(
            adjusted,
            generatedTokens,
            repetitionPenalty
        );

        const probabilities =
            this.softmax(
                adjusted,
                temperature
            );

        const candidates = [];

        for (
            let tokenId = 0;
            tokenId < probabilities.length;
            tokenId++
        ) {

            const probability =
                probabilities[tokenId];

            if (
                Number.isFinite(
                    probability
                ) &&
                probability > 0
            ) {

                candidates.push({
                    tokenId,
                    probability
                });
            }
        }

        if (!candidates.length) {
            return this.EOS_ID;
        }

        candidates.sort(
            (a, b) =>
                b.probability -
                a.probability
        );

        const safeTopP =
            Math.min(
                1,
                Math.max(
                    0.01,
                    Number(topP) || 1
                )
            );

        let cumulative = 0;

        const filtered = [];

        for (
            const candidate
            of candidates
        ) {

            filtered.push(
                candidate
            );

            cumulative +=
                candidate.probability;

            if (
                cumulative >=
                safeTopP
            ) {

                break;
            }
        }

        const total =
            filtered.reduce(
                (sum, item) =>
                    sum +
                    item.probability,
                0
            );

        if (
            !Number.isFinite(total) ||
            total <= 0
        ) {

            return filtered[0].tokenId;
        }

        let random =
            Math.random() *
            total;

        for (
            const candidate
            of filtered
        ) {

            random -=
                candidate.probability;

            if (random <= 0) {

                return candidate.tokenId;
            }
        }

        return filtered[
            filtered.length - 1
        ].tokenId;
    }


    /* ============================================================
       GENERATION
       ============================================================ */

    async generate(
        messages,
        options = {}
    ) {

        if (!this.loaded) {
            await this.load();
        }

        if (!Array.isArray(messages)) {

            throw new Error(
                "ShrekAI.generate() expects an array of messages."
            );
        }

        const maxNewTokens =
            Math.max(
                1,
                Math.min(
                    1024,
                    Number(
                        options.maxNewTokens ??
                        this.defaultMaxNewTokens
                    )
                )
            );

        const temperature =
            Number(
                options.temperature ??
                this.defaultTemperature
            );

        const topP =
            Number(
                options.topP ??
                this.defaultTopP
            );

        const repetitionPenalty =
            Number(
                options.repetitionPenalty ??
                this.defaultRepetitionPenalty
            );

        const prompt =
            this.buildPrompt(
                messages
            );

        let tokenIds =
            this.encode(prompt);

        tokenIds =
            this.prepareContext(
                tokenIds
            );

        if (!tokenIds.length) {

            throw new Error(
                "ShrekAI prompt produced no tokens."
            );
        }

        const generatedTokens = [];
        const outputTokens = [];

        for (
            let step = 0;
            step < maxNewTokens;
            step++
        ) {

            const context =
                this.prepareContext(
                    tokenIds
                );

            const logitsTensor =
                await this.forward(
                    context
                );

            const logits =
                this.getLastLogits(
                    logitsTensor
                );

            const nextToken =
                this.sampleTopP(
                    logits,
                    temperature,
                    topP,
                    generatedTokens,
                    repetitionPenalty
                );

            if (
                nextToken ===
                this.EOS_ID ||
                nextToken ===
                this.END_ID
            ) {

                break;
            }

            if (
                nextToken ===
                this.PAD_ID ||
                nextToken ===
                this.SYSTEM_ID ||
                nextToken ===
                this.USER_ID ||
                nextToken ===
                this.ASSISTANT_ID ||
                nextToken ===
                this.TOOL_ID
            ) {

                break;
            }

            tokenIds.push(
                nextToken
            );

            generatedTokens.push(
                nextToken
            );

            outputTokens.push(
                nextToken
            );

            if (
                step % 4 === 0
            ) {

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            0
                        )
                );
            }
        }

        return this.decode(
            outputTokens
        ).trim();
    }


    /* ============================================================
       STATUS
       ============================================================ */

    getStatus() {

        return {

            loaded:
                this.loaded,

            backend:
                this.backend,

            vocabSize:
                this.VOCAB_SIZE,

            contextLength:
                this.MAX_SEQ_LEN,

            modelUrl:
                this.modelUrl,

            tokenizerUrl:
                this.tokenizerUrl
        };
    }
}


/* ================================================================
   GLOBAL EXPORT
   ================================================================= */

window.ShrekAIWeb = ShrekAIWeb;

console.log(
    "[ShrekAI] Browser runtime loaded."
);
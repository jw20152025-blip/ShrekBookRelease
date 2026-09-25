// ============================================================
// SHREKAI CLIENT
// Real ShrekAI ONNX model + Supabase persistence API
// ============================================================

document.addEventListener("DOMContentLoaded", () => {

    // ========================================================
    // CONFIG
    // ========================================================

    const RUNTIME_URL =
        "/ShrekAI/web_model/shrekai_web.js";

    const MODEL_URL =
        "/ShrekAI/web_model/shrekai.onnx";

    const TOKENIZER_URL =
        "/ShrekAI/web_model/tokenizer.json";


    const SYSTEM_PROMPT = `
You are ShrekAI.

You are the real custom AI assistant created for ShrekBook.

Personality:
- witty
- casual
- confident
- helpful
- occasionally sarcastic
- technically capable
- honest
- do not invent facts
- do not pretend you performed actions you did not perform

You are associated with ShrekBook.

Important rules:
- Answer the user's actual question.
- Do not claim to have access to information you do not have.
- Do not invent ShrekBook database tables, APIs, routes, or features.
- Preserve existing ShrekBook architecture when discussing code.
- Be concise when a short answer is enough.
- Explain technical problems clearly.
- You are ShrekAI, not ChatGPT.

The following information is persistent user memory.
Use it only when it is relevant:

{{MEMORIES}}
`;


    // ========================================================
    // DOM
    // ========================================================

    const messagesElement =
        document.getElementById("shrekai-messages");

    const inputElement =
        document.getElementById("shrekai-input");

    const sendButton =
        document.getElementById("shrekai-send");

    const clearButton =
        document.getElementById("shrekai-clear");

    const statusElement =
        document.getElementById("shrekai-status");

    const statusWrapper =
        document.getElementById(
            "shrekai-status-wrapper"
        );

    const characterCount =
        document.getElementById(
            "shrekai-character-count"
        );


    // ========================================================
    // STATE
    // ========================================================

    let shrekAI = null;

    let modelReady = false;

    let sending = false;

    let messages = [];

    let memories = [];

    let conversationId = null;


    // ========================================================
    // STATUS
    // ========================================================

    function setStatus(text, state = "") {

        if (statusElement) {
            statusElement.textContent = text;
        }


        if (!statusWrapper) {
            return;
        }


        statusWrapper.classList.remove(
            "online",
            "offline",
            "loading",
            "error"
        );


        if (state) {
            statusWrapper.classList.add(state);
        }
    }


    // ========================================================
    // COMPOSER STATE
    // ========================================================

    function updateComposerState() {

        const enabled =
            modelReady &&
            !sending;


        if (inputElement) {
            inputElement.disabled =
                !enabled;
        }


        if (sendButton) {
            sendButton.disabled =
                !enabled;
        }
    }


    // ========================================================
    // CHARACTER COUNTER
    // ========================================================

    function updateCharacterCount() {

        if (!characterCount || !inputElement) {
            return;
        }


        characterCount.textContent =
            `${inputElement.value.length} / 4000`;
    }


    // ========================================================
    // AUTO RESIZE INPUT
    // ========================================================

    function resizeInput() {

        if (!inputElement) {
            return;
        }


        inputElement.style.height =
            "auto";


        inputElement.style.height =
            `${Math.min(
                inputElement.scrollHeight,
                160
            )}px`;
    }


    // ========================================================
    // EMPTY STATE
    // ========================================================

    function removeEmptyState() {

        const empty =
            document.getElementById(
                "shrekai-empty"
            );


        if (empty) {
            empty.remove();
        }
    }


    // ========================================================
    // UI MESSAGE
    // ========================================================

    function addMessageToUI(
        role,
        content,
        save = true
    ) {

        if (!messagesElement) {
            return;
        }


        removeEmptyState();


        const wrapper =
            document.createElement("div");


        wrapper.className =
            `shrekai-message ${role}`;


        const bubble =
            document.createElement("div");


        bubble.className =
            "shrekai-message-bubble";


        bubble.textContent =
            content;


        wrapper.appendChild(
            bubble
        );


        messagesElement.appendChild(
            wrapper
        );


        messagesElement.scrollTop =
            messagesElement.scrollHeight;


        if (save) {

            messages.push({
                role,
                content
            });
        }
    }


    // ========================================================
    // THINKING INDICATOR
    // ========================================================

    function showThinking() {

        removeThinking();


        removeEmptyState();


        const wrapper =
            document.createElement("div");


        wrapper.id =
            "shrekai-thinking";


        wrapper.className =
            "shrekai-message assistant";


        const bubble =
            document.createElement("div");


        bubble.className =
            "shrekai-message-bubble";


        const thinking =
            document.createElement("div");


        thinking.className =
            "shrekai-thinking";


        const label =
            document.createElement("span");


        label.textContent =
            "ShrekAI is thinking";


        const dots =
            document.createElement("span");


        dots.className =
            "shrekai-thinking-dots";


        for (let i = 0; i < 3; i++) {

            const dot =
                document.createElement("span");

            dots.appendChild(dot);
        }


        thinking.appendChild(label);

        thinking.appendChild(dots);

        bubble.appendChild(thinking);

        wrapper.appendChild(bubble);

        messagesElement.appendChild(wrapper);


        messagesElement.scrollTop =
            messagesElement.scrollHeight;
    }


    function removeThinking() {

        const existing =
            document.getElementById(
                "shrekai-thinking"
            );


        if (existing) {
            existing.remove();
        }
    }


    // ========================================================
    // CLEAR UI
    // ========================================================

    function clearMessagesUI() {

        if (!messagesElement) {
            return;
        }


        messagesElement.innerHTML = "";
    }


    // ========================================================
    // API HELPER
    // ========================================================

    async function api(
        url,
        options = {}
    ) {

        const response =
            await fetch(
                url,
                {
                    credentials: "include",

                    ...options,

                    headers: {
                        "Content-Type":
                            "application/json",

                        ...(options.headers || {})
                    }
                }
            );


        let data = null;


        try {

            data =
                await response.json();

        } catch {

            data = null;
        }


        if (!response.ok) {

            const error =
                new Error(
                    data?.error ||
                    `API request failed (${response.status})`
                );


            error.status =
                response.status;


            throw error;
        }


        return data;
    }


    // ========================================================
    // LOAD SHREKAI WEB RUNTIME
    // ========================================================

    async function ensureShrekAIWebRuntime() {

        console.log(
            "[ShrekAI][Runtime] Checking ShrekAIWeb..."
        );


        if (
            typeof window.ShrekAIWeb === "function"
        ) {

            console.log(
                "[ShrekAI][Runtime] Runtime already loaded."
            );

            return;
        }


        const oldScripts =
            document.querySelectorAll(
                'script[src*="/ShrekAI/web_model/shrekai_web.js"]'
            );


        for (const script of oldScripts) {
            script.remove();
        }


        await new Promise(
            (resolve, reject) => {

                const script =
                    document.createElement("script");


                script.src =
                    RUNTIME_URL;


                script.onload = () => {

                    console.log(
                        "[ShrekAI][Runtime] Runtime script loaded."
                    );

                    resolve();
                };


                script.onerror = () => {

                    reject(
                        new Error(
                            `Failed to load ShrekAI runtime: ${RUNTIME_URL}`
                        )
                    );
                };


                document.head.appendChild(
                    script
                );
            }
        );


        if (
            typeof window.ShrekAIWeb !== "function"
        ) {

            throw new Error(
                "shrekai_web.js loaded but did not export window.ShrekAIWeb."
            );
        }


        console.log(
            "[ShrekAI][Runtime] ShrekAIWeb available."
        );
    }


    // ========================================================
    // LOAD MEMORIES
    // ========================================================

    async function loadMemories() {

        try {

            const data =
                await api(
                    "/api/shrekai/memories"
                );


            memories =
                Array.isArray(
                    data.memories
                )
                    ? data.memories
                    : [];


            console.log(
                "[ShrekAI] Loaded memories:",
                memories.length
            );


        } catch (error) {

            if (error.status === 401) {

                console.warn(
                    "[ShrekAI] User is not logged in."
                );

                memories = [];

                return;
            }


            console.error(
                "[ShrekAI] Failed to load memories:",
                error
            );


            memories = [];
        }
    }


    // ========================================================
    // BUILD SYSTEM PROMPT
    // ========================================================

    function buildSystemPrompt() {

        let memoryText =
            "No saved memories.";


        if (memories.length > 0) {

            memoryText =
                memories
                    .map(
                        memory =>
                            `- ${memory.memory}`
                    )
                    .join("\n");
        }


        return SYSTEM_PROMPT.replace(
            "{{MEMORIES}}",
            memoryText
        );
    }


    // ========================================================
    // LOAD CONVERSATION
    // ========================================================

    async function loadConversation(id) {

        try {

            const data =
                await api(
                    `/api/shrekai/history/${encodeURIComponent(id)}`
                );


            conversationId =
                data.conversation?.id ||
                id;


            const loadedMessages =
                Array.isArray(data.messages)
                    ? data.messages
                    : [];


            messages =
                loadedMessages
                    .filter(
                        message =>
                            [
                                "user",
                                "assistant"
                            ].includes(
                                message.role
                            )
                    )
                    .map(
                        message => ({
                            role:
                                message.role,

                            content:
                                message.content
                        })
                    );


            clearMessagesUI();


            for (
                const message
                of messages
            ) {

                addMessageToUI(
                    message.role,
                    message.content,
                    false
                );
            }


            console.log(
                "[ShrekAI] Conversation loaded:",
                conversationId
            );


        } catch (error) {

            console.error(
                "[ShrekAI] Failed to load conversation:",
                error
            );


            conversationId = null;

            messages = [];

            clearMessagesUI();
        }
    }


    // ========================================================
    // SAVE CONVERSATION
    // ========================================================

    async function saveConversation() {

        if (!messages.length) {
            return;
        }


        try {

            const data =
                await api(
                    "/api/shrekai",
                    {
                        method: "POST",

                        body: JSON.stringify({
                            conversationId,
                            messages
                        })
                    }
                );


            if (data.conversationId) {

                conversationId =
                    data.conversationId;
            }


            console.log(
                "[ShrekAI] Conversation saved:",
                conversationId
            );


        } catch (error) {

            console.error(
                "[ShrekAI] Failed to save conversation:",
                error
            );


            if (error.status === 401) {

                console.warn(
                    "[ShrekAI] Login required to save conversations."
                );
            }
        }
    }


    // ========================================================
    // GENERATE
    // ========================================================

    async function generateResponse() {

        if (!shrekAI) {

            throw new Error(
                "ShrekAI model is not loaded."
            );
        }


        const modelMessages = [

            {
                role: "system",

                content:
                    buildSystemPrompt()
            },

            ...messages
        ];


        const response =
            await shrekAI.generate(
                modelMessages,
                {
                    maxNewTokens: 180,

                    temperature: 0.8,

                    topP: 0.92,

                    repetitionPenalty: 1.05
                }
            );


        return (
            typeof response === "string"
                ? response.trim()
                : ""
        );
    }


    // ========================================================
    // SEND MESSAGE
    // ========================================================

    async function sendMessage() {

        if (sending) {
            return;
        }


        if (!modelReady) {

            setStatus(
                "ShrekAI is still loading...",
                "loading"
            );

            return;
        }


        const text =
            inputElement.value.trim();


        if (!text) {
            return;
        }


        sending = true;

        updateComposerState();


        addMessageToUI(
            "user",
            text,
            true
        );


        inputElement.value = "";

        updateCharacterCount();

        resizeInput();


        showThinking();


        try {

            setStatus(
                "ShrekAI is thinking...",
                "loading"
            );


            const response =
                await generateResponse();


            removeThinking();


            if (!response) {

                throw new Error(
                    "ShrekAI returned an empty response."
                );
            }


            addMessageToUI(
                "assistant",
                response,
                true
            );


            await saveConversation();


            setStatus(
                "ShrekAI is online",
                "online"
            );


        } catch (error) {

            console.error(
                "[ShrekAI] Generation failed:",
                error
            );


            removeThinking();


            addMessageToUI(
                "assistant",
                "ShrekAI ran into an error: " +
                (
                    error?.message ||
                    "Unknown error"
                ),
                false
            );


            setStatus(
                "ShrekAI error",
                "error"
            );


        } finally {

            sending = false;

            updateComposerState();


            if (modelReady) {
                inputElement.focus();
            }
        }
    }


    // ========================================================
    // CLEAR CHAT
    // ========================================================

    async function clearChat() {

        if (sending) {
            return;
        }


        const oldConversationId =
            conversationId;


        conversationId = null;

        messages = [];


        clearMessagesUI();


        messagesElement.innerHTML = `
            <div
                id="shrekai-empty"
                class="shrekai-empty"
            >
                <div class="shrekai-empty-icon">
                    🤖
                </div>

                <h2>
                    Fresh chat.
                </h2>

                <p>
                    The slate is clean. What are we building?
                </p>
            </div>
        `;


        setStatus(
            modelReady
                ? "ShrekAI is online"
                : "Loading ShrekAI...",
            modelReady
                ? "online"
                : "loading"
        );


        if (oldConversationId) {

            try {

                await api(
                    `/api/shrekai/history/${encodeURIComponent(oldConversationId)}`,
                    {
                        method: "DELETE"
                    }
                );


                console.log(
                    "[ShrekAI] Conversation deleted."
                );


            } catch (error) {

                console.error(
                    "[ShrekAI] Failed to delete conversation:",
                    error
                );
            }
        }
    }


    // ========================================================
    // LOAD LATEST CONVERSATION
    // ========================================================

    async function loadLatestConversation() {

        try {

            const data =
                await api(
                    "/api/shrekai/history"
                );


            const conversations =
                Array.isArray(
                    data.conversations
                )
                    ? data.conversations
                    : [];


            if (
                conversations.length > 0
            ) {

                await loadConversation(
                    conversations[0].id
                );

            } else {

                console.log(
                    "[ShrekAI] No previous conversations."
                );
            }


        } catch (error) {

            if (error.status === 401) {

                console.warn(
                    "[ShrekAI] Not logged in; history disabled."
                );

                return;
            }


            console.error(
                "[ShrekAI] Failed to load history:",
                error
            );
        }
    }


    // ========================================================
    // MODEL LOADING
    // ========================================================

    async function loadModel() {

        console.group(
            "[ShrekAI] MODEL LOAD"
        );


        try {

            modelReady = false;

            updateComposerState();


            setStatus(
                "Loading ShrekAI...",
                "loading"
            );


            console.log(
                "[ShrekAI] Browser:",
                navigator.userAgent
            );


            console.log(
                "[ShrekAI] WebGPU:",
                "gpu" in navigator
            );


            console.log(
                "[ShrekAI] ONNX Runtime:",
                typeof window.ort
            );


            // ====================================================
            // RUNTIME
            // ====================================================

            await ensureShrekAIWebRuntime();


            if (
                typeof window.ShrekAIWeb !== "function"
            ) {

                throw new Error(
                    "ShrekAIWeb runtime is unavailable."
                );
            }


            // ====================================================
            // MODEL CHECK
            // ====================================================

            const modelCheck =
                await fetch(
                    MODEL_URL,
                    {
                        method: "HEAD",
                        credentials: "same-origin"
                    }
                );


            console.log(
                "[ShrekAI] Model HTTP:",
                modelCheck.status
            );


            console.log(
                "[ShrekAI] Model type:",
                modelCheck.headers.get(
                    "content-type"
                )
            );


            console.log(
                "[ShrekAI] Model size:",
                modelCheck.headers.get(
                    "content-length"
                )
            );


            if (!modelCheck.ok) {

                throw new Error(
                    `ONNX model could not be reached. HTTP ${modelCheck.status}`
                );
            }


            // ====================================================
            // TOKENIZER CHECK
            // ====================================================

            const tokenizerCheck =
                await fetch(
                    TOKENIZER_URL,
                    {
                        method: "HEAD",
                        credentials: "same-origin"
                    }
                );


            console.log(
                "[ShrekAI] Tokenizer HTTP:",
                tokenizerCheck.status
            );


            console.log(
                "[ShrekAI] Tokenizer size:",
                tokenizerCheck.headers.get(
                    "content-length"
                )
            );


            if (!tokenizerCheck.ok) {

                throw new Error(
                    `Tokenizer could not be reached. HTTP ${tokenizerCheck.status}`
                );
            }


            // ====================================================
            // INSTANCE
            // ====================================================

            shrekAI =
                new window.ShrekAIWeb({

                    modelUrl:
                        MODEL_URL,

                    tokenizerUrl:
                        TOKENIZER_URL
                });


            if (!shrekAI) {

                throw new Error(
                    "ShrekAIWeb constructor returned nothing."
                );
            }


            if (
                typeof shrekAI.load !== "function"
            ) {

                throw new Error(
                    "ShrekAIWeb.load() is missing."
                );
            }


            if (
                typeof shrekAI.generate !== "function"
            ) {

                throw new Error(
                    "ShrekAIWeb.generate() is missing."
                );
            }


            console.log(
                "[ShrekAI] Loading ONNX model..."
            );


            const start =
                performance.now();


            await shrekAI.load();


            const elapsed =
                Math.round(
                    performance.now() - start
                );


            console.log(
                `[ShrekAI] Model loaded in ${elapsed} ms`
            );


            // ====================================================
            // SUCCESS
            // ====================================================

            modelReady = true;

            updateComposerState();


            setStatus(
                "ShrekAI is online",
                "online"
            );


            console.log(
                "[ShrekAI] MODEL READY."
            );


            if (inputElement) {
                inputElement.focus();
            }


        } catch (error) {

            modelReady = false;

            updateComposerState();


            console.error(
                "[ShrekAI] MODEL LOAD FAILED:",
                error
            );


            setStatus(
                "ShrekAI failed to load",
                "error"
            );


            removeEmptyState();


            if (messagesElement) {

                const wrapper =
                    document.createElement("div");


                wrapper.className =
                    "shrekai-message assistant";


                const bubble =
                    document.createElement("div");


                bubble.className =
                    "shrekai-message-bubble";


                bubble.textContent =
                    "ShrekAI could not load. Check the browser console for the exact error.";


                wrapper.appendChild(
                    bubble
                );


                messagesElement.appendChild(
                    wrapper
                );
            }


        } finally {

            console.groupEnd();
        }
    }


    // ========================================================
    // EVENT HANDLERS
    // ========================================================

    if (sendButton) {

        sendButton.addEventListener(
            "click",
            sendMessage
        );
    }


    if (clearButton) {

        clearButton.addEventListener(
            "click",
            clearChat
        );
    }


    if (inputElement) {

        inputElement.addEventListener(
            "input",
            () => {

                updateCharacterCount();

                resizeInput();
            }
        );


        inputElement.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    sendMessage();
                }
            }
        );
    }


    // ========================================================
    // STARTUP
    // ========================================================

    async function initialize() {

        console.log(
            "[ShrekAI] Initializing..."
        );


        updateCharacterCount();

        updateComposerState();


        /*
         * These are independent of the ONNX model.
         * If history/memories fail, the actual model can
         * still load and the chat composer can still work.
         */

        await Promise.allSettled([
            loadMemories(),
            loadLatestConversation()
        ]);


        await loadModel();


        if (modelReady) {

            console.log(
                "[ShrekAI] Ready."
            );
        }
    }


    initialize();

});
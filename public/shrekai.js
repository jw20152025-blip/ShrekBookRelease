// ============================================================
// SHREKAI CLIENT
// Real ShrekAI ONNX model + Supabase persistence API
// ============================================================

document.addEventListener("DOMContentLoaded", () => {

    // ========================================================
    // CONFIG
    // ========================================================

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

        if (!statusElement) {
            return;
        }

        statusElement.textContent = text;

        statusElement.classList.remove(
            "online",
            "offline",
            "loading",
            "error"
        );

        if (state) {
            statusElement.classList.add(state);
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

        const wrapper =
            document.createElement("div");

        wrapper.className =
            `shrekai-message ${role}`;


        const bubble =
            document.createElement("div");

        bubble.className =
            "shrekai-message-bubble";


        if (role === "assistant") {
            bubble.textContent = content;
        } else {
            bubble.textContent = content;
        }


        wrapper.appendChild(bubble);

        messagesElement.appendChild(wrapper);


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


        bubble.textContent =
            "ShrekAI is thinking...";


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
            data = await response.json();
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
    // LOAD MEMORIES
    // ========================================================

    async function loadMemories() {

        try {

            const data =
                await api(
                    "/api/shrekai/memories"
                );


            memories =
                Array.isArray(data.memories)
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
                data.conversation?.id || id;


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
    // CREATE / SAVE CONVERSATION
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

                return;
            }


            // The AI response itself still works.
            // Persistence failing should not destroy
            // the current browser conversation.
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


        // ----------------------------------------------------
        // Build model messages
        // ----------------------------------------------------

        const modelMessages = [

            {
                role: "system",

                content:
                    buildSystemPrompt()
            },

            ...messages
        ];


        // ----------------------------------------------------
        // Generate
        // ----------------------------------------------------

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


        sendButton.disabled = true;

        inputElement.disabled = true;


        // ----------------------------------------------------
        // User message
        // ----------------------------------------------------

        addMessageToUI(
            "user",
            text,
            true
        );


        inputElement.value = "";


        showThinking();


        try {

            setStatus(
                "● ShrekAI thinking",
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


            // ------------------------------------------------
            // Persist to Supabase
            // ------------------------------------------------

            await saveConversation();


            setStatus(
                "● ShrekAI",
                "online"
            );


        } catch (error) {

            console.error(
                "[ShrekAI] Generation failed:",
                error
            );


            removeThinking();


            const errorText =
                "ShrekAI ran into an error: " +
                (
                    error?.message ||
                    "Unknown error"
                );


            addMessageToUI(
                "assistant",
                errorText,
                false
            );


            setStatus(
                "● ShrekAI error",
                "error"
            );

        } finally {

            sending = false;

            sendButton.disabled = false;

            inputElement.disabled = false;

            inputElement.focus();
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


        setStatus(
            "● ShrekAI",
            modelReady
                ? "online"
                : "loading"
        );


        // ----------------------------------------------------
        // Delete old persisted conversation
        // ----------------------------------------------------

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
    // LOAD MOST RECENT CONVERSATION
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

        console.group("[ShrekAI] ===== MODEL LOAD DEBUG =====");

        try {

            // ====================================================
            // STEP 1 — BASIC ENVIRONMENT
            // ====================================================

            console.log("[ShrekAI][1] Starting model load...");

            console.log(
                "[ShrekAI][1] Current URL:",
                window.location.href
            );

            console.log(
                "[ShrekAI][1] User agent:",
                navigator.userAgent
            );

            console.log(
                "[ShrekAI][1] WebGPU available:",
                "gpu" in navigator
            );

            console.log(
                "[ShrekAI][1] ONNX Runtime available:",
                typeof window.ort
            );


            setStatus(
                "● Loading ShrekAI...",
                "loading"
            );


            // ====================================================
            // STEP 2 — CHECK RUNTIME
            // ====================================================

            console.log(
                "[ShrekAI][2] Checking window.ShrekAIWeb..."
            );

            console.log(
                "[ShrekAI][2] window.ShrekAIWeb:",
                window.ShrekAIWeb
            );

            console.log(
                "[ShrekAI][2] typeof window.ShrekAIWeb:",
                typeof window.ShrekAIWeb
            );


            if (
                typeof window.ShrekAIWeb !== "function"
            ) {

                console.error(
                    "[ShrekAI][2] ❌ ShrekAIWeb DOES NOT EXIST."
                );

                console.error(
                    "[ShrekAI][2] This means shrekai_web.js either:"
                );

                console.error(
                    "[ShrekAI][2] - did not load"
                );

                console.error(
                    "[ShrekAI][2] - contains a syntax error"
                );

                console.error(
                    "[ShrekAI][2] - crashed before exporting the class"
                );

                console.error(
                    "[ShrekAI][2] - was loaded from the wrong path"
                );

                throw new Error(
                    "ShrekAIWeb is not available. shrekai_web.js did not load correctly."
                );
            }


            console.log(
                "[ShrekAI][2] ✅ ShrekAIWeb exists."
            );


            // ====================================================
            // STEP 3 — CHECK MODEL URL
            // ====================================================

            console.log(
                "[ShrekAI][3] Checking model URL:",
                MODEL_URL
            );

            const modelCheck =
                await fetch(
                    MODEL_URL,
                    {
                        method: "HEAD",
                        credentials: "same-origin"
                    }
                );

            console.log(
                "[ShrekAI][3] Model HTTP status:",
                modelCheck.status
            );

            console.log(
                "[ShrekAI][3] Model content type:",
                modelCheck.headers.get(
                    "content-type"
                )
            );

            console.log(
                "[ShrekAI][3] Model content length:",
                modelCheck.headers.get(
                    "content-length"
                )
            );


            if (!modelCheck.ok) {

                throw new Error(
                    `ONNX model could not be reached. HTTP ${modelCheck.status}`
                );
            }


            console.log(
                "[ShrekAI][3] ✅ ONNX model reachable."
            );


            // ====================================================
            // STEP 4 — CHECK TOKENIZER
            // ====================================================

            console.log(
                "[ShrekAI][4] Checking tokenizer URL:",
                TOKENIZER_URL
            );

            const tokenizerCheck =
                await fetch(
                    TOKENIZER_URL,
                    {
                        method: "HEAD",
                        credentials: "same-origin"
                    }
                );

            console.log(
                "[ShrekAI][4] Tokenizer HTTP status:",
                tokenizerCheck.status
            );

            console.log(
                "[ShrekAI][4] Tokenizer content type:",
                tokenizerCheck.headers.get(
                    "content-type"
                )
            );

            console.log(
                "[ShrekAI][4] Tokenizer content length:",
                tokenizerCheck.headers.get(
                    "content-length"
                )
            );


            if (!tokenizerCheck.ok) {

                throw new Error(
                    `Tokenizer could not be reached. HTTP ${tokenizerCheck.status}`
                );
            }


            console.log(
                "[ShrekAI][4] ✅ Tokenizer reachable."
            );


            // ====================================================
            // STEP 5 — CREATE INSTANCE
            // ====================================================

            console.log(
                "[ShrekAI][5] Creating ShrekAIWeb instance..."
            );

            shrekAI =
                new window.ShrekAIWeb({

                    modelUrl:
                        MODEL_URL,

                    tokenizerUrl:
                        TOKENIZER_URL
                });


            console.log(
                "[ShrekAI][5] Instance:",
                shrekAI
            );

            console.log(
                "[ShrekAI][5] Constructor:",
                shrekAI?.constructor?.name
            );


            if (!shrekAI) {

                throw new Error(
                    "ShrekAIWeb constructor returned nothing."
                );
            }


            console.log(
                "[ShrekAI][5] ✅ Instance created."
            );


            // ====================================================
            // STEP 6 — CHECK METHODS
            // ====================================================

            console.log(
                "[ShrekAI][6] Checking runtime methods..."
            );

            console.log(
                "[ShrekAI][6] load():",
                typeof shrekAI.load
            );

            console.log(
                "[ShrekAI][6] generate():",
                typeof shrekAI.generate
            );

            console.log(
                "[ShrekAI][6] tokenize():",
                typeof shrekAI.tokenize
            );

            console.log(
                "[ShrekAI][6] detokenize():",
                typeof shrekAI.detokenize
            );


            if (
                typeof shrekAI.load !== "function"
            ) {

                throw new Error(
                    "ShrekAIWeb exists, but load() is missing."
                );
            }


            if (
                typeof shrekAI.generate !== "function"
            ) {

                throw new Error(
                    "ShrekAIWeb exists, but generate() is missing."
                );
            }


            console.log(
                "[ShrekAI][6] ✅ Runtime methods look good."
            );


            // ====================================================
            // STEP 7 — LOAD MODEL
            // ====================================================

            console.log(
                "[ShrekAI][7] Calling shrekAI.load()..."
            );

            const loadStart =
                performance.now();


            await shrekAI.load();


            const loadTime =
                performance.now() -
                loadStart;


            console.log(
                "[ShrekAI][7] Model load time:",
                `${Math.round(loadTime)} ms`
            );

            console.log(
                "[ShrekAI][7] Runtime after load:",
                shrekAI
            );


            // ====================================================
            // STEP 8 — SUCCESS
            // ====================================================

            modelReady = true;


            setStatus(
                "● ShrekAI",
                "online"
            );


            console.log(
                "[ShrekAI][8] ✅ MODEL LOADED."
            );

            console.log(
                "[ShrekAI] 🎉 ShrekAI is ready!"
            );

        } catch (error) {

            modelReady = false;


            console.error(
                "[ShrekAI] ❌ MODEL LOAD FAILED"
            );

            console.error(
                "[ShrekAI] Error:",
                error
            );

            console.error(
                "[ShrekAI] Error name:",
                error?.name
            );

            console.error(
                "[ShrekAI] Error message:",
                error?.message
            );

            console.error(
                "[ShrekAI] Error stack:",
                error?.stack
            );


            setStatus(
                "● ShrekAI failed to load",
                "error"
            );


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


        // Load authentication-backed
        // data first.
        await loadMemories();


        await loadLatestConversation();


        // Then load the actual model.
        await loadModel();


        if (modelReady) {

            console.log(
                "[ShrekAI] Ready."
            );
        }
    }


    initialize();

});
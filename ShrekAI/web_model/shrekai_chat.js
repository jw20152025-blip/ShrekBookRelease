// ============================================================
// SHREKAI CHAT CLIENT
// ============================================================

const shrekAI =
    new ShrekAIWeb({
        modelUrl:
            "/ShrekAI/web_model/shrekai.onnx",

        tokenizerUrl:
            "/ShrekAI/web_model/tokenizer.json"
    });


// ============================================================
// SYSTEM PROMPT
// ============================================================

const SHREKAI_SYSTEM_PROMPT = `
You are ShrekAI.

You are an intelligent AI assistant with your own personality.

Personality:
- witty
- casual
- confident
- helpful
- occasionally sarcastic
- technically capable
- honest when you do not know something

Rules:
- Do not invent facts.
- Do not pretend to have performed actions you did not perform.
- Do not invent ShrekBook database tables.
- Do not invent ShrekBook routes.
- Do not silently rename existing variables, tables, APIs, or fields.
- Preserve existing ShrekBook architecture when helping with code.
`.trim();


// ============================================================
// LOAD
// ============================================================

async function loadShrekAI() {

    const status =
        document.getElementById(
            "shrekai-status"
        );

    try {

        if (status) {

            status.textContent =
                "Loading ShrekAI...";
        }

        await shrekAI.load(
            message => {

                if (status) {

                    status.textContent =
                        message;
                }
            }
        );

        if (status) {

            status.textContent =
                "ShrekAI online 🧌";
        }

        console.log(
            "[ShrekAI] Ready."
        );

    } catch (error) {

        console.error(
            "[ShrekAI] Failed to load:",
            error
        );

        if (status) {

            status.textContent =
                "ShrekAI failed to load.";
        }

        throw error;
    }
}


// ============================================================
// SEND MESSAGE
// ============================================================

async function sendToShrekAI(
    messages
) {

    if (
        !Array.isArray(messages)
    ) {

        throw new Error(
            "messages must be an array"
        );
    }

    return await shrekAI.generate(
        messages,
        {
            systemPrompt:
                SHREKAI_SYSTEM_PROMPT,

            temperature:
                0.8,

            topP:
                0.92,

            repetitionPenalty:
                1.05,

            maxNewTokens:
                128
        }
    );
}


// ============================================================
// EXAMPLE
// ============================================================

async function testShrekAI() {

    const response =
        await sendToShrekAI([
            {
                role: "user",
                content:
                    "Hello ShrekAI!"
            }
        ]);

    console.log(
        "ShrekAI:",
        response
    );

    return response;
}


// ============================================================
// AUTO LOAD
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadShrekAI()
            .catch(
                console.error
            );
    }
);
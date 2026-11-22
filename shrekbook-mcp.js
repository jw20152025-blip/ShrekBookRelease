const crypto = require("crypto");

const MCP_PATH = "/mcp";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
    "2026-07-28",
    "2025-11-25",
    "2025-06-18",
    "2025-03-26",
    "2024-11-05"
]);

function safeEqual(left, right) {
    const a = Buffer.from(String(left || ""));
    const b = Buffer.from(String(right || ""));
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function jsonRpcError(id, code, message) {
    return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function textResult(value, extra = {}) {
    return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
        structuredContent: value,
        ...extra
    };
}

function attachShrekBookMcp({
    app,
    supabase,
    notifyNewPostEmails
}) {
    const token = process.env.SHREKBOOK_MCP_TOKEN;
    const ownerId = process.env.OWNER_ID;

    async function callTool(name, args) {
        if (!ownerId) throw new Error("The ShrekBook owner account is not configured (OWNER_ID).");

        if (name === "get_my_profile") {
            const { data, error } = await supabase
                .from("profiles")
                .select("id, username, display_name, bio, role")
                .eq("id", ownerId)
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error("The configured owner profile was not found.");
            return textResult(data);
        }

        if (name === "get_recent_posts") {
            const requested = Number.isInteger(args?.limit) ? args.limit : 10;
            const limit = Math.max(1, Math.min(20, requested));
            const { data: posts, error } = await supabase
                .from("posts")
                .select("id, user_id, content, image_url, created_at")
                .order("created_at", { ascending: false })
                .limit(limit);

            if (error) throw error;

            const userIds = [...new Set((posts || []).map(post => post.user_id).filter(Boolean))];
            let profiles = [];
            if (userIds.length) {
                const { data, error: profileError } = await supabase
                    .from("profiles")
                    .select("id, username, display_name")
                    .in("id", userIds);
                if (profileError) throw profileError;
                profiles = data || [];
            }

            const byId = new Map(profiles.map(profile => [profile.id, profile]));
            return textResult((posts || []).map(post => ({
                ...post,
                author: byId.get(post.user_id) || null
            })));
        }

        if (name === "create_post") {
            const content = String(args?.content || "").trim();
            if (!content) throw new Error("Post content cannot be empty.");
            if (content.length > 5000) throw new Error("Post content cannot exceed 5,000 characters.");

            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("id, username, display_name")
                .eq("id", ownerId)
                .maybeSingle();

            if (profileError) throw profileError;
            if (!profile) throw new Error("The configured owner profile was not found.");

            const { data: post, error } = await supabase
                .from("posts")
                .insert({
                    user_id: ownerId,
                    content,
                    image_url: null
                })
                .select("id, user_id, content, image_url, created_at")
                .single();

            if (error) throw error;

            let notificationResult = { recipients: 0, queued: 0 };
            let notificationWarning = null;
            try {
                notificationResult = await notifyNewPostEmails({
                    supabase,
                    userId: ownerId,
                    content,
                    imageUrl: null
                });
            } catch (notificationError) {
                notificationWarning = "Post was published, but email notification fanout failed: " +
                    String(notificationError.message || notificationError).slice(0, 300);
                console.error("MCP NEW POST EMAIL ERROR:", notificationError);
            }

            return textResult({
                success: true,
                post,
                author: profile,
                notifications: notificationResult,
                ...(notificationWarning ? { notificationWarning } : {})
            });
        }

        throw new Error("Unknown ShrekBook tool: " + name);
    }

    async function handleMcp(req, res) {
        if (!token) {
            return res.status(503).json({
                error: "ShrekBook MCP is not configured. Set SHREKBOOK_MCP_TOKEN in the hosting environment."
            });
        }

        const authorization = String(req.headers.authorization || "");
        const suppliedToken = authorization.startsWith("Bearer ")
            ? authorization.slice(7)
            : "";

        if (!safeEqual(suppliedToken, token)) {
            res.set("WWW-Authenticate", 'Bearer realm="ShrekBook MCP"');
            return res.status(401).json({ error: "Unauthorized" });
        }

        const body = req.body || {};
        const id = body.id;
        const method = body.method;

        if (body.jsonrpc !== "2.0" || typeof method !== "string") {
            return res.status(400).json(jsonRpcError(id, -32600, "Invalid JSON-RPC request."));
        }

        if (method.startsWith("notifications/")) {
            return res.status(202).end();
        }

        let result;
        let protocolVersion = "2025-11-25";

        try {
            if (method === "initialize") {
                const requestedVersion = body.params?.protocolVersion;
                if (typeof requestedVersion === "string" &&
                    SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion)) {
                    protocolVersion = requestedVersion;
                }

                result = {
                    protocolVersion,
                    capabilities: { tools: {} },
                    serverInfo: {
                        name: "shrekbook",
                        title: "ShrekBook",
                        version: "1.0.0"
                    },
                    instructions: "Access the ShrekBook account configured as OWNER_ID. Use get_recent_posts to read the public feed. create_post publishes as the configured ShrekBook owner and queues new-post email notifications for opted-in users."
                };
            } else if (method === "ping") {
                result = {};
            } else if (method === "tools/list") {
                result = {
                    tools: [
                        {
                            name: "get_my_profile",
                            title: "Get my ShrekBook profile",
                            description: "Read the configured ShrekBook owner's public profile fields.",
                            inputSchema: {
                                type: "object",
                                properties: {},
                                additionalProperties: false
                            }
                        },
                        {
                            name: "get_recent_posts",
                            title: "Read recent ShrekBook posts",
                            description: "Read the latest public posts and their author display names.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    limit: {
                                        type: "integer",
                                        minimum: 1,
                                        maximum: 20,
                                        description: "Number of posts to return (1–20)."
                                    }
                                },
                                additionalProperties: false
                            }
                        },
                        {
                            name: "create_post",
                            title: "Publish a ShrekBook post",
                            description: "Publish a text post as the configured ShrekBook owner. This creates a real post and queues new-post email notifications for users who opted in. Ask the user before publishing content.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    content: {
                                        type: "string",
                                        minLength: 1,
                                        maxLength: 5000,
                                        description: "The text content of the ShrekBook post."
                                    }
                                },
                                required: ["content"],
                                additionalProperties: false
                            }
                        }
                    ]
                };
            } else if (method === "tools/call") {
                const name = body.params?.name;
                const args = body.params?.arguments || {};
                try {
                    result = await callTool(name, args);
                } catch (toolError) {
                    result = {
                        content: [{ type: "text", text: String(toolError.message || toolError) }],
                        isError: true
                    };
                }
            } else {
                return res.status(200).json(jsonRpcError(id, -32601, "Method not found."));
            }

            res.set("Content-Type", "application/json");
            res.set("MCP-Protocol-Version", protocolVersion);
            return res.status(200).json({ jsonrpc: "2.0", id: id ?? null, result });
        } catch (error) {
            console.error("SHREKBOOK MCP ERROR:", error);
            return res.status(200).json(jsonRpcError(id, -32603, "Internal server error."));
        }
    }

    app.post(MCP_PATH, handleMcp);

    app.get(MCP_PATH, (req, res) => {
        if (!token || !safeEqual(
            String(req.headers.authorization || "").replace(/^Bearer /, ""),
            token
        )) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        return res.status(405).set("Allow", "POST").json({ error: "GET is not supported by this stateless MCP endpoint." });
    });

    app.delete(MCP_PATH, (req, res) => {
        if (!token || !safeEqual(
            String(req.headers.authorization || "").replace(/^Bearer /, ""),
            token
        )) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        return res.status(405).set("Allow", "POST").json({ error: "DELETE is not supported by this stateless MCP endpoint." });
    });
}

module.exports = { attachShrekBookMcp };

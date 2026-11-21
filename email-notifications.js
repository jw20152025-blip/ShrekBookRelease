const express = require("express");

const DEFAULT_PREFERENCES = {
    social: true,
    new_posts: false,
    announcements: true,
    security: true
};

let workerRunning = false;

function createEmailNotificationRouter({ supabase }) {
    const router = express.Router();

    function requireUser(req, res, next) {
        if (!req.session?.user?.id) {
            return res.status(401).json({ error: "You must be logged in." });
        }
        next();
    }

    router.get("/preferences", requireUser, async (req, res) => {
        try {
            const { data, error } = await supabase
                .from("email_notification_preferences")
                .select("social, new_posts, announcements, security")
                .eq("user_id", req.session.user.id)
                .maybeSingle();

            if (error) throw error;

            res.set("Cache-Control", "no-store");
            return res.json({
                preferences: { ...DEFAULT_PREFERENCES, ...(data || {}) }
            });
        } catch (error) {
            console.error("EMAIL PREFERENCES LOAD ERROR:", error);
            return res.status(500).json({ error: "Could not load email preferences." });
        }
    });

    router.put("/preferences", requireUser, async (req, res) => {
        try {
            const body = req.body || {};
            const preferences = {
                social: body.social === true,
                new_posts: body.new_posts === true,
                announcements: body.announcements === true,
                // Security and account notices cannot be disabled.
                security: true
            };

            const { data, error } = await supabase
                .from("email_notification_preferences")
                .upsert({
                    user_id: req.session.user.id,
                    ...preferences,
                    updated_at: new Date().toISOString()
                }, { onConflict: "user_id" })
                .select("social, new_posts, announcements, security")
                .single();

            if (error) throw error;

            res.set("Cache-Control", "no-store");
            return res.json({ success: true, preferences: data });
        } catch (error) {
            console.error("EMAIL PREFERENCES SAVE ERROR:", error);
            return res.status(500).json({ error: "Could not save email preferences." });
        }
    });

    router.post("/test", requireUser, async (req, res) => {
        if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
            return res.status(503).json({
                error: "Email delivery is not configured on the server. Set RESEND_API_KEY and EMAIL_FROM."
            });
        }

        try {
            const user = req.session.user;
            const username = String(user.username || "there").slice(0, 60);
            const queued = await enqueueEmail(supabase, {
                userId: user.id,
                type: "account",
                subject: "ShrekBook email test",
                text: `Hi ${username}! This is a test email from ShrekBook. Your email notification delivery is connected.`,
                html: `<h1>ShrekBook email test</h1><p>Hi ${escapeHtml(username)}! Your email notification delivery is connected.</p>`
            });

            if (!queued.success) {
                console.error("EMAIL TEST QUEUE ERROR:", queued.error);
                return res.status(500).json({
                    error: "Could not queue the test email: " + queued.error
                });
            }

            return res.status(202).json({
                success: true,
                message: "Test email queued. It should arrive shortly."
            });
        } catch (error) {
            console.error("EMAIL TEST ERROR:", error);
            return res.status(500).json({ error: "Could not queue the test email." });
        }
    });

    return router;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}

async function enqueueEmail(supabase, { userId, type, subject, text, html }) {
    const allowedTypes = new Set(["account", "security", "social", "announcements"]);
    if (!userId || !allowedTypes.has(type) || !subject || !text) {
        return { success: false, error: "Missing or invalid email fields." };
    }

    const { error } = await supabase
        .from("email_notification_queue")
        .insert({
            user_id: userId,
            notification_type: type,
            subject: String(subject).slice(0, 180),
            text_body: String(text).slice(0, 12000),
            html_body: html ? String(html).slice(0, 30000) : null,
            status: "pending"
        });

    if (error) {
        console.error("EMAIL QUEUE INSERT ERROR:", error);
        return { success: false, error: error.message || "Unknown database error." };
    }

    return { success: true };
}

async function sendQueuedEmails(supabase) {
    if (workerRunning) return;
    workerRunning = true;

    try {
        const apiKey = process.env.RESEND_API_KEY;
        const from = process.env.EMAIL_FROM;
        if (!apiKey || !from) return;

        // Recover jobs left in "sending" if the process crashed or restarted.
        // Resend idempotency keys below prevent duplicate delivery on recovery.
        const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { error: recoveryError } = await supabase
            .from("email_notification_queue")
            .update({
                status: "pending",
                locked_at: null,
                last_error: "Recovered after an interrupted email worker attempt."
            })
            .eq("status", "sending")
            .or(`locked_at.is.null,locked_at.lt.${staleBefore}`);

        if (recoveryError) {
            console.error("EMAIL QUEUE RECOVERY ERROR:", recoveryError);
            return;
        }

        const { data: jobs, error } = await supabase
            .from("email_notification_queue")
            .select("id, user_id, notification_type, subject, text_body, html_body, attempts")
            .eq("status", "pending")
            .lte("scheduled_at", new Date().toISOString())
            .order("created_at", { ascending: true })
            .limit(10);

        if (error) {
            console.error("EMAIL QUEUE READ ERROR:", error);
            return;
        }

        for (const job of jobs || []) {
            try {
                const { data: authResult, error: authError } =
                    await supabase.auth.admin.getUserById(job.user_id);

                const recipient = authResult?.user?.email;
                if (authError || !recipient) {
                    await supabase.from("email_notification_queue")
                        .update({
                            status: "failed",
                            locked_at: null,
                            last_error: "Recipient email unavailable."
                        })
                        .eq("id", job.id);
                    continue;
                }

                if (job.notification_type !== "security" && job.notification_type !== "account") {
                    const { data: prefs, error: prefsError } = await supabase
                        .from("email_notification_preferences")
                        .select("social, announcements")
                        .eq("user_id", job.user_id)
                        .maybeSingle();

                    if (prefsError) throw prefsError;

                    const enabled = job.notification_type === "social"
                        ? (prefs?.social ?? true)
                        : job.notification_type === "announcements"
                            ? (prefs?.announcements ?? true)
                            : false;

                    if (!enabled) {
                        await supabase.from("email_notification_queue")
                            .update({
                                status: "skipped",
                                locked_at: null,
                                last_error: "Disabled by user preference."
                            })
                            .eq("id", job.id);
                        continue;
                    }
                }

                // Atomic claim: only one worker can move this pending row to sending.
                const { data: claimed, error: claimError } = await supabase
                    .from("email_notification_queue")
                    .update({
                        status: "sending",
                        locked_at: new Date().toISOString(),
                        attempts: (job.attempts || 0) + 1
                    })
                    .eq("id", job.id)
                    .eq("status", "pending")
                    .select("id")
                    .maybeSingle();

                if (claimError || !claimed) {
                    if (claimError) console.error("EMAIL QUEUE CLAIM ERROR:", claimError);
                    continue;
                }

                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 20000);

                try {
                    const response = await fetch("https://api.resend.com/emails", {
                        method: "POST",
                        signal: controller.signal,
                        headers: {
                            "Authorization": "Bearer " + apiKey,
                            "Content-Type": "application/json",
                            "Idempotency-Key": `shrekbook-notification-${job.id}`
                        },
                        body: JSON.stringify({
                            from,
                            to: [recipient],
                            subject: job.subject,
                            text: job.text_body,
                            ...(job.html_body ? { html: job.html_body } : {})
                        })
                    });

                    const result = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        const sendError = new Error(
                            result.message || result.name || "Email provider rejected the message."
                        );
                        sendError.statusCode = response.status;
                        throw sendError;
                    }

                    const { error: sentUpdateError } = await supabase
                        .from("email_notification_queue")
                        .update({
                            status: "sent",
                            sent_at: new Date().toISOString(),
                            provider_message_id: result.id || null,
                            locked_at: null,
                            last_error: null
                        })
                        .eq("id", job.id);

                    if (sentUpdateError) {
                        // Leave it recoverable; Resend's idempotency key protects the retry.
                        console.error("EMAIL QUEUE SENT-STATUS UPDATE ERROR:", sentUpdateError);
                    }
                } catch (sendError) {
                    const attempts = (job.attempts || 0) + 1;
                    const statusCode = Number(sendError.statusCode || 0);
                    const retryable = !statusCode || statusCode === 429 || statusCode >= 500;
                    const shouldRetry = retryable && attempts < 5;
                    const delayMinutes = Math.min(60, 2 ** attempts);

                    const { error: failureUpdateError } = await supabase
                        .from("email_notification_queue")
                        .update({
                            status: shouldRetry ? "pending" : "failed",
                            locked_at: null,
                            scheduled_at: shouldRetry
                                ? new Date(Date.now() + delayMinutes * 60000).toISOString()
                                : new Date().toISOString(),
                            last_error: String(sendError.message || sendError).slice(0, 1000)
                        })
                        .eq("id", job.id);

                    if (failureUpdateError) {
                        console.error("EMAIL QUEUE FAILURE-STATUS UPDATE ERROR:", failureUpdateError);
                    }
                    console.error("EMAIL DELIVERY ERROR:", sendError.message || sendError);
                } finally {
                    clearTimeout(timeout);
                }
            } catch (jobError) {
                console.error("EMAIL JOB ERROR:", jobError);
            }
        }
    } finally {
        workerRunning = false;
    }
}

module.exports = {
    createEmailNotificationRouter,
    enqueueEmail,
    sendQueuedEmails
};

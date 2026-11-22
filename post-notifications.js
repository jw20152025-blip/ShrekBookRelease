async function notifyNewPostEmails({
    supabase,
    enqueueEmail,
    escapeEmailHtml,
    userId,
    content,
    imageUrl
}) {
    const [
        { data: recipients, error: recipientError },
        { data: author }
    ] = await Promise.all([
        supabase.from("email_notification_preferences")
            .select("user_id")
            .eq("social", true)
            .eq("new_posts", true)
            .neq("user_id", userId)
            .limit(5000),
        supabase.from("profiles")
            .select("username, display_name")
            .eq("id", userId)
            .maybeSingle()
    ]);

    if (recipientError) throw recipientError;

    const authorName = author?.display_name || author?.username || "Someone";
    const preview = content ? content.slice(0, 1200) : "Shared an image or video.";
    const mediaLine = imageUrl ? "\nMedia: " + imageUrl : "";
    let queued = 0;

    for (const recipient of recipients || []) {
        const result = await enqueueEmail(supabase, {
            userId: recipient.user_id,
            type: "social",
            subject: authorName + " published a new post on ShrekBook",
            text: authorName + " just published a new post on ShrekBook:\n\n" +
                preview + mediaLine + "\n\nView ShrekBook: https://shrekbook.bbroot.com",
            html: "<h2>" + escapeEmailHtml(authorName) + " published a new post</h2><p>" +
                escapeEmailHtml(preview) + "</p>" +
                (imageUrl ? '<p><a href="' + escapeEmailHtml(imageUrl) +
                    '">View attached media</a></p>' : "") +
                '<p><a href="https://shrekbook.bbroot.com">Open ShrekBook</a></p>'
        });

        if (result?.success) queued++;
    }

    return { recipients: (recipients || []).length, queued };
}

module.exports = { notifyNewPostEmails };

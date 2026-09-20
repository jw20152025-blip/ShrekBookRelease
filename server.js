
require("dotenv").config();
const multer = require("multer");

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 50 * 1024 * 1024
    }
});




let globalMessage = null;

const specificMessages = new Map();


const messageSessionTimes = new Map();
const express = require("express");
const path = require("path");
const http = require("http");

const session = require("express-session");

const { createClient } = require("@supabase/supabase-js");

const { InferenceClient } = require("@huggingface/inference");

const hf = new InferenceClient(
    process.env.HF_TOKEN
);
const app = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const PORT =
    process.env.PORT || 3000;






const SUPABASE_URL =
    process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

const SESSION_SECRET =
    process.env.SESSION_SECRET;






if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
) {

    console.error(
        "❌ Missing Supabase environment variables."
    );

    process.exit(1);

}


if (!SESSION_SECRET) {

    console.error(
        "❌ Missing SESSION_SECRET."
    );

    process.exit(1);

}









const supabase =
    createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
    );






const sessionStore =
    new session.MemoryStore();






app.use(
    session({

        secret:
            SESSION_SECRET,

        resave:
            false,

        saveUninitialized:
            false,

        store:
            sessionStore,

        cookie: {

            secure:
                false,

            httpOnly:
                true,

            sameSite:
                "lax"

        }

    })
);


async function awardShrekCoins(
    userId,
    amount,
    reason
) {

    try {

        if (
            !userId ||
            !Number.isInteger(amount) ||
            amount === 0
        ) {

            return false;

        }






        const {
            data: profile,
            error: profileError
        } = await supabase
            .from("profiles")
            .select("shrekcoins")
            .eq(
                "id",
                userId
            )
            .single();


        if (
            profileError ||
            !profile
        ) {

            console.error(
                "SHREKCOIN PROFILE ERROR:",
                profileError
            );

            return false;

        }


        const newBalance =
            Math.max(
                0,
                (profile.shrekcoins || 0) +
                amount
            );






        const {
            error: updateError
        } = await supabase
            .from("profiles")
            .update({
                shrekcoins:
                    newBalance
            })
            .eq(
                "id",
                userId
            );


        if (updateError) {

            console.error(
                "SHREKCOIN UPDATE ERROR:",
                updateError
            );

            return false;

        }






        const {
            error: transactionError
        } = await supabase
            .from("shrekcoin_transactions")
            .insert({

                user_id:
                    userId,

                amount:
                    amount,

                reason:
                    reason

            });


        if (transactionError) {

            console.error(
                "SHREKCOIN TRANSACTION ERROR:",
                transactionError
            );

        }


        console.log(
            `🪙 ${amount > 0 ? "+" : ""}${amount} ShrekCoins → ${userId} (${reason})`
        );


        return true;

    } catch (error) {

        console.error(
            "SHREKCOIN ERROR:",
            error
        );

        return false;

    }

}

app.get("/api/shreksearch", async (req, res) => {
    try {
        const query = String(req.query.q || "").trim();

        if (!query) {
            return res.status(400).json({
                error: "Missing search query"
            });
        }

        const apiKey = process.env.TAVILY_API_KEY;

        if (!apiKey) {
            console.error("TAVILY_API_KEY is missing");

            return res.status(500).json({
                error: "TAVILY_API_KEY missing"
            });
        }

        console.log("ShrekSearch query:", query);

        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },

            body: JSON.stringify({
                query: query,

                search_depth: "basic",

                max_results: 8,

                include_answer: true
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Tavily error:", data);

            return res.status(500).json({
                error: "Tavily search failed",
                details: data
            });
        }

        const results = (data.results || []).map(result => ({
            title: result.title || "",
            url: result.url || "",
            description: result.content || "",
            content: result.content || ""
        }));

        res.json({
            query: query,


            answer: data.answer || "No AI answer was generated.",

            results: results
        });

    } catch (error) {

        console.error("SHREKSEARCH ERROR:", error);

        res.status(500).json({
            error: "Search failed",
            details: error.message
        });
    }
});




const server =
    http.createServer(app);


app.get("/api/moderation/status", async (req, res) => {

    try {

        if (!req.session || !req.session.userId) {

            return res.json({
                loggedIn: false,
                banned: false,
                kicked: false
            });

        }

        const userId =
            req.session.userId;

        const { data: user, error } =
            await supabase
                .from("profiles")
                .select("id, banned, kicked")
                .eq("id", userId)
                .single();

        if (error) {

            console.error(
                "Moderation status error:",
                error
            );

            return res.status(500).json({
                error: "Failed to check moderation status"
            });

        }

        res.json({
            loggedIn: true,
            banned: user?.banned === true,
            kicked: user?.kicked === true
        });

    } catch (error) {

        console.error(
            "Moderation status error:",
            error
        );

        res.status(500).json({
            error: "Server error"
        });

    }

});
app.get("/api/online", async (req, res) => {

    try {

        const {
            data: users,
            error
        } = await supabase
            .from("profiles")
            .select(`
                id,
                username,
                display_name,
                avatar,
                last_seen
            `);

        if (error) {

            console.error(
                "ONLINE USERS ERROR:",
                error
            );

            return res.status(500).json({
                error: error.message
            });

        }

        const now = Date.now();



        const onlineUsers = (users || [])
            .map(user => {

                const lastSeen =
                    user.last_seen
                        ? new Date(user.last_seen).getTime()
                        : 0;

                const online =
                    lastSeen > 0 &&
                    now - lastSeen < 30000;

                return {
                    id: user.id,
                    username: user.username,
                    display_name: user.display_name,
                    avatar: getAvatar(user.avatar),
                    last_seen: user.last_seen,
                    online
                };

            });

        return res.json({
            success: true,
            users: onlineUsers
        });

    } catch (error) {

        console.error(
            "ONLINE ERROR:",
            error
        );

        return res.status(500).json({
            error: "Failed to load online users."
        });

    }

});




const DEFAULT_AVATAR =
    "/default-avatar.png";







app.set("trust proxy", 1);

app.use(express.json({
    limit: "10mb"
}));

app.use(express.urlencoded({
    extended: true
}));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
});

app.use(sessionMiddleware);

app.use(express.static(
    path.join(__dirname, "public")
));
app.get("/sitemap.xml", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "sitemap.xml")
    );
});




function getAvatar(avatar) {
    if (
        typeof avatar === "string" &&
        avatar.trim() !== ""
    ) {
        return avatar;
    }

    return DEFAULT_AVATAR;
}

function normalizeEmail(email) {
    return String(email || "")
        .trim()
        .toLowerCase();
}





async function isAdmin(userId) {
    if (!userId) {
        return false;
    }

    const {
        data,
        error
    } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        console.error(
            "ADMIN CHECK ERROR:",
            error
        );

        return false;
    }

    return !!data;
}

async function getActiveBanByUserId(userId) {
    if (!userId) {
        return null;
    }

    const {
        data,
        error
    } = await supabase
        .from("bans")
        .select(`
            id,
            user_id,
            email,
            reason,
            banned_at,
            banned_by,
            active
        `)
        .eq("user_id", userId)
        .eq("active", true)
        .order("banned_at", {
            ascending: false
        })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error(
            "BAN USER CHECK ERROR:",
            error
        );

        return null;
    }

    return data;
}

async function getActiveBanByEmail(email) {
    const normalized =
        normalizeEmail(email);

    if (!normalized) {
        return null;
    }

    const {
        data,
        error
    } = await supabase
        .from("bans")
        .select(`
            id,
            user_id,
            email,
            reason,
            banned_at,
            banned_by,
            active
        `)
        .eq("email", normalized)
        .eq("active", true)
        .order("banned_at", {
            ascending: false
        })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error(
            "BAN EMAIL CHECK ERROR:",
            error
        );

        return null;
    }

    return data;
}

async function getActiveBan(userId, email) {
    const userBan =
        await getActiveBanByUserId(userId);

    if (userBan) {
        return userBan;
    }

    return await getActiveBanByEmail(email);
}

async function requireAdmin(req, res, next) {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                error: "You must be logged in."
            });
        }

        const userId = req.session.user.id;


        if (
            process.env.OWNER_ID &&
            userId === process.env.OWNER_ID
        ) {
            return next();
        }


        const { data: admin, error: adminError } = await supabase
            .from("admins")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (adminError) {
            console.error("STAFF ADMIN CHECK ERROR:", adminError);
        }

        if (admin) {
            return next();
        }


        const { data: staff, error: staffError } = await supabase
            .from("staff")
            .select("user_id, role")
            .eq("user_id", userId)
            .maybeSingle();

        if (staffError) {
            console.error("STAFF CHECK ERROR:", staffError);
        }

        if (staff) {
            return next();
        }

        return res.status(403).json({
            error: "Staff access required."
        });

    } catch (error) {
        console.error("REQUIRE STAFF ERROR:", error);

        return res.status(500).json({
            error: "Server error."
        });
    }
}
app.post("/api/admin/ban", async (req, res) => {

    try {





        if (!req.session.user) {
            return res.status(401).json({
                error: "You must be logged in."
            });
        }






        const { data: user, error: userError } =
            await supabase
                .from("profiles")
                .select("role")
                .eq("id", req.session.user.id)
                .maybeSingle();


        if (userError || !user) {

            console.error(
                "BAN PERMISSION CHECK ERROR:",
                userError
            );

            return res.status(403).json({
                error: "Unable to verify permissions."
            });

        }


        const canBan = [
            "administrator",
            "owner"
        ];


        if (!canBan.includes(user.role)) {

            return res.status(403).json({
                error:
                    "You do not have permission to ban users."
            });

        }






        const { userId, reason } = req.body;


        if (!userId) {

            return res.status(400).json({
                error: "User ID is required."
            });

        }






        const { error } =
            await supabase
                .from("profiles")
                .update({
                    banned: true
                })
                .eq("id", userId);


        if (error) {

            console.error(
                "Ban error:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to ban user."
            });

        }






        liveBanUser(userId);






        return res.json({

            success: true,

            message:
                "User banned successfully."

        });


    } catch (error) {

        console.error(
            "ADMIN BAN ERROR:",
            error
        );

        return res.status(500).json({
            error:
                "Server error while banning user."
        });

    }

});



app.post("/api/admin/kick", async (req, res) => {
    const { userId } = req.body;

    const { error } = await supabase
        .from("profiles")
        .update({
            kicked: true
        })
        .eq("id", userId);

    if (error) {
        console.error("Kick error:", error);

        return res.status(500).json({
            error: "Failed to kick user"
        });
    }


    liveKickUser(userId);
    setTimeout(() => {
        clearKick(userId);
    }, 1000);
    res.json({
        success: true
    });
});
app.get("/api/admin/auth", requireLogin, async (req, res) => {
    try {

        const userId = req.session.user.id;

        const { data: profile, error } = await supabase
            .from("profiles")
            .select("id, username, display_name, role, is_active")
            .eq("id", userId)
            .maybeSingle();

        if (error) {
            console.error("ADMIN AUTH ERROR:", error);

            return res.status(500).json({
                error: error.message
            });
        }

        if (!profile) {
            return res.status(404).json({
                error: "User profile not found."
            });
        }

        const allowedRoles = [
            "owner",
            "administrator",
            "senior_moderator",
            "junior_moderator"
        ];
        console.log(profile.role);
        if (!allowedRoles.includes(profile.role)) {
            return res.status(403).json({
            
                error: "Admin access required."
            });

        }


        res.json({
            success: true,
            authorized: true,
            user: profile
        });

    } catch (error) {

        console.error("ADMIN AUTH ERROR:", error);

        res.status(500).json({
            error: "Server error."
        });

    }
});









app.use("/api", async (req, res, next) => {

    const publicRoutes = [
        "/login",
        "/signup",
        "/health",
        "/test"
    ];

    if (publicRoutes.includes(req.path)) {
        return next();
    }

    if (!req.session.user) {
        return next();
    }

    try {

        const ban =
            await getActiveBan(
                req.session.user.id,
                req.session.user.email
            );

        if (ban) {

            req.session.destroy(() => {});

            return res.status(403).json({
                error: "Your account has been banned.",
                reason:
                    ban.reason ||
                    "No reason provided."
            });
        }

        next();

    } catch (error) {

        console.error(
            "GLOBAL BAN CHECK ERROR:",
            error
        );

        next();
    }
});





async function getReactionCounts(userId) {

    const counts = {
        gyatt: 0,
        cat: 0,
        ogred: 0
    };

    const {
        data: reactions,
        error
    } = await supabase
        .from("reactions")
        .select("type")
        .eq("to_user_id", userId);

    if (error) {
        throw error;
    }

    for (const reaction of reactions || []) {

        if (reaction.type === "gyatt") {
            counts.gyatt++;
        }

        if (reaction.type === "cat") {
            counts.cat++;
        }

        if (reaction.type === "ogred") {
            counts.ogred++;
        }
    }

    return counts;
}




app.post(
    "/api/admin/users/:userId/role",
    requireAdmin,
    async (req, res) => {

        try {

            const targetUserId =
                String(
                    req.params.userId || ""
                ).trim();

            const newRole =
                String(
                    req.body.role || ""
                ).trim().toLowerCase();


            const allowedRoles = [
                "owner",
                "administrator",
                "senior_moderator",
                "moderator",
                "peasant"
            ];


            if (!targetUserId) {

                return res.status(400).json({
                    error: "User ID is required."
                });

            }


            if (!allowedRoles.includes(newRole)) {

                return res.status(400).json({
                    error: "Invalid role."
                });

            }


            const currentUserId =
                req.session.user.id;






            if (
                targetUserId === currentUserId
            ) {

                return res.status(403).json({
                    error:
                        "You cannot change your own role."
                });

            }






            const {
                data: target,
                error: targetError
            } = await supabase
                .from("profiles")
                .select(
                    "id, username, display_name, role"
                )
                .eq(
                    "id",
                    targetUserId
                )
                .maybeSingle();


            if (targetError) {

                return res.status(500).json({
                    error:
                        targetError.message
                });

            }


            if (!target) {

                return res.status(404).json({
                    error:
                        "User not found."
                });

            }






            if (
                target.role === "owner"
            ) {

                return res.status(403).json({
                    error:
                        "The Owner cannot be demoted or modified."
                });

            }






            const currentProfile =
                await supabase
                    .from("profiles")
                    .select("role")
                    .eq(
                        "id",
                        currentUserId
                    )
                    .maybeSingle();


            const currentRole =
                currentProfile.data?.role;


            if (
                newRole === "owner"
            ) {

                return res.status(403).json({
                    error:
                        "The Owner role cannot be assigned."
                });

            }


            if (
                newRole === "administrator" &&
                currentRole !== "owner"
            ) {

                return res.status(403).json({
                    error:
                        "Only the Owner can promote users to Administrator."
                });

            }






            const {
                data: updated,
                error: updateError
            } = await supabase
                .from("profiles")
                .update({
                    role: newRole
                })
                .eq(
                    "id",
                    targetUserId
                )
                .select(
                    "id, username, display_name, role"
                )
                .single();


            if (updateError) {

                console.error(
                    "ROLE UPDATE ERROR:",
                    updateError
                );

                return res.status(500).json({
                    error:
                        updateError.message
                });

            }






            if (
                newRole === "administrator"
            ) {

                await supabase
                    .from("admins")
                    .upsert(
                        {
                            user_id:
                                targetUserId
                        },
                        {
                            onConflict:
                                "user_id"
                        }
                    );

            } else {

                await supabase
                    .from("admins")
                    .delete()
                    .eq(
                        "user_id",
                        targetUserId
                    );

            }


            res.json({

                success: true,

                message:
                    `Role changed to ${newRole}.`,

                user:
                    updated

            });


        } catch (error) {

            console.error(
                "CHANGE ROLE ERROR:",
                error
            );

            res.status(500).json({
                error:
                    error.message ||
                    "Server error while changing role."
            });

        }

    }
);




app.get("/api/test", (req, res) => {

    res.json({
        success: true,
        message: "ShrekBook server is alive 🧌"
    });

});

app.get("/api/health", (req, res) => {

    res.json({
        ok: true,
        loggedIn: !!req.session.user
    });

});





app.post("/api/signup", async (req, res) => {

    try {

        const username =
            String(
                req.body.username || ""
            ).trim();

        const display_name =
            String(
                req.body.display_name ||
                username
            ).trim();

        const email =
            normalizeEmail(
                req.body.email
            );

        const password =
            String(
                req.body.password || ""
            );

        if (
            !username ||
            !email ||
            !password
        ) {
            return res.status(400).json({
                error:
                    "Username, email, and password are required."
            });
        }


        const emailBan =
            await getActiveBanByEmail(
                email
            );

        if (emailBan) {
            return res.status(403).json({
                error:
                    "This email address is banned from ShrekBook."
            });
        }

        const {
            data: existing,
            error: usernameError
        } = await supabase
            .from("profiles")
            .select("id")
            .eq("username", username)
            .maybeSingle();

        if (usernameError) {
            return res.status(500).json({
                error:
                    usernameError.message
            });
        }

        if (existing) {
            return res.status(400).json({
                error:
                    "That username is already taken."
            });
        }

        const {
            data: authData,
            error: authError
        } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });

        if (authError) {
            return res.status(400).json({
                error:
                    authError.message
            });
        }

        const userId =
            authData.user.id;

        const {
            data: profile,
            error: profileError
        } = await supabase
            .from("profiles")
            .insert({
                id: userId,
                username,
                display_name:
                    display_name || username,
                avatar: null,
                bio: "",
                last_seen:
                    new Date().toISOString()
            })
            .select()
            .single();

        if (profileError) {

            await supabase.auth.admin
                .deleteUser(userId);

            return res.status(500).json({
                error:
                    profileError.message
            });
        }

        res.status(201).json({

            success: true,

            user: {
                ...profile,
                avatar:
                    getAvatar(
                        profile.avatar
                    )
            }

        });

    } catch (error) {

        console.error(
            "SIGNUP ERROR:",
            error
        );

        res.status(500).json({
            error: "Server error."
        });

    }

});
function requireLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            error: "You must be logged in."
        });
    }

    next();
}





app.post("/api/login", async (req, res) => {

    try {

        const email =
            normalizeEmail(
                req.body.email
            );

        const password =
            String(
                req.body.password || ""
            );






        if (!email || !password) {

            return res.status(400).json({
                error:
                    "Email and password are required."
            });

        }






        const emailBan =
            await getActiveBanByEmail(
                email
            );


        if (emailBan) {

            return res.status(403).json({

                error:
                    "This email address is banned from ShrekBook.",

                reason:
                    emailBan.reason ||
                    "No reason provided."

            });

        }






        const {
            data: authData,
            error: authError
        } =
            await supabase.auth.signInWithPassword({

                email,
                password

            });


        if (authError) {

            return res.status(401).json({

                error:
                    authError.message

            });

        }


        const authUser =
            authData.user;


        if (!authUser) {

            return res.status(401).json({

                error:
                    "Login failed."

            });

        }






        const userBan =
            await getActiveBanByUserId(
                authUser.id
            );


        if (userBan) {

            return res.status(403).json({

                error:
                    "Your account has been banned.",

                reason:
                    userBan.reason ||
                    "No reason provided."

            });

        }






        let {
            data: profile,
            error: profileError
        } =
            await supabase
                .from("profiles")
                .select("*")
                .eq(
                    "id",
                    authUser.id
                )
                .maybeSingle();


        if (profileError) {

            console.error(
                "LOGIN PROFILE ERROR:",
                profileError
            );

            return res.status(500).json({

                error:
                    profileError.message

            });

        }






        if (!profile) {

            let username =
                (
                    authUser.email ||
                    "user"
                )
                    .split("@")[0]
                    .toLowerCase()
                    .replace(
                        /[^a-z0-9_]/g,
                        ""
                    )
                    .slice(0, 20);


            if (!username) {

                username =
                    "user";

            }


            const original =
                username;


            let number =
                1;




            while (true) {

                const {
                    data: taken
                } =
                    await supabase
                        .from("profiles")
                        .select("id")
                        .eq(
                            "username",
                            username
                        )
                        .maybeSingle();


                if (!taken) {

                    break;

                }


                username =
                    `${original}${number}`;


                number++;

            }






            const {
                data: created,
                error: createError
            } =
                await supabase
                    .from("profiles")
                    .insert({

                        id:
                            authUser.id,

                        username:
                            username,

                        display_name:
                            username,

                        avatar:
                            null,

                        bio:
                            "",

                        role:
                            "peasant",

                        is_active:
                            true,

                        banned:
                            false,





                        shrekcoins:
                            10,

                        last_shrekcoin_login:
                            new Date()
                                .toISOString()
                                .slice(0, 10)

                    })
                    .select()
                    .single();


            if (createError) {

                console.error(
                    "CREATE PROFILE ERROR:",
                    createError
                );

                return res.status(500).json({

                    error:
                        createError.message

                });

            }


            profile =
                created;


            console.log(
                `🪙 ${username} received 10 ShrekCoins for their first login.`
            );

        }






        if (profile.banned === true) {

            return res.status(403).json({

                error:
                    "Your account has been banned from ShrekBook."

            });

        }






        if (profile.is_active === false) {

            return res.status(403).json({

                error:
                    "Your ShrekBook account is currently inactive."

            });

        }








        const today =
            new Date()
                .toISOString()
                .slice(0, 10);


        let loginCoinsAwarded =
            0;


        if (
            profile.last_shrekcoin_login !==
            today
        ) {

            const currentCoins =
                Number(
                    profile.shrekcoins || 0
                );


            const newCoinTotal =
                currentCoins + 10;


            const {
                data: updatedProfile,
                error: coinError
            } =
                await supabase
                    .from("profiles")
                    .update({

                        shrekcoins:
                            newCoinTotal,

                        last_shrekcoin_login:
                            today

                    })
                    .eq(
                        "id",
                        profile.id
                    )
                    .select()
                    .single();


            if (coinError) {

                console.error(
                    "SHREKCOIN LOGIN ERROR:",
                    coinError
                );



                loginCoinsAwarded = 0;

            } else {

                profile =
                    updatedProfile;

                loginCoinsAwarded =
                    10;


                console.log(
                    `🪙 ${profile.username} received 10 ShrekCoins for logging in today.`
                );

            }

        }






        req.session.user = {

            id:
                profile.id,

            username:
                profile.username,

            display_name:
                profile.display_name,

            email:
                email

        };






        req.session.save(
            error => {

                if (error) {

                    console.error(
                        "SESSION SAVE ERROR:",
                        error
                    );

                    return res.status(500).json({

                        error:
                            "Could not save login session."

                    });

                }






                res.json({

                    success:
                        true,

                    loginCoinsAwarded:
                        loginCoinsAwarded,

                    shrekcoins:
                        Number(
                            profile.shrekcoins || 0
                        ),

                    user: {

                        ...profile,

                        avatar:
                            getAvatar(
                                profile.avatar
                            )

                    }

                });

            }
        );


    } catch (error) {

        console.error(
            "LOGIN ERROR:",
            error
        );


        res.status(500).json({

            error:
                "Server error."

        });

    }

});



app.post("/api/admin/global-message", async (req, res) => {

    try {

        if (
            !req.session ||
            !req.session.user
        ) {

            return res.status(401).json({
                error: "Not logged in"
            });

        }


        const {
            data: profile,
            error
        } = await supabase
            .from("profiles")
            .select("role")
            .eq(
                "id",
                req.session.user.id
            )
            .single();


        if (
            error ||
            !profile
        ) {

            return res.status(403).json({
                error:
                    "Unable to verify permissions."
            });

        }



        if (
            profile.role !== "owner"
        ) {

            return res.status(403).json({
                error:
                    "Only the owner can send global messages."
            });

        }


        const {
            message
        } = req.body;


        if (
            !message ||
            !message.trim()
        ) {

            return res.status(400).json({
                error:
                    "Message cannot be empty."
            });

        }


        if (
            message.length > 1000
        ) {

            return res.status(400).json({
                error:
                    "Message is too long."
            });

        }


        globalMessage = {

            id:
                Date.now(),

            message:
                message.trim(),

            createdAt:
                Date.now()

        };


        res.json({
            success: true
        });


    } catch (error) {

        console.error(
            "GLOBAL MESSAGE ERROR:",
            error
        );

        res.status(500).json({
            error:
                "Failed to send global message."
        });

    }

});




app.post("/api/global-message/read", async (req, res) => {

    try {

        if (
            !req.session ||
            !req.session.user ||
            !req.session.user.id
        ) {

            return res.status(401).json({
                error:
                    "Not logged in."
            });

        }


        if (
            !globalMessage
        ) {

            return res.json({
                success:
                    true
            });

        }


        globalMessage.readBy.add(
            req.session.user.id
        );


        return res.json({
            success:
                true
        });


    } catch (error) {

        console.error(
            "GLOBAL MESSAGE READ ERROR:",
            error
        );

        return res.status(500).json({
            error:
                "Failed to mark message as read."
        });

    }

});





app.post(
    "/api/admin/specific-message",
    async (req, res) => {

        try {





            if (
                !req.session ||
                !req.session.user ||
                !req.session.user.id
            ) {

                return res.status(401).json({
                    error: "Not logged in."
                });

            }


            const senderId =
                req.session.user.id;






            const {
                data: sender,
                error: senderError
            } = await supabase
                .from("profiles")
                .select("id, username, display_name, role")
                .eq(
                    "id",
                    senderId
                )
                .single();


            if (
                senderError ||
                !sender
            ) {

                console.error(
                    "SENDER PROFILE ERROR:",
                    senderError
                );

                return res.status(403).json({
                    error:
                        "Unable to verify your permissions."
                });

            }






            if (
                sender.role !== "administrator" &&
                sender.role !== "owner"
            ) {

                return res.status(403).json({
                    error:
                        "Only administrators and owners can send specific messages."
                });

            }






            const {
                userId,
                message
            } = req.body || {};






            if (
                typeof userId !== "string" ||
                !userId.trim()
            ) {

                return res.status(400).json({
                    error:
                        "A valid user ID is required."
                });

            }


            const targetUserId =
                userId.trim();






            if (
                targetUserId === senderId
            ) {

                return res.status(400).json({
                    error:
                        "You cannot send a specific message to yourself."
                });

            }






            if (
                typeof message !== "string"
            ) {

                return res.status(400).json({
                    error:
                        "Message must be text."
                });

            }


            const cleanMessage =
                message.trim();


            if (
                !cleanMessage
            ) {

                return res.status(400).json({
                    error:
                        "Message cannot be empty."
                });

            }


            if (
                cleanMessage.length > 1000
            ) {

                return res.status(400).json({
                    error:
                        "Message cannot exceed 1000 characters."
                });

            }






            const {
                data: targetUser,
                error: targetError
            } = await supabase
                .from("profiles")
                .select(
                    "id, username, display_name"
                )
                .eq(
                    "id",
                    targetUserId
                )
                .single();


            if (
                targetError ||
                !targetUser
            ) {

                return res.status(404).json({
                    error:
                        "That user does not exist."
                });

            }






            const existingMessage =
                specificMessages.get(
                    targetUserId
                );


            if (
                existingMessage
            ) {

                return res.status(409).json({
                    error:
                        "That user already has an unread specific message."
                });

            }






            const now =
                Date.now();


            const newMessage = {

                id:
                    `${now}-${Math.random()
                        .toString(36)
                        .slice(2, 10)}`,

                message:
                    cleanMessage,

                createdAt:
                    now,

                senderId:
                    sender.id,

                senderUsername:
                    sender.username,

                senderDisplayName:
                    sender.display_name ||
                    sender.username ||
                    "Administrator"

            };






            specificMessages.set(
                targetUserId,
                newMessage
            );






            console.log(
                `📨 Specific message sent by ${sender.username} to ${targetUser.username}`
            );


            return res.json({

                success:
                    true,

                messageId:
                    newMessage.id,

                targetUser: {

                    id:
                        targetUser.id,

                    username:
                        targetUser.username,

                    display_name:
                        targetUser.display_name

                }

            });


        } catch (error) {

            console.error(
                "SPECIFIC MESSAGE ERROR:",
                error
            );


            return res.status(500).json({
                error:
                    "Failed to send specific message."
            });

        }

    }
);







app.get("/api/me", async (req, res) => {

try {

    if (!req.session.user) {

        return res.json({
            loggedIn: false
        });

    }






    if (!req.session.messageStartedAt) {

        req.session.messageStartedAt =
            Date.now();

    }






    const {
        data,
        error
    } = await supabase
        .from("profiles")
        .select("*")
        .eq(
            "id",
            req.session.user.id
        )
        .single();


    if (error || !data) {

        return res.json({
            loggedIn: false
        });

    }






    let pendingGlobalMessage = null;


    if (
        globalMessage &&
        globalMessage.createdAt >=
            req.session.messageStartedAt
    ) {

        pendingGlobalMessage =
            globalMessage;

    }






    const pendingSpecificMessage =
        specificMessages.get(data.id) || null;


    if (pendingSpecificMessage) {

        specificMessages.delete(data.id);

    }






    const [reactions, admin] =
        await Promise.all([
            getReactionCounts(data.id),
            isAdmin(data.id)
        ]);





    let equippedTitle = null;


    if (
        data.equipped_title_id
    ) {

        const {
            data: title,
            error: titleError
        } =
            await supabase
                .from("shop_items")
                .select(
                    "id, name, description, icon, price"
                )
                .eq(
                    "id",
                    data.equipped_title_id
                )
                .maybeSingle();


        if (titleError) {

            console.error(
                "EQUIPPED TITLE ERROR:",
                titleError
            );

        } else {

            equippedTitle =
                title || null;

        }

    }






    res.json({

        loggedIn: true,

        isAdmin:
            admin,

        user: {

            ...data,

            avatar:
                getAvatar(
                    data.avatar
                ),

            gyatt:
                reactions.gyatt,

            cat:
                reactions.cat,

            ogred:
                reactions.ogred,





            equippedTitle:
                equippedTitle

        },

        globalMessage:
            pendingGlobalMessage,

        specificMessage:
            pendingSpecificMessage

    });


} catch (error) {

    console.error(
        "ME ERROR:",
        error
    );

    res.status(500).json({

        error:
            "Server error."

    });

}


});







app.get(
    "/api/specific-message",
    async (req, res) => {

        try {

            if (
                !req.session ||
                !req.session.user ||
                !req.session.user.id
            ) {

                return res.status(401).json({
                    error: "Not logged in."
                });

            }

            const userId =
                req.session.user.id;

            const message =
                specificMessages.get(
                    userId
                );

            if (!message) {

                return res.json({
                    message: null
                });

            }

            return res.json({
                message
            });

        } catch (error) {

            console.error(
                "GET SPECIFIC MESSAGE ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to get specific message."
            });

        }

    }
);




app.get("/api/online", async (req, res) => {

    try {


        if (!req.session || !req.session.user) {

            return res.json({
                online: false
            });

        }



        const {
            data,
            error
        } = await supabase
            .from("profiles")
            .select("id")
            .eq(
                "id",
                req.session.user.id
            )
            .single();


        if (error || !data) {

            return res.json({
                online: false
            });

        }



        res.json({
            online: true,
            userId: data.id
        });


    } catch (error) {

        console.error(
            "ONLINE ERROR:",
            error
        );

        res.status(500).json({
            online: false,
            error: "Server error."
        });

    }

});


app.post("/api/admin/kick", async (req, res) => {

    try {

        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: "Missing userId"
            });
        }

        const { error } = await supabase
            .from("profiles")
            .update({
                kicked: true
            })
            .eq("id", userId);

        if (error) {

            console.error(
                "KICK DATABASE ERROR:",
                error
            );

            return res.status(500).json({
                error: "Failed to kick user"
            });
        }



        setTimeout(async () => {

            try {

                const { error: clearError } =
                    await supabase
                        .from("profiles")
                        .update({
                            kicked: false
                        })
                        .eq("id", userId);

                if (clearError) {

                    console.error(
                        "CLEAR KICK ERROR:",
                        clearError
                    );

                } else {

                    console.log(
                        `🦵 Kick cleared for ${userId}`
                    );

                }

            } catch (error) {

                console.error(
                    "CLEAR KICK EXCEPTION:",
                    error
                );

            }

        }, 1000);


        res.json({
            success: true,
            kicked: true
        });

    } catch (error) {

        console.error(
            "KICK ERROR:",
            error
        );

        res.status(500).json({
            error: "Server error"
        });

    }

});

app.get("/api/admin/check", async (req, res) => {

    try {

        if (!req.session.user) {
            return res.status(401).json({
                isAdmin: false,
                error: "Not logged in."
            });
        }

        const userId =
            req.session.user.id;

        console.log(
            "ADMIN CHECK USER ID:",
            userId
        );

        const {
            data,
            error
        } = await supabase
            .from("admins")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (error) {

            console.error(
                "ADMIN TABLE ERROR:",
                error
            );

            return res.status(500).json({
                isAdmin: false,
                error: error.message
            });

        }

        if (!data) {

            console.log(
                "NOT AN ADMIN:",
                userId
            );

            return res.json({
                isAdmin: false
            });

        }

        console.log(
            "ADMIN CONFIRMED:",
            userId
        );

        return res.json({
            isAdmin: true
        });

    } catch (error) {

        console.error(
            "ADMIN CHECK ERROR:",
            error
        );

        return res.status(500).json({
            isAdmin: false,
            error: "Could not check administrator status."
        });

    }

});








app.get(
    "/api/users",
    async (req, res) => {

        try {





            const {
                data: users,
                error: usersError
            } = await supabase
                .from("profiles")
                .select(`
                    id,
                    username,
                    display_name,
                    avatar,
                    bio,
                    created_at,
                    last_seen,
                    equipped_title_id
                `)
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


            if (usersError) {

                console.error(
                    "USERS DATABASE ERROR:",
                    usersError
                );

                return res.status(500).json({
                    error:
                        usersError.message
                });

            }






            const {
                data: shopItems,
                error: shopItemsError
            } = await supabase
                .from("shop_items")
                .select(`
                    id,
                    name,
                    description,
                    price,
                    icon,
                    item_type
                `);


            if (shopItemsError) {

                console.error(
                    "SHOP ITEMS ERROR:",
                    shopItemsError
                );

                return res.status(500).json({
                    error:
                        shopItemsError.message
                });

            }






            const titleMap = {};


            for (
                const item of
                shopItems || []
            ) {

                if (
                    item.item_type ===
                    "title"
                ) {

                    titleMap[
                        item.id
                    ] = item;

                }

            }






            const {
                data: reactions,
                error: reactionsError
            } = await supabase
                .from("reactions")
                .select(`
                    to_user_id,
                    type
                `);


            if (reactionsError) {

                console.error(
                    "REACTIONS ERROR:",
                    reactionsError
                );

                return res.status(500).json({
                    error:
                        reactionsError.message
                });

            }






            const reactionCounts = {};


            for (
                const reaction of
                reactions || []
            ) {

                const userId =
                    reaction.to_user_id;


                if (
                    !reactionCounts[userId]
                ) {

                    reactionCounts[userId] = {

                        gyatt: 0,
                        cat: 0,
                        ogred: 0

                    };

                }


                if (
                    reaction.type ===
                    "gyatt"
                ) {

                    reactionCounts[
                        userId
                    ].gyatt++;

                }


                if (
                    reaction.type ===
                    "cat"
                ) {

                    reactionCounts[
                        userId
                    ].cat++;

                }


                if (
                    reaction.type ===
                    "ogred"
                ) {

                    reactionCounts[
                        userId
                    ].ogred++;

                }

            }






            const result =
                (users || []).map(
                    user => {

                        const lastSeen =
                            user.last_seen
                                ? new Date(
                                    user.last_seen
                                ).getTime()
                                : 0;


                        const online =
                            lastSeen > 0 &&
                            (
                                Date.now() -
                                lastSeen
                            ) < 60 * 1000;






                        let equippedTitle =
                            null;


                        if (
                            user.equipped_title_id
                        ) {

                            equippedTitle =
                                titleMap[
                                    user.equipped_title_id
                                ] || null;

                        }


                        return {

                            ...user,


                            avatar:
                                getAvatar(
                                    user.avatar
                                ),


                            online,


                            equippedTitle,


                            gyatt:
                                reactionCounts[
                                    user.id
                                ]?.gyatt || 0,


                            cat:
                                reactionCounts[
                                    user.id
                                ]?.cat || 0,


                            ogred:
                                reactionCounts[
                                    user.id
                                ]?.ogred || 0

                        };

                    }
                );






            return res.json(
                result
            );


        } catch (error) {

            console.error(
                "USERS ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);







app.get(
    "/api/users/:id",
    async (req, res) => {

        try {

            const id = req.params.id;

            if (!id) {

                return res.status(400).json({
                    error: "No profile ID was provided."
                });

            }






            const {
                data: profile,
                error: profileError
            } = await supabase
                .from("profiles")
                .select(`
                    id,
                    username,
                    display_name,
                    avatar,
                    bio,
                    created_at,
                    equipped_title_id
                `)
                .eq(
                    "id",
                    id
                )
                .maybeSingle();


            if (profileError) {

                console.error(
                    "PROFILE ERROR:",
                    profileError
                );

                return res.status(500).json({
                    error: profileError.message
                });

            }


            if (!profile) {

                return res.status(404).json({
                    error: "User not found."
                });

            }






            let equippedTitle = null;


            if (profile.equipped_title_id) {

                const {
                    data: title,
                    error: titleError
                } = await supabase
                    .from("shop_items")
                    .select(`
                        id,
                        name,
                        description,
                        price,
                        icon,
                        item_type
                    `)
                    .eq(
                        "id",
                        profile.equipped_title_id
                    )
                    .eq(
                        "item_type",
                        "title"
                    )
                    .maybeSingle();


                if (titleError) {

                    console.error(
                        "EQUIPPED TITLE ERROR:",
                        titleError
                    );

                } else {

                    equippedTitle =
                        title || null;

                }

            }






            let displayedItems = [];


            const {
                data: inventoryItems,
                error: inventoryError
            } = await supabase
                .from("user_shop_items")
                .select(`
                    id,
                    item_id,
                    equipped,
                    purchased_at
                `)
                .eq(
                    "user_id",
                    id
                )
                .eq(
                    "equipped",
                    true
                );


            if (inventoryError) {

                console.error(
                    "DISPLAYED INVENTORY ERROR:",
                    inventoryError
                );

            } else if (
                inventoryItems &&
                inventoryItems.length > 0
            ) {






                const itemIds =
                    inventoryItems.map(
                        inventoryItem =>
                            inventoryItem.item_id
                    );


                const {
                    data: shopItems,
                    error: shopItemsError
                } = await supabase
                    .from("shop_items")
                    .select(`
                        id,
                        name,
                        description,
                        price,
                        icon,
                        item_type
                    `)
                    .in(
                        "id",
                        itemIds
                    );


                if (shopItemsError) {

                    console.error(
                        "DISPLAYED SHOP ITEMS ERROR:",
                        shopItemsError
                    );

                } else {

                    displayedItems =
                        (shopItems || []).map(
                            shopItem => {

                                const inventoryItem =
                                    inventoryItems.find(
                                        inventoryItem =>
                                            String(
                                                inventoryItem.item_id
                                            ) ===
                                            String(
                                                shopItem.id
                                            )
                                    );


                                return {

                                    id:
                                        shopItem.id,

                                    name:
                                        shopItem.name,

                                    description:
                                        shopItem.description,

                                    price:
                                        shopItem.price,

                                    icon:
                                        shopItem.icon,

                                    item_type:
                                        shopItem.item_type,

                                    purchased_at:
                                        inventoryItem
                                            ?.purchased_at
                                            || null,

                                    equipped:
                                        true

                                };

                            }
                        );

                }

            }






            const {
                data: posts,
                error: postsError
            } = await supabase
                .from("posts")
                .select(`
                    id,
                    user_id,
                    content,
                    image_url,
                    created_at
                `)
                .eq(
                    "user_id",
                    id
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


            if (postsError) {

                return res.status(500).json({
                    error: postsError.message
                });

            }






            const reactions =
                await getReactionCounts(id);






            return res.json({

                ...profile,

                avatar:
                    getAvatar(
                        profile.avatar
                    ),

                equippedTitle:
                    equippedTitle,

                displayedItems:
                    displayedItems,

                gyatt:
                    reactions.gyatt,

                cat:
                    reactions.cat,

                ogred:
                    reactions.ogred,

                posts:
                    posts || []

            });


        } catch (error) {

            console.error(
                "ONE USER ERROR:",
                error
            );

            return res.status(500).json({
                error: "Server error."
            });

        }

    }
);



app.post("/api/profile/avatar", upload.single("avatar"), async (req, res) => {
    try {




        if (!req.session || !req.session.user || !req.session.user.id) {
            return res.status(401).json({
                error: "You must be logged in."
            });
        }

        if (!req.file) {
            return res.status(400).json({
                error: "No avatar image was uploaded."
            });
        }

        const userId = req.session.user.id;





        const allowedTypes = [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif"
        ];

        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({
                error: "Invalid image type. Use PNG, JPG, WEBP, or GIF."
            });
        }


        if (req.file.size > 5 * 1024 * 1024) {
            return res.status(400).json({
                error: "Avatar must be 5 MB or smaller."
            });
        }





        const extensionMap = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/webp": "webp",
            "image/gif": "gif"
        };

        const extension = extensionMap[req.file.mimetype];


        const filePath = `${userId}/avatar.${extension}`;





        const { error: uploadError } = await supabase.storage
            .from("avatars")
            .upload(filePath, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: true,
                cacheControl: "3600"
            });

        if (uploadError) {
            console.error("AVATAR STORAGE ERROR:", uploadError);

            return res.status(500).json({
                error: "Failed to upload avatar."
            });
        }





        const {
            data: publicUrlData
        } = supabase.storage
            .from("avatars")
            .getPublicUrl(filePath);

        if (!publicUrlData || !publicUrlData.publicUrl) {
            return res.status(500).json({
                error: "Failed to create avatar URL."
            });
        }



        const avatarUrl =
            `${publicUrlData.publicUrl}?v=${Date.now()}`;





        const { error: profileError } = await supabase
            .from("profiles")
            .update({
                avatar: avatarUrl
            })
            .eq("id", userId);

        if (profileError) {
            console.error("AVATAR PROFILE UPDATE ERROR:", profileError);

            return res.status(500).json({
                error: "Avatar uploaded, but your profile could not be updated."
            });
        }





        return res.json({
            success: true,
            avatar: avatarUrl
        });

    } catch (error) {
        console.error("AVATAR UPLOAD ERROR:", error);

        return res.status(500).json({
            error: "Internal server error."
        });
    }
});






app.put(
    "/api/profile",
    async (req, res) => {

        try {

            if (!req.session.user) {
                return res.status(401).json({
                    error:
                        "You must be logged in."
                });
            }

            const display_name =
                String(
                    req.body.display_name ||
                    ""
                ).trim();

            const bio =
                String(
                    req.body.bio ||
                    ""
                ).trim();

            if (!display_name) {
                return res.status(400).json({
                    error:
                        "Display name cannot be empty."
                });
            }

            if (display_name.length > 50) {
                return res.status(400).json({
                    error:
                        "Display name is too long."
                });
            }

            if (bio.length > 500) {
                return res.status(400).json({
                    error:
                        "Bio is too long."
                });
            }

            const {
                data,
                error
            } = await supabase
                .from("profiles")
                .update({
                    display_name,
                    bio
                })
                .eq(
                    "id",
                    req.session.user.id
                )
                .select(`
                    id,
                    username,
                    display_name,
                    avatar,
                    bio,
                    created_at
                `)
                .single();

            if (error) {

                return res.status(500).json({
                    error:
                        error.message
                });

            }

            req.session.user.display_name =
                data.display_name;

            req.session.save(
                sessionError => {

                    if (sessionError) {

                        return res.status(500).json({
                            error:
                                "Could not save profile session."
                        });

                    }

                    res.json({

                        success: true,

                        user: {
                            ...data,
                            avatar:
                                getAvatar(
                                    data.avatar
                                )
                        }

                    });

                }
            );

        } catch (error) {

            console.error(
                "UPDATE PROFILE ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);






async function uploadImage(
    fileBuffer,
    fileType,
    fileName,
    userId
) {





    if (
        !fileBuffer ||
        !fileName ||
        !userId
    ) {

        throw new Error(
            "Missing file data."
        );

    }






    const extension =
        fileName
            .split(".")
            .pop()
            .toLowerCase();






    const allowedExtensions = [
        "png",
        "jpg",
        "jpeg",
        "webp",
        "gif",

        "mp4",
        "webm",
        "mov",

        "mp3"
    ];


    if (
        !allowedExtensions.includes(
            extension
        )
    ) {

        throw new Error(
            "Unsupported file type."
        );

    }






    let contentType =
        fileType;






    if (
        extension === "mp3"
    ) {

        contentType =
            "audio/mpeg";

    } else if (
        extension === "mp4"
    ) {

        contentType =
            "video/mp4";

    } else if (
        extension === "webm"
    ) {

        contentType =
            "video/webm";

    } else if (
        extension === "mov"
    ) {

        contentType =
            "video/quicktime";

    } else if (
        extension === "png"
    ) {

        contentType =
            "image/png";

    } else if (
        extension === "jpg" ||
        extension === "jpeg"
    ) {

        contentType =
            "image/jpeg";

    } else if (
        extension === "webp"
    ) {

        contentType =
            "image/webp";

    } else if (
        extension === "gif"
    ) {

        contentType =
            "image/gif";

    }






    const isVideo =
        extension === "mp4" ||
        extension === "webm" ||
        extension === "mov";

    const isAudio =
        extension === "mp3";

    const maxSize =

        isVideo
            ? 200 * 1024 * 1024
            : isAudio
                ? 20 * 1024 * 1024
                : 5 * 1024 * 1024;


    if (
        fileBuffer.length >
        maxSize
    ) {

        throw new Error(
            isVideo
                ? "Video must be under 50MB."
                : isAudio
                    ? "Audio must be under 20MB."
                    : "Image must be under 5MB."
        );

    }






    const filePath =
        `posts/${userId}/${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}.${extension}`;






    const {
        error: uploadError
    } =
        await supabase.storage
            .from("avatars")
            .upload(
                filePath,
                fileBuffer,
                {
                    contentType:
                        contentType,

                    upsert:
                        false
                }
            );


    if (uploadError) {

        console.error(
            "SUPABASE FILE UPLOAD ERROR:",
            uploadError
        );

        throw new Error(
            uploadError.message
        );

    }






    const {
        data: publicData
    } =
        supabase.storage
            .from("avatars")
            .getPublicUrl(
                filePath
            );


    if (
        !publicData ||
        !publicData.publicUrl
    ) {

        throw new Error(
            "Could not generate file URL."
        );

    }


    return publicData.publicUrl;

}




app.get(
    "/api/posts",
    async (req, res) => {

        try {

            const {
                data: posts,
                error
            } = await supabase
                .from("posts")
                .select(`
                    id,
                    user_id,
                    content,
                    image_url,
                    created_at
                `)
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                )
                .limit(100);

            if (error) {

                return res.status(500).json({
                    error:
                        error.message
                });

            }

            const result = [];

            for (
                const post of
                posts || []
            ) {

                const {
                    data: profile
                } = await supabase
                    .from("profiles")
                    .select(`
                        username,
                        display_name,
                        avatar
                    `)
                    .eq(
                        "id",
                        post.user_id
                    )
                    .maybeSingle();

                result.push({

                    ...post,

                    username:
                        profile?.username ||
                        "User",

                    display_name:
                        profile?.display_name ||
                        profile?.username ||
                        "User",

                    avatar:
                        getAvatar(
                            profile?.avatar
                        )

                });

            }

            res.json(result);

        } catch (error) {

            console.error(
                "GET POSTS ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);
app.post(
    "/api/posts",
    upload.single("media"),
    async (req, res) => {

        try {





            if (
                !req.session ||
                !req.session.user
            ) {

                return res.status(401).json({
                    error:
                        "You must be logged in."
                });

            }


            const userId =
                req.session.user.id;






            const content =
                String(
                    req.body.content ||
                    ""
                ).trim();


            if (
                content.length >
                5000
            ) {

                return res.status(400).json({
                    error:
                        "Post is too long."
                });

            }






            const file =
                req.file ||
                null;


            let imageUrl =
                null;






            if (file) {

                try {

                    imageUrl =
                        await uploadImage(
                            file.buffer,
                            file.mimetype,
                            file.originalname,
                            userId
                        );

                } catch (error) {

                    console.error(
                        "POST FILE UPLOAD ERROR:",
                        error
                    );

                    return res.status(400).json({
                        error:
                            error.message
                    });

                }

            }






            if (
                !content &&
                !imageUrl
            ) {

                return res.status(400).json({
                    error:
                        "Post cannot be empty."
                });

            }






            const {
                data,
                error
            } =
                await supabase
                    .from("posts")
                    .insert({

                        user_id:
                            userId,

                        content:
                            content,

                        image_url:
                            imageUrl

                    })
                    .select()
                    .single();


            if (error) {

                console.error(
                    "POST INSERT ERROR:",
                    error
                );

                return res.status(500).json({
                    error:
                        error.message
                });

            }






            const todayUTC =
                new Date()
                    .toISOString()
                    .slice(0, 10);


            const {
                data: profile,
                error: profileError
            } =
                await supabase
                    .from("profiles")
                    .select(
                        "last_post_reward_date"
                    )
                    .eq(
                        "id",
                        userId
                    )
                    .single();


            if (profileError) {

                console.error(
                    "POST REWARD PROFILE ERROR:",
                    profileError
                );

            } else {

                if (
                    profile.last_post_reward_date !==
                    todayUTC
                ) {

                    const {
                        error: coinError
                    } =
                        await supabase.rpc(
                            "increment_shrekcoins",
                            {

                                user_id:
                                    userId,

                                amount:
                                    5

                            }
                        );


                    if (coinError) {

                        console.error(
                            "POST SHREKCOIN ERROR:",
                            coinError
                        );

                    } else {

                        const {
                            error: dateError
                        } =
                            await supabase
                                .from("profiles")
                                .update({

                                    last_post_reward_date:
                                        todayUTC

                                })
                                .eq(
                                    "id",
                                    userId
                                );


                        if (dateError) {

                            console.error(
                                "POST REWARD DATE ERROR:",
                                dateError
                            );

                        }

                    }

                }

            }






            return res.status(201).json({

                ...data

            });


        } catch (error) {

            console.error(
                "CREATE POST ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);


app.get("/api/leaderboard", async (req, res) => {

    try {

        const type =
            req.query.type || "overall";


        const validTypes = [
            "overall",
            "posts",
            "comments",
            "cat",
            "gyatt",
            "ogred"
        ];


        if (!validTypes.includes(type)) {

            return res.status(400).json({
                error: "Invalid leaderboard type."
            });

        }


        const {
            data: profiles,
            error: profilesError
        } = await supabase
            .from("profiles")
            .select(`
                id,
                username,
                display_name,
                avatar
            `);


        if (profilesError) {

            console.error(
                "LEADERBOARD PROFILES ERROR:",
                profilesError
            );

            return res.status(500).json({
                error: profilesError.message
            });

        }



        const {
            data: posts,
            error: postsError
        } = await supabase
            .from("posts")
            .select("user_id");


        if (postsError) {

            console.error(
                "LEADERBOARD POSTS ERROR:",
                postsError
            );

            return res.status(500).json({
                error: postsError.message
            });

        }




        const postCounts = {};


        for (const post of posts || []) {

            if (!post.user_id) {
                continue;
            }

            postCounts[post.user_id] =
                (postCounts[post.user_id] || 0) + 1;

        }



        const {
            data: comments,
            error: commentsError
        } = await supabase
            .from("comments")
            .select("user_id");


        if (commentsError) {

            console.error(
                "LEADERBOARD COMMENTS ERROR:",
                commentsError
            );

            return res.status(500).json({
                error: commentsError.message
            });

        }




        const commentCounts = {};


        for (const comment of comments || []) {

            if (!comment.user_id) {
                continue;
            }

            commentCounts[comment.user_id] =
                (commentCounts[comment.user_id] || 0) + 1;

        }




        const {
            data: reactions,
            error: reactionsError
        } = await supabase
            .from("reactions")
            .select(`
                to_user_id,
                type
            `);


        if (reactionsError) {

            console.error(
                "LEADERBOARD REACTIONS ERROR:",
                reactionsError
            );

            return res.status(500).json({
                error: reactionsError.message
            });

        }



        const reactionCounts = {};


        for (const reaction of reactions || []) {

            const userId =
                reaction.to_user_id;

            const reactionType =
                reaction.type;


            if (!userId) {
                continue;
            }


            if (!reactionCounts[userId]) {

                reactionCounts[userId] = {

                    cat: 0,

                    gyatt: 0,

                    ogred: 0

                };

            }


            if (
                reactionType === "cat" ||
                reactionType === "gyatt" ||
                reactionType === "ogred"
            ) {

                reactionCounts[userId][reactionType]++;

            }

        }




        let users =
            (profiles || []).map(profile => {

                const userId =
                    profile.id;


                const postsCount =
                    postCounts[userId] || 0;


                const commentsCount =
                    commentCounts[userId] || 0;


                const reactionsForUser =
                    reactionCounts[userId] || {

                        cat: 0,

                        gyatt: 0,

                        ogred: 0

                    };


                const cat =
                    reactionsForUser.cat;


                const gyatt =
                    reactionsForUser.gyatt;


                const ogred =
                    reactionsForUser.ogred;



                const score =
                    (
                        postsCount * 5
                    ) +
                    (
                        commentsCount * 2
                    ) +
                    cat +
                    gyatt +
                    ogred;


                let leaderboardScore;


                switch (type) {

                    case "posts":

                        leaderboardScore =
                            postsCount;

                        break;


                    case "comments":

                        leaderboardScore =
                            commentsCount;

                        break;


                    case "cat":

                        leaderboardScore =
                            cat;

                        break;


                    case "gyatt":

                        leaderboardScore =
                            gyatt;

                        break;


                    case "ogred":

                        leaderboardScore =
                            ogred;

                        break;


                    case "overall":

                    default:

                        leaderboardScore =
                            score;

                        break;

                }


                return {

                    id:
                        profile.id,

                    username:
                        profile.username,

                    display_name:
                        profile.display_name,

                    avatar:
                        profile.avatar,

                    posts:
                        postsCount,

                    comments:
                        commentsCount,

                    cat:
                        cat,

                    gyatt:
                        gyatt,

                    ogred:
                        ogred,

                    score:
                        score,

                    leaderboardScore:
                        leaderboardScore

                };

            });




        users.sort(
            (a, b) => {

                if (
                    b.leaderboardScore !==
                    a.leaderboardScore
                ) {

                    return (
                        b.leaderboardScore -
                        a.leaderboardScore
                    );

                }




                return String(a.id)
                    .localeCompare(
                        String(b.id)
                    );

            }
        );




        let previousScore = null;

        let previousRank = 0;


        users.forEach(
            (user, index) => {

                const score =
                    user.leaderboardScore;


                if (
                    previousScore !== null &&
                    score === previousScore
                ) {

                    user.rank =
                        previousRank;

                }

                else {

                    user.rank =
                        index + 1;

                    previousRank =
                        user.rank;

                    previousScore =
                        score;

                }

            }
        );




        const topFive =
            users.slice(0, 5);


        let currentUser = null;


        const currentUserId =
            req.session?.user?.id;


        if (currentUserId) {

            const foundUser =
                users.find(
                    user =>
                        String(user.id) ===
                        String(currentUserId)
                );


            if (foundUser) {

                currentUser = {

                    id:
                        foundUser.id,

                    username:
                        foundUser.username,

                    display_name:
                        foundUser.display_name,

                    avatar:
                        foundUser.avatar,

                    posts:
                        foundUser.posts,

                    comments:
                        foundUser.comments,

                    cat:
                        foundUser.cat,

                    gyatt:
                        foundUser.gyatt,

                    ogred:
                        foundUser.ogred,

                    score:
                        foundUser.score,

                    leaderboardScore:
                        foundUser.leaderboardScore,

                    rank:
                        foundUser.rank

                };

            }

        }




        return res.json({

            leaderboard:
                topFive,

            currentUser:
                currentUser,

            totalUsers:
                users.length

        });


    } catch (error) {

        console.error(
            "LEADERBOARD ERROR:",
            error
        );


        return res.status(500).json({

            error:
                "Could not load leaderboard."

        });

    }

});




app.get(
    "/api/posts/:postId/comments",
    async (req, res) => {

        try {

            const {
                data: comments,
                error
            } = await supabase
                .from("comments")
                .select(`
                    id,
                    postId,
                    user_id,
                    content,
                    image_url,
                    created_at
                `)
                .eq(
                    "postId",
                    req.params.postId
                )
                .order(
                    "created_at",
                    {
                        ascending: true
                    }
                );

            if (error) {
                return res.status(500).json({
                    error:
                        error.message
                });
            }

            const result = [];

            for (
                const comment of
                comments || []
            ) {

                const {
                    data: profile
                } = await supabase
                    .from("profiles")
                    .select(
                        "username, display_name, avatar"
                    )
                    .eq(
                        "id",
                        comment.user_id
                    )
                    .maybeSingle();

                result.push({

                    ...comment,

                    username:
                        profile?.username ||
                        "User",

                    display_name:
                        profile?.display_name ||
                        profile?.username ||
                        "User",

                    avatar:
                        getAvatar(
                            profile?.avatar
                        )

                });

            }

            res.json(result);

        } catch (error) {

            console.error(
                "COMMENTS ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);


app.post(
    "/api/posts/:postId/comments",
    upload.single("image"),
    async (req, res) => {

        try {





            if (!req.session?.user) {

                return res.status(401).json({
                    error:
                        "You must be logged in."
                });

            }


            const userId =
                req.session.user.id;

            const postId =
                req.params.postId;






            const content =
                String(
                    req.body?.content ||
                    ""
                ).trim();


            if (content.length > 500) {

                return res.status(400).json({
                    error:
                        "Comment is too long."
                });

            }






            const file =
                req.file || null;


            let imageUrl =
                null;







            if (file) {

                try {
                    const extension =
                        file.originalname
                            .split(".")
                            .pop()
                            .toLowerCase();

                    const allowed = [
                        "png",
                        "jpg",
                        "jpeg",
                        "webp",
                        "gif",
                        "mp4",
                        "webm",
                        "mov"
                    ];

                    if (!allowed.includes(extension)) {
                        return res.status(400).json({
                            error: "Unsupported file type."
                        });
                    }

                    const isVideo = file.mimetype.startsWith("video/");

                    const maxSize =
                        isVideo
                            ? 50 * 1024 * 1024
                            : 5 * 1024 * 1024;

                    if (file.size > maxSize) {
                        return res.status(400).json({
                            error: isVideo
                                ? "Video must be under 50MB."
                                : "Image must be under 5MB."
                        });
                    }

                    const filePath =
                        `comments/${userId}/${Date.now()}-${Math.random()
                            .toString(36)
                            .slice(2)}.${extension}`;

                    const {
                        error: uploadError
                    } = await supabase.storage
                        .from("avatars")
                        .upload(filePath, file.buffer, {
                            contentType: file.mimetype,
                            upsert: false
                        });

                    if (uploadError) {
                        console.error(
                            "COMMENT FILE UPLOAD ERROR:",
                            uploadError
                        );

                        return res.status(500).json({
                            error: uploadError.message
                        });
                    }

                    const {
                        data: publicData
                    } = supabase.storage
                        .from("avatars")
                        .getPublicUrl(filePath);

                    imageUrl = publicData.publicUrl;

                } catch (error) {
                    console.error("COMMENT FILE ERROR:", error);

                    return res.status(500).json({
                        error: "Failed to upload comment media."
                    });
                }
            }






            if (
                !content &&
                !imageUrl
            ) {

                return res.status(400).json({
                    error:
                        "Comment cannot be empty."
                });

            }






            const {
                data,
                error
            } =
                await supabase
                    .from("comments")
                    .insert({

                        postId:

                            req.params.postId,

                            postId,


                        user_id:
                            userId,

                        content:
                            content,

                        content,


                        image_url:
                            imageUrl

                    })
                    .select()
                    .single();


            if (error) {

                console.error(
                    "COMMENT INSERT ERROR:",
                    error
                );

                return res.status(500).json({
                    error:
                        error.message
                });

            }






            const todayUTC =
                new Date()
                    .toISOString()
                    .slice(
                        0,
                        10
                    );


            const {

                data:
                    profile,
                error:
                    profileError

            } =
                await supabase
                    .from("profiles")
                    .select(
                        "last_comment_reward_date"
                    )
                    .eq(
                        "id",
                        userId
                    )
                    .single();


            if (profileError) {

                console.error(
                    "COMMENT REWARD PROFILE ERROR:",
                    profileError
                );

            } else {







                if (
                    profile.last_comment_reward_date !==
                    todayUTC
                ) {

                    const {

                        error:
                            coinError

                    } =
                        await supabase.rpc(
                            "increment_shrekcoins",
                            {

                                user_id:
                                    userId,

                                amount:
                                    5

                            }
                        );


                    if (coinError) {

                        console.error(
                            "COMMENT SHREKCOIN ERROR:",
                            coinError
                        );

                    } else {





                        const {
                            error: dateError
                        } = await supabase
                            .from("profiles")
                            .update({
                                last_comment_reward_date:
                                    todayUTC
                            })
                            .eq(
                                "id",
                                userId
                            );

                        if (dateError) {

                            console.error(
                                "COMMENT REWARD DATE ERROR:",
                                dateError
                            );

                        }

                    }

                }

            }






            return res.status(201).json({
                ...data
            });


        } catch (error) {

            console.error(
                "COMMENT ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    error.message ||
                    "Server error."
            });

        }

    }
);

app.post(
    "/api/shop/items",
    async (req, res) => {

        try {





            if (
                !req.session ||
                !req.session.user
            ) {

                return res.status(401).json({
                    error:
                        "You must be logged in."
                });

            }

            const userId =
                req.session.user.id;






            const name =
                String(
                    req.body.name ||
                    ""
                ).trim();

            const description =
                String(
                    req.body.description ||
                    ""
                ).trim();

            const itemType =
                String(
                    req.body.item_type ||
                    ""
                ).trim();

            const price =
                Number(
                    req.body.price
                );

            const icon =
                String(
                    req.body.icon ||
                    "🧌"
                ).trim();

            const file =
                req.body.file;






            if (!name) {

                return res.status(400).json({
                    error:
                        "Item name is required."
                });

            }

            if (name.length > 100) {

                return res.status(400).json({
                    error:
                        "Item name must be 100 characters or less."
                });

            }

            if (description.length > 1000) {

                return res.status(400).json({
                    error:
                        "Description must be 1000 characters or less."
                });

            }

            if (itemType !== "avatar") {

                return res.status(400).json({
                    error:
                        "Invalid item type."
                });

            }

            if (
                !Number.isInteger(price) ||
                price < 1 ||
                price > 1000000000
            ) {

                return res.status(400).json({
                    error:
                        "Invalid ShrekCoin price."
                });

            }

            if (!file) {

                return res.status(400).json({
                    error:
                        "No .sb file was provided."
                });

            }

            if (
                !file.name ||
                !file.name
                    .toLowerCase()
                    .endsWith(".sb")
            ) {

                return res.status(400).json({
                    error:
                        "Avatar files must use the .sb extension."
                });

            }

            if (!file.data) {

                return res.status(400).json({
                    error:
                        "Avatar file data is missing."
                });

            }






            let fileBuffer;

            try {

                fileBuffer =
                    Buffer.from(
                        file.data,
                        "base64"
                    );

            } catch (error) {

                return res.status(400).json({
                    error:
                        "Invalid .sb file."
                });

            }

            if (!fileBuffer.length) {

                return res.status(400).json({
                    error:
                        "The .sb file is empty."
                });

            }






            const maxSize =
                20 * 1024 * 1024;

            if (
                fileBuffer.length >
                maxSize
            ) {

                return res.status(400).json({
                    error:
                        "The .sb file must be under 20MB."
                });

            }






            const safeName =
                file.name
                    .replace(
                        /[^a-zA-Z0-9._-]/g,
                        "_"
                    );

            const storagePath =
                `shop/${userId}/${Date.now()}-${safeName}`;






            const {
                error: uploadError
            } =
                await supabase.storage
                    .from("avatars")
                    .upload(
                        storagePath,
                        fileBuffer,
                        {
                            contentType:
                                "application/octet-stream",

                            upsert:
                                false
                        }
                    );


            if (uploadError) {

                console.error(
                    "SHOP FILE UPLOAD ERROR:",
                    uploadError
                );

                return res.status(500).json({
                    error:
                        "Could not upload the .sb file."
                });

            }






            const {
                data: publicData
            } =
                supabase.storage
                    .from("avatars")
                    .getPublicUrl(
                        storagePath
                    );


            const fileUrl =
                publicData?.publicUrl;


            if (!fileUrl) {

                await supabase.storage
                    .from("avatars")
                    .remove([
                        storagePath
                    ]);

                return res.status(500).json({
                    error:
                        "Could not create the file URL."
                });

            }






            const {
                data: item,
                error: itemError
            } =
                await supabase
                    .from("shop_items")
                    .insert({


                        user_id:
                            userId,

                        name:
                            name,

                        description:
                            description,

                        item_type:
                            "avatar",

                        item_value:
                            fileUrl,

                        price:
                            price,

                        icon:
                            icon
                    })
                    .select()
                    .single();






            if (itemError) {

                console.error(
                    "SHOP ITEM INSERT ERROR:",
                    itemError
                );


                await supabase.storage
                    .from("avatars")
                    .remove([
                        storagePath
                    ]);


                return res.status(500).json({
                    error:
                        itemError.message
                });

            }






            const {
                data: listing,
                error: listingError
            } =
                await supabase
                    .from("marketplace_listings")
                    .insert({

                        item_id:
                            item.id,

                        seller_id:
                            userId,

                        price:
                            price
                    })
                    .select()
                    .single();






            if (listingError) {

                console.error(
                    "MARKETPLACE LISTING ERROR:",
                    listingError
                );



                await supabase
                    .from("shop_items")
                    .delete()
                    .eq(
                        "id",
                        item.id
                    );



                await supabase.storage
                    .from("avatars")
                    .remove([
                        storagePath
                    ]);


                return res.status(500).json({
                    error:
                        "Avatar was created, but the marketplace listing could not be created."
                });

            }






            const {
                error: ownershipError
            } =
                await supabase
                    .from("user_shop_items")
                    .insert({

                        user_id:
                            userId,

                        item_id:
                            item.id
                    });






            if (ownershipError) {

                console.error(
                    "SVIS OWNERSHIP ERROR:",
                    ownershipError
                );




                await supabase
                    .from("marketplace_listings")
                    .delete()
                    .eq(
                        "id",
                        listing.id
                    );


                await supabase
                    .from("shop_items")
                    .delete()
                    .eq(
                        "id",
                        item.id
                    );


                await supabase.storage
                    .from("avatars")
                    .remove([
                        storagePath
                    ]);


                return res.status(500).json({
                    error:
                        "Avatar was created, but ownership could not be assigned."
                });

            }






            return res.status(201).json({

                success:
                    true,

                message:
                    "Avatar published successfully and listed for sale.",

                item:
                    item,

                listing:
                    listing

            });


        } catch (error) {

            console.error(
                "SHOP PUBLISH ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);





app.post(
    "/api/shop/buy",
    async (req, res) => {

        try {





            if (
                !req.session ||
                !req.session.user ||
                !req.session.user.id
            ) {

                return res.status(401).json({
                    error:
                        "You must be logged in."
                });

            }


            const userId =
                req.session.user.id;






            const itemId =
                req.body &&
                req.body.item_id;


            if (
                itemId === undefined ||
                itemId === null ||
                itemId === ""
            ) {

                return res.status(400).json({
                    error:
                        "A valid item ID is required."
                });

            }


            const numericItemId =
                Number(itemId);


            if (
                !Number.isInteger(numericItemId) ||
                numericItemId <= 0
            ) {

                return res.status(400).json({
                    error:
                        "Invalid item ID."
                });

            }






            const {
                data,
                error
            } =
                await supabase.rpc(
                    "buy_shop_item",
                    {
                        p_user_id:
                            userId,

                        p_item_id:
                            numericItemId
                    }
                );






            if (error) {

                console.error(
                    "SHOP PURCHASE ERROR:",
                    error
                );


                const message =
                    error.message ||
                    "Purchase failed.";




                if (
                    message.toLowerCase()
                        .includes(
                            "not enough"
                        )
                ) {

                    return res.status(400).json({
                        error:
                            "You don't have enough ShrekCoins."
                    });

                }




                if (
                    message.toLowerCase()
                        .includes(
                            "already own"
                        )
                ) {

                    return res.status(400).json({
                        error:
                            "You already own this item."
                    });

                }




                if (
                    message.toLowerCase()
                        .includes(
                            "not found"
                        ) ||
                    message.toLowerCase()
                        .includes(
                            "unavailable"
                        )
                ) {

                    return res.status(404).json({
                        error:
                            "That item is unavailable."
                    });

                }


                return res.status(500).json({
                    error:
                        "Purchase failed."
                });

            }






            const {
                data: profile,
                error: profileError
            } =
                await supabase
                    .from("profiles")
                    .select("shrekcoins")
                    .eq(
                        "id",
                        userId
                    )
                    .single();


            if (profileError) {

                console.error(
                    "COIN BALANCE ERROR:",
                    profileError
                );

            }






            return res.json({

                success:
                    true,

                purchase:
                    data,

                shrekcoins:
                    profile
                        ? profile.shrekcoins
                        : null

            });


        } catch (error) {

            console.error(
                "SHOP BUY ERROR:",
                error
            );


            return res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);



























app.post(
    "/api/shop/equip",
    async (req, res) => {

        try {





            if (
                !req.session ||
                !req.session.user ||
                !req.session.user.id
            ) {

                return res.status(401).json({
                    error:
                        "You must be logged in."
                });

            }


            const userId =
                req.session.user.id;






            const itemId =
                req.body &&
                req.body.item_id;


            const numericItemId =
                Number(itemId);


            if (
                !Number.isInteger(
                    numericItemId
                ) ||
                numericItemId <= 0
            ) {

                return res.status(400).json({
                    error:
                        "A valid item ID is required."
                });

            }






            const {
                data: ownership,
                error: ownershipError
            } =
                await supabase
                    .from("user_shop_items")
                    .select(`
                        user_id,
                        item_id,
                        equipped
                    `)
                    .eq(
                        "user_id",
                        userId
                    )
                    .eq(
                        "item_id",
                        numericItemId
                    )
                    .maybeSingle();


            if (ownershipError) {

                console.error(
                    "OWNERSHIP CHECK ERROR:",
                    ownershipError
                );

                return res.status(500).json({
                    error:
                        ownershipError.message
                });

            }


            if (!ownership) {

                return res.status(403).json({
                    error:
                        "You do not own this item."
                });

            }






            const {
                data: item,
                error: itemError
            } =
                await supabase
                    .from("shop_items")
                    .select(`
                        id,
                        name,
                        description,
                        icon,
                        price,
                        item_type
                    `)
                    .eq(
                        "id",
                        numericItemId
                    )
                    .maybeSingle();


            if (itemError) {

                console.error(
                    "SHOP ITEM ERROR:",
                    itemError
                );

                return res.status(500).json({
                    error:
                        itemError.message
                });

            }


            if (!item) {

                return res.status(404).json({
                    error:
                        "Shop item not found."
                });

            }






            if (
                item.item_type ===
                "title"
            ) {

                const {
                    error: updateError
                } =
                    await supabase
                        .from("profiles")
                        .update({

                            equipped_title_id:
                                numericItemId

                        })
                        .eq(
                            "id",
                            userId
                        );


                if (updateError) {

                    console.error(
                        "EQUIP TITLE ERROR:",
                        updateError
                    );

                    return res.status(500).json({
                        error:
                            "Could not equip title."
                    });

                }


                return res.json({

                    success:
                        true,

                    type:
                        "title",

                    equipped:
                        item

                });

            }






            if (
                ownership.equipped
            ) {

                return res.json({

                    success:
                        true,

                    type:
                        "item",

                    alreadyEquipped:
                        true,

                    displayed:
                        item

                });

            }






            const {
                count,
                error: countError
            } =
                await supabase
                    .from("user_shop_items")
                    .select(
                        "item_id",
                        {
                            count:
                                "exact",
                            head:
                                true
                        }
                    )
                    .eq(
                        "user_id",
                        userId
                    )
                    .eq(
                        "equipped",
                        true
                    );


            if (countError) {

                console.error(
                    "EQUIPPED COUNT ERROR:",
                    countError
                );

                return res.status(500).json({
                    error:
                        countError.message
                });

            }






            if (
                (count || 0) >= 5
            ) {

                return res.status(400).json({
                    error:
                        "You can only display 5 items at once."
                });

            }






            const {
                error: equipError
            } =
                await supabase
                    .from("user_shop_items")
                    .update({

                        equipped:
                            true

                    })
                    .eq(
                        "user_id",
                        userId
                    )
                    .eq(
                        "item_id",
                        numericItemId
                    );


            if (equipError) {

                console.error(
                    "EQUIP ITEM ERROR:",
                    equipError
                );

                return res.status(500).json({
                    error:
                        "Could not display item."
                });

            }


            return res.json({

                success:
                    true,

                type:
                    "item",

                displayed:
                    item

            });


        } catch (error) {

            console.error(
                "SHOP EQUIP ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to equip item."
            });

        }

    }
);




app.post(
    "/api/shop/undisplay",
    async (req, res) => {

        try {





            if (
                !req.session ||
                !req.session.user ||
                !req.session.user.id
            ) {

                return res.status(401).json({
                    error:
                        "You must be logged in."
                });

            }


            const userId =
                req.session.user.id;






            const itemId =
                req.body &&
                req.body.item_id;


            const numericItemId =
                Number(itemId);


            if (
                !Number.isInteger(
                    numericItemId
                ) ||
                numericItemId <= 0
            ) {

                return res.status(400).json({
                    error:
                        "A valid item ID is required."
                });

            }






            const {
                data: ownership,
                error: ownershipError
            } =
                await supabase
                    .from("user_shop_items")
                    .select(
                        "item_id, equipped"
                    )
                    .eq(
                        "user_id",
                        userId
                    )
                    .eq(
                        "item_id",
                        numericItemId
                    )
                    .maybeSingle();


            if (ownershipError) {

                console.error(
                    "UNDISPLAY OWNERSHIP ERROR:",
                    ownershipError
                );

                return res.status(500).json({
                    error:
                        ownershipError.message
                });

            }


            if (!ownership) {

                return res.status(403).json({
                    error:
                        "You do not own this item."
                });

            }






            const {
                error: updateError
            } =
                await supabase
                    .from("user_shop_items")
                    .update({

                        equipped:
                            false

                    })
                    .eq(
                        "user_id",
                        userId
                    )
                    .eq(
                        "item_id",
                        numericItemId
                    );


            if (updateError) {

                console.error(
                    "UNDISPLAY ITEM ERROR:",
                    updateError
                );

                return res.status(500).json({
                    error:
                        "Could not undisplay item."
                });

            }


            return res.json({

                success:
                    true

            });


        } catch (error) {

            console.error(
                "UNDISPLAY ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to undisplay item."
            });

        }

    }
);




app.post(
    "/api/shop/unequip",
    async (req, res) => {

        try {

            if (
                !req.session ||
                !req.session.user ||
                !req.session.user.id
            ) {

                return res.status(401).json({
                    error:
                        "You must be logged in."
                });

            }


            const userId =
                req.session.user.id;


            const itemId =
                req.body &&
                req.body.item_id;






            if (
                itemId === undefined ||
                itemId === null
            ) {

                const {
                    error
                } =
                    await supabase
                        .from("profiles")
                        .update({

                            equipped_title_id:
                                null

                        })
                        .eq(
                            "id",
                            userId
                        );


                if (error) {

                    return res.status(500).json({
                        error:
                            error.message
                    });

                }


                return res.json({
                    success:
                        true
                });

            }


            const numericItemId =
                Number(itemId);


            if (
                !Number.isInteger(
                    numericItemId
                )
            ) {

                return res.status(400).json({
                    error:
                        "Invalid item ID."
                });

            }






            const {
                data: item,
                error: itemError
            } =
                await supabase
                    .from("shop_items")
                    .select(
                        "id, item_type"
                    )
                    .eq(
                        "id",
                        numericItemId
                    )
                    .maybeSingle();


            if (itemError || !item) {

                return res.status(404).json({
                    error:
                        "Shop item not found."
                });

            }






            if (
                item.item_type !==
                "title"
            ) {

                const {
                    error
                } =
                    await supabase
                        .from("profiles")
                        .update({

                            displayed_item_id:
                                null

                        })
                        .eq(
                            "id",
                            userId
                        );


                if (error) {

                    return res.status(500).json({
                        error:
                            error.message
                    });

                }


                return res.json({
                    success:
                        true
                });

            }






            const {
                error
            } =
                await supabase
                    .from("profiles")
                    .update({

                        equipped_title_id:
                            null

                    })
                    .eq(
                        "id",
                        userId
                    );


            if (error) {

                return res.status(500).json({
                    error:
                        error.message
                });

            }


            return res.json({
                success:
                    true
            });


        } catch (error) {

            console.error(
                "UNEQUIP/HIDE ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to unequip or hide item."
            });

        }

    }
);



app.get("/api/shop/items", async (req, res) => {
    try {
        const {
            data: items,
            error
        } = await supabase
            .from("shop_items")
            .select("*")
            .order("id", {
                ascending: true
            });

        if (error) {
            console.error("SHOP ITEMS ERROR:", error);

            return res.status(500).json({
                error: "Failed to load shop items."
            });
        }

        const currentUserId =
            req.session?.user?.id || null;

        let ownedItemIds = new Set();

        if (currentUserId) {
            const {
                data: ownedItems,
                error: ownedError
            } = await supabase
                .from("user_shop_items")
                .select("item_id")
                .eq("user_id", currentUserId);

            if (ownedError) {
                console.error("SHOP OWNERSHIP ERROR:", ownedError);

                return res.status(500).json({
                    error: "Failed to load item ownership."
                });
            }

            ownedItemIds = new Set(
                (ownedItems || []).map(ownedItem => ownedItem.item_id)
            );
        }

        const formattedItems = (items || []).map(item => ({
            ...item,

            owned:
                currentUserId !== null &&
                ownedItemIds.has(item.id)
        }));

        return res.json({
            success: true,
            items: formattedItems
        });

    } catch (error) {
        console.error("SHOP ITEMS ERROR:", error);

        return res.status(500).json({
            error: "Server error."
        });
    }
});
app.post(
    "/api/shop/items",
    async (req, res) => {

        try {





            if (
                !req.session ||
                !req.session.user
            ) {

                return res.status(401).json({
                    error:
                        "You must be logged in."
                });

            }


            const userId =
                req.session.user.id;






            const name =
                String(
                    req.body.name ||
                    ""
                ).trim();

            const description =
                String(
                    req.body.description ||
                    ""
                ).trim();

            const itemType =
                String(
                    req.body.item_type ||
                    ""
                ).trim();

            const price =
                Number(
                    req.body.price
                );

            const icon =
                String(
                    req.body.icon ||
                    "🧌"
                ).trim();

            const file =
                req.body.file;






            if (!name) {

                return res.status(400).json({
                    error:
                        "Item name is required."
                });

            }


            if (name.length > 100) {

                return res.status(400).json({
                    error:
                        "Item name must be 100 characters or less."
                });

            }


            if (description.length > 1000) {

                return res.status(400).json({
                    error:
                        "Description must be 1000 characters or less."
                });

            }


            if (itemType !== "avatar") {

                return res.status(400).json({
                    error:
                        "Invalid item type."
                });

            }


            if (
                !Number.isInteger(price) ||
                price < 1 ||
                price > 1000000000
            ) {

                return res.status(400).json({
                    error:
                        "Invalid ShrekCoin price."
                });

            }


            if (!file) {

                return res.status(400).json({
                    error:
                        "No .sb file was provided."
                });

            }


            if (
                !file.name ||
                !file.name
                    .toLowerCase()
                    .endsWith(".sb")
            ) {

                return res.status(400).json({
                    error:
                        "Avatar files must use the .sb extension."
                });

            }


            if (!file.data) {

                return res.status(400).json({
                    error:
                        "Avatar file data is missing."
                });

            }






            let fileBuffer;

            try {

                fileBuffer =
                    Buffer.from(
                        file.data,
                        "base64"
                    );

            } catch (error) {

                return res.status(400).json({
                    error:
                        "Invalid .sb file."
                });

            }


            if (!fileBuffer.length) {

                return res.status(400).json({
                    error:
                        "The .sb file is empty."
                });

            }






            const maxSize =
                20 * 1024 * 1024;


            if (
                fileBuffer.length >
                maxSize
            ) {

                return res.status(400).json({
                    error:
                        "The .sb file must be under 20MB."
                });

            }






            const safeName =
                file.name
                    .replace(
                        /[^a-zA-Z0-9._-]/g,
                        "_"
                    );


            const storagePath =
                `shop/${userId}/${Date.now()}-${safeName}`;






            const {
                error: uploadError
            } =
                await supabase.storage
                    .from("avatars")
                    .upload(
                        storagePath,
                        fileBuffer,
                        {

                            contentType:
                                "application/octet-stream",

                            upsert:
                                false

                        }
                    );


            if (uploadError) {

                console.error(
                    "SHOP FILE UPLOAD ERROR:",
                    uploadError
                );

                return res.status(500).json({
                    error:
                        "Could not upload the .sb file."
                });

            }






            const {
                data: publicData
            } =
                supabase.storage
                    .from("avatars")
                    .getPublicUrl(
                        storagePath
                    );


            const fileUrl =
                publicData?.publicUrl;


            if (!fileUrl) {

                await supabase.storage
                    .from("avatars")
                    .remove([
                        storagePath
                    ]);

                return res.status(500).json({
                    error:
                        "Could not create the file URL."
                });

            }






            const {
                data: item,
                error: itemError
            } =
                await supabase
                    .from("shop_items")
                    .insert({

                        name:
                            name,

                        description:
                            description,

                        item_type:
                            "avatar",

                        item_value:
                            fileUrl,

                        price:
                            price,

                        icon:
                            icon

                    })
                    .select()
                    .single();






            if (itemError) {

                console.error(
                    "SHOP ITEM INSERT ERROR:",
                    itemError
                );


                await supabase.storage
                    .from("avatars")
                    .remove([
                        storagePath
                    ]);


                return res.status(500).json({
                    error:
                        itemError.message
                });

            }






            const {
                data: listing,
                error: listingError
            } =
                await supabase
                    .from("marketplace_listings")
                    .insert({

                        item_id:
                            item.id,

                        seller_id:
                            userId,

                        price:
                            price

                    })
                    .select()
                    .single();






            if (listingError) {

                console.error(
                    "MARKETPLACE LISTING ERROR:",
                    listingError
                );




                await supabase
                    .from("shop_items")
                    .delete()
                    .eq(
                        "id",
                        item.id
                    );




                await supabase.storage
                    .from("avatars")
                    .remove([
                        storagePath
                    ]);


                return res.status(500).json({
                    error:
                        "Avatar was created, but the marketplace listing could not be created."
                });

            }






            const {
                error: ownershipError
            } =
                await supabase
                    .from("user_shop_items")
                    .insert({

                        user_id:
                            userId,

                        item_id:
                            item.id

                    });






            if (ownershipError) {

                console.error(
                    "SVIS OWNERSHIP ERROR:",
                    ownershipError
                );




                await supabase
                    .from("marketplace_listings")
                    .delete()
                    .eq(
                        "id",
                        listing.id
                    );


                await supabase
                    .from("shop_items")
                    .delete()
                    .eq(
                        "id",
                        item.id
                    );


                await supabase.storage
                    .from("avatars")
                    .remove([
                        storagePath
                    ]);


                return res.status(500).json({
                    error:
                        "Avatar was created, but ownership could not be assigned."
                });

            }






            return res.status(201).json({

                success:
                    true,

                message:
                    "Avatar published successfully and listed for sale.",

                item:
                    item,

                listing:
                    listing

            });


        } catch (error) {

            console.error(
                "SHOP PUBLISH ERROR:",
                error
            );


            return res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);




app.get(
    "/api/shop/my-items",
    async (req, res) => {

        try {

            if (
                !req.session ||
                !req.session.user
            ) {

                return res.status(401).json({
                    error:
                        "You must be logged in."
                });

            }


            const userId =
                req.session.user.id;


            const {
                data,
                error
            } =
                await supabase
                    .from("user_items")
                    .select(`
                        id,
                        purchased_at,
                        item:shop_items (
                            id,
                            name,
                            description,
                            item_type,
                            price,
                            item_value
                        )
                    `)
                    .eq(
                        "user_id",
                        userId
                    )
                    .order(
                        "purchased_at",
                        {
                            ascending: false
                        }
                    );


            if (error) {

                console.error(
                    "MY ITEMS ERROR:",
                    error
                );

                return res.status(500).json({
                    error:
                        "Failed to load your items."
                });

            }


            return res.json({
                items:
                    data || []
            });


        } catch (error) {

            console.error(
                "MY ITEMS ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);








async function addReaction(
    req,
    res,
    type
) {

    try {





        if (!req.session.user) {

            return res.status(401).json({
                error:
                    "You must be logged in."
            });

        }


        const fromUserId =
            req.session.user.id;

        const toUserId =
            req.params.id;






        if (
            fromUserId ===
            toUserId
        ) {

            return res.status(400).json({
                error:
                    "You cannot react to yourself."
            });

        }






        const validTypes = [
            "gyatt",
            "cat",
            "ogred"
        ];


        if (
            !validTypes.includes(type)
        ) {

            return res.status(400).json({
                error:
                    "Invalid reaction type."
            });

        }






        const {
            data: targetUser,
            error: targetError
        } = await supabase
            .from("profiles")
            .select(
                "id, shrekcoins"
            )
            .eq(
                "id",
                toUserId
            )
            .maybeSingle();


        if (targetError) {

            console.error(
                "TARGET USER ERROR:",
                targetError
            );

            return res.status(500).json({
                error:
                    targetError.message
            });

        }


        if (!targetUser) {

            return res.status(404).json({
                error:
                    "User not found."
            });

        }






        const {
            error: insertError
        } = await supabase
            .from("reactions")
            .insert({

                from_user_id:
                    fromUserId,

                to_user_id:
                    toUserId,

                type

            });






        if (insertError) {

            if (
                insertError.code ===
                "23505"
            ) {

                const names = {

                    gyatt:
                        "Gyatt",

                    cat:
                        "Cat",

                    ogred:
                        "Ogred"

                };


                return res.status(400).json({

                    error:
                        `You already gave this person a ${names[type]}.`

                });

            }


            console.error(
                "REACTION INSERT ERROR:",
                insertError
            );


            return res.status(500).json({
                error:
                    insertError.message
            });

        }






        const {
            error: coinError
        } = await supabase.rpc(
            "increment_shrekcoins",
            {
                user_id:
                    toUserId,

                amount:
                    1
            }
        );


        if (coinError) {

            console.error(
                "SHREKCOIN REWARD ERROR:",
                coinError
            );







        }






        const {
            count,
            error: countError
        } = await supabase
            .from("reactions")
            .select(
                "*",
                {
                    count:
                        "exact",
                    head:
                        true
                }
            )
            .eq(
                "to_user_id",
                toUserId
            )
            .eq(
                "type",
                type
            );


        if (countError) {

            return res.status(500).json({
                error:
                    countError.message
            });

        }






        res.json({

            success:
                true,

            [type]:
                count || 0,

            shrekcoinEarned:
                1

        });


    } catch (error) {

        console.error(
            `${type.toUpperCase()} ERROR:`,
            error
        );


        res.status(500).json({
            error:
                "Server error."
        });

    }

}
app.post(
    "/api/users/:id/gyatt",
    async (req, res) => {

        await addReaction(
            req,
            res,
            "gyatt"
        );

    }
);

app.post(
    "/api/users/:id/cat",
    async (req, res) => {

        await addReaction(
            req,
            res,
            "cat"
        );

    }
);

app.post(
    "/api/users/:id/ogred",
    async (req, res) => {

        await addReaction(
            req,
            res,
            "ogred"
        );

    }
);





app.get(
    "/api/chat/rooms",
    async (req, res) => {

        try {

            if (!req.session.user) {
                return res.status(401).json({
                    error:
                        "You must be logged in."
                });
            }

            const userId =
                req.session.user.id;

            const {
                data: rooms,
                error: roomError
            } = await supabase
                .from("chat_rooms")
                .select(`
                    id,
                    name,
                    created_by,
                    is_private,
                    created_at
                `)
                .order(
                    "created_at",
                    {
                        ascending: true
                    }
                );

            if (roomError) {
                return res.status(500).json({
                    error:
                        roomError.message
                });
            }

            const {
                data: memberships,
                error: memberError
            } = await supabase
                .from("chat_members")
                .select(
                    "room_id"
                )
                .eq(
                    "user_id",
                    userId
                );

            if (memberError) {
                return res.status(500).json({
                    error:
                        memberError.message
                });
            }

            const memberRooms =
                new Set(
                    (memberships || [])
                        .map(
                            member =>
                                member.room_id
                        )
                );

            const visibleRooms =
                (rooms || [])
                    .filter(room => {

                        if (
                            !room.is_private
                        ) {
                            return true;
                        }

                        return (
                            room.created_by ===
                            userId ||
                            memberRooms.has(
                                room.id
                            )
                        );

                    });

            res.json(
                visibleRooms
            );

        } catch (error) {

            console.error(
                "GET ROOMS ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);





app.post(
    "/api/chat/rooms",
    async (req, res) => {

        try {

            if (!req.session.user) {
                return res.status(401).json({
                    error:
                        "You must be logged in."
                });
            }

            const name =
                String(
                    req.body.name ||
                    ""
                ).trim();

            const isPrivate =
                req.body.is_private ===
                true;

            if (!name) {
                return res.status(400).json({
                    error:
                        "Room name cannot be empty."
                });
            }

            if (name.length > 50) {
                return res.status(400).json({
                    error:
                        "Room name is too long."
                });
            }

            const {
                data: room,
                error
            } = await supabase
                .from("chat_rooms")
                .insert({
                    name,

                    created_by:
                        req.session.user.id,

                    is_private:
                        isPrivate
                })
                .select()
                .single();

            if (error) {
                return res.status(500).json({
                    error:
                        error.message
                });
            }

            const {
                error: memberError
            } = await supabase
                .from("chat_members")
                .insert({
                    room_id:
                        room.id,

                    user_id:
                        req.session.user.id
                });

            if (memberError) {

                await supabase
                    .from("chat_rooms")
                    .delete()
                    .eq(
                        "id",
                        room.id
                    );

                return res.status(500).json({
                    error:
                        memberError.message
                });
            }

            res.status(201).json(
                room
            );

        } catch (error) {

            console.error(
                "CREATE ROOM ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);





app.post(
    "/api/chat/rooms/:roomId/join",
    async (req, res) => {

        try {

            if (!req.session.user) {
                return res.status(401).json({
                    error:
                        "You must be logged in."
                });
            }

            const roomId =
                req.params.roomId;

            const userId =
                req.session.user.id;

            const {
                data: room,
                error
            } = await supabase
                .from("chat_rooms")
                .select(`
                    id,
                    created_by,
                    is_private
                `)
                .eq(
                    "id",
                    roomId
                )
                .maybeSingle();

            if (error) {
                return res.status(500).json({
                    error:
                        error.message
                });
            }

            if (!room) {
                return res.status(404).json({
                    error:
                        "Room not found."
                });
            }

            if (room.is_private) {

                const {
                    data: membership
                } = await supabase
                    .from("chat_members")
                    .select(
                        "room_id"
                    )
                    .eq(
                        "room_id",
                        roomId
                    )
                    .eq(
                        "user_id",
                        userId
                    )
                    .maybeSingle();

                if (
                    !membership &&
                    room.created_by !==
                    userId
                ) {

                    return res.status(403).json({
                        error:
                            "🔒 You need an invitation to enter this room."
                    });

                }

            }

            const {
                error: joinError
            } = await supabase
                .from("chat_members")
                .upsert(
                    {
                        room_id:
                            roomId,

                        user_id:
                            userId
                    },
                    {
                        onConflict:
                            "room_id,user_id"
                    }
                );

            if (joinError) {
                return res.status(500).json({
                    error:
                        joinError.message
                });
            }

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "JOIN ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);





app.post(
    "/api/chat/rooms/:roomId/leave",
    async (req, res) => {

        try {

            if (!req.session.user) {
                return res.status(401).json({
                    error:
                        "You must be logged in."
                });
            }

            const {
                error
            } = await supabase
                .from("chat_members")
                .delete()
                .eq(
                    "room_id",
                    req.params.roomId
                )
                .eq(
                    "user_id",
                    req.session.user.id
                );

            if (error) {
                return res.status(500).json({
                    error:
                        error.message
                });
            }

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "LEAVE ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);





app.delete(
    "/api/chat/rooms/:roomId",
    async (req, res) => {

        try {

            if (!req.session.user) {
                return res.status(401).json({
                    error:
                        "You must be logged in."
                });
            }

            const {
                data: room
            } = await supabase
                .from("chat_rooms")
                .select(
                    "created_by"
                )
                .eq(
                    "id",
                    req.params.roomId
                )
                .maybeSingle();

            if (!room) {
                return res.status(404).json({
                    error:
                        "Room not found."
                });
            }

            if (
                room.created_by !==
                req.session.user.id
            ) {
                return res.status(403).json({
                    error:
                        "Only the room creator can delete it."
                });
            }

            const {
                error
            } = await supabase
                .from("chat_rooms")
                .delete()
                .eq(
                    "id",
                    req.params.roomId
                );

            if (error) {
                return res.status(500).json({
                    error:
                        error.message
                });
            }

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "DELETE ROOM ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);





app.get(
    "/api/chat/rooms/:roomId/invite-users",
    async (req, res) => {

        try {

            if (!req.session.user) {
                return res.status(401).json({
                    error:
                        "You must be logged in."
                });
            }

            const roomId =
                req.params.roomId;

            const {
                data: room
            } = await supabase
                .from("chat_rooms")
                .select(`
                    created_by,
                    is_private
                `)
                .eq(
                    "id",
                    roomId
                )
                .maybeSingle();

            if (!room) {
                return res.status(404).json({
                    error:
                        "Room not found."
                });
            }

            if (
                room.created_by !==
                req.session.user.id
            ) {
                return res.status(403).json({
                    error:
                        "Only the creator can invite people."
                });
            }

            const {
                data: members
            } = await supabase
                .from("chat_members")
                .select(
                    "user_id"
                )
                .eq(
                    "room_id",
                    roomId
                );

            const memberIds =
                new Set(
                    (members || [])
                        .map(
                            member =>
                                member.user_id
                        )
                );

            const {
                data: users,
                error
            } = await supabase
                .from("profiles")
                .select(`
                    id,
                    username,
                    display_name,
                    avatar
                `)
                .order(
                    "username",
                    {
                        ascending: true
                    }
                );

            if (error) {
                return res.status(500).json({
                    error:
                        error.message
                });
            }

            const result =
                (users || [])
                    .filter(
                        user =>
                            !memberIds.has(
                                user.id
                            )
                    )
                    .map(
                        user => ({
                            ...user,
                            avatar:
                                getAvatar(
                                    user.avatar
                                )
                        })
                    );

            res.json(result);

        } catch (error) {

            console.error(
                "INVITE USERS ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);





app.post(
    "/api/chat/rooms/:roomId/invite",
    async (req, res) => {

        try {

            if (!req.session.user) {
                return res.status(401).json({
                    error:
                        "You must be logged in."
                });
            }

            const roomId =
                req.params.roomId;

            const invitedUserId =
                req.body.user_id;

            if (!invitedUserId) {
                return res.status(400).json({
                    error:
                        "No user selected."
                });
            }

            const {
                data: room
            } = await supabase
                .from("chat_rooms")
                .select(`
                    created_by,
                    is_private
                `)
                .eq(
                    "id",
                    roomId
                )
                .maybeSingle();

            if (!room) {
                return res.status(404).json({
                    error:
                        "Room not found."
                });
            }

            if (
                room.created_by !==
                req.session.user.id
            ) {
                return res.status(403).json({
                    error:
                        "Only the creator can invite people."
                });
            }

            const {
                data: user
            } = await supabase
                .from("profiles")
                .select("id")
                .eq(
                    "id",
                    invitedUserId
                )
                .maybeSingle();

            if (!user) {
                return res.status(404).json({
                    error:
                        "User not found."
                });
            }

            const {
                error
            } = await supabase
                .from("chat_members")
                .upsert(
                    {
                        room_id:
                            roomId,

                        user_id:
                            invitedUserId
                    },
                    {
                        onConflict:
                            "room_id,user_id"
                    }
                );

            if (error) {
                return res.status(500).json({
                    error:
                        error.message
                });
            }

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "INVITE ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);





app.get(
    "/api/chat/rooms/:roomId/messages",
    async (req, res) => {

        try {

            if (!req.session.user) {
                return res.status(401).json({
                    error:
                        "You must be logged in."
                });
            }

            const roomId =
                req.params.roomId;

            const userId =
                req.session.user.id;

            const {
                data: membership
            } = await supabase
                .from("chat_members")
                .select(
                    "room_id"
                )
                .eq(
                    "room_id",
                    roomId
                )
                .eq(
                    "user_id",
                    userId
                )
                .maybeSingle();

            if (!membership) {
                return res.status(403).json({
                    error:
                        "You are not a member of this room."
                });
            }

            const {
                data: messages,
                error
            } = await supabase
                .from("chat_messages")
                .select(`
                    id,
                    room_id,
                    user_id,
                    content,
                    created_at
                `)
                .eq(
                    "room_id",
                    roomId
                )
                .order(
                    "created_at",
                    {
                        ascending: true
                    }
                )
                .limit(200);

            if (error) {
                return res.status(500).json({
                    error:
                        error.message
                });
            }

            const result = [];

            for (
                const message of
                messages || []
            ) {

                const {
                    data: profile
                } = await supabase
                    .from("profiles")
                    .select(`
                        id,
                        username,
                        display_name,
                        avatar
                    `)
                    .eq(
                        "id",
                        message.user_id
                    )
                    .maybeSingle();

                let reactions = {
                    gyatt: 0,
                    cat: 0,
                    ogred: 0
                };

                try {

                    reactions =
                        await getReactionCounts(
                            message.user_id
                        );

                } catch (reactionError) {

                    console.error(
                        "MESSAGE REACTION ERROR:",
                        reactionError
                    );

                }

                result.push({

                    ...message,

                    username:
                        profile?.username ||
                        "User",

                    display_name:
                        profile?.display_name ||
                        profile?.username ||
                        "User",

                    avatar:
                        getAvatar(
                            profile?.avatar
                        ),

                    cat:
                        reactions.cat,

                    gyatt:
                        reactions.gyatt,

                    ogred:
                        reactions.ogred

                });

            }

            res.json(result);

        } catch (error) {

            console.error(
                "MESSAGES ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);





app.post(
    "/api/chat/rooms/:roomId/messages",
    async (req, res) => {

        try {

            if (!req.session.user) {
                return res.status(401).json({
                    error:
                        "You must be logged in."
                });
            }

            const roomId =
                req.params.roomId;

            const userId =
                req.session.user.id;

            const {
                data: membership
            } = await supabase
                .from("chat_members")
                .select(
                    "room_id"
                )
                .eq(
                    "room_id",
                    roomId
                )
                .eq(
                    "user_id",
                    userId
                )
                .maybeSingle();

            if (!membership) {
                return res.status(403).json({
                    error:
                        "You are not a member of this room."
                });
            }

            const content =
                String(
                    req.body.content ||
                    ""
                ).trim();

            if (!content) {
                return res.status(400).json({
                    error:
                        "Message cannot be empty."
                });
            }

            if (content.length > 1000) {
                return res.status(400).json({
                    error:
                        "Message is too long."
                });
            }

            const {
                data,
                error
            } = await supabase
                .from("chat_messages")
                .insert({
                    room_id:
                        roomId,

                    user_id:
                        userId,

                    content
                })
                .select()
                .single();

            if (error) {
                return res.status(500).json({
                    error:
                        error.message
                });
            }

            res.status(201).json(data);

        } catch (error) {

            console.error(
                "SEND MESSAGE ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);





app.post(
    "/api/heartbeat",
    async (req, res) => {

        try {

            if (!req.session.user) {
                return res.status(401).json({
                    error:
                        "You must be logged in."
                });
            }

            const {
                error
            } = await supabase
                .from("profiles")
                .update({
                    last_seen:
                        new Date()
                            .toISOString()
                })
                .eq(
                    "id",
                    req.session.user.id
                );

            if (error) {
                return res.status(500).json({
                    error:
                        error.message
                });
            }

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "HEARTBEAT ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);





const ROLE_LEVELS = {
    peasant: 0,
    junior_moderator: 1,
    senior_moderator: 2,
    administrator: 3,
    owner: 4
};

const ADMIN_ROLES = [
    "owner",
    "administrator",
    "senior_moderator",
    "junior_moderator"
];

const VALID_ROLES = [
    "owner",
    "administrator",
    "senior_moderator",
    "junior_moderator",
    "peasant"
];






function requireLogin(req, res, next) {

    if (!req.session?.user?.id) {

        return res.status(401).json({
            error: "Not logged in."
        });

    }

    next();

}






async function getAdminActor(req) {

    const userId =
        req.session?.user?.id;

    if (!userId) {

        return {
            actor: null,
            error: "Not logged in."
        };

    }


    const {
        data: actor,
        error
    } = await supabase
        .from("profiles")
        .select(
            "id, username, display_name, role, banned, kicked"
        )
        .eq(
            "id",
            userId
        )
        .maybeSingle();


    if (error) {

        console.error(
            "GET ADMIN ACTOR ERROR:",
            error
        );

        return {
            actor: null,
            error: error.message
        };

    }


    if (!actor) {

        return {
            actor: null,
            error: "Profile not found."
        };

    }


    return {
        actor,
        error: null
    };

}






async function requireAdmin(req, res) {

    const {
        actor,
        error
    } = await getAdminActor(req);


    if (!actor) {

        res.status(403).json({
            error:
                error ||
                "Admin access required."
        });

        return null;

    }


    if (actor.banned) {

        res.status(403).json({
            error:
                "Your account is banned."
        });

        return null;

    }


    if (!ADMIN_ROLES.includes(actor.role)) {

        res.status(403).json({
            error:
                "Admin access required."
        });

        return null;

    }


    return actor;

}






function canManageRole(
    actorRole,
    targetRole
) {

    return (
        ROLE_LEVELS[actorRole] >
        ROLE_LEVELS[targetRole]
    );

}






app.get(
    "/api/admin/auth",
    requireLogin,
    async (req, res) => {

        try {

            const actor =
                await requireAdmin(
                    req,
                    res
                );


            if (!actor) {
                return;
            }


            res.json({
                success: true,
                authorized: true,
                user: actor
            });


        } catch (error) {

            console.error(
                "ADMIN AUTH ERROR:",
                error
            );


            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);






app.get(
    "/api/admin/users",
    requireLogin,
    async (req, res) => {

        try {

            const actor =
                await requireAdmin(
                    req,
                    res
                );


            if (!actor) {
                return;
            }


            const {
                data: users,
                error
            } = await supabase
                .from("profiles")
                .select(
                    "id, username, display_name, avatar, role, banned, kicked, shrekcoins"
                )
                .order(
                    "username",
                    {
                        ascending: true
                    }
                );


            if (error) {

                return res.status(500).json({
                    error:
                        error.message
                });

            }


            res.json(
                users || []
            );


        } catch (error) {

            console.error(
                "ADMIN USERS ERROR:",
                error
            );


            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);






app.put(
    "/api/admin/users/:id/role",
    requireLogin,
    async (req, res) => {

        try {

            const actor =
                await requireAdmin(
                    req,
                    res
                );


            if (!actor) {
                return;
            }


            const targetId =
                req.params.id;


            const newRole =
                String(
                    req.body?.role || ""
                )
                .trim()
                .toLowerCase();


            if (
                !VALID_ROLES.includes(
                    newRole
                )
            ) {

                return res.status(400).json({
                    error:
                        "Invalid role."
                });

            }


            const {
                data: target,
                error
            } = await supabase
                .from("profiles")
                .select(
                    "id, username, role"
                )
                .eq(
                    "id",
                    targetId
                )
                .maybeSingle();


            if (error) {

                return res.status(500).json({
                    error:
                        error.message
                });

            }


            if (!target) {

                return res.status(404).json({
                    error:
                        "User not found."
                });

            }


            if (
                target.id === actor.id
            ) {

                return res.status(403).json({
                    error:
                        "You cannot change your own role."
                });

            }


            if (
                !canManageRole(
                    actor.role,
                    target.role
                )
            ) {

                return res.status(403).json({
                    error:
                        "You cannot manage this user."
                });

            }




            if (
                newRole === "owner" &&
                actor.role !== "owner"
            ) {

                return res.status(403).json({
                    error:
                        "Only the owner can assign owner."
                });

            }





            if (
                actor.role !== "owner" &&
                ROLE_LEVELS[newRole] >=
                ROLE_LEVELS[actor.role]
            ) {

                return res.status(403).json({
                    error:
                        "You cannot assign a role equal to or above your own."
                });

            }


            const {
                error: updateError
            } = await supabase
                .from("profiles")
                .update({
                    role:
                        newRole
                })
                .eq(
                    "id",
                    target.id
                );


            if (updateError) {

                console.error(
                    "ROLE UPDATE ERROR:",
                    updateError
                );

                return res.status(500).json({
                    error:
                        updateError.message
                });

            }


            console.log(
                `ADMIN: ${actor.username} changed ${target.username} to ${newRole}`
            );


            res.json({
                success: true,
                username:
                    target.username,
                role:
                    newRole
            });


        } catch (error) {

            console.error(
                "ROLE CHANGE ERROR:",
                error
            );


            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);






app.post(
    "/api/admin/users/:id/ban",
    requireLogin,
    async (req, res) => {

        try {

            const actor =
                await requireAdmin(
                    req,
                    res
                );


            if (!actor) {
                return;
            }


            const {
                data: target,
                error
            } = await supabase
                .from("profiles")
                .select(
                    "id, username, role"
                )
                .eq(
                    "id",
                    req.params.id
                )
                .maybeSingle();


            if (error) {

                return res.status(500).json({
                    error:
                        error.message
                });

            }


            if (!target) {

                return res.status(404).json({
                    error:
                        "User not found."
                });

            }


            if (
                target.id === actor.id
            ) {

                return res.status(403).json({
                    error:
                        "You cannot ban yourself."
                });

            }


            if (
                !canManageRole(
                    actor.role,
                    target.role
                )
            ) {

                return res.status(403).json({
                    error:
                        "You cannot ban this user."
                });

            }


            const {
                error: updateError
            } = await supabase
                .from("profiles")
                .update({
                    banned: true,
                    kicked: false
                })
                .eq(
                    "id",
                    target.id
                );


            if (updateError) {

                console.error(
                    "BAN ERROR:",
                    updateError
                );

                return res.status(500).json({
                    error:
                        updateError.message
                });

            }


            console.log(
                `ADMIN: ${actor.username} banned ${target.username}`
            );


            res.json({
                success: true,
                banned: true
            });


        } catch (error) {

            console.error(
                "BAN ROUTE ERROR:",
                error
            );


            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);






app.post(
    "/api/admin/users/:id/unban",
    requireLogin,
    async (req, res) => {

        try {





            const canUnban = [
                "administrator",
                "owner"
            ];






            const actor =
                await requireAdmin(
                    req,
                    res
                );


            if (!actor) {
                return;
            }






            if (
                !canUnban.includes(
                    actor.role
                )
            ) {

                return res.status(403).json({
                    error:
                        "You must be an administrator or higher to ban/unban people."
                });

            }






            const {
                data: target,
                error
            } = await supabase
                .from("profiles")
                .select(
                    "id, username, role, banned"
                )
                .eq(
                    "id",
                    req.params.id
                )
                .maybeSingle();


            if (error) {

                console.error(
                    "UNBAN TARGET ERROR:",
                    error
                );

                return res.status(500).json({
                    error:
                        error.message
                });

            }






            if (!target) {

                return res.status(404).json({
                    error:
                        "User not found."
                });

            }






            if (
                target.id === actor.id
            ) {

                return res.status(403).json({
                    error:
                        "You cannot unban yourself."
                });

            }






            if (
                !canManageRole(
                    actor.role,
                    target.role
                )
            ) {

                return res.status(403).json({
                    error:
                        "You cannot unban this user."
                });

            }






            const {
                error: updateError
            } = await supabase
                .from("profiles")
                .update({
                    banned: false
                })
                .eq(
                    "id",
                    target.id
                );


            if (updateError) {

                console.error(
                    "UNBAN UPDATE ERROR:",
                    updateError
                );

                return res.status(500).json({
                    error:
                        updateError.message
                });

            }






            console.log(
                `🔓 ${actor.username} unbanned ${target.username}`
            );


            return res.json({

                success:
                    true,

                banned:
                    false

            });

        } catch (error) {

            console.error(
                "🔥 UNBAN ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    error.message ||
                    "Server error."
            });

        }

    }
);






app.post(
    "/api/admin/users/:id/kick",
    requireLogin,
    async (req, res) => {

        try {

            const actor =
                await requireAdmin(
                    req,
                    res
                );


            if (!actor) {
                return;
            }


            const {
                data: target,
                error
            } = await supabase
                .from("profiles")
                .select(
                    "id, username, role"
                )
                .eq(
                    "id",
                    req.params.id
                )
                .maybeSingle();


            if (error) {

                return res.status(500).json({
                    error:
                        error.message
                });

            }


            if (!target) {

                return res.status(404).json({
                    error:
                        "User not found."
                });

            }


            if (
                target.id === actor.id
            ) {

                return res.status(403).json({
                    error:
                        "You cannot kick yourself."
                });

            }


            if (
                !canManageRole(
                    actor.role,
                    target.role
                )
            ) {

                return res.status(403).json({
                    error:
                        "You cannot kick this user."
                });

            }


            const {
                error: updateError
            } = await supabase
                .from("profiles")
                .update({
                    kicked: true,
                    banned: false
                })
                .eq(
                    "id",
                    target.id
                );


            if (updateError) {

                console.error(
                    "KICK ERROR:",
                    updateError
                );

                return res.status(500).json({
                    error:
                        updateError.message
                });

            }


            console.log(
                `ADMIN: ${actor.username} kicked ${target.username}`
            );


            res.json({
                success: true,
                kicked: true
            });


        } catch (error) {

            console.error(
                "KICK ROUTE ERROR:",
                error
            );


            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);












app.post(
    "/api/admin/users/:id/clear-kick",
    requireLogin,
    async (req, res) => {

        try {

            const actor =
                await requireAdmin(
                    req,
                    res
                );


            if (!actor) {
                return;
            }


            const {
                data: target,
                error
            } = await supabase
                .from("profiles")
                .select(
                    "id, username, role"
                )
                .eq(
                    "id",
                    req.params.id
                )
                .maybeSingle();


            if (error) {

                return res.status(500).json({
                    error:
                        error.message
                });

            }


            if (!target) {

                return res.status(404).json({
                    error:
                        "User not found."
                });

            }


            if (
                target.id === actor.id
            ) {

                return res.status(403).json({
                    error:
                        "You cannot do this to yourself."
                });

            }


            if (
                !canManageRole(
                    actor.role,
                    target.role
                )
            ) {

                return res.status(403).json({
                    error:
                        "You cannot manage this user."
                });

            }


            const {
                error: updateError
            } = await supabase
                .from("profiles")
                .update({
                    kicked: false
                })
                .eq(
                    "id",
                    target.id
                );


            if (updateError) {

                return res.status(500).json({
                    error:
                        updateError.message
                });

            }


            res.json({
                success: true
            });


        } catch (error) {

            console.error(
                "CLEAR KICK ERROR:",
                error
            );


            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);












app.get(
    "/api/moderation/status",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                req.session.user.id;


            const {
                data: profile,
                error
            } = await supabase
                .from("profiles")
                .select(
                    "banned, kicked"
                )
                .eq(
                    "id",
                    userId
                )
                .maybeSingle();


            if (error) {

                return res.status(500).json({
                    error:
                        error.message
                });

            }


            if (!profile) {

                return res.status(404).json({
                    error:
                        "Profile not found."
                });

            }


            res.json({
                banned:
                    profile.banned === true,

                kicked:
                    profile.kicked === true
            });


        } catch (error) {

            console.error(
                "MODERATION STATUS ERROR:",
                error
            );


            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);

app.post("/api/admin/reset-password", async (req, res) => {
    try {

        if (!req.session || !req.session.user) {
            return res.status(401).json({
                error: "Not logged in"
            });
        }


        const { data: admin, error: adminError } = await supabase
            .from("profiles")
            .select("id, role")
            .eq("id", req.session.user.id)
            .single();

        if (adminError || !admin) {
            return res.status(403).json({
                error: "Unable to verify administrator"
            });
        }


        if (admin.role !== "administrator" && admin.role !== "owner") {
            return res.status(403).json({
                error: "You do not have permission to reset passwords"
            });
        }

        const { userId, newPassword } = req.body;

        if (!userId || !newPassword) {
            return res.status(400).json({
                error: "User ID and new password are required"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                error: "Password must be at least 6 characters"
            });
        }


        const { data, error } =
            await supabase.auth.admin.updateUserById(
                userId,
                {
                    password: newPassword
                }
            );

        if (error) {
            console.error("Password reset error:", error);

            return res.status(500).json({
                error: error.message
            });
        }

        return res.json({
            success: true,
            message: "Password reset successfully"
        });

    } catch (error) {

        console.error("Admin password reset error:", error);

        return res.status(500).json({
            error: "Internal server error"
        });
    }
});







app.post(
    "/api/admin/users/:id/shrekcoins",
    requireLogin,
    async (req, res) => {

        try {

            const actor =
                await requireAdmin(
                    req,
                    res
                );

            if (!actor) {
                return;
            }


            const targetId =
                req.params.id;


            const action =
                String(
                    req.body?.action || ""
                )
                .trim()
                .toLowerCase();


            const amount =
                Number(
                    req.body?.amount
                );


            if (
                action !== "give" &&
                action !== "take"
            ) {

                return res.status(400).json({
                    error:
                        "Action must be give or take."
                });

            }


            if (
                !Number.isInteger(amount) ||
                amount <= 0
            ) {

                return res.status(400).json({
                    error:
                        "Amount must be a positive whole number."
                });

            }


            if (
                amount > 1000000000
            ) {

                return res.status(400).json({
                    error:
                        "Amount is too large."
                });

            }




            const {
                data: target,
                error: targetError
            } = await supabase
                .from("profiles")
                .select(
                    "id, username, display_name, role, shrekcoins"
                )
                .eq(
                    "id",
                    targetId
                )
                .maybeSingle();


            if (targetError) {

                console.error(
                    "SHREKCOIN TARGET ERROR:",
                    targetError
                );

                return res.status(500).json({
                    error:
                        targetError.message
                });

            }


            if (!target) {

                return res.status(404).json({
                    error:
                        "User not found."
                });

            }





            if (
                !canManageRole(
                    actor.role,
                    target.role
                )
            ) {

                return res.status(403).json({
                    error:
                        "You cannot modify this user's ShrekCoins."
                });

            }


            const currentCoins =
                Number(
                    target.shrekcoins || 0
                );


            let newCoins;


            if (
                action === "give"
            ) {

                newCoins =
                    currentCoins +
                    amount;

            } else {

                newCoins =
                    currentCoins -
                    amount;

                if (
                    newCoins < 0
                ) {
                    newCoins = 0;
                }

            }


            const {
                error: updateError
            } = await supabase
                .from("profiles")
                .update({
                    shrekcoins:
                        newCoins
                })
                .eq(
                    "id",
                    target.id
                );


            if (updateError) {

                console.error(
                    "SHREKCOIN UPDATE ERROR:",
                    updateError
                );

                return res.status(500).json({
                    error:
                        updateError.message
                });

            }


            console.log(
                `🪙 ${actor.username} ${action} ${amount} ShrekCoins ${action === "give" ? "to" : "from"} ${target.username}`
            );


            return res.json({

                success:
                    true,

                userId:
                    target.id,

                username:
                    target.username,

                action,

                amount,

                shrekcoins:
                    newCoins

            });


        } catch (error) {

            console.error(
                "SHREKCOIN ROUTE ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);





app.post(
    "/api/admin/shrekcoins",
    requireLogin,
    async (req, res) => {

        try {





            const actor =
                await requireAdmin(
                    req,
                    res
                );

            if (!actor) {
                return;
            }






            const userId =
                String(
                    req.body?.userId ||
                    ""
                ).trim();

            const action =
                String(
                    req.body?.action ||
                    ""
                ).trim().toLowerCase();

            const amount =
                Number(
                    req.body?.amount
                );






            if (!userId) {

                return res.status(400).json({
                    error:
                        "User ID is required."
                });

            }






            if (
                action !== "give" &&
                action !== "take"
            ) {

                return res.status(400).json({
                    error:
                        "Action must be give or take."
                });

            }






            if (
                !Number.isInteger(amount) ||
                amount <= 0
            ) {

                return res.status(400).json({
                    error:
                        "Amount must be a positive whole number."
                });

            }






            const {
                data: target,
                error: targetError
            } = await supabase
                .from("profiles")
                .select(
                    "id, username, display_name, shrekcoins, role"
                )
                .eq(
                    "id",
                    userId
                )
                .maybeSingle();


            if (targetError) {

                console.error(
                    "SHREKCOIN TARGET ERROR:",
                    targetError
                );

                return res.status(500).json({
                    error:
                        targetError.message
                });

            }


            if (!target) {

                return res.status(404).json({
                    error:
                        "User not found."
                });

            }






            const currentBalance =
                Number(
                    target.shrekcoins || 0
                );


            let newBalance;


            if (action === "give") {

                newBalance =
                    currentBalance +
                    amount;

            } else {

                newBalance =
                    currentBalance -
                    amount;

                if (newBalance < 0) {

                    newBalance = 0;

                }

            }






            const {
                data: updated,
                error: updateError
            } = await supabase
                .from("profiles")
                .update({

                    shrekcoins:
                        newBalance

                })
                .eq(
                    "id",
                    userId
                )
                .select(
                    "id, username, display_name, shrekcoins"
                )
                .single();


            if (updateError) {

                console.error(
                    "SHREKCOIN UPDATE ERROR:",
                    updateError
                );

                return res.status(500).json({
                    error:
                        updateError.message
                });

            }






            console.log(
                `🪙 ADMIN: ${actor.username} ${action} ${amount} ShrekCoins ${target.username}. New balance: ${newBalance}`
            );






            return res.json({

                success:
                    true,

                action:
                    action,

                amount:
                    amount,

                userId:
                    target.id,

                username:
                    target.username,

                shrekcoins:
                    updated.shrekcoins

            });


        } catch (error) {

            console.error(
                "ADMIN SHREKCOIN ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);

app.get("/api/shop/inventory", async (req, res) => {

    try {





        if (
            !req.session ||
            !req.session.user ||
            !req.session.user.id
        ) {

            return res.status(401).json({
                error: "You must be logged in."
            });

        }

        const userId = req.session.user.id;






        const {
            data: ownedItems,
            error: ownedError
        } = await supabase
            .from("user_shop_items")
            .select(`
                purchased_at,
                equipped,
                shop_items (
                    id,
                    name,
                    description,
                    item_type,
                    item_value,
                    price,
                    icon
                )
            `)
            .eq("user_id", userId);


        if (ownedError) {

            console.error(
                "INVENTORY OWNED ITEMS ERROR:",
                ownedError
            );

            return res.status(500).json({
                error: ownedError.message
            });

        }






        const {
            data: profile,
            error: profileError
        } = await supabase
            .from("profiles")
            .select(`
                equipped_title_id,
                displayed_item_id
            `)
            .eq("id", userId)
            .maybeSingle();


        if (profileError) {

            console.error(
                "INVENTORY PROFILE ERROR:",
                profileError
            );

            return res.status(500).json({
                error: profileError.message
            });

        }






        let equippedTitle = null;

        if (
            profile &&
            profile.equipped_title_id
        ) {

            const {
                data: title,
                error: titleError
            } = await supabase
                .from("shop_items")
                .select(`
                    id,
                    name,
                    description,
                    item_type,
                    item_value,
                    price,
                    icon
                `)
                .eq(
                    "id",
                    profile.equipped_title_id
                )
                .eq(
                    "item_type",
                    "title"
                )
                .maybeSingle();


            if (titleError) {

                console.error(
                    "EQUIPPED TITLE ERROR:",
                    titleError
                );

            } else {

                equippedTitle =
                    title || null;

            }

        }






        let displayedItem = null;

        if (
            profile &&
            profile.displayed_item_id
        ) {

            const {
                data: item,
                error: itemError
            } = await supabase
                .from("shop_items")
                .select(`
                    id,
                    name,
                    description,
                    item_type,
                    item_value,
                    price,
                    icon
                `)
                .eq(
                    "id",
                    profile.displayed_item_id
                )
                .maybeSingle();


            if (itemError) {

                console.error(
                    "DISPLAYED ITEM ERROR:",
                    itemError
                );

            } else {

                displayedItem =
                    item || null;

            }

        }






        const items =
            (ownedItems || [])
                .map(row => {

                    if (!row.shop_items) {
                        return null;
                    }

                    return {

                        id:
                            row.shop_items.id,

                        name:
                            row.shop_items.name,

                        description:
                            row.shop_items.description,

                        icon:
                            row.shop_items.icon,

                        price:
                            row.shop_items.price,

                        item_type:
                            row.shop_items.item_type,

                        item_value:
                            row.shop_items.item_value,

                        purchased_at:
                            row.purchased_at,

                        equipped:
                            row.equipped === true

                    };

                })
                .filter(Boolean);






        const displayedItems =
            items.filter(item => {

                return (
                    item.item_type !== "title" &&
                    item.equipped === true
                );

            });






        return res.json({

            success: true,

            items,

            equipped:
                equippedTitle,

            displayedItems,

            displayedCount:
                displayedItems.length,

            maxDisplayed:
                5

        });


    } catch (error) {

        console.error(
            "SHOP INVENTORY ERROR:",
            error
        );

        return res.status(500).json({
            error:
                "Failed to load inventory."
        });

    }

});
app.get(
    "/api/shop/download/:id",
    async (req, res) => {

        try {





            if (
                !req.session ||
                !req.session.user ||
                !req.session.user.id
            ) {

                return res.status(401).json({
                    error:
                        "You must be logged in."
                });

            }


            const userId =
                req.session.user.id;






            const itemId =
                Number(req.params.id);


            if (
                !Number.isInteger(itemId) ||
                itemId <= 0
            ) {

                return res.status(400).json({
                    error:
                        "Invalid item ID."
                });

            }






            const {
                data: ownership,
                error: ownershipError
            } =
                await supabase
                    .from("user_shop_items")
                    .select("item_id")
                    .eq(
                        "user_id",
                        userId
                    )
                    .eq(
                        "item_id",
                        itemId
                    )
                    .maybeSingle();


            if (ownershipError) {

                console.error(
                    "DOWNLOAD OWNERSHIP ERROR:",
                    ownershipError
                );

                return res.status(500).json({
                    error:
                        "Could not verify ownership."
                });

            }


            if (!ownership) {

                return res.status(403).json({
                    error:
                        "You do not own this avatar."
                });

            }






            const {
                data: item,
                error: itemError
            } =
                await supabase
                    .from("shop_items")
                    .select(`
                        id,
                        name,
                        item_type,
                        item_value
                    `)
                    .eq(
                        "id",
                        itemId
                    )
                    .maybeSingle();


            if (itemError) {

                console.error(
                    "DOWNLOAD ITEM ERROR:",
                    itemError
                );

                return res.status(500).json({
                    error:
                        "Could not find avatar."
                });

            }


            if (!item) {

                return res.status(404).json({
                    error:
                        "Avatar not found."
                });

            }






            if (
                item.item_type !==
                "avatar"
            ) {

                return res.status(400).json({
                    error:
                        "This item is not an avatar."
                });

            }






            if (
                !item.item_value
            ) {

                return res.status(404).json({
                    error:
                        "Avatar file not found."
                });

            }






            const avatarResponse =
                await fetch(
                    item.item_value
                );


            if (
                !avatarResponse.ok
            ) {

                console.error(
                    "AVATAR STORAGE ERROR:",
                    avatarResponse.status,
                    avatarResponse.statusText
                );

                return res.status(500).json({
                    error:
                        "Could not retrieve avatar file."
                });

            }


            const arrayBuffer =
                await avatarResponse.arrayBuffer();


            const buffer =
                Buffer.from(
                    arrayBuffer
                );






            const safeName =
                String(
                    item.name ||
                    "shrekbook-avatar"
                )
                    .replace(
                        /[^a-z0-9_\- ]/gi,
                        ""
                    )
                    .trim()
                    .replace(
                        /\s+/g,
                        "-"
                    );






            res.setHeader(
                "Content-Type",
                "application/octet-stream"
            );

            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${safeName || "shrekbook-avatar"}.sb"`
            );

            res.setHeader(
                "Content-Length",
                buffer.length
            );


            return res.send(
                buffer
            );


        } catch (error) {

            console.error(
                "AVATAR DOWNLOAD ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to download avatar."
            });

        }

    }
);
app.post("/api/hambicoin/exchange", async (req, res) => {

    try {





        if (!req.session.user) {

            return res.status(401).json({
                error: "You must be logged in."
            });

        }

        const userId =
            req.session.user.id;






        const {
            direction,
            amount
        } = req.body;


        const numericAmount =
            Number(amount);






        if (
            !Number.isInteger(numericAmount) ||
            numericAmount <= 0
        ) {

            return res.status(400).json({
                error:
                    "Amount must be a positive whole number."
            });

        }






        if (
            direction !== "shrek_to_hambi" &&
            direction !== "hambi_to_shrek"
        ) {

            return res.status(400).json({
                error:
                    "Invalid exchange direction."
            });

        }








        if (
            direction === "shrek_to_hambi" &&
            numericAmount % 100 !== 0
        ) {

            return res.status(400).json({
                error:
                    "ShrekCoin amount must be divisible by 100."
            });

        }






        const {
            data,
            error
        } = await supabase.rpc(
            "exchange_hambicoin",
            {
                p_user_id:
                    userId,

                p_direction:
                    direction,

                p_amount:
                    numericAmount
            }
        );


        if (error) {

            console.error(
                "HAMBI EXCHANGE ERROR:",
                error
            );

            return res.status(400).json({
                error:
                    error.message ||
                    "Exchange failed."
            });

        }






        const balances =
            data?.[0];


        return res.json({

            success:
                true,

            user: {

                shrekcoins:
                    Number(
                        balances?.shrekcoins || 0
                    ),

                hambicoins:
                    Number(
                        balances?.hambicoins || 0
                    )

            }

        });


    } catch (error) {

        console.error(
            "HAMBI EXCHANGE SERVER ERROR:",
            error
        );

        return res.status(500).json({
            error:
                "Internal server error."
        });

    }

});
app.post("/api/shop/purchase", async (req, res) => {

    try {

        if (!req.session.user) {

            return res.status(401).json({
                error:
                    "You must be logged in."
            });

        }

        const itemId =
            Number(req.body.item_id);


        if (
            !Number.isInteger(itemId) ||
            itemId <= 0
        ) {

            return res.status(400).json({
                error:
                    "Invalid item ID."
            });

        }


        const {
            data,
            error
        } = await supabase.rpc(
            "purchase_shop_item",
            {
                p_buyer_id:
                    req.session.user.id,

                p_item_id:
                    itemId
            }
        );


        if (error) {

            console.error(
                "SHOP PURCHASE ERROR:",
                error
            );

            return res.status(400).json({
                error:
                    error.message ||
                    "Purchase failed."
            });

        }


        const result =
            data?.[0];


        res.json({

            success:
                true,

            buyer_shrekcoins:
                Number(
                    result?.buyer_shrekcoins || 0
                ),

            seller_shrekcoins:
                Number(
                    result?.seller_shrekcoins || 0
                ),

            seller_id:
                result?.seller_id,

            seller_amount:
                Number(
                    result?.seller_amount || 0
                ),

            tax_amount:
                Number(
                    result?.tax_amount || 0
                )

        });


    } catch (error) {

        console.error(
            "SHOP PURCHASE SERVER ERROR:",
            error
        );

        res.status(500).json({
            error:
                "Internal server error."
        });

    }

});
app.get("/api/shop/sell-history", async (req, res) => {

    try {

        if (!req.session.user) {
            return res.status(401).json({
                error: "You must be logged in."
            });
        }

        const sellerId = req.session.user.id;

        const { data, error } = await supabase
            .from("marketplace_sales")
            .select(`
                id,
                item_id,
                buyer_id,
                price,
                tax,
                seller_amount,
                created_at,
                shop_items (
                    name,
                    icon
                ),
                profiles!marketplace_sales_buyer_id_fkey (
                    username,
                    display_name,
                    avatar
                )
            `)
            .eq("seller_id", sellerId)
            .order("created_at", {
                ascending: false
            });

        if (error) {

            console.error(
                "SELL HISTORY ERROR:",
                error
            );

            return res.status(500).json({
                error: "Failed to load sell history."
            });
        }

        res.json({
            success: true,
            sales: data || []
        });

    } catch (error) {

        console.error(
            "SELL HISTORY SERVER ERROR:",
            error
        );

        res.status(500).json({
            error: "Internal server error."
        });
    }

});
app.post("/api/currency/transfer", async (req, res) => {

    try {





        if (!req.session.user) {

            return res.status(401).json({
                error:
                    "You must be logged in."
            });

        }

        const userId =
            req.session.user.id;






        const {
            username,
            currency,
            amount
        } = req.body;






        if (
            !username ||
            typeof username !== "string"
        ) {

            return res.status(400).json({
                error:
                    "Recipient username is required."
            });

        }






        const numericAmount =
            Number(amount);


        if (
            !Number.isInteger(numericAmount) ||
            numericAmount <= 0
        ) {

            return res.status(400).json({
                error:
                    "Amount must be a positive whole number."
            });

        }






        if (
            currency !== "shrekcoins" &&
            currency !== "hambicoins"
        ) {

            return res.status(400).json({
                error:
                    "Invalid currency."
            });

        }






        const {
            data,
            error
        } = await supabase.rpc(
            "transfer_currency",
            {
                p_sender_id:
                    userId,

                p_recipient_username:
                    username.trim(),

                p_currency:
                    currency,

                p_amount:
                    numericAmount
            }
        );


        if (error) {

            console.error(
                "CURRENCY TRANSFER ERROR:",
                error
            );

            return res.status(400).json({
                error:
                    error.message ||
                    "Transfer failed."
            });

        }






        const balances =
            data?.[0];


        return res.json({

            success:
                true,

            user: {

                shrekcoins:
                    Number(
                        balances?.shrekcoins || 0
                    ),

                hambicoins:
                    Number(
                        balances?.hambicoins || 0
                    )

            }

        });


    } catch (error) {

        console.error(
            "CURRENCY TRANSFER SERVER ERROR:",
            error
        );

        return res.status(500).json({
            error:
                "Internal server error."
        });

    }

});






function requireHouseLogin(req, res) {
    const userId = req.session?.user?.id;

    if (!userId) {
        res.status(401).json({
            error: "You must be logged in."
        });
        return null;
    }

    return userId;
}






async function getHouseMembership(houseId, userId) {
    if (!houseId || !userId) return null;

    const { data, error } = await supabase
        .from("house_members")
        .select("id, house_id, user_id, role, joined_at")
        .eq("house_id", houseId)
        .eq("user_id", userId)
        .maybeSingle();

    if (error) throw error;

    return data || null;
}


async function getHouseOwner(ownerId) {
    if (!ownerId) return null;

    const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar")
        .eq("id", ownerId)
        .maybeSingle();

    if (error) throw error;

    return data || null;
}


async function getHouseType(houseTypeName) {
    if (!houseTypeName) return null;

    const { data, error } = await supabase
        .from("house_types")
        .select("id, name, cost, room_count")
        .eq("name", houseTypeName)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
        ...data,
        tax_reduction_percent: getTaxReductionPercent(
            data.name,
            data.room_count
        )
    };
}


function getTaxReductionPercent(houseTypeName, roomCount = 0) {
    const name = String(houseTypeName || "").toLowerCase();

    if (name.includes("castle") || name.includes("mansion")) {
        return 10;
    }

    if (name.includes("manor") || name.includes("estate")) {
        return 7.5;
    }

    if (name.includes("cottage") || name.includes("house")) {
        return 5;
    }

    return Math.min(
        10,
        Math.max(0, (Number(roomCount) - 1) * 2.5)
    );
}


async function getHouseMembers(houseId) {
    const { data: members, error } = await supabase
        .from("house_members")
        .select("id, house_id, user_id, role, joined_at")
        .eq("house_id", houseId)
        .order("joined_at", { ascending: true });

    if (error) throw error;

    const userIds = [
        ...new Set(
            (members || []).map(member => member.user_id)
        )
    ];

    let profiles = [];

    if (userIds.length) {
        const { data, error: profileError } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar")
            .in("id", userIds);

        if (profileError) throw profileError;

        profiles = data || [];
    }

    const profileMap = new Map(
        profiles.map(profile => [profile.id, profile])
    );

    return (members || []).map(member => ({
        ...member,
        profile: profileMap.get(member.user_id) || null
    }));
}






app.get("/api/houses/types", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("house_types")
            .select("id, name, cost, room_count")
            .order("cost", { ascending: true });

        if (error) throw error;

        res.json({
            houseTypes: (data || []).map(houseType => ({
                ...houseType,
                tax_reduction_percent: getTaxReductionPercent(
                    houseType.name,
                    houseType.room_count
                )
            }))
        });

    } catch (error) {
        console.error("HOUSE TYPES ERROR:", error);

        res.status(500).json({
            error: "Failed to load House types."
        });
    }
});






app.post("/api/houses", async (req, res) => {
    const userId = requireHouseLogin(req, res);

    if (!userId) return;

    try {
        const name = String(req.body?.name || "").trim();
        const description = String(req.body?.description || "").trim();
        const houseTypeName = String(req.body?.houseType || "").trim();

        if (!name || !houseTypeName) {
            return res.status(400).json({
                error: "House name and type are required."
            });
        }

        const houseType = await getHouseType(houseTypeName);

        if (!houseType) {
            return res.status(400).json({
                error: "Invalid House type."
            });
        }

        const cost = Number(houseType.cost || 0);

        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("shrekcoins")
            .eq("id", userId)
            .single();

        if (profileError) throw profileError;

        const balance = Number(profile.shrekcoins || 0);

        if (balance < cost) {
            return res.status(400).json({
                error: "You do not have enough ShrekCoins."
            });
        }


        const { data: house, error: houseError } = await supabase
            .from("houses")
            .insert({
                name,
                description,
                owner_id: userId,
                house_type: houseType.name
            })
            .select(
                "id, name, description, owner_id, house_type, created_at"
            )
            .single();

        if (houseError) throw houseError;


        const roomCount = Math.max(
            1,
            Number(houseType.room_count || 1)
        );

        const rooms = Array.from(
            { length: roomCount },
            (_, index) => ({
                house_id: house.id,
                name:
                    index === roomCount - 1
                        ? "Bedroom"
                        : `Room ${index + 1}`,
                room_type:
                    index === roomCount - 1
                        ? "bedroom"
                        : "common",
                user_id:
                    index === roomCount - 1
                        ? userId
                        : null
            })
        );

        const { error: roomError } = await supabase
            .from("house_rooms")
            .insert(rooms);

        if (roomError) throw roomError;


        const { error: memberError } = await supabase
            .from("house_members")
            .insert({
                house_id: house.id,
                user_id: userId,
                role: "owner"
            });

        if (memberError) throw memberError;


        const { data: updatedProfile, error: chargeError } =
            await supabase
                .from("profiles")
                .update({
                    shrekcoins: balance - cost
                })
                .eq("id", userId)
                .eq("shrekcoins", balance)
                .select("shrekcoins")
                .maybeSingle();

        if (chargeError) throw chargeError;

        if (!updatedProfile) {
            return res.status(409).json({
                error: "Your ShrekCoin balance changed. Please try again."
            });
        }

        res.status(201).json({
            success: true,
            house
        });

    } catch (error) {
        console.error("HOUSE CREATE ERROR:", error);

        res.status(500).json({
            error: "Failed to create House."
        });
    }
});






app.get("/api/houses", async (req, res) => {
    const userId = requireHouseLogin(req, res);

    if (!userId) return;

    try {
        const { data: houses, error } = await supabase
            .from("houses")
            .select(
                "id, name, description, owner_id, house_type, created_at"
            )
            .order("created_at", { ascending: false });

        if (error) throw error;

        const ownerIds = [
            ...new Set(
                (houses || []).map(house => house.owner_id)
            )
        ];

        let owners = [];

        if (ownerIds.length) {
            const { data, error: ownerError } = await supabase
                .from("profiles")
                .select("id, username, display_name, avatar")
                .in("id", ownerIds);

            if (ownerError) throw ownerError;

            owners = data || [];
        }

        const ownerMap = new Map(
            owners.map(owner => [owner.id, owner])
        );

        res.json({
            houses: (houses || []).map(house => ({
                ...house,
                owner: ownerMap.get(house.owner_id) || null
            }))
        });

    } catch (error) {
        console.error("HOUSES LIST ERROR:", error);

        res.status(500).json({
            error: "Failed to load Houses."
        });
    }
});






app.get("/api/houses/:id", async (req, res) => {
    const userId = requireHouseLogin(req, res);

    if (!userId) return;

    const houseId = Number(req.params.id);

    if (!Number.isInteger(houseId) || houseId <= 0) {
        return res.status(400).json({
            error: "Invalid House ID."
        });
    }

    try {
        const { data: house, error: houseError } = await supabase
            .from("houses")
            .select(
                "id, name, description, owner_id, house_type, created_at"
            )
            .eq("id", houseId)
            .maybeSingle();

        if (houseError) throw houseError;

        if (!house) {
            return res.status(404).json({
                error: "House not found."
            });
        }

        const { data: rooms, error: roomsError } = await supabase
            .from("house_rooms")
            .select(
                "id, house_id, name, room_type, user_id, created_at"
            )
            .eq("house_id", houseId)
            .order("id", { ascending: true });

        if (roomsError) throw roomsError;

        const [owner, members, houseType] = await Promise.all([
            getHouseOwner(house.owner_id),
            getHouseMembers(houseId),
            getHouseType(house.house_type)
        ]);

        const membership =
            members.find(
                member => member.user_id === userId
            ) ||
            (
                house.owner_id === userId
                    ? {
                        house_id: houseId,
                        user_id: userId,
                        role: "owner"
                    }
                    : null
            );

        res.json({
            house,
            owner,
            rooms: rooms || [],
            members,
            membership,
            houseType
        });

    } catch (error) {
        console.error("HOUSE DETAILS ERROR:", error);

        res.status(500).json({
            error: "Failed to load House."
        });
    }
});













app.get("/api/users/search", async (req, res) => {
    const userId = requireHouseLogin(req, res);

    if (!userId) return;

    const query = String(req.query.q || "").trim();

    if (!query) {
        return res.json({
            users: []
        });
    }

    try {
        const safeQuery = query
            .replace(/[%_]/g, "\\$&")
            .replace(/\\/g, "\\\\");

        const pattern = `%${safeQuery}%`;

        const { data, error } = await supabase
            .from("profiles")
            .select(
                "id, username, display_name, avatar"
            )
            .or(
                `username.ilike.${pattern},display_name.ilike.${pattern}`
            )
            .neq("id", userId)
            .limit(20);

        if (error) throw error;

        res.json({
            users: data || []
        });

    } catch (error) {
        console.error("HOUSE USER SEARCH ERROR:", error);

        res.status(500).json({
            error: "Failed to search users."
        });
    }
});






app.get("/api/houses/invitations", async (req, res) => {
    const userId = requireHouseLogin(req, res);

    if (!userId) return;

    try {
        const { data, error } = await supabase
            .from("house_invitations")
            .select(
                "id, house_id, inviter_id, invitee_id, status, created_at"
            )
            .eq("invitee_id", userId)
            .eq("status", "pending")
            .order("created_at", { ascending: false });

        if (error) throw error;

        const invitations = data || [];

        const houseIds = [
            ...new Set(
                invitations.map(invite => invite.house_id)
            )
        ];

        const inviterIds = [
            ...new Set(
                invitations.map(invite => invite.inviter_id)
            )
        ];

        let houses = [];
        let inviters = [];

        if (houseIds.length) {
            const { data, error: housesError } =
                await supabase
                    .from("houses")
                    .select("id, name, house_type")
                    .in("id", houseIds);

            if (housesError) throw housesError;

            houses = data || [];
        }

        if (inviterIds.length) {
            const { data, error: invitersError } =
                await supabase
                    .from("profiles")
                    .select("id, username, display_name")
                    .in("id", inviterIds);

            if (invitersError) throw invitersError;

            inviters = data || [];
        }

        const houseMap = new Map(
            houses.map(house => [house.id, house])
        );

        const inviterMap = new Map(
            inviters.map(inviter => [inviter.id, inviter])
        );

        res.json({
            invitations: invitations.map(invite => ({
                ...invite,
                house:
                    houseMap.get(invite.house_id) ||
                    null,
                inviter:
                    inviterMap.get(invite.inviter_id) ||
                    null
            }))
        });

    } catch (error) {
        console.error("HOUSE INVITATIONS ERROR:", error);

        res.status(500).json({
            error: "Failed to load invitations."
        });
    }
});






app.post("/api/houses/:id/invite", async (req, res) => {
    const userId = requireHouseLogin(req, res);

    if (!userId) return;

    const houseId = Number(req.params.id);
    const inviteeId = String(
        req.body?.userId || ""
    ).trim();

    if (!Number.isInteger(houseId) || houseId <= 0) {
        return res.status(400).json({
            error: "Invalid House ID."
        });
    }

    if (!inviteeId) {
        return res.status(400).json({
            error: "User ID is required."
        });
    }

    try {
        const membership =
            await getHouseMembership(
                houseId,
                userId
            );

        if (
            !membership ||
            !["owner", "admin"].includes(
                membership.role
            )
        ) {
            return res.status(403).json({
                error:
                    "Only House managers can invite users."
            });
        }

        if (inviteeId === userId) {
            return res.status(400).json({
                error:
                    "You cannot invite yourself."
            });
        }

        const { data: targetUser, error: targetError } =
            await supabase
                .from("profiles")
                .select("id")
                .eq("id", inviteeId)
                .maybeSingle();

        if (targetError) throw targetError;

        if (!targetUser) {
            return res.status(404).json({
                error: "User not found."
            });
        }

        const existingMember =
            await getHouseMembership(
                houseId,
                inviteeId
            );

        if (existingMember) {
            return res.status(400).json({
                error:
                    "That user is already a member of this House."
            });
        }

        const { error } = await supabase
            .from("house_invitations")
            .upsert(
                {
                    house_id: houseId,
                    inviter_id: userId,
                    invitee_id: inviteeId,
                    status: "pending"
                },
                {
                    onConflict:
                        "house_id,invitee_id"
                }
            );

        if (error) throw error;

        res.json({
            success: true
        });

    } catch (error) {
        console.error("HOUSE INVITE ERROR:", error);

        res.status(500).json({
            error:
                "Failed to send invitation."
        });
    }
});






app.post(
    "/api/houses/invitations/:id/:action",
    async (req, res) => {
        const userId =
            requireHouseLogin(req, res);

        if (!userId) return;

        const invitationId =
            Number(req.params.id);

        const status =
            req.params.action === "accept"
                ? "accepted"
                : req.params.action === "decline"
                    ? "declined"
                    : null;

        if (
            !Number.isInteger(invitationId) ||
            invitationId <= 0
        ) {
            return res.status(400).json({
                error:
                    "Invalid invitation ID."
            });
        }

        if (!status) {
            return res.status(400).json({
                error:
                    "Invalid invitation action."
            });
        }

        try {
            const {
                data: invitation,
                error
            } = await supabase
                .from("house_invitations")
                .select(
                    "id, house_id, invitee_id, status"
                )
                .eq("id", invitationId)
                .eq("invitee_id", userId)
                .eq("status", "pending")
                .maybeSingle();

            if (error) throw error;

            if (!invitation) {
                return res.status(404).json({
                    error:
                        "Invitation not found."
                });
            }

            if (status === "accepted") {
                const { error: memberError } =
                    await supabase
                        .from("house_members")
                        .upsert(
                            {
                                house_id:
                                    invitation.house_id,
                                user_id:
                                    userId,
                                role: "member"
                            },
                            {
                                onConflict:
                                    "house_id,user_id"
                            }
                        );

                if (memberError) {
                    throw memberError;
                }
            }

            const {
                error: updateError
            } = await supabase
                .from("house_invitations")
                .update({ status })
                .eq("id", invitation.id);

            if (updateError) {
                throw updateError;
            }

            res.json({
                success: true,
                status
            });

        } catch (error) {
            console.error(
                "HOUSE INVITATION ACTION ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Invitation action failed."
            });
        }
    }
);












async function getShrekAIUser(req) {
    try {





        if (req.session?.user?.id) {
            return {
                id: req.session.user.id
            };
        }






        const authHeader = req.headers.authorization || "";

        if (
            authHeader.startsWith("Bearer ") &&
            typeof supabase !== "undefined"
        ) {
            const token = authHeader.slice(7).trim();

            if (!token) {
                return null;
            }

            const {
                data,
                error
            } = await supabase.auth.getUser(token);

            if (error || !data?.user) {
                return null;
            }

            return data.user;
        }

        return null;

    } catch (error) {
        console.error(
            "[ShrekAI] Authentication error:",
            error
        );

        return null;
    }
}






async function requireShrekAIUser(req, res, next) {
    const user = await getShrekAIUser(req);

    if (!user) {
        return res.status(401).json({
            error: "You must be logged in to use ShrekAI."
        });
    }

    req.shrekAIUser = user;

    next();
}









app.post(
    "/api/shrekai",
    requireShrekAIUser,
    async (req, res) => {

        try {
            const userId = req.shrekAIUser.id;

            const {
                conversationId,
                messages,
                title
            } = req.body || {};

            if (!Array.isArray(messages)) {
                return res.status(400).json({
                    error: "messages must be an array"
                });
            }

            if (messages.length === 0) {
                return res.status(400).json({
                    error: "messages cannot be empty"
                });
            }

            if (messages.length > 100) {
                return res.status(400).json({
                    error: "Too many messages"
                });
            }






            const cleanMessages = messages
                .filter(message =>
                    message &&
                    typeof message.role === "string" &&
                    typeof message.content === "string"
                )
                .map(message => ({
                    role: message.role,
                    content: message.content.slice(0, 10000)
                }))
                .filter(message =>
                    [
                        "system",
                        "user",
                        "assistant",
                        "tool"
                    ].includes(message.role)
                );

            if (cleanMessages.length === 0) {
                return res.status(400).json({
                    error: "No valid messages supplied"
                });
            }






            let currentConversationId = conversationId;

            if (currentConversationId) {

                const {
                    data: existingConversation,
                    error: conversationError
                } = await supabase
                    .from("ai_conversations")
                    .select("id")
                    .eq("id", currentConversationId)
                    .eq("user_id", userId)
                    .maybeSingle();

                if (conversationError) {
                    console.error(
                        "[ShrekAI] Conversation lookup failed:",
                        conversationError
                    );

                    return res.status(500).json({
                        error: "Failed to load conversation"
                    });
                }

                if (!existingConversation) {
                    return res.status(404).json({
                        error: "Conversation not found"
                    });
                }

            } else {

                const firstUserMessage =
                    cleanMessages.find(
                        message => message.role === "user"
                    );

                let conversationTitle =
                    typeof title === "string" && title.trim()
                        ? title.trim()
                        : "New conversation";

                if (
                    conversationTitle === "New conversation" &&
                    firstUserMessage
                ) {
                    conversationTitle =
                        firstUserMessage.content
                            .replace(/\s+/g, " ")
                            .trim()
                            .slice(0, 80);

                    if (!conversationTitle) {
                        conversationTitle = "New conversation";
                    }
                }

                const {
                    data: newConversation,
                    error: createConversationError
                } = await supabase
                    .from("ai_conversations")
                    .insert({
                        user_id: userId,
                        title: conversationTitle
                    })
                    .select("id, title, created_at, updated_at")
                    .single();

                if (createConversationError) {
                    console.error(
                        "[ShrekAI] Failed to create conversation:",
                        createConversationError
                    );

                    return res.status(500).json({
                        error: "Failed to create conversation"
                    });
                }

                currentConversationId =
                    newConversation.id;
            }









            const {
                data: existingMessages,
                error: existingMessagesError
            } = await supabase
                .from("ai_messages")
                .select("role, content")
                .eq(
                    "conversation_id",
                    currentConversationId
                )
                .eq("user_id", userId)
                .order("created_at", {
                    ascending: true
                });

            if (existingMessagesError) {
                console.error(
                    "[ShrekAI] Failed to load existing messages:",
                    existingMessagesError
                );

                return res.status(500).json({
                    error: "Failed to load conversation messages"
                });
            }







            const existing = existingMessages || [];

            const newMessages = [];

            for (let i = existing.length; i < cleanMessages.length; i++) {
                newMessages.push({
                    conversation_id:
                        currentConversationId,

                    user_id:
                        userId,

                    role:
                        cleanMessages[i].role,

                    content:
                        cleanMessages[i].content
                });
            }






            if (newMessages.length > 0) {

                const {
                    error: insertMessagesError
                } = await supabase
                    .from("ai_messages")
                    .insert(newMessages);

                if (insertMessagesError) {
                    console.error(
                        "[ShrekAI] Failed to save messages:",
                        insertMessagesError
                    );

                    return res.status(500).json({
                        error: "Failed to save messages"
                    });
                }
            }






            await supabase
                .from("ai_conversations")
                .update({
                    updated_at: new Date().toISOString()
                })
                .eq(
                    "id",
                    currentConversationId
                )
                .eq(
                    "user_id",
                    userId
                );


            console.log(
                "[ShrekAI] Conversation saved:",
                currentConversationId
            );


            return res.json({
                success: true,
                conversationId:
                    currentConversationId
            });

        } catch (error) {

            console.error(
                "[ShrekAI] API error:",
                error
            );

            return res.status(500).json({
                error: "ShrekAI API failed"
            });
        }
    }
);








app.get(
    "/api/shrekai/history",
    requireShrekAIUser,
    async (req, res) => {

        try {

            const userId = req.shrekAIUser.id;

            const {
                data,
                error
            } = await supabase
                .from("ai_conversations")
                .select(
                    "id, title, created_at, updated_at"
                )
                .eq("user_id", userId)
                .order("updated_at", {
                    ascending: false
                })
                .limit(100);

            if (error) {
                console.error(
                    "[ShrekAI] History lookup failed:",
                    error
                );

                return res.status(500).json({
                    error: "Failed to load conversation history"
                });
            }

            return res.json({
                conversations: data || []
            });

        } catch (error) {

            console.error(
                "[ShrekAI] History error:",
                error
            );

            return res.status(500).json({
                error: "Failed to load history"
            });
        }
    }
);








app.get(
    "/api/shrekai/history/:conversationId",
    requireShrekAIUser,
    async (req, res) => {

        try {

            const userId = req.shrekAIUser.id;

            const conversationId =
                req.params.conversationId;


            const {
                data: conversation,
                error: conversationError
            } = await supabase
                .from("ai_conversations")
                .select(
                    "id, title, created_at, updated_at"
                )
                .eq("id", conversationId)
                .eq("user_id", userId)
                .maybeSingle();


            if (conversationError) {
                console.error(
                    "[ShrekAI] Conversation lookup failed:",
                    conversationError
                );

                return res.status(500).json({
                    error: "Failed to load conversation"
                });
            }


            if (!conversation) {
                return res.status(404).json({
                    error: "Conversation not found"
                });
            }


            const {
                data: messages,
                error: messagesError
            } = await supabase
                .from("ai_messages")
                .select(
                    "id, role, content, created_at"
                )
                .eq(
                    "conversation_id",
                    conversationId
                )
                .eq("user_id", userId)
                .order("created_at", {
                    ascending: true
                });


            if (messagesError) {
                console.error(
                    "[ShrekAI] Message lookup failed:",
                    messagesError
                );

                return res.status(500).json({
                    error: "Failed to load messages"
                });
            }


            return res.json({
                conversation,
                messages: messages || []
            });

        } catch (error) {

            console.error(
                "[ShrekAI] Conversation history error:",
                error
            );

            return res.status(500).json({
                error: "Failed to load conversation"
            });
        }
    }
);






app.delete(
    "/api/shrekai/history/:conversationId",
    requireShrekAIUser,
    async (req, res) => {

        try {

            const userId = req.shrekAIUser.id;

            const conversationId =
                req.params.conversationId;


            const {
                error
            } = await supabase
                .from("ai_conversations")
                .delete()
                .eq("id", conversationId)
                .eq("user_id", userId);


            if (error) {
                console.error(
                    "[ShrekAI] Conversation deletion failed:",
                    error
                );

                return res.status(500).json({
                    error: "Failed to delete conversation"
                });
            }


            return res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "[ShrekAI] Delete error:",
                error
            );

            return res.status(500).json({
                error: "Failed to delete conversation"
            });
        }
    }
);






app.get(
    "/api/shrekai/memories",
    requireShrekAIUser,
    async (req, res) => {

        try {

            const userId = req.shrekAIUser.id;

            const {
                data,
                error
            } = await supabase
                .from("ai_memories")
                .select(
                    "id, memory, created_at, updated_at"
                )
                .eq("user_id", userId)
                .order("updated_at", {
                    ascending: false
                })
                .limit(100);


            if (error) {
                console.error(
                    "[ShrekAI] Memory lookup failed:",
                    error
                );

                return res.status(500).json({
                    error: "Failed to load memories"
                });
            }


            return res.json({
                memories: data || []
            });

        } catch (error) {

            console.error(
                "[ShrekAI] Memory error:",
                error
            );

            return res.status(500).json({
                error: "Failed to load memories"
            });
        }
    }
);






app.post(
    "/api/shrekai/memories",
    requireShrekAIUser,
    async (req, res) => {

        try {

            const userId = req.shrekAIUser.id;

            const memory =
                typeof req.body?.memory === "string"
                    ? req.body.memory.trim()
                    : "";


            if (!memory) {
                return res.status(400).json({
                    error: "memory is required"
                });
            }


            if (memory.length > 2000) {
                return res.status(400).json({
                    error: "Memory is too long"
                });
            }


            const {
                data,
                error
            } = await supabase
                .from("ai_memories")
                .insert({
                    user_id: userId,
                    memory
                })
                .select(
                    "id, memory, created_at, updated_at"
                )
                .single();


            if (error) {
                console.error(
                    "[ShrekAI] Memory creation failed:",
                    error
                );

                return res.status(500).json({
                    error: "Failed to save memory"
                });
            }


            return res.json({
                success: true,
                memory: data
            });

        } catch (error) {

            console.error(
                "[ShrekAI] Memory creation error:",
                error
            );

            return res.status(500).json({
                error: "Failed to save memory"
            });
        }
    }
);






app.delete(
    "/api/shrekai/memories/:id",
    requireShrekAIUser,
    async (req, res) => {

        try {

            const userId = req.shrekAIUser.id;

            const memoryId = req.params.id;


            const {
                error
            } = await supabase
                .from("ai_memories")
                .delete()
                .eq("id", memoryId)
                .eq("user_id", userId);


            if (error) {
                console.error(
                    "[ShrekAI] Memory deletion failed:",
                    error
                );

                return res.status(500).json({
                    error: "Failed to delete memory"
                });
            }


            return res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "[ShrekAI] Memory deletion error:",
                error
            );

            return res.status(500).json({
                error: "Failed to delete memory"
            });
        }
    }
);

app.put("/api/houses/:id", async (req, res) => {
    const userId =
        requireHouseLogin(req, res);

    if (!userId) return;

    const houseId =
        Number(req.params.id);

    if (
        !Number.isInteger(houseId) ||
        houseId <= 0
    ) {
        return res.status(400).json({
            error: "Invalid House ID."
        });
    }

    try {
        const membership =
            await getHouseMembership(
                houseId,
                userId
            );

        if (
            !membership ||
            !["owner", "admin"].includes(
                membership.role
            )
        ) {
            return res.status(403).json({
                error:
                    "Only House managers can edit the House."
            });
        }

        const name =
            String(req.body?.name || "")
                .trim();

        const description =
            String(req.body?.description || "")
                .trim();

        if (!name) {
            return res.status(400).json({
                error:
                    "House name is required."
            });
        }

        const {
            data,
            error
        } = await supabase
            .from("houses")
            .update({
                name,
                description
            })
            .eq("id", houseId)
            .select(
                "id, name, description, owner_id, house_type, created_at"
            )
            .single();

        if (error) throw error;

        res.json({
            house: data
        });

    } catch (error) {
        console.error(
            "HOUSE UPDATE ERROR:",
            error
        );

        res.status(500).json({
            error:
                "Failed to update House."
        });
    }
});






app.delete(
    "/api/houses/:id/leave",
    async (req, res) => {
        const userId =
            requireHouseLogin(req, res);

        if (!userId) return;

        const houseId =
            Number(req.params.id);

        if (
            !Number.isInteger(houseId) ||
            houseId <= 0
        ) {
            return res.status(400).json({
                error:
                    "Invalid House ID."
            });
        }

        try {
            const membership =
                await getHouseMembership(
                    houseId,
                    userId
                );

            if (!membership) {
                return res.status(404).json({
                    error:
                        "You are not a member of this House."
                });
            }

            if (membership.role === "owner") {
                return res.status(403).json({
                    error:
                        "The House owner cannot leave the House."
                });
            }

            const { error } =
                await supabase
                    .from("house_members")
                    .delete()
                    .eq("house_id", houseId)
                    .eq("user_id", userId);

            if (error) throw error;

            res.json({
                success: true
            });

        } catch (error) {
            console.error(
                "HOUSE LEAVE ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Failed to leave House."
            });
        }
    }
);






app.post(
    "/api/houses/:id/admins/:userId",
    async (req, res) => {
        const userId =
            requireHouseLogin(req, res);

        if (!userId) return;

        const houseId =
            Number(req.params.id);

        const targetId =
            String(req.params.userId);

        if (
            !Number.isInteger(houseId) ||
            houseId <= 0
        ) {
            return res.status(400).json({
                error:
                    "Invalid House ID."
            });
        }

        try {
            const manager =
                await getHouseMembership(
                    houseId,
                    userId
                );

            if (
                !manager ||
                !["owner", "admin"].includes(
                    manager.role
                )
            ) {
                return res.status(403).json({
                    error:
                        "Only House managers can change admins."
                });
            }

            const target =
                await getHouseMembership(
                    houseId,
                    targetId
                );

            if (!target) {
                return res.status(404).json({
                    error:
                        "Member not found."
                });
            }

            if (target.role === "owner") {
                return res.status(403).json({
                    error:
                        "The House owner cannot be changed."
                });
            }

            const { error } =
                await supabase
                    .from("house_members")
                    .update({
                        role: "admin"
                    })
                    .eq("house_id", houseId)
                    .eq("user_id", targetId)
                    .neq("role", "owner");

            if (error) throw error;

            res.json({
                success: true
            });

        } catch (error) {
            console.error(
                "HOUSE PROMOTE ADMIN ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Failed to promote admin."
            });
        }
    }
);






app.delete(
    "/api/houses/:id/admins/:userId",
    async (req, res) => {
        const userId =
            requireHouseLogin(req, res);

        if (!userId) return;

        const houseId =
            Number(req.params.id);

        const targetId =
            String(req.params.userId);

        if (
            !Number.isInteger(houseId) ||
            houseId <= 0
        ) {
            return res.status(400).json({
                error:
                    "Invalid House ID."
            });
        }

        try {
            const manager =
                await getHouseMembership(
                    houseId,
                    userId
                );

            if (
                !manager ||
                !["owner", "admin"].includes(
                    manager.role
                )
            ) {
                return res.status(403).json({
                    error:
                        "Only House managers can change admins."
                });
            }

            const target =
                await getHouseMembership(
                    houseId,
                    targetId
                );

            if (!target) {
                return res.status(404).json({
                    error:
                        "Member not found."
                });
            }

            if (target.role === "owner") {
                return res.status(403).json({
                    error:
                        "The House owner cannot be changed."
                });
            }

            const { error } =
                await supabase
                    .from("house_members")
                    .update({
                        role: "member"
                    })
                    .eq("house_id", houseId)
                    .eq("user_id", targetId)
                    .eq("role", "admin");

            if (error) throw error;

            res.json({
                success: true
            });

        } catch (error) {
            console.error(
                "HOUSE DEMOTE ADMIN ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Failed to demote admin."
            });
        }
    }
);






app.delete(
    "/api/houses/:id/members/:userId",
    async (req, res) => {
        const userId =
            requireHouseLogin(req, res);

        if (!userId) return;

        const houseId =
            Number(req.params.id);

        const targetId =
            String(req.params.userId);

        if (
            !Number.isInteger(houseId) ||
            houseId <= 0
        ) {
            return res.status(400).json({
                error:
                    "Invalid House ID."
            });
        }

        try {
            const manager =
                await getHouseMembership(
                    houseId,
                    userId
                );

            if (
                !manager ||
                !["owner", "admin"].includes(
                    manager.role
                )
            ) {
                return res.status(403).json({
                    error:
                        "Only House managers can remove members."
                });
            }

            const target =
                await getHouseMembership(
                    houseId,
                    targetId
                );

            if (!target) {
                return res.status(404).json({
                    error:
                        "Member not found."
                });
            }

            if (target.role === "owner") {
                return res.status(403).json({
                    error:
                        "The House owner cannot be removed."
                });
            }


            if (
                manager.role === "admin" &&
                target.role === "admin"
            ) {
                return res.status(403).json({
                    error:
                        "Admins cannot remove other admins."
                });
            }

            const { error } =
                await supabase
                    .from("house_members")
                    .delete()
                    .eq("house_id", houseId)
                    .eq("user_id", targetId);

            if (error) throw error;

            res.json({
                success: true
            });

        } catch (error) {
            console.error(
                "HOUSE REMOVE MEMBER ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Failed to remove member."
            });
        }
    }
);








app.listen(PORT, "0.0.0.0", () => {

    console.log(
        `🧌 ShrekBook server running on port ${PORT}`
    );

});

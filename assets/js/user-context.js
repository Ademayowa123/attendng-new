/*************************************************
 * USER-CONTEXT.JS
 * AttendNG Context — resolves who's logged in and
 * which tier they belong to: platform, admin, or
 * teacher.
 *************************************************/


// =========================================
// GLOBAL CONTEXT
// =========================================

window.AttendNGContext = {

    loaded: false,

    userId: null,

    tier: null,           // "platform" | "admin" | "teacher"

    // platform tier

    platformAdminId: null,

    fullName: "",

    email: "",

    // school-scoped tiers (admin / teacher)

    memberId: null,

    username: "",

    schoolId: null,

    schoolName: "",

    schoolLogoUrl: null,

    isGenesis: false,

    membershipRole: "",

    sessionId: null,

    sessionName: "",

    currentTerm: "",

    // only set if this member is assigned a class

    classId: null,

    className: "",

    classIsFinalized: false

};


// =========================================
// BROWSER TAB TITLE
// School accounts see "School Name | Page", e.g.
// "Matem College | Dashboard".
// Long school names (over 20 characters) become
// the first letter of each word, e.g.
// "State Comprehensive Junior College" -> "SCJC".
// The page part is taken from each page's own
// <title> ("AttendNG | Dashboard" -> "Dashboard").
// Platform (super admin) pages keep their own title.
// =========================================

const TAB_TITLE_MAX_LENGTH = 20;

// Read once, before the title is ever replaced.
const TAB_PAGE_NAME =
    (document.title.split("|")[1] || "").trim();

function tabTitleForSchool(schoolName) {

    const name =
        String(schoolName || "").trim().replace(/\s+/g, " ");

    if (name.length <= TAB_TITLE_MAX_LENGTH) {

        return name;

    }

    return name
        .split(" ")
        .map(word => (word.match(/[A-Za-z0-9]/) || [""])[0])
        .join("")
        .toUpperCase();

}


function applyTabTitle() {

    if (AttendNGContext.tier === "platform" || !AttendNGContext.schoolName) {

        return;

    }

    const schoolPart =
        tabTitleForSchool(AttendNGContext.schoolName);

    document.title =
        TAB_PAGE_NAME ? `${schoolPart} | ${TAB_PAGE_NAME}` : schoolPart;

}


// =========================================
// BROWSER TAB ICON
// AttendNG's logo by default; the school's own
// logo once the school has uploaded one.
// Platform (super admin) accounts always get
// the AttendNG logo.
// =========================================

function applyFavicon() {

    const url =
        (AttendNGContext.tier !== "platform" && AttendNGContext.schoolLogoUrl) ?
            AttendNGContext.schoolLogoUrl :
            "/assets/images/logo.png";

    let link =
        document.querySelector("link[rel~='icon']");

    if (!link) {

        link =
            document.createElement("link");

        link.rel =
            "icon";

        document.head.appendChild(link);

    }

    link.removeAttribute("type");

    if (link.getAttribute("href") !== url) {

        link.href =
            url;

    }

}


// =========================================
// CONTEXT CACHE
//
// Working out who is logged in takes several
// requests to the database. The answer hardly
// ever changes, so it is kept in the browser
// for a few minutes. Pages after the first one
// then start straight away, and the details are
// re-checked quietly in the background.
//
// The cache belongs to one user id, so another
// person logging in on the same browser never
// sees it. It is wiped on sign-out.
// =========================================

const CONTEXT_CACHE_KEY = "attendng_context_v1";
const CONTEXT_RELOAD_KEY = "attendng_context_reload";

const CONTEXT_CACHE_MAX_AGE_MS = 10 * 60 * 1000;   // used without waiting
const CONTEXT_REFRESH_AFTER_MS = 10 * 1000;        // re-checked in the background

// If one of these changes after a page has already loaded with the
// old value, the page reloads once so it shows the right data.
const CONTEXT_CRITICAL_FIELDS = [
    "tier",
    "memberId",
    "schoolId",
    "sessionId",
    "currentTerm",
    "classId",
    "classIsFinalized"
];


function readContextCache(userId) {

    try {

        const saved =
            JSON.parse(localStorage.getItem(CONTEXT_CACHE_KEY));

        if (
            saved &&
            saved.userId === userId &&
            saved.fields &&
            Date.now() - saved.savedAt < CONTEXT_CACHE_MAX_AGE_MS
        ) {

            return saved;

        }

    }
    catch (error) {

        // Storage blocked or unreadable: just behave as if empty.

    }

    return null;

}


function writeContextCache(userId, fields) {

    try {

        localStorage.setItem(
            CONTEXT_CACHE_KEY,
            JSON.stringify({ userId, savedAt: Date.now(), fields })
        );

    }
    catch (error) {

        // Storage full or blocked: the app still works, just not cached.

    }

}


function clearAttendNGContextCache() {

    try {

        localStorage.removeItem(CONTEXT_CACHE_KEY);

    }
    catch (error) {

        // Nothing to clear.

    }

}


function applyContextFields(fields) {

    Object.keys(fields).forEach(
        key => {

            AttendNGContext[key] =
                fields[key];

        }
    );

}


// Wipe the cache the moment anyone signs out, from anywhere.
try {

    supabaseClient.auth.onAuthStateChange(
        (event) => {

            if (event === "SIGNED_OUT") {

                clearAttendNGContextCache();

            }

        }
    );

}
catch (error) {

    console.warn("Context cache sign-out listener not set:", error);

}


// =========================================
// FETCH CONTEXT FROM THE DATABASE
//
// Independent requests are sent together, so
// this takes 2 round trips instead of 4.
// Returns the plain values; the caller applies them.
// =========================================

async function fetchContextFromServer(userId) {

    // 1. Platform admin check and school membership at the same time

    const [platformResult, memberResult] =
        await Promise.all([

            supabaseClient
                .from("platform_admins")
                .select(
                    "id, full_name, email"
                )
                .eq(
                    "user_id",
                    userId
                )
                .maybeSingle(),

            supabaseClient
                .from("school_members")
                .select(
                    `
                    id,
                    username,
                    full_name,
                    role,
                    is_genesis,
                    school_id,
                    schools (
                        id,
                        name,
                        logo_url
                    )
                    `
                )
                .eq(
                    "user_id",
                    userId
                )
                .maybeSingle()

        ]);


    if (platformResult.error) {

        throw platformResult.error;

    }


    if (platformResult.data) {

        return {
            tier: "platform",
            platformAdminId: platformResult.data.id,
            fullName: platformResult.data.full_name,
            email: platformResult.data.email
        };

    }


    if (memberResult.error) {

        throw memberResult.error;

    }

    const member =
        memberResult.data;

    if (!member) {

        throw new Error(
            "This account isn't set up yet. Contact your school admin."
        );

    }


    // 2. The school's active session and this member's class, together.
    //    (Genesis accounts are never assigned a class.)

    const [sessionResult, classResult] =
        await Promise.all([

            supabaseClient
                .from("sessions")
                .select(
                    "id, name, current_term"
                )
                .eq(
                    "school_id",
                    member.school_id
                )
                .eq(
                    "is_active",
                    true
                )
                .maybeSingle(),

            member.is_genesis ?
                Promise.resolve({ data: [], error: null }) :
                supabaseClient
                    .from("classes")
                    .select(
                        "id, name, is_finalized, session_id"
                    )
                    .eq(
                        "teacher_id",
                        member.id
                    )

        ]);


    if (sessionResult.error) {

        throw sessionResult.error;

    }

    if (classResult.error) {

        throw classResult.error;

    }


    const session =
        sessionResult.data;

    const classRow =
        session ?
            (classResult.data || []).find(row => row.session_id === session.id) :
            null;


    return {

        tier: member.role,                       // "admin" | "teacher"
        memberId: member.id,
        username: member.username,
        fullName: member.full_name,
        membershipRole: member.role,
        isGenesis: member.is_genesis,
        schoolId: member.school_id,

        schoolName: member.schools ? member.schools.name : "",
        schoolLogoUrl: member.schools ? member.schools.logo_url : null,

        sessionId: session ? session.id : null,
        sessionName: session ? session.name : "",
        currentTerm: session ? session.current_term : "",

        classId: classRow ? classRow.id : null,
        className: classRow ? classRow.name : "",
        classIsFinalized: classRow ? classRow.is_finalized : false

    };

}


// Re-check the details without making the page wait. If something
// important changed (new term, new class, new role), reload once.
async function refreshContextInBackground(userId, oldFields) {

    try {

        const fresh =
            await fetchContextFromServer(userId);

        writeContextCache(userId, fresh);

        const changed =
            CONTEXT_CRITICAL_FIELDS.some(
                key => (fresh[key] === undefined ? null : fresh[key]) !==
                    (oldFields[key] === undefined ? null : oldFields[key])
            );

        applyContextFields(fresh);

        applyFavicon();
        applyTabTitle();
        updateAttendNGContextUI();

        if (changed) {

            // Reload at most once in a row, so it can never loop.
            const lastReload =
                Number(sessionStorage.getItem(CONTEXT_RELOAD_KEY) || 0);

            if (Date.now() - lastReload > 15000) {

                sessionStorage.setItem(CONTEXT_RELOAD_KEY, String(Date.now()));

                window.location.reload();

            }

        }

    }
    catch (error) {

        // Don't disturb the page; the next full load will sort it out.
        console.warn("Background context refresh failed:", error);

        clearAttendNGContextCache();

    }

}


// =========================================
// LOAD CONTEXT
// =========================================

async function loadAttendNGContext() {

    try {

        // =====================================
        // 1. WHO IS LOGGED IN
        //    The sign-in session is kept in the browser, so
        //    this needs no trip to the server.
        // =====================================

        const {
            data: {
                session: authSession
            },
            error: userError

        } =
            await supabaseClient.auth.getSession();


        if (userError) {

            throw userError;

        }


        const user =
            authSession ? authSession.user : null;


        if (!user) {

            throw new Error(
                "No authenticated user found."
            );

        }


        AttendNGContext.userId =
            user.id;


        // =====================================
        // 2. USE THE SAVED COPY IF WE HAVE ONE
        // =====================================

        const cached =
            readContextCache(user.id);

        if (cached) {

            applyContextFields(cached.fields);

            AttendNGContext.loaded =
                true;

            applyFavicon();
            applyTabTitle();

            if (Date.now() - cached.savedAt > CONTEXT_REFRESH_AFTER_MS) {

                refreshContextInBackground(user.id, cached.fields);

            }

            return AttendNGContext;

        }


        // =====================================
        // 3. NOTHING SAVED: ASK THE DATABASE
        // =====================================

        const fields =
            await fetchContextFromServer(user.id);

        applyContextFields(fields);

        writeContextCache(user.id, fields);

        AttendNGContext.loaded =
            true;

        applyFavicon();
        applyTabTitle();

        return AttendNGContext;

    }

    catch (error) {

        console.error(
            "Unable to load AttendNG context:",
            error
        );

        AttendNGContext.loaded =
            false;

        throw error;

    }

}


// =========================================
// UPDATE CONTEXT UI
// Fills in any element with these IDs, on
// any page, if present.
// =========================================

function updateAttendNGContextUI() {

    const bindings = {

        "#fullName": AttendNGContext.fullName,
        "#schoolName": AttendNGContext.schoolName,
        "#className": AttendNGContext.className,
        "#sessionName": AttendNGContext.sessionName,
        "#term": AttendNGContext.currentTerm

    };


    Object.entries(bindings).forEach(
        ([selector, value]) => {

            document.querySelectorAll(selector).forEach(
                element => {

                    element.textContent =
                        value || "";

                }
            );

        }
    );


    // =====================================
    // SCHOOL LOGO (falls back to initial
    // avatar if no logo_url is set)
    // =====================================

    const logoElements =
        document.querySelectorAll(
            "#schoolLogo"
        );


    logoElements.forEach(
        element => {

            if (AttendNGContext.schoolLogoUrl) {

                element.src =
                    AttendNGContext.schoolLogoUrl;

            }
            else {

                element.src =
                    "/assets/images/logo.png";

            }

        }
    );

}


// =========================================
// GLOBAL FUNCTIONS
// =========================================

window.loadAttendNGContext =
    loadAttendNGContext;

window.updateAttendNGContextUI =
    updateAttendNGContextUI;

window.applyFavicon =
    applyFavicon;

window.applyTabTitle =
    applyTabTitle;

window.clearAttendNGContextCache =
    clearAttendNGContextCache;
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
// LOAD CONTEXT
// =========================================

async function loadAttendNGContext() {

    try {

        // =====================================
        // 1. GET AUTHENTICATED USER
        // =====================================

        const {
            data: {
                user
            },
            error: userError

        } =
            await supabaseClient.auth.getUser();


        if (userError) {

            throw userError;

        }


        if (!user) {

            throw new Error(
                "No authenticated user found."
            );

        }


        AttendNGContext.userId =
            user.id;


        // =====================================
        // 2. IS THIS A PLATFORM ADMIN?
        // =====================================

        const {
            data: platformAdmin,
            error: platformError

        } =
            await supabaseClient
                .from("platform_admins")
                .select(
                    "id, full_name, email"
                )
                .eq(
                    "user_id",
                    user.id
                )
                .maybeSingle();


        if (platformError) {

            throw platformError;

        }


        if (platformAdmin) {

            AttendNGContext.tier =
                "platform";

            AttendNGContext.platformAdminId =
                platformAdmin.id;

            AttendNGContext.fullName =
                platformAdmin.full_name;

            AttendNGContext.email =
                platformAdmin.email;

            AttendNGContext.loaded =
                true;

            return AttendNGContext;

        }


        // =====================================
        // 3. NOT A PLATFORM ADMIN — SCHOOL
        //    MEMBERSHIP LOOKUP
        // =====================================

        const {
            data: member,
            error: memberError

        } =
            await supabaseClient
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
                    user.id
                )
                .maybeSingle();


        if (memberError) {

            throw memberError;

        }


        if (!member) {

            throw new Error(
                "This account isn't set up yet. Contact your school admin."
            );

        }


        AttendNGContext.tier =
            member.role; // "admin" | "teacher"

        AttendNGContext.memberId =
            member.id;

        AttendNGContext.username =
            member.username;

        AttendNGContext.fullName =
            member.full_name;

        AttendNGContext.membershipRole =
            member.role;

        AttendNGContext.isGenesis =
            member.is_genesis;

        AttendNGContext.schoolId =
            member.school_id;


        if (member.schools) {

            AttendNGContext.schoolName =
                member.schools.name;

            AttendNGContext.schoolLogoUrl =
                member.schools.logo_url;

        }


        // =====================================
        // 4. LOAD THE SCHOOL'S ACTIVE SESSION
        // =====================================

        const {
            data: session,
            error: sessionError

        } =
            await supabaseClient
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
                .maybeSingle();


        if (sessionError) {

            throw sessionError;

        }


        if (session) {

            AttendNGContext.sessionId =
                session.id;

            AttendNGContext.sessionName =
                session.name;

            AttendNGContext.currentTerm =
                session.current_term;

        }


        // =====================================
        // 5. IS THIS MEMBER ASSIGNED A CLASS
        //    THIS SESSION?
        //    (Genesis accounts never are.)
        // =====================================

        if (session && !member.is_genesis) {

            const {
                data: classRow,
                error: classError

            } =
                await supabaseClient
                    .from("classes")
                    .select(
                        "id, name, is_finalized"
                    )
                    .eq(
                        "session_id",
                        session.id
                    )
                    .eq(
                        "teacher_id",
                        member.id
                    )
                    .maybeSingle();


            if (classError) {

                throw classError;

            }


            if (classRow) {

                AttendNGContext.classId =
                    classRow.id;

                AttendNGContext.className =
                    classRow.name;

                AttendNGContext.classIsFinalized =
                    classRow.is_finalized;

            }

        }


        // =====================================
        // 6. MARK CONTEXT AS LOADED
        // =====================================

        AttendNGContext.loaded =
            true;


        console.log(
            "AttendNG context loaded:",
            AttendNGContext
        );


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
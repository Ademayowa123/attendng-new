/*************************************************
 * ADMIN-SESSIONS.JS
 *************************************************/

let currentActiveSession = null;


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    await loadActiveSession();


    document.getElementById("startDateInput").addEventListener(
        "change",
        async (event) => {

            if (!currentActiveSession) {

                return;

            }

            const previousStartDate =
                currentActiveSession.start_date;

            const newStartDate =
                event.target.value || null;

            const { error } =
                await supabaseClient
                    .from("sessions")
                    .update({ start_date: newStartDate })
                    .eq("id", currentActiveSession.id);

            if (error) {

                alert(
                    "Unable to update the start date: " +
                    error.message
                );

                return;

            }

            currentActiveSession.start_date =
                newStartDate;

            logActivity(
                "session.start_date_changed",
                currentActiveSession.name,
                `${previousStartDate || "not set"} → ${newStartDate || "not set"}`
            );

        }
    );


    document.getElementById("termSelect").addEventListener(
        "change",
        async (event) => {

            if (!currentActiveSession) {

                return;

            }

            const { error } =
                await supabaseClient
                    .from("sessions")
                    .update({ current_term: event.target.value })
                    .eq("id", currentActiveSession.id);

            if (error) {

                alert(
                    "Unable to update the term: " +
                    error.message
                );

            }

        }
    );


    document.getElementById("startSessionBtn").addEventListener(
        "click",
        startNewSession
    );

});


function waitForContext() {

    return new Promise(
        (resolve) => {

            const check =
                () => {

                    if (AttendNGContext.loaded) {

                        resolve();

                    }
                    else {

                        setTimeout(check, 50);

                    }

                };

            check();

        }
    );

}


async function loadActiveSession() {

    const {
        data: session,
        error

    } =
        await supabaseClient
            .from("sessions")
            .select("id, name, current_term, start_date")
            .eq("school_id", AttendNGContext.schoolId)
            .eq("is_active", true)
            .maybeSingle();


    if (error) {

        console.error(
            "Unable to load active session:",
            error
        );

        return;

    }


    currentActiveSession =
        session;


    if (!session) {

        document.getElementById("noActiveSession").style.display =
            "block";

        document.getElementById("activeSessionInfo").style.display =
            "none";

        return;

    }


    document.getElementById("noActiveSession").style.display =
        "none";

    document.getElementById("activeSessionInfo").style.display =
        "block";

    document.getElementById("activeSessionName").textContent =
        session.name;

    document.getElementById("termSelect").value =
        session.current_term;

    document.getElementById("startDateInput").value =
        session.start_date || "";

}


async function startNewSession() {

    const errorEl =
        document.getElementById("sessionError");

    const nameInput =
        document.getElementById("newSessionName");

    const startBtn =
        document.getElementById("startSessionBtn");

    const name =
        nameInput.value.trim();

    const startDate =
        document.getElementById("newSessionStartDate").value;


    errorEl.style.display =
        "none";


    if (!name) {

        errorEl.textContent =
            "Please enter a session name.";

        errorEl.style.display =
            "block";

        return;

    }

    if (!startDate) {

        errorEl.textContent =
            "Please choose a start date.";

        errorEl.style.display =
            "block";

        return;

    }


    if (currentActiveSession) {

        const confirmed =
            window.confirm(
                `This will close "${currentActiveSession.name}" and start "${name}". ` +
                `Last session's classes and students stay archived, untouched. Continue?`
            );

        if (!confirmed) {

            return;

        }

    }


    startBtn.disabled =
        true;

    startBtn.textContent =
        "Starting…";


    try {

        // Deactivate the current session first, if one exists —
        // the unique index only allows one active session per
        // school at a time.

        if (currentActiveSession) {

            const { error: deactivateError } =
                await supabaseClient
                    .from("sessions")
                    .update({ is_active: false })
                    .eq("id", currentActiveSession.id);

            if (deactivateError) {

                throw deactivateError;

            }

        }


        const { error: insertError } =
            await supabaseClient
                .from("sessions")
                .insert({
                    school_id: AttendNGContext.schoolId,
                    name,
                    start_date: startDate,
                    is_active: true,
                    current_term: "1st Term"
                });

        if (insertError) {

            throw insertError;

        }


        nameInput.value =
            "";

        document.getElementById("newSessionStartDate").value =
            "";

        await loadActiveSession();

        logActivity("session.created", name, `Start date: ${startDate}`);

    }

    catch (error) {

        console.error(
            "Unable to start new session:",
            error
        );

        errorEl.textContent =
            error.message ||
            "Something went wrong starting the new session.";

        errorEl.style.display =
            "block";

    }

    finally {

        startBtn.disabled =
            false;

        startBtn.textContent =
            "Start session";

    }

}
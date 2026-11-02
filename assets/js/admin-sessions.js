/*************************************************
 * ADMIN-SESSIONS.JS
 *************************************************/

let currentActiveSession = null;


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    bindTermDropdown();

    bindNewSessionFold();

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

        updateNewSessionNote();

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

    syncTermUI();

    updateNewSessionNote();

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

    const startLabel =
        document.getElementById("startSessionLabel");

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

    startLabel.textContent =
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

        startLabel.textContent =
            "Start session";

    }

}


/* ==========================================
   STYLED TERM DROPDOWN
   The real <select id="termSelect"> stays in the page (hidden)
   and keeps doing the saving; this is just a nicer face for it.
========================================== */

function syncTermUI() {

    const select =
        document.getElementById("termSelect");

    const value =
        select.value;

    document.getElementById("termValue").textContent =
        value || "Choose a term";

    document.querySelectorAll("#termMenu .se-opt").forEach(
        option => {

            const selected =
                option.dataset.value === value;

            option.classList.toggle("is-selected", selected);

            option.setAttribute("aria-selected", String(selected));

        }
    );

    const step =
        select.selectedIndex + 1;

    document.querySelectorAll("#termSteps span").forEach(
        (segment, index) => {

            segment.classList.toggle("is-on", value !== "" && index < step);

        }
    );

}


function bindTermDropdown() {

    const select =
        document.getElementById("termSelect");

    const button =
        document.getElementById("termBtn");

    const menu =
        document.getElementById("termMenu");

    const options =
        Array.from(menu.querySelectorAll(".se-opt"));


    const close = (returnFocus) => {

        menu.hidden =
            true;

        button.setAttribute("aria-expanded", "false");

        if (returnFocus) {

            button.focus();

        }

    };

    const open = () => {

        menu.hidden =
            false;

        button.setAttribute("aria-expanded", "true");

        const selected =
            options.find(o => o.classList.contains("is-selected")) || options[0];

        selected.focus();

    };


    button.addEventListener(
        "click",
        (event) => {

            event.stopPropagation();

            if (menu.hidden) {

                open();

            }
            else {

                close(false);

            }

        }
    );

    button.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "ArrowDown" || event.key === "ArrowUp") {

                event.preventDefault();

                if (menu.hidden) {

                    open();

                }

            }

        }
    );


    options.forEach(
        option => {

            option.addEventListener(
                "click",
                (event) => {

                    event.stopPropagation();

                    const changed =
                        select.value !== option.dataset.value;

                    select.value =
                        option.dataset.value;

                    syncTermUI();

                    close(true);

                    // The existing handler on the select saves the new term.
                    if (changed) {

                        select.dispatchEvent(new Event("change", { bubbles: true }));

                    }

                }
            );

        }
    );

    menu.addEventListener(
        "keydown",
        (event) => {

            const index =
                options.indexOf(document.activeElement);

            if (event.key === "ArrowDown") {

                event.preventDefault();

                options[Math.min(index + 1, options.length - 1)].focus();

            }
            else if (event.key === "ArrowUp") {

                event.preventDefault();

                options[Math.max(index - 1, 0)].focus();

            }
            else if (event.key === "Home") {

                event.preventDefault();

                options[0].focus();

            }
            else if (event.key === "End") {

                event.preventDefault();

                options[options.length - 1].focus();

            }
            else if (event.key === "Escape") {

                event.preventDefault();

                close(true);

            }
            else if (event.key === "Tab") {

                close(false);

            }

        }
    );

    document.addEventListener(
        "click",
        () => {

            if (!menu.hidden) {

                close(false);

            }

        }
    );

}


/* ==========================================
   NEW-SESSION CARD (folds away on phones)
========================================== */

function bindNewSessionFold() {

    const toggle =
        document.getElementById("newSessionToggle");

    toggle.addEventListener(
        "click",
        () => {

            const open =
                document.getElementById("newSessionCard").classList.toggle("is-open");

            toggle.setAttribute("aria-expanded", String(open));

        }
    );

}


function updateNewSessionNote() {

    const fresh =
        "Classes are set up fresh for each session, so nothing carries over.";

    document.getElementById("newSessionNote").textContent =
        currentActiveSession ?
            `This closes ${currentActiveSession.name}. ${fresh}` :
            fresh;

}
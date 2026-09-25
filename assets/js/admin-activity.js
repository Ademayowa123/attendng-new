/*************************************************
 * ADMIN-ACTIVITY.JS
 *************************************************/

const PAGE_SIZE = 50;

let offset = 0;
let reachedEnd = false;
let loading = false;


// Human-readable label + badge color per action. Anything not
// listed here still renders (raw action string, muted badge)
// rather than being hidden — new action types show up safely
// even before this map is updated.

const ACTION_META = {

    "class.created": { label: "Class created", badge: "badge-success" },
    "class.renamed": { label: "Class renamed", badge: "badge-warning" },
    "class.deleted": { label: "Class deleted", badge: "badge-danger" },
    "class.teacher_assigned": { label: "Teacher assigned", badge: "badge-success" },
    "class.teacher_unassigned": { label: "Teacher unassigned", badge: "badge-warning" },
    "class.finalized": { label: "Register finalized", badge: "badge-warning" },
    "class.unlocked": { label: "Register unlocked", badge: "badge-success" },

    "teacher.created": { label: "Teacher added", badge: "badge-success" },
    "teacher.deleted": { label: "Teacher deleted", badge: "badge-danger" },
    "teacher.password_reset": { label: "Password reset", badge: "badge-warning" },
    "teacher.promoted": { label: "Promoted to admin", badge: "badge-success" },
    "teacher.demoted": { label: "Demoted to teacher", badge: "badge-warning" },

    "student.added": { label: "Student added", badge: "badge-success" },
    "student.edited": { label: "Student edited", badge: "badge-warning" },
    "student.deleted": { label: "Student deleted", badge: "badge-danger" },
    "student.moved": { label: "Student moved", badge: "badge-warning" },
    "student.imported": { label: "Students imported", badge: "badge-success" },

    "session.created": { label: "Session started", badge: "badge-success" },
    "session.start_date_changed": { label: "Start date changed", badge: "badge-warning" }

};


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    document.getElementById("schoolName").textContent =
        AttendNGContext.schoolName || "";

    document.getElementById("loadMoreBtn").addEventListener(
        "click",
        () => loadActivity(false)
    );

    await loadActivity(true);

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


async function loadActivity(isFirstPage) {

    if (loading || reachedEnd) {

        return;

    }

    loading =
        true;

    const loadMoreBtn =
        document.getElementById("loadMoreBtn");

    loadMoreBtn.disabled =
        true;

    loadMoreBtn.textContent =
        "Loading…";


    if (isFirstPage) {

        offset =
            0;

        reachedEnd =
            false;

        document.getElementById("activityTableBody").innerHTML =
            "";

    }


    const {
        data,
        error

    } =
        await supabaseClient
            .from("activity_log")
            .select("actor_name, action, target_name, detail, created_at")
            .eq("school_id", AttendNGContext.schoolId)
            .order("created_at", { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);


    loading =
        false;

    loadMoreBtn.disabled =
        false;

    loadMoreBtn.textContent =
        "Load more";


    if (error) {

        console.error(
            "Unable to load activity log:",
            error
        );

        return;

    }


    renderRows(data);

    offset +=
        data.length;

    if (data.length < PAGE_SIZE) {

        reachedEnd =
            true;

        loadMoreBtn.style.display =
            "none";

    }
    else {

        loadMoreBtn.style.display =
            "inline-flex";

    }


    const hasAnyRows =
        offset > 0;

    document.getElementById("activityEmpty").style.display =
        hasAnyRows ? "none" : "block";

}


function renderRows(rows) {

    const tbody =
        document.getElementById("activityTableBody");

    rows.forEach(
        row => {

            const meta =
                ACTION_META[row.action] ||
                { label: row.action, badge: "badge-muted" };


            const tr =
                document.createElement("tr");

            tr.style.borderBottom =
                "1px solid var(--border)";

            tr.innerHTML = `
                <td class="sticky-col1" style="padding:10px 8px; white-space:nowrap;">${formatDateTime(row.created_at)}</td>
                <td style="padding:10px 8px;">${escapeHtml(row.actor_name)}</td>
                <td style="padding:10px 8px;"><span class="badge ${meta.badge}">${escapeHtml(meta.label)}</span></td>
                <td style="padding:10px 8px;">${escapeHtml(row.target_name || "—")}</td>
                <td style="padding:10px 8px; color:var(--text-secondary);">${escapeHtml(row.detail || "—")}</td>
            `;

            tbody.appendChild(tr);

        }
    );

}


function formatDateTime(isoString) {

    const date =
        new Date(isoString);

    return date.toLocaleString(
        undefined,
        {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit"
        }
    );

}


function escapeHtml(value) {

    const div =
        document.createElement("div");

    div.textContent =
        value;

    return div.innerHTML;

}
/*************************************************
 * SCHOOL-DASHBOARD.JS
 *************************************************/

document.addEventListener("DOMContentLoaded", async () => {

    // auth.js's own DOMContentLoaded handler runs first in
    // script order and populates AttendNGContext before this
    // fires, since it's listed after auth.js in the <script>
    // tags — but to be safe, wait a tick for context to be
    // marked loaded.

    await waitForContext();


    if (AttendNGContext.classId) {

        document.getElementById("classSummary").style.display =
            "block";

        await loadClassStats();

    }
    else {

        document.getElementById("noClassNotice").style.display =
            "block";

    }

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


async function loadClassStats() {

    const {
        data: students,
        error

    } =
        await supabaseClient
            .from("students")
            .select("id, gender")
            .eq("class_id", AttendNGContext.classId);


    if (error) {

        console.error(
            "Unable to load class stats:",
            error
        );

        return;

    }


    const total =
        students.length;

    const male =
        students.filter(s => s.gender === "male").length;

    const female =
        students.filter(s => s.gender === "female").length;


    document.getElementById("statTotal").textContent =
        total;

    document.getElementById("statMale").textContent =
        male;

    document.getElementById("statFemale").textContent =
        female;

}

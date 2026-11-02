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


    // Genesis accounts have no class of their own — they get
    // a school-wide overview instead.

    if (AttendNGContext.isGenesis) {

        await loadSchoolOverview();

        return;

    }


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


/*************************************************
 * GENESIS: SCHOOL OVERVIEW
 *************************************************/

let overviewCharts = {};


async function loadSchoolOverview() {

    if (!AttendNGContext.sessionId) {

        document.getElementById("noSessionNotice").style.display =
            "block";

        return;

    }


    const [classesResult, staffResult] =
        await Promise.all([

            supabaseClient
                .from("classes")
                .select("id, name")
                .eq("session_id", AttendNGContext.sessionId),

            supabaseClient
                .from("school_members")
                .select("id", { count: "exact", head: true })
                .eq("school_id", AttendNGContext.schoolId)

        ]);


    if (classesResult.error || staffResult.error) {

        console.error(
            "Unable to load school overview:",
            classesResult.error || staffResult.error
        );

        return;

    }


    const classes =
        [...classesResult.data].sort(
            (a, b) => a.name.localeCompare(
                b.name,
                undefined,
                { numeric: true }
            )
        );

    const students =
        await fetchStudentsForClasses(
            classes.map(c => c.id)
        );

    if (students === null) {

        return;

    }


    const male =
        students.filter(s => s.gender === "male").length;

    const female =
        students.filter(s => s.gender === "female").length;

    const perClass =
        classes.map(
            c => students.filter(s => s.class_id === c.id).length
        );


    document.getElementById("overviewSession").textContent =
        AttendNGContext.sessionName;

    document.getElementById("overviewTerm").textContent =
        AttendNGContext.currentTerm;

    document.getElementById("ovStudents").textContent =
        students.length;

    document.getElementById("ovStaff").textContent =
        staffResult.count || 0;

    document.getElementById("ovClasses").textContent =
        classes.length;

    document.getElementById("schoolOverview").style.display =
        "block";


    renderGenderDoughnut(male, female);

    renderClassBars(
        classes.map(c => c.name),
        perClass
    );

}


// Supabase returns at most 1000 rows per request, so a large
// school is read in pages.

async function fetchStudentsForClasses(classIds) {

    if (classIds.length === 0) {

        return [];

    }

    const pageSize = 1000;

    let all = [];

    for (let from = 0; ; from += pageSize) {

        const { data, error } =
            await supabaseClient
                .from("students")
                .select("id, class_id, gender")
                .in("class_id", classIds)
                .order("id")
                .range(from, from + pageSize - 1);

        if (error) {

            console.error(
                "Unable to load students:",
                error
            );

            return null;

        }

        all = all.concat(data);

        if (data.length < pageSize) {

            return all;

        }

    }

}


function renderGenderDoughnut(male, female) {

    if (overviewCharts.gender) {

        overviewCharts.gender.destroy();

    }

    const canvas =
        document.getElementById("genderDoughnut");

    const empty =
        document.getElementById("genderEmpty");

    if (male + female === 0) {

        canvas.style.display = "none";

        empty.style.display = "flex";

        return;

    }

    canvas.style.display = "block";

    empty.style.display = "none";

    overviewCharts.gender =
        new Chart(canvas.getContext("2d"), {
            type: "doughnut",
            data: {
                labels: [
                    `Male (${male})`,
                    `Female (${female})`
                ],
                datasets: [{
                    data: [male, female],
                    backgroundColor: ["#2563eb", "#d97706"],
                    borderColor: "#ffffff",
                    borderWidth: 3,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "65%",
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: { usePointStyle: true, padding: 16 }
                    }
                }
            }
        });

}


function renderClassBars(labels, counts) {

    if (overviewCharts.classes) {

        overviewCharts.classes.destroy();

    }

    const canvas =
        document.getElementById("classBarChart");

    const empty =
        document.getElementById("classEmpty");

    if (labels.length === 0) {

        canvas.style.display = "none";

        empty.style.display = "flex";

        return;

    }

    canvas.style.display = "block";

    empty.style.display = "none";

    overviewCharts.classes =
        new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "Students",
                    data: counts,
                    backgroundColor: "#0f766e",
                    hoverBackgroundColor: "#0b5c56",
                    // Rounded on top only; flat on the bottom.
                    borderRadius: {
                        topLeft: 10,
                        topRight: 10,
                        bottomLeft: 0,
                        bottomRight: 0
                    },
                    borderSkipped: false,
                    maxBarThickness: 44
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 }
                    }
                }
            }
        });

}
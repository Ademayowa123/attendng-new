/*************************************************
 * ANALYTICS.JS
 *************************************************/

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

let sessionStartDate = null;
let students = [];
let selectedTerm = "";
let charts = {}; // keyed by canvas id, so we can destroy before re-creating


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    applyReportOverrideIfAny();

    await loadSessionStartDate();

    if (!sessionStartDate) {

        document.getElementById("noStartDateNotice").style.display =
            "block";

        return;

    }

    document.getElementById("analyticsWrapper").style.display =
        "block";

    document.getElementById("className").textContent =
        AttendNGContext.className || "";

    document.getElementById("sessionName").textContent =
        AttendNGContext.sessionName || "";


    selectedTerm =
        AttendNGContext.currentTerm || "1st Term";

    document.getElementById("analyticsTerm").value =
        selectedTerm;

    document.getElementById("analyticsTerm").addEventListener(
        "change",
        async (event) => {

            selectedTerm =
                event.target.value;

            await generateAnalytics();

        }
    );


    await loadStudents();

    await generateAnalytics();

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


/* ==========================================
   ADMIN CROSS-CLASS OVERRIDE
   (same mechanism as the report pages)
========================================== */

function applyReportOverrideIfAny() {

    const raw =
        sessionStorage.getItem("attendng_report_override");

    if (!raw) {

        return;

    }

    sessionStorage.removeItem("attendng_report_override");

    let override;

    try {

        override =
            JSON.parse(raw);

    }
    catch (e) {

        return;

    }

    const isOwnClass =
        override.classId === AttendNGContext.classId;

    AttendNGContext.classId = override.classId;
    AttendNGContext.className = override.className;
    AttendNGContext.sessionId = override.sessionId;
    AttendNGContext.sessionName = override.sessionName;
    AttendNGContext.currentTerm = override.currentTerm;
    AttendNGContext.classIsFinalized = override.classIsFinalized;
    AttendNGContext.schoolName = override.schoolName;

    if (isOwnClass) {

        return;

    }

    const banner =
        document.createElement("div");

    banner.className =
        "card";

    banner.style.marginBottom =
        "1rem";

    banner.innerHTML = `
        <a href="/school/admin/roster.html" style="font-size:13px;">
            <i class="fa-solid fa-arrow-left"></i> Back to ${override.className}
        </a>
        <span style="color:var(--text-muted); font-size:13px;"> — viewing as admin, not your own class</span>
    `;

    document.querySelector(".main-content").insertBefore(
        banner,
        document.querySelector(".top-header").nextSibling
    );

}


/* ==========================================
   DATE / WEEK HELPERS
========================================== */

async function loadSessionStartDate() {

    if (!AttendNGContext.sessionId) {

        return;

    }

    const { data, error } =
        await supabaseClient
            .from("sessions")
            .select("start_date")
            .eq("id", AttendNGContext.sessionId)
            .maybeSingle();

    if (error) {

        console.error("Unable to load session start date:", error);

        return;

    }

    sessionStartDate =
        (data && data.start_date) || null;

}


function weekNumberForDate(dateISO) {

    const start =
        new Date(sessionStartDate + "T00:00:00");

    const date =
        new Date(dateISO + "T00:00:00");

    const diffDays =
        Math.floor((date - start) / (1000 * 60 * 60 * 24));

    return Math.floor(diffDays / 7) + 1;

}


function dayNameForDate(dateISO) {

    const date =
        new Date(dateISO + "T00:00:00");

    const jsDay =
        date.getDay(); // 0=Sun..6=Sat

    const index =
        jsDay - 1; // 0=Mon..4=Fri

    return (index >= 0 && index <= 4) ? DAYS[index] : null;

}


async function loadStudents() {

    let query =
        supabaseClient
            .from("students")
            .select("id, surname, first_name, gender, position")
            .eq("class_id", AttendNGContext.classId);

    query =
        AttendNGContext.classIsFinalized ?
            query.order("position") :
            query.order("surname").order("first_name");

    const { data, error } =
        await query;

    if (error) {

        console.error("Unable to load students:", error);

        return;

    }

    students =
        data;

}


/* ==========================================
   CORE AGGREGATION
========================================== */

async function generateAnalytics() {

    let attendanceRows = [];

    if (students.length > 0) {

        const { data, error } =
            await supabaseClient
                .from("attendance")
                .select("student_id, date, morning_present, afternoon_present")
                .in("student_id", students.map(s => s.id))
                .eq("term", selectedTerm);

        if (error) {

            console.error("Unable to load attendance:", error);

        }
        else {

            attendanceRows =
                data;

        }

    }


    const weekNumbers =
        Array.from(new Set(attendanceRows.map(r => weekNumberForDate(r.date)))).sort((a, b) => a - b);


    let weeklySettingsMap =
        {};

    if (weekNumbers.length > 0) {

        const { data: settingsRows, error: settingsError } =
            await supabaseClient
                .from("weekly_settings")
                .select("week, school_opened")
                .eq("class_id", AttendNGContext.classId)
                .in("week", weekNumbers);

        if (!settingsError) {

            settingsRows.forEach(
                row => { weeklySettingsMap[row.week] = row.school_opened; }
            );

        }

    }


    const totalSchoolOpened =
        weekNumbers.reduce((sum, w) => sum + (weeklySettingsMap[w] || 0), 0);


    const studentStats =
        students.map(
            student => {

                const records =
                    attendanceRows.filter(r => r.student_id === student.id);

                let present = 0;

                records.forEach(
                    r => {

                        if (r.morning_present) present += 1;
                        if (r.afternoon_present) present += 1;

                    }
                );

                const percentage =
                    totalSchoolOpened > 0 ? (present / totalSchoolOpened) * 100 : 0;

                return {
                    id: student.id,
                    name: `${student.surname} ${student.first_name}`,
                    gender: student.gender,
                    present,
                    percentage
                };

            }
        );


    const weeklyBreakdown =
        weekNumbers.map(
            week => {

                const weekRows =
                    attendanceRows.filter(r => weekNumberForDate(r.date) === week);

                let totalAttendance = 0;

                weekRows.forEach(
                    r => {

                        if (r.morning_present) totalAttendance += 1;
                        if (r.afternoon_present) totalAttendance += 1;

                    }
                );

                const opened =
                    weeklySettingsMap[week] || 0;

                const percentage =
                    (students.length * opened) > 0 ?
                        (totalAttendance / (students.length * opened)) * 100 : 0;

                return { week, totalAttendance, opened, percentage };

            }
        );


    const dayStats =
        DAYS.map(
            day => {

                let present = 0;
                let weeksCounted = 0;

                weekNumbers.forEach(
                    week => {

                        const dayRows =
                            attendanceRows.filter(
                                r => weekNumberForDate(r.date) === week && dayNameForDate(r.date) === day
                            );

                        if (dayRows.length === 0) {

                            return;

                        }

                        weeksCounted += 1;

                        dayRows.forEach(
                            r => {

                                if (r.morning_present) present += 1;
                                if (r.afternoon_present) present += 1;

                            }
                        );

                    }
                );

                const percentage =
                    (students.length * weeksCounted * 2) > 0 ?
                        (present / (students.length * weeksCounted * 2)) * 100 : 0;

                return percentage;

            }
        );


    renderSummaryCards(studentStats);
    renderCharts(studentStats, weeklyBreakdown, dayStats);
    renderRankings(studentStats);
    renderWeeklyTable(weeklyBreakdown);
    renderInsights(studentStats, weeklyBreakdown);

}


/* ==========================================
   SUMMARY CARDS
========================================== */

function renderSummaryCards(studentStats) {

    const percentages =
        studentStats.map(s => s.percentage);

    const average =
        percentages.length > 0 ? percentages.reduce((a, b) => a + b, 0) / percentages.length : 0;

    const best =
        percentages.length > 0 ? Math.max(...percentages) : 0;

    const lowest =
        percentages.length > 0 ? Math.min(...percentages) : 0;

    const maleStats =
        studentStats.filter(s => s.gender === "male");

    const femaleStats =
        studentStats.filter(s => s.gender === "female");

    const maleAvg =
        maleStats.length > 0 ? maleStats.reduce((a, b) => a + b.percentage, 0) / maleStats.length : 0;

    const femaleAvg =
        femaleStats.length > 0 ? femaleStats.reduce((a, b) => a + b.percentage, 0) / femaleStats.length : 0;


    document.getElementById("cardTotalStudents").textContent = studentStats.length;
    document.getElementById("cardAverage").textContent = average.toFixed(1) + "%";
    document.getElementById("cardBest").textContent = best.toFixed(1) + "%";
    document.getElementById("cardLowest").textContent = lowest.toFixed(1) + "%";
    document.getElementById("cardMaleAvg").textContent = maleAvg.toFixed(1) + "%";
    document.getElementById("cardFemaleAvg").textContent = femaleAvg.toFixed(1) + "%";

}


/* ==========================================
   CHARTS
========================================== */

function renderCharts(studentStats, weeklyBreakdown, dayStats) {

    renderChart(
        "weeklyTrendChart", "line",
        {
            labels: weeklyBreakdown.map(w => `Week ${w.week}`),
            datasets: [{
                label: "Attendance %",
                data: weeklyBreakdown.map(w => w.percentage.toFixed(1)),
                borderColor: "#0f766e",
                backgroundColor: "rgba(15,118,110,0.1)",
                fill: true,
                tension: 0.3
            }]
        },
        { scales: { y: { min: 0, max: 100 } } }
    );

    const maleStats = studentStats.filter(s => s.gender === "male");
    const femaleStats = studentStats.filter(s => s.gender === "female");
    const maleAvg = maleStats.length > 0 ? maleStats.reduce((a, b) => a + b.percentage, 0) / maleStats.length : 0;
    const femaleAvg = femaleStats.length > 0 ? femaleStats.reduce((a, b) => a + b.percentage, 0) / femaleStats.length : 0;

    renderChart(
        "genderChart", "bar",
        {
            labels: ["Male", "Female"],
            datasets: [{
                label: "Average Attendance %",
                data: [maleAvg.toFixed(1), femaleAvg.toFixed(1)],
                backgroundColor: ["#2563eb", "#db2777"]
            }]
        },
        { scales: { y: { min: 0, max: 100 } } }
    );


    const buckets = { Excellent: 0, Good: 0, Fair: 0, Poor: 0 };

    studentStats.forEach(
        s => { buckets[statusFor(s.percentage)] += 1; }
    );

    renderChart(
        "distributionChart", "doughnut",
        {
            labels: Object.keys(buckets),
            datasets: [{
                data: Object.values(buckets),
                backgroundColor: ["#16a34a", "#0f766e", "#eab308", "#dc2626"]
            }]
        },
        {}
    );


    renderChart(
        "dayOfWeekChart", "bar",
        {
            labels: DAY_LABELS,
            datasets: [{
                label: "Attendance %",
                data: dayStats.map(d => d.toFixed(1)),
                backgroundColor: "#0f766e"
            }]
        },
        { scales: { y: { min: 0, max: 100 } } }
    );

}


function renderChart(canvasId, type, data, extraOptions) {

    if (charts[canvasId]) {

        charts[canvasId].destroy();

    }

    const ctx =
        document.getElementById(canvasId).getContext("2d");

    charts[canvasId] =
        new Chart(ctx, {
            type,
            data,
            options: {
                responsive: true,
                plugins: { legend: { display: type === "doughnut" } },
                ...extraOptions
            }
        });

}


/* ==========================================
   STATUS / RANKINGS
========================================== */

function statusFor(percentage) {

    if (percentage >= 95) return "Excellent";
    if (percentage >= 80) return "Good";
    if (percentage >= 60) return "Fair";
    return "Poor";

}


function renderRankings(studentStats) {

    const sortedDesc =
        [...studentStats].sort((a, b) => b.present - a.present);

    const sortedAsc =
        [...studentStats].sort((a, b) => a.present - b.present);

    fillRankingTable("topRankingBody", sortedDesc.slice(0, 5));
    fillRankingTable("lowestRankingBody", sortedAsc.slice(0, 5));

    const below75 =
        [...studentStats].filter(s => s.percentage < 75).sort((a, b) => a.percentage - b.percentage);

    const below50 =
        [...studentStats].filter(s => s.percentage < 50).sort((a, b) => a.percentage - b.percentage);

    fillAlertTable("below75Body", below75);
    fillAlertTable("below50Body", below50);

}


function fillRankingTable(tbodyId, list) {

    const tbody =
        document.getElementById(tbodyId);

    tbody.innerHTML =
        list.length === 0 ?
            `<tr><td colspan="3" style="padding:8px 4px; color:var(--text-muted);">No data yet.</td></tr>` :
            "";

    list.forEach(
        (row, index) => {

            const tr =
                document.createElement("tr");

            tr.style.borderBottom =
                "1px solid var(--border)";

            tr.innerHTML = `
                <td style="padding:6px 4px;">${index + 1}</td>
                <td style="padding:6px 4px;">${row.name}</td>
                <td style="padding:6px 4px; text-align:right;">${row.present}</td>
            `;

            tbody.appendChild(tr);

        }
    );

}


function fillAlertTable(tbodyId, list) {

    const tbody =
        document.getElementById(tbodyId);

    tbody.innerHTML =
        list.length === 0 ?
            `<tr><td colspan="2" style="padding:8px 4px; color:var(--text-muted);">None — nice work.</td></tr>` :
            "";

    list.forEach(
        row => {

            const tr =
                document.createElement("tr");

            tr.style.borderBottom =
                "1px solid var(--border)";

            tr.innerHTML = `
                <td style="padding:6px 4px;">${row.name}</td>
                <td style="padding:6px 4px; text-align:right;">${row.percentage.toFixed(1)}%</td>
            `;

            tbody.appendChild(tr);

        }
    );

}


function renderWeeklyTable(weeklyBreakdown) {

    const tbody =
        document.getElementById("weeklyAnalysisBody");

    tbody.innerHTML =
        weeklyBreakdown.length === 0 ?
            `<tr><td colspan="3" style="padding:8px 4px; color:var(--text-muted);">No data yet.</td></tr>` :
            "";

    weeklyBreakdown.forEach(
        w => {

            const tr =
                document.createElement("tr");

            tr.style.borderBottom =
                "1px solid var(--border)";

            tr.innerHTML = `
                <td style="padding:6px 4px;">Week ${w.week}</td>
                <td style="padding:6px 4px; text-align:center;">${w.totalAttendance}</td>
                <td style="padding:6px 4px; text-align:center;">${w.percentage.toFixed(1)}%</td>
            `;

            tbody.appendChild(tr);

        }
    );

}


/* ==========================================
   AUTO-GENERATED INSIGHTS
========================================== */

function renderInsights(studentStats, weeklyBreakdown) {

    const insights =
        [];

    if (studentStats.length === 0 || weeklyBreakdown.length === 0) {

        insights.push("Not enough data yet to generate insights for this term.");

        renderInsightsList(insights);

        return;

    }

    const average =
        studentStats.reduce((a, b) => a + b.percentage, 0) / studentStats.length;

    insights.push(
        `Class average attendance this term is ${average.toFixed(1)}%.`
    );


    const below50Count =
        studentStats.filter(s => s.percentage < 50).length;

    if (below50Count > 0) {

        insights.push(
            `${below50Count} student${below50Count === 1 ? "" : "s"} ${below50Count === 1 ? "has" : "have"} critical attendance below 50% — worth a follow-up.`
        );

    }


    const bestWeek =
        [...weeklyBreakdown].sort((a, b) => b.percentage - a.percentage)[0];

    const worstWeek =
        [...weeklyBreakdown].sort((a, b) => a.percentage - b.percentage)[0];

    if (bestWeek && worstWeek && bestWeek.week !== worstWeek.week) {

        insights.push(
            `Week ${bestWeek.week} had the best attendance (${bestWeek.percentage.toFixed(1)}%), while Week ${worstWeek.week} had the lowest (${worstWeek.percentage.toFixed(1)}%).`
        );

    }


    if (weeklyBreakdown.length >= 4) {

        const midpoint =
            Math.floor(weeklyBreakdown.length / 2);

        const firstHalf =
            weeklyBreakdown.slice(0, midpoint);

        const secondHalf =
            weeklyBreakdown.slice(midpoint);

        const firstAvg =
            firstHalf.reduce((a, b) => a + b.percentage, 0) / firstHalf.length;

        const secondAvg =
            secondHalf.reduce((a, b) => a + b.percentage, 0) / secondHalf.length;

        const diff =
            secondAvg - firstAvg;

        if (Math.abs(diff) >= 5) {

            insights.push(
                diff > 0 ?
                    `Attendance has been trending upward — up ${diff.toFixed(1)} points across the term so far.` :
                    `Attendance has been trending downward — down ${Math.abs(diff).toFixed(1)} points across the term so far.`
            );

        }
        else {

            insights.push("Attendance has stayed fairly steady across the term so far.");

        }

    }


    const maleStats = studentStats.filter(s => s.gender === "male");
    const femaleStats = studentStats.filter(s => s.gender === "female");

    if (maleStats.length > 0 && femaleStats.length > 0) {

        const maleAvg = maleStats.reduce((a, b) => a + b.percentage, 0) / maleStats.length;
        const femaleAvg = femaleStats.reduce((a, b) => a + b.percentage, 0) / femaleStats.length;
        const genderGap = Math.abs(maleAvg - femaleAvg);

        if (genderGap >= 10) {

            insights.push(
                maleAvg > femaleAvg ?
                    `Boys are attending noticeably more than girls this term (${genderGap.toFixed(1)} point gap).` :
                    `Girls are attending noticeably more than boys this term (${genderGap.toFixed(1)} point gap).`
            );

        }

    }


    renderInsightsList(insights);

}


function renderInsightsList(insights) {

    const container =
        document.getElementById("insightsList");

    container.innerHTML =
        "";

    insights.forEach(
        text => {

            const item =
                document.createElement("div");

            item.style.display =
                "flex";

            item.style.gap =
                "8px";

            item.style.alignItems =
                "flex-start";

            item.innerHTML = `
                <i class="fa-solid fa-circle-dot" style="color:var(--primary); font-size:6px; margin-top:6px;"></i>
                <span>${text}</span>
            `;

            container.appendChild(item);

        }
    );

}
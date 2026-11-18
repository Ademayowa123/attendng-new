/*************************************************
 * ANALYTICS.JS
 *************************************************/

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

let sessionStartDate = null;
let students = [];
let selectedTerm = "";
let analyticsData = null;       // everything the page draws, kept so it can be re-drawn on resize
let followTab = "75";            // "75" | "50"
let followExpanded = false;
const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// Term attendance status thresholds (percent) — same as the term report.
const ANALYTICS_THRESHOLDS = { excellent: 95, good: 80, fair: 60 };


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

    setAnalyticsHeader();

    initAnalyticsUI();

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

        try {

            attendanceRows =
                await fetchPaged(
                    () => supabaseClient
                        .from("attendance")
                        .select("student_id, date, morning_present, afternoon_present")
                        .in("student_id", students.map(s => s.id))
                        .eq("term", selectedTerm)
                        .order("student_id")
                        .order("date")
                );

        }
        catch (error) {

            console.error("Unable to load attendance:", error);

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


    analyticsData = {
        studentStats,
        weeklyBreakdown,
        dayStats,
        totalSchoolOpened,
        weekNumbers
    };

    followExpanded = false;

    renderAnalytics();

}


/* ==========================================
   SMALL HELPERS
========================================== */

function byId(id) {

    return document.getElementById(id);

}


function anEscape(value) {

    const text =
        (value === null || value === undefined) ? "" : String(value);

    return text.replace(
        /[&<>"']/g,
        ch => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        }[ch])
    );

}


function anHash(text) {

    let sum = 0;

    String(text || "").split("").forEach(
        ch => { sum += ch.charCodeAt(0); }
    );

    return sum;

}


function fmtPct(value) {

    const rounded =
        Math.round(value * 10) / 10;

    return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + "%";

}


function plural(count, singular, pluralWord) {

    return count === 1 ? singular : (pluralWord || singular + "s");

}


function statusFor(percentage) {

    if (percentage >= ANALYTICS_THRESHOLDS.excellent) return "Excellent";
    if (percentage >= ANALYTICS_THRESHOLDS.good) return "Good";
    if (percentage >= ANALYTICS_THRESHOLDS.fair) return "Fair";
    return "Poor";

}


function statusClass(status) {

    return status === "Excellent" ? "an-ex" :
        status === "Good" ? "an-go" :
        status === "Fair" ? "an-fa" :
        "an-po";

}


/* ==========================================
   HEADER + CONTROLS
========================================== */

function setAnalyticsHeader() {

    const name =
        AttendNGContext.className || "";

    const tones =
        ["an-tone-teal", "an-tone-indigo", "an-tone-amber"];

    const digits =
        name.match(/\d+/);

    const tone =
        digits ?
            tones[(((parseInt(digits[0], 10) - 1) % 3) + 3) % 3] :
            tones[anHash(name) % 3];

    const tile =
        byId("classTile");

    tile.textContent =
        name;

    tile.className =
        "an-tile " + tone;

    byId("className").textContent =
        name;

    byId("sessionName").textContent =
        AttendNGContext.sessionName || "";

    byId("termText").textContent =
        selectedTerm;

}


function syncTermUI() {

    const term =
        byId("analyticsTerm").value;

    document.querySelectorAll("#termSeg .an-tbtn").forEach(
        button => {

            const on =
                button.dataset.value === term;

            button.classList.toggle("is-on", on);

            button.setAttribute("aria-pressed", String(on));

        }
    );

    byId("termText").textContent =
        term;

}


function initAnalyticsUI() {

    const select =
        byId("analyticsTerm");

    const current =
        AttendNGContext.currentTerm || "";

    byId("termSeg").innerHTML =
        Array.from(select.options).map(
            option => `
                <button type="button" class="an-tbtn" data-value="${anEscape(option.value)}" aria-pressed="false">
                    ${anEscape(option.textContent)}${option.value === current ? `<span class="an-tdot" title="Current term"></span>` : ""}
                </button>
            `
        ).join("");

    byId("termSeg").addEventListener(
        "click",
        (event) => {

            const button =
                event.target.closest(".an-tbtn");

            if (!button || select.value === button.dataset.value) {

                return;

            }

            select.value =
                button.dataset.value;

            syncTermUI();

            // The existing handler on the select loads that term's numbers.
            select.dispatchEvent(new Event("change", { bubbles: true }));

        }
    );

    syncTermUI();


    // "Students to follow up": below 75% / below 50%
    document.querySelector(".an-tabs").addEventListener(
        "click",
        (event) => {

            const tab =
                event.target.closest(".an-tab");

            if (!tab) {

                return;

            }

            followTab =
                tab.dataset.tab;

            followExpanded =
                false;

            renderFollowUp();

        }
    );

    byId("followMore").addEventListener(
        "click",
        () => {

            followExpanded =
                !followExpanded;

            renderFollowUp();

        }
    );


    // A week in the strip opens that week's report
    byId("weekStrip").addEventListener(
        "click",
        (event) => {

            const cell =
                event.target.closest(".an-cell");

            if (!cell) {

                return;

            }

            sessionStorage.setItem(
                "attendng_report_override",
                JSON.stringify({
                    classId: AttendNGContext.classId,
                    className: AttendNGContext.className,
                    sessionId: AttendNGContext.sessionId,
                    sessionName: AttendNGContext.sessionName,
                    currentTerm: selectedTerm,
                    classIsFinalized: AttendNGContext.classIsFinalized,
                    schoolName: AttendNGContext.schoolName
                })
            );

            sessionStorage.setItem("attendng_report_week", cell.dataset.week);

            window.location.href =
                "/school/report-weekly.html";

        }
    );


    // Save as PDF = the browser's print dialog, with a clean print layout
    byId("pdfBtn").addEventListener(
        "click",
        () => {

            const originalTitle =
                document.title;

            document.title =
                "Powered by AttendNG";

            window.addEventListener(
                "afterprint",
                () => {

                    document.title =
                        originalTitle;

                },
                { once: true }
            );

            window.print();

        }
    );


    // Charts are drawn to fit their box, so redraw when it changes size.
    let resizeTimer = null;

    window.addEventListener(
        "resize",
        () => {

            clearTimeout(resizeTimer);

            resizeTimer =
                setTimeout(renderTrend, 150);

        }
    );

}


/* ==========================================
   RENDER EVERYTHING
========================================== */

function renderAnalytics() {

    const d =
        analyticsData;

    syncTermUI();

    const weeks =
        d.weekNumbers.length;

    byId("weeksText").textContent =
        weeks > 0 ?
            ` · ${weeks} week${weeks === 1 ? "" : "s"} recorded · ${d.studentStats.length} student${d.studentStats.length === 1 ? "" : "s"}` :
            "";


    // print header (only visible when printing / saving as PDF)
    byId("printTitle").textContent =
        `${AttendNGContext.schoolName} — Term Attendance Analytics`;

    byId("printMeta").textContent =
        `${AttendNGContext.className} · ${AttendNGContext.sessionName} · ${selectedTerm}`;

    const printHeaderEl =
        byId("printHeader");

    if (AttendNGContext.schoolLogoUrl) {

        byId("printLogo").src =
            AttendNGContext.schoolLogoUrl;

        printHeaderEl.classList.add("has-logo");

    }
    else {

        printHeaderEl.classList.remove("has-logo");

    }


    // nothing to analyse yet
    const empty =
        byId("anEmpty");

    const content =
        byId("anContent");

    const notice =
        byId("openedNotice");

    notice.hidden =
        true;

    if (d.studentStats.length === 0 || weeks === 0) {

        byId("anEmptyTitle").textContent =
            d.studentStats.length === 0 ?
                "No students in this class yet" :
                `No attendance recorded for ${selectedTerm} yet`;

        byId("anEmptyText").textContent =
            d.studentStats.length === 0 ?
                "Add students to the class, then record attendance." :
                "Record attendance and the insights will appear here.";

        byId("anEmptyLink").hidden =
            d.studentStats.length === 0;

        empty.hidden =
            false;

        content.hidden =
            true;

        return;

    }

    empty.hidden =
        true;

    content.hidden =
        false;

    if (d.totalSchoolOpened === 0) {

        byId("openedNoticeText").textContent =
            `Times school opened isn't set for the weeks recorded in ${selectedTerm}, so attendance shows 0%.`;

        notice.hidden =
            false;

    }

    renderInsights();
    renderKpis();
    renderTrend();
    renderDays();
    renderStatus();
    renderFollowUp();
    renderTop();
    renderStrip();

}


/* ==========================================
   INSIGHTS (what to look at first)
========================================== */

function buildInsights(d) {

    const stats =
        d.studentStats;

    const weekly =
        d.weeklyBreakdown;

    const list =
        [];

    // students in real trouble
    const below50 =
        stats.filter(s => s.percentage < 50).length;

    if (below50 > 0 && d.totalSchoolOpened > 0) {

        list.push({
            tone: "bad",
            icon: "fa-user-clock",
            title: `${below50} ${plural(below50, "student needs", "students need")} follow-up`,
            text: `${below50} ${plural(below50, "is", "are")} below 50% for the term.`
        });

    }

    // best / worst week
    const bestWeek =
        [...weekly].sort((a, b) => b.percentage - a.percentage)[0];

    const worstWeek =
        [...weekly].sort((a, b) => a.percentage - b.percentage)[0];

    if (bestWeek && worstWeek && bestWeek.week !== worstWeek.week) {

        list.push({
            tone: "warn",
            icon: "fa-arrow-trend-down",
            title: `Lowest week: Week ${worstWeek.week}`,
            text: `Attendance fell to ${fmtPct(worstWeek.percentage)} (best was Week ${bestWeek.week} at ${fmtPct(bestWeek.percentage)}).`
        });

    }

    // weakest day
    const days =
        d.dayStats
            .map((value, index) => ({ index, value }))
            .filter(x => x.value > 0);

    if (days.length >= 2) {

        const low =
            days.reduce((a, b) => (b.value < a.value ? b : a));

        const high =
            days.reduce((a, b) => (b.value > a.value ? b : a));

        if (high.value - low.value >= 5) {

            list.push({
                tone: "warn",
                icon: "fa-calendar-day",
                title: `${FULL_DAYS[low.index]}s are weakest`,
                text: `${fmtPct(low.value)} on ${FULL_DAYS[low.index]}s, ${Math.round(high.value - low.value)} points below ${FULL_DAYS[high.index]}s.`
            });

        }

    }

    // direction across the term
    if (weekly.length >= 4) {

        const midpoint =
            Math.floor(weekly.length / 2);

        const first =
            weekly.slice(0, midpoint);

        const second =
            weekly.slice(midpoint);

        const diff =
            second.reduce((a, b) => a + b.percentage, 0) / second.length -
            first.reduce((a, b) => a + b.percentage, 0) / first.length;

        if (diff >= 5) {

            list.push({
                tone: "good",
                icon: "fa-arrow-trend-up",
                title: "Trending up",
                text: `Up ${diff.toFixed(1)} points across the term so far.`
            });

        }
        else if (diff <= -5) {

            list.push({
                tone: "bad",
                icon: "fa-arrow-trend-down",
                title: "Trending down",
                text: `Down ${Math.abs(diff).toFixed(1)} points across the term so far.`
            });

        }
        else {

            list.push({
                tone: "info",
                icon: "fa-minus",
                title: "Steady attendance",
                text: "Fairly steady across the term so far."
            });

        }

    }

    // gender gap
    const male =
        stats.filter(s => s.gender === "male");

    const female =
        stats.filter(s => s.gender === "female");

    if (male.length > 0 && female.length > 0) {

        const maleAvg =
            male.reduce((a, b) => a + b.percentage, 0) / male.length;

        const femaleAvg =
            female.reduce((a, b) => a + b.percentage, 0) / female.length;

        const gap =
            Math.abs(maleAvg - femaleAvg);

        if (gap >= 10) {

            list.push({
                tone: "info",
                icon: "fa-venus-mars",
                title: `${maleAvg > femaleAvg ? "Male" : "Female"} students attend more`,
                text: `A ${gap.toFixed(1)} point gap between male and female students.`
            });

        }

    }

    if (list.length === 0) {

        const average =
            stats.reduce((a, b) => a + b.percentage, 0) / stats.length;

        list.push({
            tone: "good",
            icon: "fa-circle-check",
            title: "Nothing needs attention",
            text: `Class average attendance is ${fmtPct(average)} this term.`
        });

    }

    return list.slice(0, 4);

}


function renderInsights() {

    byId("insightsList").innerHTML =
        buildInsights(analyticsData).map(
            item => `
                <div class="an-ins">
                    <span class="an-ico an-ico-${item.tone}"><i class="fa-solid ${item.icon}" aria-hidden="true"></i></span>
                    <div><b>${anEscape(item.title)}</b><span>${anEscape(item.text)}</span></div>
                </div>
            `
        ).join("");

}


/* ==========================================
   KEY NUMBERS
========================================== */

function renderKpis() {

    const d =
        analyticsData;

    const stats =
        d.studentStats;

    const percentages =
        stats.map(s => s.percentage);

    const average =
        percentages.reduce((a, b) => a + b, 0) / percentages.length;

    const best =
        Math.max(...percentages);

    const lowest =
        Math.min(...percentages);

    byId("kpiAvg").textContent =
        fmtPct(average);


    // change since the previous recorded week
    const delta =
        byId("kpiDelta");

    const weekly =
        d.weeklyBreakdown;

    if (weekly.length >= 2 && d.totalSchoolOpened > 0) {

        const change =
            weekly[weekly.length - 1].percentage - weekly[weekly.length - 2].percentage;

        const flat =
            Math.abs(change) < 0.05;

        delta.className =
            "an-delta " + (flat ? "an-delta-flat" : change > 0 ? "an-delta-up" : "an-delta-down");

        delta.innerHTML =
            flat ?
                "no change" :
                `<i class="fa-solid ${change > 0 ? "fa-arrow-up" : "fa-arrow-down"}" aria-hidden="true"></i>${Math.abs(change).toFixed(1)}`;

        delta.hidden =
            false;

        byId("kpiAvgNote").textContent =
            `vs. previous week (Week ${weekly[weekly.length - 2].week})`;

    }
    else {

        delta.hidden =
            true;

        byId("kpiAvgNote").textContent =
            "across the term";

    }

    byId("kpiBest").textContent =
        fmtPct(best);

    const atBest =
        stats.filter(s => s.percentage >= best - 0.05).length;

    byId("kpiBestNote").textContent =
        `${atBest} ${plural(atBest, "student")} at this level`;

    byId("kpiLow").textContent =
        fmtPct(lowest);

    const atLowest =
        stats.filter(s => s.percentage <= lowest + 0.05);

    byId("kpiLowNote").textContent =
        atLowest.length === 1 ?
            atLowest[0].name :
            `${atLowest[0].name} and ${atLowest.length - 1} ${plural(atLowest.length - 1, "other")}`;


    [["male", "kpiMale", "maleBar"], ["female", "kpiFemale", "femaleBar"]].forEach(
        ([gender, textId, barId]) => {

            const group =
                stats.filter(s => s.gender === gender);

            const value =
                group.length > 0 ?
                    group.reduce((a, b) => a + b.percentage, 0) / group.length :
                    null;

            byId(textId).textContent =
                value === null ? "–" : fmtPct(value);

            byId(barId).style.width =
                value === null ? "0%" : Math.min(100, value) + "%";

        }
    );

}


/* ==========================================
   CHARTS (plain SVG / CSS — no chart library)
========================================== */

function renderTrend() {

    const host =
        byId("trendChart");

    if (!analyticsData || !host || host.offsetParent === null) {

        return;

    }

    const weekly =
        analyticsData.weeklyBreakdown;

    if (weekly.length === 0) {

        host.innerHTML =
            "";

        return;

    }

    const width =
        Math.max(240, Math.round(host.clientWidth));

    const height =
        width < 360 ? 150 : 190;

    const pad =
        width < 360 ? 18 : 24;

    const values =
        weekly.map(w => w.percentage);

    const floor =
        Math.max(0, Math.floor((Math.min(...values, 75) - 10) / 10) * 10);

    const plotHeight =
        height - pad - 22;

    const xFor = (i) =>
        weekly.length === 1 ?
            width / 2 :
            pad + i * ((width - pad * 2) / (weekly.length - 1));

    const yFor = (v) =>
        pad + plotHeight - ((Math.min(100, Math.max(floor, v)) - floor) / (100 - floor)) * plotHeight;

    const points =
        weekly.map((w, i) => [xFor(i), yFor(w.percentage)]);

    const line =
        points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");

    const baseline =
        pad + plotHeight;

    const area =
        `${line} L${points[points.length - 1][0].toFixed(1)} ${baseline} L${points[0][0].toFixed(1)} ${baseline} Z`;

    const targetY =
        yFor(75);

    const lowest =
        Math.min(...values);

    let svg =
        `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Weekly attendance trend, lowest in week ${weekly[values.indexOf(lowest)].week} at ${Math.round(lowest)} percent">` +
        `<line x1="${pad}" x2="${width - pad}" y1="${targetY.toFixed(1)}" y2="${targetY.toFixed(1)}" stroke="#94a3b8" stroke-dasharray="4 4" stroke-width="1"/>` +
        (weekly.length > 1 ? `<path d="${area}" fill="rgba(15,118,110,0.12)"/>` : "") +
        (weekly.length > 1 ? `<path d="${line}" fill="none" stroke="#0f766e" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>` : "");

    points.forEach(
        (p, i) => {

            const isLow =
                weekly.length > 1 && values[i] === lowest;

            svg +=
                `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${isLow ? 5 : 3.5}" fill="${isLow ? "#ef4444" : "#0f766e"}"/>`;

            if (isLow || i === 0 || i === weekly.length - 1) {

                svg +=
                    `<text x="${p[0].toFixed(1)}" y="${(p[1] - 9).toFixed(1)}" font-size="11" text-anchor="middle" fill="${isLow ? "#ef4444" : "#64748b"}">${Math.round(values[i])}%</text>`;

            }

            svg +=
                `<text x="${p[0].toFixed(1)}" y="${height - 4}" font-size="11" text-anchor="middle" fill="#64748b">W${weekly[i].week}</text>`;

        }
    );

    host.innerHTML =
        svg + "</svg>";

}


function renderDays() {

    const values =
        analyticsData.dayStats;

    const withData =
        values.filter(v => v > 0);

    const min =
        withData.length > 1 ? Math.min(...withData) : null;

    const max =
        withData.length > 1 ? Math.max(...withData) : null;

    byId("dayHint").textContent =
        min !== null && max !== min ? "lowest day in red" : "";

    byId("dayBars").innerHTML =
        DAY_LABELS.map(
            (label, i) => {

                const value =
                    values[i];

                const tone =
                    value <= 0 ? "" :
                    (min !== null && max !== min && value === min) ? "an-po" :
                    (min !== null && max !== min && value === max) ? "an-ex" :
                    "an-dim";

                return `
                    <div class="an-drow">
                        <span>${label}</span>
                        <span class="an-bar"><i class="${tone}" style="width:${value > 0 ? Math.min(100, value) : 0}%"></i></span>
                        <b>${value > 0 ? fmtPct(value) : "–"}</b>
                    </div>
                `;

            }
        ).join("");

}


function renderStatus() {

    const statuses =
        ["Excellent", "Good", "Fair", "Poor"];

    const counts = {};

    statuses.forEach(status => { counts[status] = 0; });

    analyticsData.studentStats.forEach(s => { counts[statusFor(s.percentage)] += 1; });

    const t =
        ANALYTICS_THRESHOLDS;

    byId("statusHint").textContent =
        `Excellent ${t.excellent}%+ · Good ${t.good}%+ · Fair ${t.fair}%+ · Poor below ${t.fair}%`;

    byId("statusBar").innerHTML =
        statuses
            .filter(status => counts[status] > 0)
            .map(status => `<span class="${statusClass(status)}" style="flex:${counts[status]} 1 0" title="${status}: ${counts[status]}"></span>`)
            .join("");

    byId("statusBar").setAttribute(
        "aria-label",
        "Status breakdown: " + statuses.map(status => `${status} ${counts[status]}`).join(", ")
    );

    byId("statusLegend").innerHTML =
        statuses.map(
            status => `<span><i class="an-dot ${statusClass(status)}"></i>${status} <b>${counts[status]}</b></span>`
        ).join("");

}


/* ==========================================
   LISTS
========================================== */

function studentRowHtml(row, extra) {

    const initials =
        row.name.split(" ").filter(Boolean).slice(0, 2).map(w => w.charAt(0)).join("").toUpperCase() || "?";

    return `
        <div class="an-row"${extra && extra.hidden ? " hidden" : ""}>
            ${extra && extra.rank ? `<span class="an-rank">${extra.rank}</span>` : `<span class="an-av an-av-${anHash(row.name) % 5}" aria-hidden="true">${anEscape(initials)}</span>`}
            <span class="an-name">${anEscape(row.name)}</span>
            ${extra && extra.bar ? `<span class="an-bar"><i class="${statusClass(statusFor(row.percentage))}" style="width:${Math.min(100, row.percentage)}%"></i></span>` : ""}
            <b>${fmtPct(row.percentage)}</b>
        </div>
    `;

}


function renderFollowUp() {

    const stats =
        analyticsData.studentStats;

    const enabled =
        analyticsData.totalSchoolOpened > 0;

    const below75 =
        enabled ? stats.filter(s => s.percentage < 75).sort((a, b) => a.percentage - b.percentage) : [];

    const below50 =
        enabled ? stats.filter(s => s.percentage < 50).sort((a, b) => a.percentage - b.percentage) : [];

    byId("tab75").textContent =
        below75.length;

    byId("tab50").textContent =
        below50.length;

    document.querySelectorAll(".an-tab").forEach(
        tab => {

            const on =
                tab.dataset.tab === followTab;

            tab.classList.toggle("is-on", on);

            tab.setAttribute("aria-pressed", String(on));

        }
    );

    const list =
        followTab === "50" ? below50 : below75;

    const LIMIT =
        5;

    byId("followList").innerHTML =
        list.length === 0 ?
            `<p class="an-none">None — nice work.</p>` :
            list.map(
                (row, index) => studentRowHtml(row, { bar: true, hidden: !followExpanded && index >= LIMIT })
            ).join("");

    const more =
        byId("followMore");

    if (list.length > LIMIT) {

        more.textContent =
            followExpanded ? "Show fewer" : `Show all ${list.length} ›`;

        more.hidden =
            false;

    }
    else {

        more.hidden =
            true;

    }

}


function renderTop() {

    const top =
        [...analyticsData.studentStats]
            .sort((a, b) => b.present - a.present)
            .slice(0, 5);

    byId("topList").innerHTML =
        top.length === 0 ?
            `<p class="an-none">No data yet.</p>` :
            top.map((row, index) => studentRowHtml(row, { rank: index + 1 })).join("");

}


function renderStrip() {

    byId("weekStrip").innerHTML =
        analyticsData.weeklyBreakdown.map(
            w => `
                <button type="button" class="an-cell ${statusClass(statusFor(w.percentage))}" data-week="${w.week}" title="Open the Week ${w.week} report" aria-label="Week ${w.week}, ${fmtPct(w.percentage)}. Open the report.">
                    W${w.week}<b>${fmtPct(w.percentage)}</b>
                </button>
            `
        ).join("");

}


/* ==========================================
   PAGED FETCH
   The database returns at most 1000 rows per request, and a
   whole term of attendance for a class is far more than that
   (students × days). Without paging, the later rows were silently
   dropped, so some students' attendance came out too low.
   Same helper broadsheet.js / report-card.js / ratings.js use.
========================================== */

async function fetchPaged(makeQuery) {

    const PAGE =
        1000;

    let all =
        [];

    let from =
        0;

    while (true) {

        const { data, error } =
            await makeQuery().range(from, from + PAGE - 1);

        if (error) {

            throw error;

        }

        all =
            all.concat(data);

        if (data.length < PAGE) {

            return all;

        }

        from += PAGE;

    }

}
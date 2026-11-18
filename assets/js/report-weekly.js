/*************************************************
 * REPORT-WEEKLY.JS
 *************************************************/

let sessionStartDate = null;
let currentWeek = 1;
let students = [];
let reportRows = [];
let schoolOpened = 0;

// Weekly attendance status thresholds (percent). One place, used by the
// status labels, the legend and the "below 75%" strip.
const WEEKLY_THRESHOLDS = { excellent: 90, good: 75, fair: 50 };

let statusFilter = new Set();   // empty = every status
let reportSearchTerm = "";


/* ==========================================
   FILENAME HELPERS
   Long school names collapse to an acronym
   (first letter of each word) so exported
   filenames stay reasonable.
========================================== */

function schoolNamePartForFilename(schoolName) {

    const trimmed =
        (schoolName || "School").trim();

    const ACRONYM_THRESHOLD =
        20;

    if (trimmed.length <= ACRONYM_THRESHOLD) {

        return trimmed.replace(/\s+/g, "_");

    }

    return trimmed
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase())
        .join("");

}


function filenameSafe(value) {

    return (value || "")
        .toString()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^A-Za-z0-9_]/g, "");

}


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    applyReportOverrideIfAny();

    setReportHeader();

    await loadSessionStartDate();

    if (!sessionStartDate) {

        document.getElementById("noStartDateNotice").style.display =
            "block";

        return;

    }

    document.getElementById("reportWrapper").style.display =
        "block";


    setDefaultWeek();

    initWeekPicker();

    initReportScreen();

    document.getElementById("reportWeek").addEventListener(
        "change",
        async (event) => {

            currentWeek =
                Number(event.target.value);

            await generateReport();

        }
    );

    document.getElementById("printBtn").addEventListener(
        "click",
        () => {

            // Swap the tab title for the print header's benefit —
            // Chrome prints document.title as the page title in
            // its own header. Restored once the print dialog closes.
            // (The date/URL/page-number stamp is a browser "Headers
            // and footers" setting in the print dialog itself —
            // outside what the page can control.)

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

    document.getElementById("exportBtn").addEventListener(
        "click",
        exportExcel
    );

    document.getElementById("switchToTermBtn").addEventListener(
        "click",
        () => {

            sessionStorage.setItem(
                "attendng_report_override",
                JSON.stringify({
                    classId: AttendNGContext.classId,
                    className: AttendNGContext.className,
                    sessionId: AttendNGContext.sessionId,
                    sessionName: AttendNGContext.sessionName,
                    currentTerm: AttendNGContext.currentTerm,
                    classIsFinalized: AttendNGContext.classIsFinalized,
                    schoolName: AttendNGContext.schoolName
                })
            );

            window.location.href =
                "/school/report-term.html";

        }
    );


    await loadStudents();

    await generateReport();

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
   Read once, then cleared — so a later normal
   visit to this page (own class) isn't affected
   by a stale leftover override.
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

        return; // no banner needed — this is just a normal weekly/term switch

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


function setDefaultWeek() {

    const start =
        new Date(sessionStartDate + "T00:00:00");

    const today =
        new Date();

    const diffDays =
        Math.floor((today - start) / (1000 * 60 * 60 * 24));

    let guessed =
        Math.floor(diffDays / 7) + 1;

    guessed =
        Math.min(15, Math.max(1, guessed));

    // Opened from a week in the Analytics "Week by week" strip.
    const requestedWeek =
        parseInt(sessionStorage.getItem("attendng_report_week"), 10);

    sessionStorage.removeItem("attendng_report_week");

    if (requestedWeek >= 1 && requestedWeek <= 15) {

        guessed =
            requestedWeek;

    }

    currentWeek =
        guessed;

    document.getElementById("reportWeek").value =
        String(currentWeek);

}


function getWeekDates(weekNumber) {

    const start =
        new Date(sessionStartDate + "T00:00:00");

    const monday =
        new Date(start);

    monday.setDate(start.getDate() + ((weekNumber - 1) * 7));

    return [0, 1, 2, 3, 4].map(
        n => {

            const d = new Date(monday);

            d.setDate(monday.getDate() + n);

            return d;

        }
    );

}


function toISODate(date) {

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;

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


async function generateReport() {

    const weekDates =
        getWeekDates(currentWeek);

    const startISO =
        toISODate(weekDates[0]);

    const endISO =
        toISODate(weekDates[4]);


    const { data: settingsData } =
        await supabaseClient
            .from("weekly_settings")
            .select("school_opened")
            .eq("class_id", AttendNGContext.classId)
            .eq("week", currentWeek)
            .maybeSingle();

    schoolOpened =
        settingsData ? settingsData.school_opened : 0;


    let attendanceRows = [];

    if (students.length > 0) {

        const { data, error } =
            await supabaseClient
                .from("attendance")
                .select("student_id, date, morning_present, afternoon_present")
                .in("student_id", students.map(s => s.id))
                .gte("date", startISO)
                .lte("date", endISO);

        if (error) {

            console.error("Unable to load attendance:", error);

        }
        else {

            attendanceRows =
                data;

        }

    }


    reportRows =
        students.map(
            (student, index) => {

                const records =
                    attendanceRows.filter(r => r.student_id === student.id);

                let present = 0;

                records.forEach(
                    r => {

                        if (r.morning_present) present += 1;
                        if (r.afternoon_present) present += 1;

                    }
                );

                const absent =
                    Math.max(schoolOpened - present, 0);

                const percentage =
                    schoolOpened > 0 ? (present / schoolOpened) * 100 : 0;

                return {
                    serial: index + 1,
                    name: `${student.surname} ${student.first_name}`,
                    gender: student.gender,
                    present,
                    absent,
                    percentage,
                    status: statusFor(percentage, "weekly")
                };

            }
        );


    renderReport();

}


function statusFor(percentage, type) {

    const thresholds =
        type === "weekly" ?
            WEEKLY_THRESHOLDS :
            { excellent: 95, good: 80, fair: 60 };

    if (percentage >= thresholds.excellent) return "Excellent";
    if (percentage >= thresholds.good) return "Good";
    if (percentage >= thresholds.fair) return "Fair";
    return "Poor";

}


function badgeClassFor(status) {

    if (status === "Excellent" || status === "Good") return "badge-success";
    if (status === "Fair") return "badge-warning";
    return "badge-muted";

}


function renderReport() {

    const totalPresent =
        reportRows.reduce((sum, r) => sum + r.present, 0);

    const totalAbsent =
        reportRows.reduce((sum, r) => sum + r.absent, 0);

    const average =
        reportRows.length > 0 ?
            reportRows.reduce((sum, r) => sum + r.percentage, 0) / reportRows.length :
            0;

    const maleRows =
        reportRows.filter(r => r.gender === "male");

    const femaleRows =
        reportRows.filter(r => r.gender === "female");

    const maleAvg =
        maleRows.length > 0 ?
            maleRows.reduce((sum, r) => sum + r.percentage, 0) / maleRows.length : 0;

    const femaleAvg =
        femaleRows.length > 0 ?
            femaleRows.reduce((sum, r) => sum + r.percentage, 0) / femaleRows.length : 0;

    const overall =
        (reportRows.length * schoolOpened) > 0 ?
            (totalPresent / (reportRows.length * schoolOpened)) * 100 : 0;


    document.getElementById("cardTotalPresent").textContent = totalPresent;
    document.getElementById("cardSchoolOpened").textContent = schoolOpened;
    document.getElementById("cardAverage").textContent = average.toFixed(1) + "%";
    document.getElementById("cardMale").textContent = maleAvg.toFixed(1) + "%";
    document.getElementById("cardFemale").textContent = femaleAvg.toFixed(1) + "%";
    document.getElementById("cardOverall").textContent = overall.toFixed(1) + "%";


    const tbody =
        document.getElementById("reportTableBody");

    tbody.innerHTML =
        "";

    reportRows.forEach(
        row => {

            const tr =
                document.createElement("tr");

            tr.style.borderBottom =
                "1px solid var(--border)";

            tr.innerHTML = `
                <td class="sticky-col1" style="padding:10px 8px;">${row.serial}</td>
                <td class="sticky-col2" style="padding:10px 8px; left:56px;">${row.name}</td>
                <td style="padding:10px 8px; text-align:center;">${row.present}</td>
                <td style="padding:10px 8px; text-align:center;">${row.absent}</td>
                <td style="padding:10px 8px; text-align:center;">${row.percentage.toFixed(1)}%</td>
                <td style="padding:10px 8px; text-align:center;"><span class="badge ${badgeClassFor(row.status)}">${row.status}</span></td>
            `;

            tbody.appendChild(tr);

        }
    );


    renderScreenReport();


    document.getElementById("printTitle").textContent =
        `${AttendNGContext.schoolName} — Weekly Attendance Report`;

    document.getElementById("printMeta").textContent =
        `${AttendNGContext.className} · ${AttendNGContext.sessionName} · ${AttendNGContext.currentTerm} · Week ${currentWeek}`;


    const printHeaderEl =
        document.getElementById("printHeader");

    const printLogoEl =
        document.getElementById("printLogo");

    if (AttendNGContext.schoolLogoUrl) {

        printLogoEl.src =
            AttendNGContext.schoolLogoUrl;

        printHeaderEl.classList.add("has-logo");

    }
    else {

        printHeaderEl.classList.remove("has-logo");

    }

}


/* ==========================================
   EXCEL EXPORT
========================================== */

async function exportExcel() {

    try {

        const workbook =
            new ExcelJS.Workbook();

        const sheet =
            workbook.addWorksheet("Weekly Report");

        sheet.views =
            [{ showGridLines: false }]; // no stray gridlines outside the table

        const LAST_COLUMN =
            "F"; // SN, Student Name, Present, Absent, Attendance %, Status

        sheet.columns = [
            { key: "serial", width: 8 },
            { key: "name", width: 28 },
            { key: "present", width: 14 },
            { key: "absent", width: 14 },
            { key: "percentage", width: 16 },
            { key: "status", width: 14 }
        ];


        // ---- Logo, column A rows 1-4 (same treatment as the roster template) ----

        const schoolLogoUrl =
            (typeof AttendNGContext !== "undefined") ?
                AttendNGContext.schoolLogoUrl :
                null;

        if (schoolLogoUrl) {

            try {

                const response =
                    await fetch(schoolLogoUrl);

                const contentType =
                    response.headers.get("content-type") || "";

                const extension =
                    contentType.includes("png") ? "png" :
                    contentType.includes("gif") ? "gif" :
                    "jpeg";

                const arrayBuffer =
                    await response.arrayBuffer();

                const imageId =
                    workbook.addImage({
                        buffer: arrayBuffer,
                        extension
                    });

                sheet.addImage(imageId, "A1:A4");

            }
            catch (error) {

                // No logo is better than a broken export — just
                // skip it and carry on.

                console.warn(
                    "Unable to embed school logo in report:",
                    error
                );

            }

        }


        // ---- School name / report title / meta, columns B-F rows 1-3 ----

        sheet.mergeCells(`B1:${LAST_COLUMN}1`);

        sheet.getCell("B1").value =
            AttendNGContext.schoolName || "School";

        sheet.getCell("B1").font =
            { bold: true, size: 16, color: { argb: "FFFFFFFF" } };

        sheet.getCell("B1").alignment =
            { vertical: "middle" };


        sheet.mergeCells(`B2:${LAST_COLUMN}2`);

        sheet.getCell("B2").value =
            `${AttendNGContext.className} — Weekly Attendance Report`;

        sheet.getCell("B2").font =
            { bold: true, size: 12, color: { argb: "FFE6F4F1" } };

        sheet.getCell("B2").alignment =
            { vertical: "middle" };


        sheet.mergeCells(`B3:${LAST_COLUMN}3`);

        sheet.getCell("B3").value =
            `${AttendNGContext.sessionName} · ${AttendNGContext.currentTerm} · Week ${currentWeek}`;

        sheet.getCell("B3").font =
            { italic: true, size: 10, color: { argb: "FFCDE6E1" } };

        sheet.getCell("B3").alignment =
            { vertical: "middle" };


        sheet.getRow(1).height = 24;
        sheet.getRow(2).height = 18;
        sheet.getRow(3).height = 16;
        sheet.getRow(4).height = 8; // spacer, no border, no content


        // ---- Brand-teal fill behind the whole header block, rows 1-4 ----

        ["A", "B", "C", "D", "E", "F"].forEach(
            (col) => {

                for (let rowNum = 1; rowNum <= 4; rowNum++) {

                    sheet.getCell(`${col}${rowNum}`).fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: "FF0F766E" } // AttendNG brand teal
                    };

                }

            }
        );


        // ---- Summary cards, rows 5-10 (mirrors the cards on the page) ----

        const totalPresent =
            reportRows.reduce((sum, r) => sum + r.present, 0);

        const average =
            reportRows.length > 0 ?
                reportRows.reduce((sum, r) => sum + r.percentage, 0) / reportRows.length : 0;

        const maleRows =
            reportRows.filter(r => r.gender === "male");

        const femaleRows =
            reportRows.filter(r => r.gender === "female");

        const maleAvg =
            maleRows.length > 0 ?
                maleRows.reduce((sum, r) => sum + r.percentage, 0) / maleRows.length : 0;

        const femaleAvg =
            femaleRows.length > 0 ?
                femaleRows.reduce((sum, r) => sum + r.percentage, 0) / femaleRows.length : 0;

        const overall =
            (reportRows.length * schoolOpened) > 0 ?
                (totalPresent / (reportRows.length * schoolOpened)) * 100 : 0;

        const summaryPairs = [
            ["Total Present", totalPresent, "number"],
            ["School Opened", schoolOpened, "number"],
            ["Average Attendance", average, "percent"],
            ["Male Attendance", maleAvg, "percent"],
            ["Female Attendance", femaleAvg, "percent"],
            ["Attendance %", overall, "percent"]
        ];

        const SUMMARY_START_ROW = 5;

        summaryPairs.forEach(
            ([label, value, type], index) => {

                const rowNum =
                    SUMMARY_START_ROW + index;

                // Label gets its own two columns so it isn't
                // clipped by A's narrow (SN-sized) width.

                sheet.mergeCells(`A${rowNum}:B${rowNum}`);

                sheet.getCell(`A${rowNum}`).value =
                    label;

                sheet.getCell(`A${rowNum}`).font =
                    { bold: true, size: 10 };

                sheet.mergeCells(`C${rowNum}:${LAST_COLUMN}${rowNum}`);

                const valueCell =
                    sheet.getCell(`C${rowNum}`);

                valueCell.font =
                    { size: 10 };

                valueCell.alignment =
                    { horizontal: "left" };

                if (type === "percent") {

                    // Store as a real number (fraction) with a
                    // percent format, not a "12.3%" string — a
                    // text string here is what makes Excel flag
                    // the cell as "number stored as text".

                    valueCell.value =
                        value / 100;

                    valueCell.numFmt =
                        "0.0%";

                }
                else {

                    valueCell.value =
                        value;

                }

            }
        );


        // ---- Table header, one blank row below the summary block ----

        const TABLE_HEADER_ROW =
            SUMMARY_START_ROW + summaryPairs.length + 1;

        const headerRow =
            sheet.getRow(TABLE_HEADER_ROW);

        headerRow.values =
            ["SN", "Student Name", "Present", "Absent", "Attendance %", "Status"];

        headerRow.font =
            { bold: true, color: { argb: "FFFFFFFF" } }; // white text on brand teal

        headerRow.eachCell(
            (cell) => {

                cell.border = {
                    top: { style: "thin" },
                    left: { style: "thin" },
                    bottom: { style: "thin" },
                    right: { style: "thin" }
                };

                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FF0F766E" } // AttendNG brand teal
                };

            }
        );


        // ---- Data rows, one per student, exactly as shown on the page ----

        reportRows.forEach(
            (row, index) => {

                const dataRow =
                    sheet.getRow(TABLE_HEADER_ROW + 1 + index);

                dataRow.values = [
                    row.serial,
                    row.name,
                    row.present,
                    row.absent,
                    row.percentage / 100, // real number, not a "12.3%" string
                    row.status
                ];

                dataRow.getCell(5).numFmt =
                    "0.0%";

                dataRow.eachCell(
                    (cell) => {

                        cell.border = {
                            top: { style: "thin" },
                            left: { style: "thin" },
                            bottom: { style: "thin" },
                            right: { style: "thin" }
                        };

                    }
                );

            }
        );


        // ---- Footer, one row below the last data row ----

        const footerRowNumber =
            TABLE_HEADER_ROW + 1 + reportRows.length + 1;

        sheet.mergeCells(`A${footerRowNumber}:${LAST_COLUMN}${footerRowNumber}`);

        const footerCell =
            sheet.getCell(`A${footerRowNumber}`);

        footerCell.value =
            "Powered by AttendNG";

        footerCell.font =
            { italic: true, size: 9, color: { argb: "FF999999" } };

        footerCell.alignment =
            { horizontal: "center" };


        const buffer =
            await workbook.xlsx.writeBuffer();

        const blob =
            new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

        const url =
            URL.createObjectURL(blob);

        const link =
            document.createElement("a");

        link.href = url;
        const schoolPart =
            schoolNamePartForFilename(AttendNGContext.schoolName);

        const classPart =
            filenameSafe(AttendNGContext.className);

        link.download =
            `${schoolPart}_${classPart}_WeeklyReport_Week${currentWeek}.xlsx`;
        link.click();

        URL.revokeObjectURL(url);

    }
    catch (error) {

        console.error("Excel export failed:", error);

        alert("Unable to export the report to Excel.");

    }

}


/* ==========================================
   ON-SCREEN REPORT
   (Printing and the Excel export still use the
   plain table and reportRows, exactly as before.)
========================================== */

function byId(id) {

    return document.getElementById(id);

}


function wrEscape(value) {

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


function wrHash(text) {

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


function statusClass(status) {

    return status === "Excellent" ? "wr-ex" :
        status === "Good" ? "wr-go" :
        status === "Fair" ? "wr-fa" :
        "wr-po";

}


function setReportHeader() {

    const name =
        AttendNGContext.className || "";

    const tones =
        ["wr-tone-teal", "wr-tone-indigo", "wr-tone-amber"];

    const digits =
        name.match(/\d+/);

    const tone =
        digits ?
            tones[(((parseInt(digits[0], 10) - 1) % 3) + 3) % 3] :
            tones[wrHash(name) % 3];

    const tile =
        byId("classTile");

    tile.textContent =
        name;

    tile.className =
        "wr-tile " + tone;

    // An admin viewing another class: show that class, not their own.
    byId("className").textContent =
        name;

    byId("term").textContent =
        AttendNGContext.currentTerm || "";

}


/* ---------- week picker ---------- */

function weekRangeText(weekNumber) {

    const dates =
        getWeekDates(weekNumber);

    const months =
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const short = (date) =>
        `${date.getDate()} ${months[date.getMonth()]}`;

    return `${short(dates[0])} – ${short(dates[4])}`;

}


// Which week today falls in (0 if today is outside weeks 1–15).
function thisWeekNumber() {

    const start =
        new Date(sessionStartDate + "T00:00:00");

    const week =
        Math.floor((new Date() - start) / (1000 * 60 * 60 * 24 * 7)) + 1;

    return week >= 1 && week <= 15 ? week : 0;

}


function syncWeekUI() {

    const select =
        byId("reportWeek");

    const week =
        Number(select.value) || currentWeek;

    byId("weekValue").textContent =
        `Week ${week}`;

    byId("weekRange").textContent =
        weekRangeText(week);

    byId("weekRangeText").textContent =
        `Week ${week} · ${weekRangeText(week)}`;

    byId("weekNowPill").hidden =
        week !== thisWeekNumber();

    byId("weekPrev").disabled =
        week <= 1;

    byId("weekNext").disabled =
        week >= 15;

    document.querySelectorAll("#weekMenu .wr-opt").forEach(
        option => {

            const selected =
                Number(option.dataset.value) === week;

            option.classList.toggle("is-selected", selected);

            option.setAttribute("aria-selected", String(selected));

        }
    );

}


function initWeekPicker() {

    const select =
        byId("reportWeek");

    const button =
        byId("weekBtn");

    const menu =
        byId("weekMenu");

    const now =
        thisWeekNumber();

    menu.innerHTML =
        Array.from(select.options).map(
            option => `
                <button type="button" class="wr-opt" role="option" data-value="${option.value}">
                    <b>${option.textContent.trim()}</b>
                    <span class="wr-opt-range">${weekRangeText(Number(option.value))}</span>
                    ${Number(option.value) === now ? `<span class="wr-now">This week</span>` : ""}
                    <i class="fa-solid fa-check wr-check" aria-hidden="true"></i>
                </button>
            `
        ).join("");

    const options =
        Array.from(menu.querySelectorAll(".wr-opt"));


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

        menu.scrollTop =
            Math.max(0, selected.offsetTop - menu.clientHeight / 2 + selected.offsetHeight / 2);

        selected.focus({ preventScroll: true });

    };

    const choose = (week) => {

        if (week < 1 || week > 15 || String(week) === select.value) {

            return;

        }

        select.value =
            String(week);

        syncWeekUI();

        // The existing handler on the select loads that week's report.
        select.dispatchEvent(new Event("change", { bubbles: true }));

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

            if ((event.key === "ArrowDown" || event.key === "ArrowUp") && menu.hidden) {

                event.preventDefault();

                open();

            }

        }
    );

    options.forEach(
        option => {

            option.addEventListener(
                "click",
                (event) => {

                    event.stopPropagation();

                    close(true);

                    choose(Number(option.dataset.value));

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

    byId("weekPrev").addEventListener("click", () => choose(Number(select.value) - 1));

    byId("weekNext").addEventListener("click", () => choose(Number(select.value) + 1));

    syncWeekUI();

}


/* ---------- search, status chips, "show them" ---------- */

function updateStatusChips() {

    document.querySelectorAll("#statusChips .wr-chip").forEach(
        chip => {

            const on =
                chip.dataset.status === "all" ?
                    statusFilter.size === 0 :
                    statusFilter.has(chip.dataset.status);

            chip.classList.toggle("is-on", on);

            chip.setAttribute("aria-pressed", String(on));

        }
    );

}


function initReportScreen() {

    byId("reportSearch").addEventListener(
        "input",
        (event) => {

            reportSearchTerm =
                event.target.value.trim().toLowerCase();

            applyReportFilter();

        }
    );

    byId("statusChips").addEventListener(
        "click",
        (event) => {

            const chip =
                event.target.closest(".wr-chip");

            if (!chip) {

                return;

            }

            const status =
                chip.dataset.status;

            if (status === "all") {

                statusFilter.clear();

            }
            else if (statusFilter.has(status)) {

                statusFilter.delete(status);

            }
            else {

                statusFilter.add(status);

            }

            updateStatusChips();

            applyReportFilter();

        }
    );

    byId("attentionShow").addEventListener(
        "click",
        () => {

            statusFilter =
                new Set(["Fair", "Poor"]);

            updateStatusChips();

            applyReportFilter();

            byId("reportList").scrollIntoView({ behavior: "smooth", block: "start" });

        }
    );

}


function applyReportFilter() {

    const tokens =
        reportSearchTerm.split(/\s+/).filter(Boolean);

    let shown = 0;

    byId("reportList").querySelectorAll(".wr-row").forEach(
        rowEl => {

            const row =
                reportRows[Number(rowEl.dataset.index)];

            const statusOk =
                statusFilter.size === 0 || statusFilter.has(row.status);

            const name =
                row.name.toLowerCase();

            const searchOk =
                tokens.every(token => name.includes(token));

            rowEl.hidden =
                !(statusOk && searchOk);

            if (!rowEl.hidden) {

                shown++;

            }

        }
    );

    const note =
        byId("reportNote");

    if (reportRows.length === 0) {

        note.textContent =
            "No students in this class yet.";

        note.hidden =
            false;

    }
    else if (shown === 0) {

        note.textContent =
            "No students match.";

        note.hidden =
            false;

    }
    else {

        note.hidden =
            true;

    }

    byId("reportFoot").textContent =
        `Showing ${shown} of ${reportRows.length} student${reportRows.length === 1 ? "" : "s"}`;

}


/* ---------- summary + list ---------- */

function renderScreenReport() {

    const total =
        reportRows.length;

    const present =
        reportRows.reduce((sum, r) => sum + r.present, 0);

    const possible =
        total * schoolOpened;

    const overall =
        possible > 0 ? (present / possible) * 100 : 0;

    const average =
        total > 0 ?
            reportRows.reduce((sum, r) => sum + r.percentage, 0) / total :
            0;


    // ring + stat tiles
    const ring =
        byId("ringFill");

    const ringPercent =
        Math.max(0, Math.min(100, overall));

    ring.setAttribute("stroke-dasharray", `${ringPercent} 100`);

    ring.style.opacity =
        ringPercent > 0 ? "1" : "0";

    byId("cardOverall").textContent =
        fmtPct(overall);

    byId("cardTotalPresent").textContent =
        present;

    byId("cardTotalOf").textContent =
        possible > 0 ? `of ${possible}` : "";

    byId("cardSchoolOpened").textContent =
        schoolOpened;

    byId("cardStudents").textContent =
        total;

    byId("cardAverage").textContent =
        fmtPct(average);


    // male vs female
    [["male", "cardMale", "maleBar"], ["female", "cardFemale", "femaleBar"]].forEach(
        ([gender, textId, barId]) => {

            const group =
                reportRows.filter(r => r.gender === gender);

            const value =
                group.length > 0 ?
                    group.reduce((sum, r) => sum + r.percentage, 0) / group.length :
                    null;

            byId(textId).textContent =
                value === null ? "–" : fmtPct(value);

            byId(barId).style.width =
                value === null ? "0%" : Math.min(100, value) + "%";

        }
    );


    // status breakdown
    const statuses =
        ["Excellent", "Good", "Fair", "Poor"];

    const counts = {};

    statuses.forEach(status => { counts[status] = 0; });

    reportRows.forEach(r => { counts[r.status] += 1; });

    const t =
        WEEKLY_THRESHOLDS;

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
            status => `<span><i class="wr-dot ${statusClass(status)}"></i>${status} <b>${counts[status]}</b></span>`
        ).join("");

    byId("chipAll").textContent = total;
    byId("chipExcellent").textContent = counts.Excellent;
    byId("chipGood").textContent = counts.Good;
    byId("chipFair").textContent = counts.Fair;
    byId("chipPoor").textContent = counts.Poor;


    // "school opened" not set → everyone would look absent; say so instead
    const notice =
        byId("openedNotice");

    if (schoolOpened === 0 && total > 0) {

        byId("openedNoticeText").textContent =
            `Times school opened isn't set for Week ${currentWeek}, so attendance shows 0%.`;

        notice.hidden =
            false;

    }
    else {

        notice.hidden =
            true;

    }


    // students below the "Good" line
    const below =
        schoolOpened > 0 ?
            reportRows.filter(r => r.percentage < t.good) :
            [];

    const strip =
        byId("attentionStrip");

    if (below.length > 0) {

        const names =
            below.slice(0, 3).map(r => r.name).join(", ");

        const more =
            below.length > 3 ? ` and ${below.length - 3} more` : "";

        byId("attentionText").innerHTML =
            `<b>${below.length} student${below.length === 1 ? " is" : "s are"} below ${t.good}%.</b> ${wrEscape(names)}${more}`;

        strip.hidden =
            false;

    }
    else {

        strip.hidden =
            true;

    }


    // list
    byId("presentHead").textContent =
        schoolOpened > 0 ? `Present of ${schoolOpened}` : "Present";

    byId("reportList").innerHTML =
        reportRows.map(
            (row, index) => {

                const initials =
                    row.name.split(" ").filter(Boolean).slice(0, 2).map(w => w.charAt(0)).join("").toUpperCase() || "?";

                const attention =
                    schoolOpened > 0 && row.percentage < t.good;

                return `
                    <div class="wr-row${attention ? " is-attn" : ""}${attention && row.status === "Poor" ? " is-poor" : ""}" data-index="${index}">
                        <span class="wr-num">${row.serial}</span>
                        <div class="wr-who">
                            <span class="wr-av wr-av-${wrHash(row.name) % 5}" aria-hidden="true">${wrEscape(initials)}</span>
                            <span class="wr-nm">${wrEscape(row.name)}<span class="wr-meta">${row.present} present · ${row.absent} absent</span></span>
                        </div>
                        <div class="wr-prog">
                            <span class="wr-bar"><i class="${statusClass(row.status)}" style="width:${Math.min(100, row.percentage)}%"></i></span>
                            <span class="wr-frac">${row.present}/${schoolOpened}</span>
                        </div>
                        <span class="wr-abs">${row.absent}</span>
                        <div class="wr-side">
                            <b class="wr-pct">${fmtPct(row.percentage)}</b>
                            <span class="wr-st ${statusClass(row.status)}">${row.status}</span>
                        </div>
                    </div>
                `;

            }
        ).join("");

    syncWeekUI();

    applyReportFilter();

}
/*************************************************
 * REPORT-WEEKLY.JS
 *************************************************/

let sessionStartDate = null;
let currentWeek = 1;
let students = [];
let reportRows = [];
let schoolOpened = 0;


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

    await loadSessionStartDate();

    if (!sessionStartDate) {

        document.getElementById("noStartDateNotice").style.display =
            "block";

        return;

    }

    document.getElementById("reportWrapper").style.display =
        "block";


    setDefaultWeek();

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
            { excellent: 90, good: 75, fair: 50 } :
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
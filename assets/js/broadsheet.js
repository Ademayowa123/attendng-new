/*************************************************
 * BROADSHEET.JS
 *
 * Admins pick any class in the session; a class teacher
 * sees their own class only.
 *
 * Class + term view: every student x every subject
 * assigned to the class, ranked by total.
 *
 * A subject score only counts once BOTH CA and Exam
 * are in (same rule the teacher's Results page uses
 * for its Total column).
 *************************************************/

let classes = [];
let classSubjects = [];   // [{ id, subject_name, teacher_name }]
let students = [];
let scoreMap = {};        // `${class_subject_id}|${student_id}` -> { ca, exam, total|null }
let sheetRows = [];       // ranked rows, rebuilt on every generate
let missingBySubject = []; // [{ subject_name, teacher_name, count }]
let missingTotal = 0;
let sheetClassName = "";
let sheetTerm = "";


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    document.getElementById("sessionLabel").textContent =
        AttendNGContext.sessionName || "";

    document.getElementById("termSelect").value =
        AttendNGContext.currentTerm || "1st Term";

    await loadClasses();

    bindUI();

});


/*
 * Subject order for the broadsheet and report cards:
 * English first, Mathematics second, then everything else A-Z.
 * Matches by name: English / English Language / English Studies, and
 * Mathematics / Maths / Math / General or Basic Mathematics (an
 * optional "(...)" on the end is ignored). "Further Mathematics" and
 * "English Literature" are treated as ordinary subjects.
 */
function subjectSortRank(name) {

    const n =
        String(name || "")
            .trim()
            .toLowerCase()
            .replace(/\s*\(.*\)\s*$/, "")
            .replace(/\s+/g, " ");

    if (/^english( language| lang\.?| studies)?$/.test(n)) {

        return 0;

    }

    if (/^(general |basic )?(mathematics|maths|math)$/.test(n)) {

        return 1;

    }

    return 2;

}


function compareSubjects(a, b) {

    return subjectSortRank(a) - subjectSortRank(b) ||
        String(a).localeCompare(String(b));

}


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
   LOAD
========================================== */

async function loadClasses() {

    const isAdmin =
        AttendNGContext.tier === "admin";

    const noClassesEl =
        document.getElementById("noClassesNotice");

    if (!AttendNGContext.sessionId || (!isAdmin && !AttendNGContext.classId)) {

        document.getElementById("noClassesText").textContent =
            isAdmin ?
                "There are no classes in this session yet. Create one under Classes first." :
                "You haven't been assigned a class this session, so there's no broadsheet for you to view. Ask your admin to assign you a class.";

        noClassesEl.style.display =
            "block";

        document.getElementById("generateBtn").disabled =
            true;

        return;

    }

    if (isAdmin) {

        const { data, error } =
            await supabaseClient
                .from("classes")
                .select("id, name")
                .eq("session_id", AttendNGContext.sessionId)
                .order("name");

        if (error) {

            console.error("Unable to load classes:", error);

            return;

        }

        classes =
            data || [];

    }
    else {

        // A class teacher only ever sees their own class.

        classes =
            [{ id: AttendNGContext.classId, name: AttendNGContext.className }];

    }

    if (classes.length === 0) {

        noClassesEl.style.display =
            "block";

        document.getElementById("generateBtn").disabled =
            true;

        return;

    }

    const select =
        document.getElementById("classSelect");

    select.innerHTML =
        classes.map(c => `<option value="${c.id}">${c.name}</option>`).join("");

    // If the admin arrived from the Classes page, start on that class.

    const remembered =
        sessionStorage.getItem("attendng_selected_class_id");

    if (remembered && classes.some(c => c.id === remembered)) {

        select.value =
            remembered;

    }
    else if (AttendNGContext.classId && classes.some(c => c.id === AttendNGContext.classId)) {

        select.value =
            AttendNGContext.classId;

    }

    select.disabled =
        classes.length === 1;

}


// Supabase returns at most 1000 rows per request, and a big class
// (e.g. 100 students x 15 subjects) can go past that — so scores
// are pulled in pages until a short page comes back.

async function fetchAllScores(classSubjectIds, term) {

    const PAGE =
        1000;

    let all =
        [];

    let from =
        0;

    while (true) {

        const { data, error } =
            await supabaseClient
                .from("scores")
                .select("class_subject_id, student_id, ca_score, exam_score")
                .in("class_subject_id", classSubjectIds)
                .eq("term", term)
                .order("id")
                .range(from, from + PAGE - 1);

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


async function loadSheetData(classId, term) {

    // 1. Subjects assigned to this class

    const { data: csRows, error: csError } =
        await supabaseClient
            .from("class_subjects")
            .select("id, teacher_id, subjects ( id, name )")
            .eq("class_id", classId);

    if (csError) {

        throw csError;

    }

    // Teacher names, looked up separately (same approach as the
    // Class → Subjects page) rather than relying on an embed.

    // Names are a nice-to-have in the "missing scores" list — if this
    // account isn't allowed to list school members, carry on without them.

    const { data: members, error: membersError } =
        await supabaseClient
            .from("school_members")
            .select("id, full_name")
            .eq("school_id", AttendNGContext.schoolId);

    if (membersError) {

        console.warn("Teacher names unavailable:", membersError);

    }

    const memberNames = {};

    (members || []).forEach(m => { memberNames[m.id] = m.full_name; });

    classSubjects =
        (csRows || [])
            .filter(row => row.subjects)
            .map(
                row => ({
                    id: row.id,
                    subject_name: row.subjects.name,
                    teacher_name: row.teacher_id ? (memberNames[row.teacher_id] || "Subject teacher") : "No teacher assigned"
                })
            )
            .sort((a, b) => compareSubjects(a.subject_name, b.subject_name));


    // 2. Students

    const { data: studentRows, error: studentsError } =
        await supabaseClient
            .from("students")
            .select("id, surname, first_name")
            .eq("class_id", classId)
            .order("surname")
            .order("first_name");

    if (studentsError) {

        throw studentsError;

    }

    students =
        studentRows || [];


    // 3. Scores

    scoreMap =
        {};

    if (classSubjects.length > 0 && students.length > 0) {

        const scoreRows =
            await fetchAllScores(classSubjects.map(cs => cs.id), term);

        scoreRows.forEach(
            row => {

                const complete =
                    row.ca_score !== null && row.exam_score !== null;

                scoreMap[`${row.class_subject_id}|${row.student_id}`] = {
                    ca: row.ca_score,
                    exam: row.exam_score,
                    total: complete ? Number(row.ca_score) + Number(row.exam_score) : null
                };

            }
        );

    }

}


/* ==========================================
   COMPUTE
========================================== */

function findMissing() {

    missingBySubject =
        [];

    missingTotal =
        0;

    classSubjects.forEach(
        cs => {

            let count =
                0;

            students.forEach(
                student => {

                    const entry =
                        scoreMap[`${cs.id}|${student.id}`];

                    if (!entry || entry.total === null) {

                        count += 1;

                    }

                }
            );

            if (count > 0) {

                missingBySubject.push({
                    subject_name: cs.subject_name,
                    teacher_name: cs.teacher_name,
                    count
                });

                missingTotal += count;

            }

        }
    );

}


function buildRankedRows() {

    const rows =
        students.map(
            student => {

                let total =
                    0;

                let scored =
                    0;

                const cells =
                    classSubjects.map(
                        cs => {

                            const entry =
                                scoreMap[`${cs.id}|${student.id}`];

                            if (entry && entry.total !== null) {

                                total += entry.total;
                                scored += 1;

                                return entry.total;

                            }

                            return null;

                        }
                    );

                return {
                    name: `${student.surname} ${student.first_name}`,
                    surname: student.surname,
                    cells,
                    total,
                    scored,
                    average: scored > 0 ? total / scored : 0,
                    incomplete: scored < classSubjects.length
                };

            }
        );

    rows.sort(
        (a, b) =>
            b.total - a.total ||
            a.name.localeCompare(b.name)
    );

    // Standard competition ranking: equal totals share a position and
    // the next position skips (1, 2, 2, 4) — what schools expect on a
    // broadsheet.

    rows.forEach(
        (row, index) => {

            row.position =
                (index > 0 && row.total === rows[index - 1].total) ?
                    rows[index - 1].position :
                    index + 1;

        }
    );

    sheetRows =
        rows;

}


function ordinal(n) {

    const mod100 =
        n % 100;

    if (mod100 >= 11 && mod100 <= 13) {

        return `${n}th`;

    }

    switch (n % 10) {

        case 1: return `${n}st`;
        case 2: return `${n}nd`;
        case 3: return `${n}rd`;
        default: return `${n}th`;

    }

}


function formatAverage(value) {

    return (Math.round(value * 10) / 10).toFixed(1);

}


/* ==========================================
   RENDER
========================================== */

function renderSheet() {

    const thStyle =
        "padding:10px 8px; text-align:center; background:#0F766E; color:#FFFFFF; font-weight:600;";

    document.getElementById("sheetHead").innerHTML = `
        <tr>
            <th class="sticky-col1" style="${thStyle} width:56px;">S/N</th>
            <th class="sticky-col2" style="${thStyle} left:56px; min-width:180px; text-align:left;">Student Name</th>
            ${classSubjects.map(cs => `<th style="${thStyle} min-width:90px;" title="${cs.teacher_name}">${cs.subject_name}</th>`).join("")}
            <th style="${thStyle} min-width:80px;">Total</th>
            <th style="${thStyle} min-width:80px;">Average</th>
            <th style="${thStyle} min-width:80px;">Position</th>
        </tr>
    `;

    document.getElementById("sheetBody").innerHTML =
        sheetRows.map(
            (row, index) => `
                <tr style="border-bottom:1px solid var(--border);">
                    <td class="sticky-col1" style="padding:10px 8px;">${index + 1}</td>
                    <td class="sticky-col2" style="padding:10px 8px; left:56px;">${row.name}</td>
                    ${row.cells.map(
                        value => value === null ?
                            `<td class="missing" style="padding:10px 8px; text-align:center;">—</td>` :
                            `<td style="padding:10px 8px; text-align:center;">${value}</td>`
                    ).join("")}
                    <td style="padding:10px 8px; text-align:center; font-weight:600;">${row.total}</td>
                    <td style="padding:10px 8px; text-align:center;">${row.scored > 0 ? formatAverage(row.average) : "—"}</td>
                    <td style="padding:10px 8px; text-align:center; font-weight:600;">${ordinal(row.position)}</td>
                </tr>
            `
        ).join("");


    const highest =
        sheetRows.length > 0 ? sheetRows[0].total : 0;

    const classAverage =
        sheetRows.length > 0 ?
            sheetRows.reduce((sum, r) => sum + r.average, 0) / sheetRows.length : 0;

    document.getElementById("cardStudents").textContent = sheetRows.length;
    document.getElementById("cardSubjects").textContent = classSubjects.length;
    document.getElementById("cardHighest").textContent = highest;
    document.getElementById("cardAverage").textContent = formatAverage(classAverage);

    document.getElementById("incompleteNote").style.display =
        missingTotal > 0 ? "block" : "none";


    document.getElementById("printTitle").textContent =
        `${AttendNGContext.schoolName} — Broadsheet`;

    document.getElementById("printMeta").textContent =
        `${sheetClassName} · ${AttendNGContext.sessionName} · ${sheetTerm}`;

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

        printLogoEl.removeAttribute("src");

        printHeaderEl.classList.remove("has-logo");

    }

    document.getElementById("sheetWrapper").style.display =
        "block";

    document.getElementById("sheetActions").style.display =
        "flex";

}


function hideSheet() {

    document.getElementById("sheetWrapper").style.display = "none";
    document.getElementById("sheetActions").style.display = "none";
    document.getElementById("noSubjectsNotice").style.display = "none";
    document.getElementById("noStudentsNotice").style.display = "none";

}


/* ==========================================
   GENERATE
========================================== */

async function generate() {

    const classId =
        document.getElementById("classSelect").value;

    const term =
        document.getElementById("termSelect").value;

    if (!classId) {

        return;

    }

    const button =
        document.getElementById("generateBtn");

    button.disabled = true;

    hideSheet();

    try {

        await loadSheetData(classId, term);

    }
    catch (error) {

        console.error("Unable to load broadsheet data:", error);

        showToast("Unable to load the broadsheet — try again.");

        button.disabled = false;

        return;

    }

    button.disabled = false;

    sheetClassName =
        classes.find(c => c.id === classId).name;

    sheetTerm =
        term;

    if (classSubjects.length === 0) {

        document.getElementById("noSubjectsNotice").style.display = "block";

        return;

    }

    if (students.length === 0) {

        document.getElementById("noStudentsNotice").style.display = "block";

        return;

    }

    findMissing();

    if (missingTotal > 0) {

        openMissingModal();

        return;

    }

    buildRankedRows();

    renderSheet();

}


function openMissingModal() {

    const totalCells =
        classSubjects.length * students.length;

    document.getElementById("missingSummary").textContent =
        `${missingTotal} of ${totalCells} scores are missing or incomplete (CA and Exam both needed).`;

    document.getElementById("missingList").innerHTML =
        missingBySubject.map(
            item => `
                <li>
                    <strong>${item.subject_name}</strong>
                    — ${item.count} ${item.count === 1 ? "student" : "students"}
                    <br><span>${item.teacher_name}</span>
                </li>
            `
        ).join("");

    document.getElementById("missingModal").style.display =
        "flex";

}


/* ==========================================
   UI BINDING
========================================== */

function bindUI() {

    document.getElementById("generateBtn").addEventListener("click", generate);

    // Changing class or term makes the sheet on screen stale — clear it
    // so it can never be mistaken for the new selection.

    document.getElementById("classSelect").addEventListener("change", hideSheet);
    document.getElementById("termSelect").addEventListener("change", hideSheet);

    document.getElementById("missingGoBack").addEventListener(
        "click",
        () => {

            document.getElementById("missingModal").style.display =
                "none";

        }
    );

    document.getElementById("missingContinue").addEventListener(
        "click",
        () => {

            document.getElementById("missingModal").style.display =
                "none";

            buildRankedRows();

            renderSheet();

        }
    );

    document.getElementById("printBtn").addEventListener(
        "click",
        async () => {

            // Make sure the logo has finished loading — printing
            // straight away can catch it half-loaded and drop it.

            const logo =
                document.getElementById("printLogo");

            if (logo.getAttribute("src")) {

                try {

                    await logo.decode();

                }
                catch (error) {

                    console.warn("Logo not ready for print:", error);

                }

            }

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

    document.getElementById("exportBtn").addEventListener("click", exportExcel);

}


/* ==========================================
   EXCEL EXPORT
========================================== */

function filenameSafe(value) {

    return (value || "")
        .toString()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^A-Za-z0-9_]/g, "");

}


function schoolNamePartForFilename(schoolName) {

    const trimmed =
        (schoolName || "School").trim();

    if (trimmed.length <= 20) {

        return trimmed.replace(/\s+/g, "_");

    }

    return trimmed
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase())
        .join("");

}


async function exportExcel() {

    try {

        const workbook =
            new ExcelJS.Workbook();

        const sheet =
            workbook.addWorksheet("Broadsheet");

        sheet.views =
            [{ showGridLines: false }];

        const headers =
            ["SN", "Student Name", ...classSubjects.map(cs => cs.subject_name), "Total", "Average", "Position"];

        const lastColumnLetter =
            sheet.getColumn(headers.length).letter;

        sheet.columns =
            headers.map(
                (h, i) => ({ width: i === 0 ? 10 : i === 1 ? 28 : 13 })
            );


        // ---- Logo, column A rows 1-4 (same treatment as the roster template) ----

        const schoolLogoUrl =
            AttendNGContext.schoolLogoUrl;

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

                // Fixed size (not stretched to the cell range) so a
                // square logo stays square on a wide broadsheet.

                sheet.addImage(
                    imageId,
                    {
                        tl: { col: 0.1, row: 0.1 },
                        ext: { width: 60, height: 60 }
                    }
                );

            }
            catch (error) {

                // No logo is better than a broken export — just
                // skip it and carry on.

                console.warn(
                    "Unable to embed school logo in broadsheet:",
                    error
                );

            }

        }


        // ---- School name / title / meta, columns B-end rows 1-3 ----

        const titles = [
            [AttendNGContext.schoolName || "School", { bold: true, size: 16, color: { argb: "FFFFFFFF" } }],
            [`${sheetClassName} — Broadsheet`, { bold: true, size: 12, color: { argb: "FFE6F4F1" } }],
            [`${AttendNGContext.sessionName} · ${sheetTerm}`, { italic: true, size: 10, color: { argb: "FFCDE6E1" } }]
        ];

        titles.forEach(
            ([text, font], index) => {

                const rowNum =
                    index + 1;

                sheet.mergeCells(`B${rowNum}:${lastColumnLetter}${rowNum}`);

                const cell =
                    sheet.getCell(`B${rowNum}`);

                cell.value = text;
                cell.font = font;
                cell.alignment = { vertical: "middle" };

            }
        );


        // ---- Brand-teal fill behind the whole header block, rows 1-4 ----

        for (let rowNum = 1; rowNum <= 4; rowNum++) {

            for (let col = 1; col <= headers.length; col++) {

                sheet.getCell(rowNum, col).fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FF0F766E" }
                };

            }

        }

        sheet.getRow(1).height = 24;
        sheet.getRow(2).height = 18;
        sheet.getRow(3).height = 16;
        sheet.getRow(4).height = 14; // spacer under the logo


        // ---- Table ----

        const HEADER_ROW =
            5;

        const border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" }
        };

        const headerRow =
            sheet.getRow(HEADER_ROW);

        headerRow.values =
            headers;

        headerRow.font =
            { bold: true, color: { argb: "FFFFFFFF" } };

        headerRow.eachCell(
            cell => {

                cell.border = border;
                cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FF0F766E" }
                };

            }
        );

        sheetRows.forEach(
            (row, index) => {

                const dataRow =
                    sheet.getRow(HEADER_ROW + 1 + index);

                // Missing scores are left blank (not "—" text) so Excel
                // formulas on the sheet still work.

                dataRow.values = [
                    index + 1,
                    row.name,
                    ...row.cells.map(v => v === null ? null : v),
                    row.total,
                    row.scored > 0 ? Math.round(row.average * 10) / 10 : null,
                    row.position
                ];

                dataRow.eachCell(
                    { includeEmpty: true },
                    (cell, colNumber) => {

                        cell.border = border;

                        if (colNumber !== 2) {

                            cell.alignment = { horizontal: "center" };

                        }

                    }
                );

            }
        );

        const footerRowNumber =
            HEADER_ROW + sheetRows.length + 2;

        sheet.mergeCells(`A${footerRowNumber}:${lastColumnLetter}${footerRowNumber}`);

        const footerCell =
            sheet.getCell(`A${footerRowNumber}`);

        footerCell.value =
            "Powered by AttendNG";

        footerCell.font =
            { italic: true, size: 9, color: { argb: "FF999999" } };

        footerCell.alignment =
            { horizontal: "center" };

        sheet.pageSetup =
            { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };


        const buffer =
            await workbook.xlsx.writeBuffer();

        const blob =
            new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

        const url =
            URL.createObjectURL(blob);

        const link =
            document.createElement("a");

        link.href = url;

        link.download =
            `${schoolNamePartForFilename(AttendNGContext.schoolName)}_${filenameSafe(sheetClassName)}_Broadsheet_${filenameSafe(sheetTerm)}.xlsx`;

        link.click();

        URL.revokeObjectURL(url);

    }
    catch (error) {

        console.error("Excel export failed:", error);

        alert("Unable to export the broadsheet to Excel.");

    }

}


function showToast(message) {

    const toast =
        document.getElementById("toast");

    toast.textContent =
        message;

    toast.classList.add("show");

    setTimeout(
        () => toast.classList.remove("show"),
        2500
    );

}
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
let classTeacherName = "";
let sessionStartDate = null;
let attendance = { opened: 0, presentByStudent: {}, available: false };


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
 * Subject order for the broadsheet:
 * English first, Mathematics second, then every other subject A-Z.
 * CRS and IRS (whatever the school calls them) always stay side by
 * side as one block (Christian first, then Islamic). The block takes
 * its place among the other subjects alphabetically, so it never
 * sits straight after English and Maths unless it falls there on its
 * own. English / English Language / English Studies and Mathematics /
 * Maths / Math / General or Basic Mathematics are matched by name (an
 * optional "(...)" on the end is ignored). "Further Mathematics" and
 * "English Literature" are treated as ordinary subjects.
 */
function coreRank(name) {

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

    return null;

}


function orderSubjects(list) {

    const byName =
        (a, b) => String(a.subject_name).localeCompare(String(b.subject_name));

    const core =
        list
            .filter(cs => coreRank(cs.subject_name) !== null)
            .sort((a, b) => coreRank(a.subject_name) - coreRank(b.subject_name) || byName(a, b));

    const religion =
        list
            .filter(cs => coreRank(cs.subject_name) === null && religionOf(cs.subject_name))
            .sort(
                (a, b) =>
                    (religionOf(a.subject_name) === "christian" ? 0 : 1) -
                    (religionOf(b.subject_name) === "christian" ? 0 : 1) ||
                    byName(a, b)
            );

    // Every other subject is one unit; the CRS + IRS pair is one unit
    // too, filed under the name that sorts first, so the two can never
    // be split up.

    const units =
        list
            .filter(cs => coreRank(cs.subject_name) === null && !religionOf(cs.subject_name))
            .map(cs => ({ key: cs.subject_name, items: [cs] }));

    if (religion.length > 0) {

        units.push({
            key: religion.map(cs => cs.subject_name).sort((a, b) => a.localeCompare(b))[0],
            items: religion
        });

    }

    units.sort((a, b) => String(a.key).localeCompare(String(b.key)));

    return core.concat(...units.map(u => u.items));

}


/*
 * Christian / Islamic religious subject, whatever the school calls it
 * (CRS, CRK, Christian Religious Studies/Knowledge, IRS, IRK, Islamic
 * Religious Studies/Knowledge, Islamic Studies...). Returns null for
 * every other subject.
 */
function religionOf(name) {

    const n =
        String(name || "").trim().toLowerCase().replace(/\s+/g, " ");

    if (/^(crs|crk|christian)\b/.test(n)) {

        return "christian";

    }

    if (/^(irs|irk|islamic|islamiyat)\b/.test(n)) {

        return "islamic";

    }

    return null;

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
        orderSubjects(
            (csRows || [])
                .filter(row => row.subjects)
                .map(
                    row => ({
                        id: row.id,
                        subject_name: row.subjects.name,
                        teacher_name: row.teacher_id ? (memberNames[row.teacher_id] || "Subject teacher") : "No teacher assigned"
                    })
                )
        );


    // 2. Students

    const { data: studentRows, error: studentsError } =
        await supabaseClient
            .from("students")
            .select("id, surname, first_name, gender")
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

    // 4. Class teacher + attendance (both nice-to-have — the sheet
    //    still works without them)

    await loadClassTeacher(classId);

    try {

        await loadAttendance(classId, term);

    }
    catch (error) {

        console.warn("Attendance unavailable for broadsheet:", error);

        attendance =
            { opened: 0, presentByStudent: {}, available: false };

    }

}


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


// Full name of the class's teacher, picked up on its own.

async function loadClassTeacher(classId) {

    classTeacherName =
        "";

    try {

        const { data: classRow } =
            await supabaseClient
                .from("classes")
                .select("teacher_id")
                .eq("id", classId)
                .maybeSingle();

        if (!classRow || !classRow.teacher_id) {

            return;

        }

        const { data: member } =
            await supabaseClient
                .from("school_members")
                .select("full_name")
                .eq("id", classRow.teacher_id)
                .maybeSingle();

        if (member && member.full_name) {

            classTeacherName =
                member.full_name;

        }
        else if (classRow.teacher_id === AttendNGContext.memberId) {

            classTeacherName =
                AttendNGContext.fullName || "";

        }

    }
    catch (error) {

        console.warn("Class teacher unavailable:", error);

    }

}


/*
 * Same counting the report card and Term report use: every ticked
 * morning or afternoon is one "time present", and "times school
 * opened" is the sum of the weekly figures for weeks with attendance.
 */
async function loadSessionStartDate() {

    if (sessionStartDate) {

        return;

    }

    const { data, error } =
        await supabaseClient
            .from("sessions")
            .select("start_date")
            .eq("id", AttendNGContext.sessionId)
            .maybeSingle();

    if (error) {

        throw error;

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


async function loadAttendance(classId, term) {

    attendance =
        { opened: 0, presentByStudent: {}, available: false };

    await loadSessionStartDate();

    if (!sessionStartDate || students.length === 0) {

        return;

    }

    const rows =
        await fetchPaged(
            () => supabaseClient
                .from("attendance")
                .select("student_id, date, morning_present, afternoon_present")
                .in("student_id", students.map(s => s.id))
                .eq("term", term)
                .order("student_id")
                .order("date")
        );

    const weeks =
        new Set();

    rows.forEach(
        r => {

            weeks.add(weekNumberForDate(r.date));

            attendance.presentByStudent[r.student_id] =
                (attendance.presentByStudent[r.student_id] || 0) +
                (r.morning_present ? 1 : 0) +
                (r.afternoon_present ? 1 : 0);

        }
    );

    if (weeks.size === 0) {

        return;

    }

    const { data: settingsRows, error } =
        await supabaseClient
            .from("weekly_settings")
            .select("week, school_opened")
            .eq("class_id", classId)
            .in("week", Array.from(weeks));

    if (error) {

        throw error;

    }

    attendance.opened =
        settingsRows.reduce((sum, s) => sum + s.school_opened, 0);

    attendance.available =
        attendance.opened > 0;

}


/* ==========================================
   COMPUTE
========================================== */

/*
 * A student only takes one of CRS / IRS. When a religion cell is blank
 * but the student has a score in the other religion subject, the blank
 * is "not taken" — not a missing score.
 */
function isNotTaken(cs, student) {

    const religion =
        religionOf(cs.subject_name);

    if (!religion) {

        return false;

    }

    return classSubjects.some(
        other => {

            const otherReligion =
                religionOf(other.subject_name);

            if (!otherReligion || otherReligion === religion) {

                return false;

            }

            const entry =
                scoreMap[`${other.id}|${student.id}`];

            return !!entry && entry.total !== null;

        }
    );

}


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

                    if ((!entry || entry.total === null) && !isNotTaken(cs, student)) {

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

                let missing =
                    false;

                const counts =
                    { A: 0, B: 0, C: 0, P: 0, F: 0 };

                const cells =
                    classSubjects.map(
                        cs => {

                            const entry =
                                scoreMap[`${cs.id}|${student.id}`];

                            if (entry && entry.total !== null) {

                                total += entry.total;
                                scored += 1;

                                const result =
                                    gradeFor(entry.total);

                                if (result) {

                                    counts[result.grade] += 1;

                                }

                                return { v: entry.total, na: false };

                            }

                            if (isNotTaken(cs, student)) {

                                return { v: null, na: true };

                            }

                            missing = true;

                            return { v: null, na: false };

                        }
                    );

                const present =
                    attendance.presentByStudent[student.id] || 0;

                return {
                    name: `${student.surname} ${student.first_name}`.toUpperCase(),
                    surname: student.surname,
                    gender: (student.gender || "").toString().trim().charAt(0).toUpperCase(),
                    cells,
                    counts,
                    total,
                    scored,
                    average: scored > 0 ? total / scored : 0,
                    attendancePct:
                        attendance.available ?
                            Math.round((Math.min(present, attendance.opened) / attendance.opened) * 100) :
                            null,
                    incomplete: missing
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


// Average / highest / lowest for each subject, over the students
// who have a complete score in it.

function subjectStats() {

    return classSubjects.map(
        (cs, i) => {

            const values =
                sheetRows
                    .map(row => row.cells[i].v)
                    .filter(v => v !== null);

            if (values.length === 0) {

                return { name: cs.subject_name, average: null, highest: null, lowest: null };

            }

            return {
                name: cs.subject_name,
                average: values.reduce((a, b) => a + b, 0) / values.length,
                highest: Math.max(...values),
                lowest: Math.min(...values)
            };

        }
    );

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


function escapeHtml(value) {

    return String(value === null || value === undefined ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

}


/* ==========================================
   RENDER
========================================== */

// The five grade-count columns, with their score range read from the
// grading scale so the heading can never drift from the real bands.

function countColumns() {

    const scale =
        window.GRADE_SCALE || [];

    const labels =
        { A: "DISTINCTION", B: "GOOD", C: "CREDIT", P: "PASSED", F: "FAILED" };

    return ["A", "B", "C", "P", "F"].map(
        key => {

            const index =
                scale.findIndex(band => band.grade === key);

            let range =
                "";

            if (index >= 0) {

                const high =
                    index === 0 ? 100 : scale[index - 1].min - 1;

                range =
                    `[${scale[index].min} - ${high}]`;

            }

            return { key, title: `NO OF ${labels[key]}`, range };

        }
    );

}


function renderSheet() {

    const thStyle =
        "padding:10px 8px; text-align:center; background:#0F766E; color:#FFFFFF; font-weight:600;";

    const shortLabel =
        { A: "D", B: "G", C: "C", P: "P", F: "F" };

    document.getElementById("sheetHead").innerHTML = `
        <tr>
            <th class="sticky-col1" style="${thStyle} width:56px;">S/N</th>
            <th class="sticky-col2" style="${thStyle} left:56px; min-width:180px; text-align:left;">Student Name</th>
            <th style="${thStyle} min-width:50px;">Sex</th>
            ${classSubjects.map(cs => `<th style="${thStyle} min-width:90px;" title="${escapeHtml(cs.teacher_name)}">${escapeHtml(cs.subject_name)}</th>`).join("")}
            ${countColumns().map(c => `<th style="${thStyle} min-width:44px;" title="${escapeHtml(c.title + " " + c.range)}">${shortLabel[c.key]}</th>`).join("")}
            <th style="${thStyle} min-width:80px;">Total</th>
            <th style="${thStyle} min-width:80px;">%</th>
            <th style="${thStyle} min-width:80px;">Position</th>
            <th style="${thStyle} min-width:80px;">Attend. %</th>
        </tr>
    `;

    document.getElementById("sheetBody").innerHTML =
        sheetRows.map(
            (row, index) => `
                <tr style="border-bottom:1px solid var(--border);">
                    <td class="sticky-col1" style="padding:10px 8px;">${index + 1}</td>
                    <td class="sticky-col2" style="padding:10px 8px; left:56px;">${escapeHtml(row.name)}</td>
                    <td style="padding:10px 8px; text-align:center;">${escapeHtml(row.gender) || "—"}</td>
                    ${row.cells.map(
                        cell =>
                            cell.v !== null ?
                                `<td style="padding:10px 8px; text-align:center;">${cell.v}</td>` :
                                cell.na ?
                                    `<td style="padding:10px 8px; text-align:center; color:var(--text-muted);">-</td>` :
                                    `<td class="missing" style="padding:10px 8px; text-align:center;">—</td>`
                    ).join("")}
                    <td style="padding:10px 8px; text-align:center;">${row.counts.A}</td>
                    <td style="padding:10px 8px; text-align:center;">${row.counts.B}</td>
                    <td style="padding:10px 8px; text-align:center;">${row.counts.C}</td>
                    <td style="padding:10px 8px; text-align:center;">${row.counts.P}</td>
                    <td style="padding:10px 8px; text-align:center;">${row.counts.F}</td>
                    <td style="padding:10px 8px; text-align:center; font-weight:600;">${row.total}</td>
                    <td style="padding:10px 8px; text-align:center;">${row.scored > 0 ? formatAverage(row.average) : "—"}</td>
                    <td style="padding:10px 8px; text-align:center; font-weight:600;">${ordinal(row.position)}</td>
                    <td style="padding:10px 8px; text-align:center;">${row.attendancePct === null ? "—" : row.attendancePct + "%"}</td>
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

    const takenCells =
        classSubjects.reduce(
            (sum, cs) => sum + students.filter(st => !isNotTaken(cs, st)).length,
            0
        );

    document.getElementById("missingSummary").textContent =
        `${missingTotal} of ${takenCells} scores are missing or incomplete (CA and Exam both needed).`;

    document.getElementById("missingList").innerHTML =
        missingBySubject.map(
            item => `
                <li>
                    <strong>${escapeHtml(item.subject_name)}</strong>
                    — ${item.count} ${item.count === 1 ? "student" : "students"}
                    <br><span>${escapeHtml(item.teacher_name)}</span>
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

    document.getElementById("pdfBtn").addEventListener("click", downloadPdf);

}


/* ==========================================
   DOWNLOAD PDF  (always A4 landscape)

   Drawn straight into the PDF as a table, so the text stays sharp
   and long classes flow onto extra pages with the header repeated.
   The last page holds each subject's average, highest and lowest.
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


function broadsheetFileName() {

    return `${schoolNamePartForFilename(AttendNGContext.schoolName)}_${filenameSafe(sheetClassName)}_Broadsheet_${filenameSafe(sheetTerm)}.pdf`;

}


// The logo is fetched once and embedded as data, with its real
// proportions kept.

async function loadLogoForPdf() {

    const url =
        AttendNGContext.schoolLogoUrl;

    if (!url) {

        return null;

    }

    try {

        const response =
            await fetch(url, { mode: "cors" });

        if (!response.ok) {

            throw new Error(`HTTP ${response.status}`);

        }

        const blob =
            await response.blob();

        const dataUrl =
            await new Promise(
                (resolve, reject) => {

                    const reader =
                        new FileReader();

                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);

                }
            );

        const img =
            new Image();

        img.src =
            dataUrl;

        await img.decode();

        // jsPDF can only place PNG / JPEG directly, so anything else
        // (webp, svg...) is redrawn as PNG first.

        let format =
            /^data:image\/png/i.test(dataUrl) ? "PNG" :
            /^data:image\/jpe?g/i.test(dataUrl) ? "JPEG" :
            null;

        let finalData =
            dataUrl;

        if (!format) {

            const canvas =
                document.createElement("canvas");

            canvas.width = img.naturalWidth || 200;
            canvas.height = img.naturalHeight || 200;

            canvas.getContext("2d").drawImage(img, 0, 0);

            finalData = canvas.toDataURL("image/png");
            format = "PNG";

        }

        return {
            data: finalData,
            format,
            ratio: (img.naturalWidth || 1) / (img.naturalHeight || 1)
        };

    }
    catch (error) {

        console.warn("Logo could not be embedded in the PDF:", error);

        return null;

    }

}


const BS_TEAL = [15, 118, 110];
const BS_MARGIN_X = 10;
const BS_HEADER_BOTTOM = 30;   // table starts below this on every page


async function downloadPdf() {

    const button =
        document.getElementById("pdfBtn");

    if (button.disabled) {

        return;

    }

    if (!window.jspdf || !window.jspdf.jsPDF) {

        showToast("The PDF tools didn't load. Check your connection and refresh the page.");

        return;

    }

    if (sheetRows.length === 0) {

        return;

    }

    const originalHtml =
        button.innerHTML;

    button.disabled =
        true;

    try {

        button.innerHTML =
            `<i class="fa-solid fa-spinner fa-spin"></i> Preparing PDF…`;

        const doc =
            new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });

        if (typeof doc.autoTable !== "function") {

            showToast("The PDF tools didn't load. Check your connection and refresh the page.");

            return;

        }

        const logo =
            await loadLogoForPdf();

        const pageW =
            doc.internal.pageSize.getWidth();

        const pageH =
            doc.internal.pageSize.getHeight();

        const contentW =
            pageW - BS_MARGIN_X * 2;

        // ---- Header, drawn on every page ----

        const drawHeader =
            () => {

                let textX =
                    BS_MARGIN_X;

                if (logo) {

                    const box =
                        16;

                    const w =
                        logo.ratio >= 1 ? box : box * logo.ratio;

                    const h =
                        logo.ratio >= 1 ? box / logo.ratio : box;

                    try {

                        doc.addImage(logo.data, logo.format, BS_MARGIN_X, 8, w, h);

                        textX =
                            BS_MARGIN_X + box + 4;

                    }
                    catch (error) {

                        console.warn("Logo skipped:", error);

                    }

                }

                doc.setTextColor(0, 0, 0);

                doc.setFont("helvetica", "bold");
                doc.setFontSize(14);
                doc.text(String(AttendNGContext.schoolName || "School").toUpperCase(), textX, 13);

                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.text(`${sheetClassName} Broadsheet  |  ${sheetTerm}  |  ${AttendNGContext.sessionName || ""}`, textX, 19);

                doc.setFont("helvetica", "normal");
                doc.setFontSize(9);
                doc.text(`Class Teacher: ${classTeacherName || "—"}`, textX, 24.5);

            };

        // ---- Main table ----

        const countCols =
            countColumns();

        // Subject and grade-count headings are written vertically
        // (reading bottom to top). autoTable can't rotate text, so
        // those head cells are left empty and drawn by hand in
        // didDrawCell; here we work out each heading's lines and how
        // tall the head row has to be to fit the longest one.

        const rotatedHead =
            {};

        rotatedHead[2] =
            ["SEX"];

        classSubjects.forEach(
            (cs, i) => { rotatedHead[3 + i] = [String(cs.subject_name).toUpperCase()]; }
        );

        countCols.forEach(
            (c, i) => { rotatedHead[3 + classSubjects.length + i] = [c.title, c.range].filter(Boolean); }
        );

        const HEAD_FONT = 6.5;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(HEAD_FONT);

        const headHeight =
            Math.max(
                18,
                ...Object.values(rotatedHead).flat().map(line => doc.getTextWidth(line))
            ) + 5;

        const blankHead =
            (index) => ({ content: "", styles: index === 0 ? { minCellHeight: headHeight } : {} });

        const head = [[
            { content: "S/N", styles: { minCellHeight: headHeight, valign: "bottom" } },
            { content: "NAME OF STUDENTS", styles: { valign: "bottom" } },
            blankHead(1),
            ...classSubjects.map(() => blankHead(1)),
            ...countCols.map(() => blankHead(1)),
            { content: "TOTAL", styles: { valign: "bottom" } },
            { content: "%", styles: { valign: "bottom" } },
            { content: "POS.", styles: { valign: "bottom" } },
            { content: "ATT. %", styles: { valign: "bottom" } }
        ]];

        const MISSING_FILL =
            [255, 247, 230];

        const body =
            sheetRows.map(
                (row, index) => [
                    index + 1,
                    row.name,
                    row.gender || "-",
                    ...row.cells.map(
                        cell =>
                            cell.v !== null ?
                                cell.v :
                                cell.na ?
                                    "-" :
                                    { content: "-", styles: { fillColor: MISSING_FILL } }
                    ),
                    ...countCols.map(c => row.counts[c.key]),
                    row.total,
                    row.scored > 0 ? formatAverage(row.average) : "-",
                    ordinal(row.position).toUpperCase(),
                    row.attendancePct === null ? "-" : `${row.attendancePct}%`
                ]
            );

        const subjectCount =
            classSubjects.length;

        const columnStyles =
            {
                0: { cellWidth: 8 },
                1: { cellWidth: 44, halign: "left" },
                2: { cellWidth: 8 }
            };

        const tailStart =
            3 + subjectCount;

        [7, 7, 7, 7, 7, 11, 10, 10, 11].forEach(
            (width, i) => {

                columnStyles[tailStart + i] = { cellWidth: width };

            }
        );

        doc.autoTable({
            head,
            body,
            startY: BS_HEADER_BOTTOM,
            margin: { top: BS_HEADER_BOTTOM, left: BS_MARGIN_X, right: BS_MARGIN_X, bottom: 12 },
            tableWidth: contentW,
            theme: "grid",
            styles: {
                font: "helvetica",
                fontSize: 7.5,
                cellPadding: { top: 1.1, bottom: 1.1, left: 0.8, right: 0.8 },
                halign: "center",
                valign: "middle",
                lineColor: [170, 170, 170],
                lineWidth: 0.1,
                textColor: [20, 20, 20],
                overflow: "linebreak"
            },
            headStyles: {
                fillColor: BS_TEAL,
                textColor: [255, 255, 255],
                fontStyle: "bold",
                fontSize: 6.5,
                valign: "middle"
            },
            columnStyles,
            showHead: "everyPage",
            rowPageBreak: "avoid",
            didDrawCell: (data) => {

                if (data.section !== "head" || !rotatedHead[data.column.index]) {

                    return;

                }

                const lines =
                    rotatedHead[data.column.index];

                const lineH =
                    HEAD_FONT * 0.3528 * 1.2;   // pt -> mm, with a little leading

                const sizeMm =
                    HEAD_FONT * 0.3528;

                const left =
                    data.cell.x + data.cell.width / 2 - (lines.length * lineH) / 2;

                doc.setFont("helvetica", "bold");
                doc.setFontSize(HEAD_FONT);
                doc.setTextColor(255, 255, 255);

                lines.forEach(
                    (line, i) => {

                        doc.text(
                            line,
                            left + lineH * (i + 0.5) + sizeMm * 0.36,
                            data.cell.y + data.cell.height - 2,
                            { angle: 90 }
                        );

                    }
                );

            },
            didDrawPage: drawHeader
        });

        const mainPages =
            doc.internal.getNumberOfPages();

        // ---- Last page: subject average / highest / lowest ----

        doc.addPage();

        const stats =
            subjectStats();

        const statsWidth =
            Math.min(contentW, 150);

        doc.autoTable({
            head: [["SUBJECT", "SUBJECT AVERAGE", "CLASS HIGHEST", "CLASS LOWEST"]],
            body: stats.map(
                st => [
                    st.name,
                    st.average === null ? "-" : formatAverage(st.average),
                    st.highest === null ? "-" : st.highest,
                    st.lowest === null ? "-" : st.lowest
                ]
            ),
            startY: BS_HEADER_BOTTOM,
            margin: { top: BS_HEADER_BOTTOM, left: BS_MARGIN_X, right: BS_MARGIN_X, bottom: 12 },
            tableWidth: statsWidth,
            theme: "grid",
            styles: {
                font: "helvetica",
                fontSize: 9,
                cellPadding: 1.8,
                halign: "center",
                valign: "middle",
                lineColor: [170, 170, 170],
                lineWidth: 0.1,
                textColor: [20, 20, 20]
            },
            headStyles: {
                fillColor: BS_TEAL,
                textColor: [255, 255, 255],
                fontStyle: "bold",
                fontSize: 8.5
            },
            columnStyles: {
                0: { halign: "left", cellWidth: statsWidth - 3 * 32, fontStyle: "bold" },
                1: { cellWidth: 32 },
                2: { cellWidth: 32 },
                3: { cellWidth: 32 }
            },
            didDrawPage: drawHeader
        });

        // ---- Footer on every page ----

        const totalPages =
            doc.internal.getNumberOfPages();

        for (let page = 1; page <= totalPages; page++) {

            doc.setPage(page);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(110, 110, 110);

            if (page <= mainPages) {

                doc.text(
                    "D = Distinction   G = Good   C = Credit   P = Passed   F = Failed   (ATT. % = student attendance)",
                    BS_MARGIN_X,
                    pageH - 5
                );

            }

            doc.text("Powered by AttendNG", pageW / 2, pageH - 5, { align: "center" });

            doc.text(`Page ${page} of ${totalPages}`, pageW - BS_MARGIN_X, pageH - 5, { align: "right" });

        }

        doc.save(broadsheetFileName());

    }
    catch (error) {

        console.error("Unable to create the PDF:", error);

        showToast("Couldn't create the PDF. Please try again.");

    }
    finally {

        button.disabled =
            false;

        button.innerHTML =
            originalHtml;

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
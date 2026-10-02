/*************************************************
 * REPORT-CARD.JS
 *
 * One report card per student for a class + term.
 *
 *  1st term -> shows 1st               (1st highlighted)
 *  2nd term -> shows 1st, 2nd          (2nd highlighted)
 *  3rd term -> shows 1st, 2nd, 3rd,AVG (AVG highlighted)
 *
 * AVG = sum of the term totals the student actually has for
 * that subject, divided by how many terms that is.
 *
 * A term only counts for a subject once BOTH CA (out of 40)
 * and Exam (out of 60) are in — the same rule the Results page
 * and the broadsheet use.
 *
 * Who can use it: admins (any class) and class teachers
 * (their own class). Both remarks (class teacher's and
 * principal's) are written automatically from the student's
 * results and cannot be edited.
 *************************************************/

const TERMS = ["1st Term", "2nd Term", "3rd Term"];

/*
 * Class teacher's remark, written automatically from the student's
 * overall grade (the same A / B / C / P / F scale as everywhere else,
 * via gradeFor). Five variants per grade; [First Name] is swapped for
 * the student's first name. A variant is picked at random for each
 * student; students in the same grade are dealt from a shuffled deck,
 * so the five variants get used evenly before any repeats. The pick is
 * remembered while the page is open, so re-rendering or printing a
 * card never changes its remark.
 */
const TEACHER_COMMENTS = {
    A: [
        "[First Name] has performed excellently. Keep up the outstanding work!",
        "[First Name] has demonstrated an excellent understanding of the subject. Well done!",
        "[First Name] has achieved an impressive result. Keep up the good work!",
        "[First Name] has shown excellent effort and understanding. Maintain this standard!",
        "[First Name] has done exceptionally well. Keep striving for greater heights!"
    ],
    B: [
        "[First Name] has performed very well. Keep working hard!",
        "[First Name] has shown a good understanding of the subject. Keep it up!",
        "[First Name] has done well. More effort can lead to an even better result.",
        "[First Name] has demonstrated good academic progress. Keep working hard!",
        "[First Name] has produced a very good result. Aim even higher next time!"
    ],
    C: [
        "[First Name] has done well. Put in more effort for better results.",
        "[First Name] has shown a fair understanding of the subject. Keep working hard!",
        "[First Name] has made good progress. More practice will improve the result.",
        "[First Name] has achieved a satisfactory result. Greater effort is encouraged.",
        "[First Name] has made a good attempt. Keep working towards better performance."
    ],
    P: [
        "[First Name] has made a fair attempt. More effort is needed.",
        "[First Name] has achieved a pass. More practice and attention are required.",
        "[First Name] has shown some understanding of the subject. Keep working harder.",
        "[First Name] needs to put in more effort to improve this performance.",
        "[First Name] has made progress, but greater effort is needed for better results."
    ],
    F: [
        "[First Name] needs to work harder and pay more attention to lessons.",
        "[First Name] needs significant improvement. More effort and practice are required.",
        "[First Name] should work harder and seek help where necessary.",
        "[First Name] needs to improve concentration and put more effort into studies.",
        "[First Name] has not met the expected standard. Greater effort is required next term."
    ]
};

/*
 * Principal's remark, written automatically from the overall
 * percentage. Five variants per band; one is picked at random for
 * each student, dealt from a shuffled deck so students in the same
 * band get an even spread before any repeats (same method as the
 * class teacher's remark). Highest band first.
 */
const PRINCIPAL_BANDS = [
    {
        min: 80,
        comments: [
            "Outstanding performance. Keep it up!",
            "Excellent result. Maintain this impressive standard!",
            "An exceptional performance. Keep striving for excellence!",
            "Remarkable achievement. Continue with the good work!",
            "Excellent performance. Keep aiming for greater heights!"
        ]
    },
    {
        min: 70,
        comments: [
            "Very good performance. Keep pushing!",
            "A very commendable result. Keep up the good work!",
            "Very good achievement. Continue to work hard!",
            "A strong performance. Keep striving for excellence!",
            "Very good result. With continued effort, you can do even better!"
        ]
    },
    {
        min: 60,
        comments: [
            "Above average performance. Aim higher!",
            "A good performance. Keep working towards greater achievement!",
            "Good result. More effort can lead to an even better performance!",
            "A commendable performance. Continue to work hard!",
            "Good progress. Keep pushing yourself to achieve more!"
        ]
    },
    {
        min: 50,
        comments: [
            "Average performance. You need more effort.",
            "A fair performance. Greater effort is needed for improvement.",
            "Satisfactory result. Work harder to achieve better results.",
            "An average performance. More dedication is required.",
            "Fair result. Put in more effort and aim higher next time!"
        ]
    },
    {
        min: 0,
        comments: [
            "Poor performance. You must work harder.",
            "Performance is below expectation. More effort is needed.",
            "An unsatisfactory result. Greater commitment to studies is required.",
            "More effort and dedication are needed to improve this performance.",
            "This result needs significant improvement. Work harder next term."
        ]
    }
];


let isAdmin = false;
let sessionStartDate = null;

let classes = [];
let selectedClassId = null;
let selectedClassName = "";
let selectedTerm = "";

let schoolInfo = { name: "", logo_url: null, address: null, phone: null };

let classSubjects = [];     // [{ id, subject_name }]
let students = [];
let scoreMap = {};          // `${cs}|${student}|${term}` -> { ca, exam, total|null }
let termDates = { resume_date: null, close_date: null, next_term_date: null };
let attendance = { opened: 0, presentByStudent: {}, available: false };

let cards = [];
let visibleStudentId = "all";


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    // Teachers with no class of their own have no report card to see.
    if (AttendNGContext.tier === "teacher" && !AttendNGContext.classId) {

        window.location.href =
            "/school/dashboard.html";

        return;

    }

    isAdmin =
        AttendNGContext.tier === "admin";

    document.getElementById("sessionLabel").textContent =
        AttendNGContext.sessionName || "";

    document.getElementById("termSelect").value =
        AttendNGContext.currentTerm || "1st Term";

    await loadSchoolInfo();

    await loadClasses();

    bindUI();

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
   SMALL HELPERS
========================================== */

function escapeHtml(value) {

    return String(value === null || value === undefined ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

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


function formatScore(value) {

    if (value === null || value === undefined) {

        return "—";

    }

    const rounded =
        Math.round(value * 10) / 10;

    return Number.isInteger(rounded) ?
        String(rounded) :
        rounded.toFixed(1);

}


function formatPercent(value) {

    return `${Math.round(value * 100) / 100}%`;

}


const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

// "2025-01-06" -> "6th January 2025" (split by hand so timezones can't shift the day)
function formatLongDate(iso) {

    if (!iso) {

        return "—";

    }

    const [y, m, d] =
        iso.split("-").map(Number);

    return `${ordinal(d)} ${MONTHS[m - 1]} ${y}`;

}


// "2013-05-30" -> "30/05/2013"
function formatShortDate(iso) {

    if (!iso) {

        return "—";

    }

    const [y, m, d] =
        iso.split("-");

    return `${d}/${m}/${y}`;

}


function ageFromDob(iso) {

    if (!iso) {

        return "—";

    }

    const [y, m, d] =
        iso.split("-").map(Number);

    const today =
        new Date();

    let age =
        today.getFullYear() - y;

    const hadBirthday =
        (today.getMonth() + 1 > m) ||
        (today.getMonth() + 1 === m && today.getDate() >= d);

    if (!hadBirthday) {

        age -= 1;

    }

    return age >= 0 ? age : "—";

}


const principalPickCache = {};     // `${studentId}|${term}` -> { min, index }

function principalSuggestion(card) {

    // No scores in yet -> nothing sensible to say.
    if (!card.scored) {

        return "";

    }

    // Same rounding as the percentage printed on the card.
    const percentage =
        Math.round(card.percentage * 100) / 100;

    const band =
        PRINCIPAL_BANDS.find(b => percentage >= b.min) ||
        PRINCIPAL_BANDS[PRINCIPAL_BANDS.length - 1];

    const key =
        `${card.student.id}|${selectedTerm}`;

    // Re-roll only if the student has moved to a different band.
    if (!principalPickCache[key] || principalPickCache[key].min !== band.min) {

        principalPickCache[key] =
            { min: band.min, index: dealVariant(`principal|${band.min}`, band.comments.length) };

    }

    return band.comments[principalPickCache[key].index];

}


function firstNameFor(student) {

    const raw =
        (student.first_name || "").trim();

    if (!raw) {

        return "This student";

    }

    // "JOHN" / "john" -> "John"; mixed case ("McKenzie") is left alone.
    return (raw === raw.toUpperCase() || raw === raw.toLowerCase()) ?
        raw.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase()) :
        raw;

}


function teacherCommentOptions(card) {

    // No scores in yet -> nothing sensible to say.
    if (!card.scored) {

        return [];

    }

    const band =
        gradeFor(card.percentage);

    const bank =
        band ? TEACHER_COMMENTS[band.grade] : null;

    if (!bank) {

        return [];

    }

    const name =
        firstNameFor(card.student);

    return bank.map(text => text.replace("[First Name]", name));

}


const teacherPickCache = {};      // `${studentId}|${term}` -> { grade, index }
const variantDecks = {};          // deck key -> shuffled variant indexes still to deal

function dealVariant(deckKey, size) {

    if (!variantDecks[deckKey] || variantDecks[deckKey].length === 0) {

        const deck =
            Array.from({ length: size }, (_, i) => i);

        // Fisher-Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {

            const j =
                Math.floor(Math.random() * (i + 1));

            [deck[i], deck[j]] = [deck[j], deck[i]];

        }

        variantDecks[deckKey] =
            deck;

    }

    return variantDecks[deckKey].pop();

}


function teacherSuggestion(card) {

    const options =
        teacherCommentOptions(card);

    if (!options.length) {

        return "";

    }

    const grade =
        gradeFor(card.percentage).grade;

    const key =
        `${card.student.id}|${selectedTerm}`;

    // Re-roll only if the student's grade has changed since the last pick.
    if (!teacherPickCache[key] || teacherPickCache[key].grade !== grade) {

        teacherPickCache[key] =
            { grade, index: dealVariant(`teacher|${grade}`, options.length) };

    }

    return options[teacherPickCache[key].index];

}


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


// Supabase returns at most 1000 rows per request, so anything that can
// grow past that (scores, attendance) is pulled in pages.
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


/* ==========================================
   LOAD — SCHOOL + CLASSES
========================================== */

async function loadSchoolInfo() {

    schoolInfo = {
        name: AttendNGContext.schoolName,
        logo_url: AttendNGContext.schoolLogoUrl,
        address: null,
        phone: null
    };

    const { data, error } =
        await supabaseClient
            .from("schools")
            .select("name, logo_url, address, phone")
            .eq("id", AttendNGContext.schoolId)
            .maybeSingle();

    if (error) {

        console.error("Unable to load school details:", error);

        return;

    }

    if (data) {

        schoolInfo = data;

    }

}


async function loadClasses() {

    const noClassesNotice =
        document.getElementById("noClassesNotice");

    const generateBtn =
        document.getElementById("generateBtn");

    if (!AttendNGContext.sessionId) {

        noClassesNotice.style.display =
            "block";

        generateBtn.disabled =
            true;

        return;

    }

    let query =
        supabaseClient
            .from("classes")
            .select("id, name")
            .eq("session_id", AttendNGContext.sessionId)
            .order("name");

    if (!isAdmin) {

        query =
            query.eq("id", AttendNGContext.classId);

    }

    const { data, error } =
        await query;

    if (error) {

        console.error("Unable to load classes:", error);

        return;

    }

    classes =
        data || [];

    if (classes.length === 0) {

        noClassesNotice.style.display =
            "block";

        generateBtn.disabled =
            true;

        return;

    }

    const select =
        document.getElementById("classSelect");

    select.innerHTML =
        classes.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");

    // Class teachers only ever have their own class, so no picker.
    document.getElementById("classField").style.display =
        isAdmin ? "block" : "none";

    const remembered =
        sessionStorage.getItem("attendng_selected_class_id");

    if (isAdmin && remembered && classes.some(c => c.id === remembered)) {

        select.value =
            remembered;

    }
    else if (AttendNGContext.classId && classes.some(c => c.id === AttendNGContext.classId)) {

        select.value =
            AttendNGContext.classId;

    }

}


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


/* ==========================================
   LOAD — EVERYTHING A CARD NEEDS
========================================== */

async function loadData(classId, term) {

    const termCount =
        TERMS.indexOf(term) + 1;

    const termsNeeded =
        TERMS.slice(0, termCount);

    let setupProblems =
        false;

    // 1. Subjects assigned to the class
    const { data: csRows, error: csError } =
        await supabaseClient
            .from("class_subjects")
            .select("id, subjects ( id, name )")
            .eq("class_id", classId);

    if (csError) {

        throw csError;

    }

    classSubjects =
        (csRows || [])
            .filter(row => row.subjects)
            .map(row => ({ id: row.id, subject_name: row.subjects.name }))
            .sort((a, b) => compareSubjects(a.subject_name, b.subject_name));

    // 2. Students
    const { data: studentRows, error: studentsError } =
        await supabaseClient
            .from("students")
            .select("id, surname, first_name, other_name, gender, admission_no, date_of_birth")
            .eq("class_id", classId)
            .order("surname")
            .order("first_name");

    if (studentsError) {

        throw studentsError;

    }

    students =
        studentRows || [];

    // 3. Scores for this term and every earlier one
    scoreMap =
        {};

    if (classSubjects.length > 0 && students.length > 0) {

        const csIds =
            classSubjects.map(cs => cs.id);

        const scoreRows =
            await fetchPaged(
                () => supabaseClient
                    .from("scores")
                    .select("class_subject_id, student_id, term, ca_score, exam_score")
                    .in("class_subject_id", csIds)
                    .in("term", termsNeeded)
                    .order("id")
            );

        scoreRows.forEach(
            row => {

                const complete =
                    row.ca_score !== null && row.exam_score !== null;

                scoreMap[`${row.class_subject_id}|${row.student_id}|${row.term}`] = {
                    ca: row.ca_score,
                    exam: row.exam_score,
                    total: complete ? Number(row.ca_score) + Number(row.exam_score) : null
                };

            }
        );

    }

    // 5. Term dates
    termDates =
        { resume_date: null, close_date: null, next_term_date: null };

    const { data: dateRow, error: datesError } =
        await supabaseClient
            .from("term_dates")
            .select("resume_date, close_date, next_term_date")
            .eq("session_id", AttendNGContext.sessionId)
            .eq("term", term)
            .maybeSingle();

    if (datesError) {

        console.error("Unable to load term dates:", datesError);

        setupProblems =
            true;

    }
    else if (dateRow) {

        termDates =
            dateRow;

    }

    // 6. Attendance for this term
    await loadAttendance(classId, term);

    return setupProblems;

}


/*
 * Same counting the Term report uses: every ticked morning or
 * afternoon is one "time present", and "times school opened" is the
 * sum of the weekly figures for the weeks that have attendance.
 */
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

        console.error("Unable to load weekly settings:", error);

        return;

    }

    attendance.opened =
        settingsRows.reduce((sum, s) => sum + s.school_opened, 0);

    attendance.available =
        attendance.opened > 0;

}


/* ==========================================
   COMPUTE
========================================== */

function termEntry(csId, studentId, term) {

    return scoreMap[`${csId}|${studentId}|${term}`] || null;

}


function buildCards() {

    const termCount =
        TERMS.indexOf(selectedTerm) + 1;

    cards =
        students.map(
            student => {

                const rows =
                    classSubjects.map(
                        cs => {

                            // Complete totals for each term up to the selected one.
                            const termTotals =
                                TERMS.slice(0, termCount).map(
                                    term => {

                                        const entry =
                                            termEntry(cs.id, student.id, term);

                                        return entry && entry.total !== null ? entry.total : null;

                                    }
                                );

                            const current =
                                termEntry(cs.id, student.id, selectedTerm);

                            // The score this card is built on.
                            let used =
                                null;

                            if (termCount === 1) {

                                used =
                                    termTotals[0];

                            }
                            else if (termCount === 2) {

                                used =
                                    termTotals[1];

                            }
                            else {

                                const available =
                                    termTotals.filter(v => v !== null);

                                used =
                                    available.length > 0 ?
                                        available.reduce((a, b) => a + b, 0) / available.length :
                                        null;

                            }

                            return {
                                subject: cs.subject_name,
                                ca: current ? current.ca : null,
                                exam: current ? current.exam : null,
                                termTotals,
                                used,
                                grade: gradeFor(used)
                            };

                        }
                    );

                const scoredRows =
                    rows.filter(r => r.used !== null);

                const total =
                    scoredRows.reduce((sum, r) => sum + r.used, 0);

                const obtainable =
                    scoredRows.length * 100;

                const percentage =
                    obtainable > 0 ? (total / obtainable) * 100 : 0;

                const present =
                    attendance.presentByStudent[student.id] || 0;

                return {
                    student,
                    name: [student.surname, student.first_name, student.other_name]
                        .filter(Boolean)
                        .join(" "),
                    rows,
                    scored: scoredRows.length,
                    total,
                    obtainable,
                    percentage,
                    position: null,
                    present: Math.min(present, attendance.opened || present),
                    absent: Math.max((attendance.opened || 0) - present, 0)
                };

            }
        );

    // Standard competition ranking (1, 2, 2, 4) on the score the card
    // is built on — for the 3rd term that is the sum of the AVGs.
    const ranked =
        [...cards].sort(
            (a, b) =>
                b.total - a.total ||
                a.name.localeCompare(b.name)
        );

    ranked.forEach(
        (card, index) => {

            card.position =
                (index > 0 && card.total === ranked[index - 1].total) ?
                    ranked[index - 1].position :
                    index + 1;

        }
    );

}


/* ==========================================
   RENDER
========================================== */

function gradeKeyText() {

    return GRADE_SCALE.map(
        (band, index) => {

            const max =
                index === 0 ? 100 : GRADE_SCALE[index - 1].min - 1;

            return `${band.grade} = ${band.min}–${max} ${band.remark}`;

        }
    ).join(" &nbsp;·&nbsp; ");

}


function commentValues(card) {

    return {
        teacher: teacherSuggestion(card),
        principal: principalSuggestion(card)
    };

}


function scoreTableHtml(card) {

    const termCount =
        TERMS.indexOf(selectedTerm) + 1;

    // Which column carries the score being used this term.
    const highlight =
        termCount === 1 ? "t1" : termCount === 2 ? "t2" : "avg";

    const cls =
        (key) => key === highlight ? "hl" : "";

    let headCols =
        `
        <th>CA<small>40</small></th>
        <th>Exam<small>60</small></th>
        <th class="${cls("t1")}">1st<small>100</small></th>
        `;

    if (termCount >= 2) {

        headCols +=
            `<th class="${cls("t2")}">2nd<small>100</small></th>`;

    }

    if (termCount >= 3) {

        headCols +=
            `
            <th>3rd<small>100</small></th>
            <th class="${cls("avg")}">AVG<small>100</small></th>
            `;

    }

    headCols +=
        `<th>Grade</th><th>Remark</th>`;

    const bodyRows =
        card.rows.map(
            (row, index) => {

                let cells =
                    `
                    <td>${row.ca !== null ? row.ca : "—"}</td>
                    <td>${row.exam !== null ? row.exam : "—"}</td>
                    <td class="${cls("t1")}">${formatScore(row.termTotals[0] !== undefined ? row.termTotals[0] : null)}</td>
                    `;

                if (termCount >= 2) {

                    cells +=
                        `<td class="${cls("t2")}">${formatScore(row.termTotals[1])}</td>`;

                }

                if (termCount >= 3) {

                    cells +=
                        `
                        <td>${formatScore(row.termTotals[2])}</td>
                        <td class="${cls("avg")}">${formatScore(row.used)}</td>
                        `;

                }

                cells +=
                    `
                    <td><strong>${row.grade ? row.grade.grade : "—"}</strong></td>
                    <td>${row.grade ? row.grade.remark : "—"}</td>
                    `;

                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td class="left">${escapeHtml(row.subject)}</td>
                        ${cells}
                    </tr>
                `;

            }
        ).join("");

    const colCount =
        2 + 3 + (termCount >= 2 ? 1 : 0) + (termCount >= 3 ? 2 : 0) + 2;

    return `
        <table class="rc-scores">
            <thead>
                <tr>
                    <th>S/N</th>
                    <th class="left">Subject</th>
                    ${headCols}
                </tr>
            </thead>
            <tbody>
                ${bodyRows}
                <tr class="rc-total">
                    <td colspan="2" class="left">TOTAL NUMBER OF SUBJECTS: ${card.scored}</td>
                    <td colspan="${colCount - 2}" style="text-align:right;">TOTAL SCORE: ${formatScore(card.total)}</td>
                </tr>
            </tbody>
        </table>
    `;

}


function commentBlockHtml(label, value) {

    return `
        <div class="rc-block">
            <div class="rc-label">${label}</div>
            <div class="rc-text">${escapeHtml(value)}</div>
        </div>
    `;

}


function cardHtml(card) {

    const student =
        card.student;

    const comments =
        commentValues(card);

    const percentageGrade =
        gradeFor(card.percentage);

    const opened =
        attendance.available ? attendance.opened : "—";

    const present =
        attendance.available ? card.present : "—";

    const absent =
        attendance.available ? card.absent : "—";

    const logoHtml =
        schoolInfo.logo_url ?
            `<img src="${escapeHtml(schoolInfo.logo_url)}" alt="School logo">` :
            "";

    const termCount =
        TERMS.indexOf(selectedTerm) + 1;

    const averageNote =
        termCount === 3 ?
            `<div style="margin-top:3px;">AVG = total of the terms with scores ÷ number of those terms.</div>` :
            "";

    return `
        <article class="rc-card">

            <div class="rc-head">
                ${logoHtml}
                <div class="rc-head-text">
                    <h2>${escapeHtml(schoolInfo.name || AttendNGContext.schoolName)}</h2>
                    ${schoolInfo.address ? `<p>${escapeHtml(schoolInfo.address)}</p>` : ""}
                    ${schoolInfo.phone ? `<p>Tel: ${escapeHtml(schoolInfo.phone)}</p>` : ""}
                </div>
            </div>

            <div class="rc-title">Student Report Card — ${escapeHtml(selectedTerm)} · ${escapeHtml(AttendNGContext.sessionName)} Session</div>

            <table class="rc-info">
                <tr>
                    <td class="k">Student name</td>
                    <td colspan="3"><strong>${escapeHtml(card.name)}</strong></td>
                </tr>
                <tr>
                    <td class="k">Class</td>
                    <td>${escapeHtml(selectedClassName)}</td>
                    <td class="k">Gender</td>
                    <td style="text-transform:capitalize;">${escapeHtml(student.gender || "—")}</td>
                </tr>
                <tr>
                    <td class="k">Admission no.</td>
                    <td>${escapeHtml(student.admission_no || "—")}</td>
                    <td class="k">Date of birth</td>
                    <td>${formatShortDate(student.date_of_birth)}${student.date_of_birth ? ` (age ${ageFromDob(student.date_of_birth)})` : ""}</td>
                </tr>
                <tr>
                    <td class="k">Times school opened</td>
                    <td>${opened}</td>
                    <td class="k">Times present</td>
                    <td>${present}</td>
                </tr>
                <tr>
                    <td class="k">Times absent</td>
                    <td>${absent}</td>
                    <td class="k">Term</td>
                    <td>${escapeHtml(selectedTerm)}</td>
                </tr>
            </table>

            ${scoreTableHtml(card)}

            <table class="rc-summary">
                <tr>
                    <td class="k">Total students in class</td>
                    <td>${students.length}</td>
                    <td class="k">Percentage</td>
                    <td>${card.scored > 0 ? formatPercent(card.percentage) : "—"}</td>
                </tr>
                <tr>
                    <td class="k">Total score obtained</td>
                    <td>${formatScore(card.total)}</td>
                    <td class="k">Position</td>
                    <td><strong>${card.scored > 0 ? ordinal(card.position) : "—"}</strong></td>
                </tr>
                <tr>
                    <td class="k">Score obtainable</td>
                    <td>${card.obtainable}</td>
                    <td class="k">Grade</td>
                    <td>${card.scored > 0 && percentageGrade ? `${percentageGrade.grade} (${percentageGrade.remark})` : "—"}</td>
                </tr>
                <tr>
                    <td class="k">School resumed</td>
                    <td>${formatLongDate(termDates.resume_date)}</td>
                    <td class="k">School closes</td>
                    <td>${formatLongDate(termDates.close_date)}</td>
                </tr>
                <tr>
                    <td class="k">Next term begins</td>
                    <td colspan="3">${formatLongDate(termDates.next_term_date)}</td>
                </tr>
            </table>

            ${commentBlockHtml("Class teacher's remark", comments.teacher)}
            ${commentBlockHtml("Principal's remark", comments.principal)}

            <div class="rc-sign">
                <span>Teacher's signature &amp; date</span>
                <span>Principal's signature &amp; date</span>
                <span>Parent's name &amp; signature</span>
            </div>

            <div class="rc-key">
                GRADE / REMARK KEY: ${gradeKeyText()}
                ${averageNote}
            </div>

            <div class="rc-foot">Powered by AttendNG</div>

        </article>
    `;

}


function renderCards() {

    const list =
        visibleStudentId === "all" ?
            cards :
            cards.filter(c => c.student.id === visibleStudentId);

    document.getElementById("cardsMount").innerHTML =
        list.map(cardHtml).join("");

}


function fillStudentSelect() {

    const select =
        document.getElementById("studentSelect");

    select.innerHTML =
        `<option value="all">All students (${students.length})</option>` +
        students.map(
            s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.surname + " " + s.first_name)}</option>`
        ).join("");

    select.value =
        "all";

    visibleStudentId =
        "all";

    document.getElementById("studentField").style.display =
        "block";

}


function fillDatesForm() {

    document.getElementById("resumeDate").value =
        termDates.resume_date || "";

    document.getElementById("closeDate").value =
        termDates.close_date || "";

    document.getElementById("nextTermDate").value =
        termDates.next_term_date || "";

    document.getElementById("datesCard").style.display =
        isAdmin ? "block" : "none";

}


function hideResult() {

    document.getElementById("resultWrapper").style.display = "none";
    document.getElementById("cardActions").style.display = "none";
    document.getElementById("studentField").style.display = "none";
    document.getElementById("noSubjectsNotice").style.display = "none";
    document.getElementById("noStudentsNotice").style.display = "none";

}


/* ==========================================
   GENERATE
========================================== */

async function generate() {

    const classSelect =
        document.getElementById("classSelect");

    const classId =
        classSelect.value;

    const term =
        document.getElementById("termSelect").value;

    if (!classId) {

        return;

    }

    const button =
        document.getElementById("generateBtn");

    button.disabled =
        true;

    hideResult();

    let setupProblems =
        false;

    try {

        selectedClassId =
            classId;

        selectedClassName =
            (classes.find(c => c.id === classId) || {}).name || "";

        selectedTerm =
            term;

        setupProblems =
            await loadData(classId, term);

    }
    catch (error) {

        console.error("Unable to load report card data:", error);

        showToast("Unable to load the report cards — try again.");

        button.disabled =
            false;

        return;

    }

    button.disabled =
        false;

    if (classSubjects.length === 0) {

        document.getElementById("noSubjectsNotice").style.display =
            "block";

        return;

    }

    if (students.length === 0) {

        document.getElementById("noStudentsNotice").style.display =
            "block";

        return;

    }

    buildCards();

    // Notes above the cards
    const incomplete =
        cards.filter(c => c.scored < classSubjects.length).length;

    const incompleteNote =
        document.getElementById("incompleteNote");

    if (incomplete > 0) {

        incompleteNote.innerHTML =
            `<i class="fa-solid fa-triangle-exclamation"></i> ${incomplete} of ${students.length} students have missing scores ` +
            `(a subject needs both CA and Exam). Their cards show “—” for those subjects, and totals, percentages and positions use only the scores that are in.`;

        incompleteNote.style.display =
            "block";

    }
    else {

        incompleteNote.style.display =
            "none";

    }

    const setupNote =
        document.getElementById("setupNote");

    if (setupProblems) {

        setupNote.innerHTML =
            `<i class="fa-solid fa-triangle-exclamation"></i> Term dates couldn't be loaded — the report card database update may not have been applied yet.`;

        setupNote.style.display =
            "block";

    }
    else {

        setupNote.style.display =
            "none";

    }

    fillStudentSelect();

    fillDatesForm();

    renderCards();

    document.getElementById("resultWrapper").style.display =
        "block";

    document.getElementById("cardActions").style.display =
        "flex";

}


/* ==========================================
   TERM DATES (admins)
========================================== */

async function saveDates() {

    const button =
        document.getElementById("saveDatesBtn");

    const next = {
        resume_date: document.getElementById("resumeDate").value || null,
        close_date: document.getElementById("closeDate").value || null,
        next_term_date: document.getElementById("nextTermDate").value || null
    };

    button.disabled =
        true;

    const { error } =
        await supabaseClient
            .from("term_dates")
            .upsert(
                {
                    session_id: AttendNGContext.sessionId,
                    term: selectedTerm,
                    ...next
                },
                { onConflict: "session_id,term" }
            );

    button.disabled =
        false;

    if (error) {

        console.error("Unable to save term dates:", error);

        showToast("Unable to save the dates — try again.");

        return;

    }

    termDates =
        next;

    renderCards();

    showToast("Term dates saved.");

}


/* ==========================================
   UI BINDING
========================================== */

function bindUI() {

    document.getElementById("generateBtn").addEventListener("click", generate);

    // Changing class or term makes the cards on screen stale — clear
    // them so they can never be mistaken for the new selection.
    document.getElementById("classSelect").addEventListener("change", hideResult);
    document.getElementById("termSelect").addEventListener("change", hideResult);

    document.getElementById("studentSelect").addEventListener(
        "change",
        (event) => {

            visibleStudentId =
                event.target.value;

            renderCards();

        }
    );

    document.getElementById("saveDatesBtn").addEventListener("click", saveDates);

    document.getElementById("pdfBtn").addEventListener("click", downloadPdf);

}


/* ==========================================
   DOWNLOAD PDF

   Each card is drawn off-screen at one fixed A4 layout width and
   photographed, so the file is identical whether it's made on a
   phone or a PC: same width, same fonts, same desktop styling, no
   dependence on the screen size or the browser's print engine.
   One card per A4 page.
========================================== */

const PDF_PAGE_W_MM = 210;
const PDF_PAGE_H_MM = 297;
const PDF_MARGIN_MM = 8;
const PDF_RENDER_SCALE = 2;          // 2x = about 190 dpi on the page
const PDF_LAYOUT_VIEWPORT = 1200;    // so desktop CSS applies, even on a phone

let logoDataUrlCache = { url: null, data: null };


function reportFileName() {

    const studentPart =
        visibleStudentId === "all" ?
            "" :
            `_${filenameSafe((cards.find(c => c.student.id === visibleStudentId) || {}).name)}`;

    return `${schoolNamePartForFilename(schoolInfo.name || AttendNGContext.schoolName)}_${filenameSafe(selectedClassName)}_Report_Card_${filenameSafe(selectedTerm)}${studentPart}.pdf`;

}


// Poppins has to be fully loaded or the text would be drawn in a
// fallback font and look different from device to device.
async function ensureFontsLoaded() {

    if (!document.fonts || !document.fonts.load) {

        return;

    }

    try {

        await Promise.all(
            ["400", "500", "600", "700"].map(
                weight => document.fonts.load(`${weight} 11px Poppins`)
            )
        );

        await document.fonts.ready;

    }
    catch (error) {

        console.warn("Fonts not ready for PDF:", error);

    }

}


// The logo is fetched once and embedded as data, so it can't be
// blocked by cross-origin rules while the card is drawn.
async function logoDataUrl() {

    const url =
        schoolInfo.logo_url;

    if (!url) {

        return null;

    }

    if (logoDataUrlCache.url === url) {

        return logoDataUrlCache.data;

    }

    let data =
        null;

    try {

        const response =
            await fetch(url, { mode: "cors" });

        if (!response.ok) {

            throw new Error(`HTTP ${response.status}`);

        }

        const blob =
            await response.blob();

        data =
            await new Promise(
                (resolve, reject) => {

                    const reader =
                        new FileReader();

                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);

                }
            );

    }
    catch (error) {

        console.warn("Logo could not be embedded in the PDF:", error);

    }

    logoDataUrlCache =
        { url, data };

    return data;

}


async function renderCardToCanvas(card, logoData) {

    const stage =
        document.createElement("div");

    stage.id = "rcPdfStage";
    stage.className = "rc-pdf-stage";
    stage.innerHTML = cardHtml(card);

    document.body.appendChild(stage);

    try {

        const logo =
            stage.querySelector(".rc-head img");

        if (logo) {

            if (logoData) {

                logo.src =
                    logoData;

            }

            try {

                await logo.decode();

            }
            catch (error) {

                console.warn("Logo not ready for PDF:", error);

            }

        }

        return await html2canvas(
            stage.firstElementChild,
            {
                scale: PDF_RENDER_SCALE,
                backgroundColor: "#ffffff",
                useCORS: true,
                logging: false,
                scrollX: 0,
                scrollY: 0,
                windowWidth: PDF_LAYOUT_VIEWPORT,
                onclone: (clonedDocument) => {

                    const clonedStage =
                        clonedDocument.getElementById("rcPdfStage");

                    if (clonedStage) {

                        clonedStage.style.position = "absolute";
                        clonedStage.style.left = "0";
                        clonedStage.style.top = "0";

                    }

                }
            }
        );

    }
    finally {

        stage.remove();

    }

}


async function downloadPdf() {

    const button =
        document.getElementById("pdfBtn");

    if (button.disabled) {

        return;

    }

    if (!window.html2canvas || !window.jspdf) {

        showToast("The PDF tools didn't load. Check your connection and refresh the page.");

        return;

    }

    const list =
        visibleStudentId === "all" ?
            cards :
            cards.filter(c => c.student.id === visibleStudentId);

    if (list.length === 0) {

        return;

    }

    const originalHtml =
        button.innerHTML;

    button.disabled =
        true;

    try {

        button.innerHTML =
            `<i class="fa-solid fa-spinner fa-spin"></i> Preparing PDF…`;

        await ensureFontsLoaded();

        const logoData =
            await logoDataUrl();

        const { jsPDF } =
            window.jspdf;

        const pdf =
            new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

        const maxW =
            PDF_PAGE_W_MM - PDF_MARGIN_MM * 2;

        const maxH =
            PDF_PAGE_H_MM - PDF_MARGIN_MM * 2;

        for (let i = 0; i < list.length; i++) {

            if (list.length > 1) {

                button.innerHTML =
                    `<i class="fa-solid fa-spinner fa-spin"></i> Preparing ${i + 1} of ${list.length}…`;

            }

            // Let the button text repaint between cards.
            await new Promise(resolve => setTimeout(resolve, 0));

            const canvas =
                await renderCardToCanvas(list[i], logoData);

            let w =
                maxW;

            let h =
                w * canvas.height / canvas.width;

            // A card taller than one page is shrunk to fit, never split.
            if (h > maxH) {

                h = maxH;
                w = h * canvas.width / canvas.height;

            }

            if (i > 0) {

                pdf.addPage();

            }

            pdf.addImage(
                canvas.toDataURL("image/jpeg", 0.92),
                "JPEG",
                (PDF_PAGE_W_MM - w) / 2,
                PDF_MARGIN_MM,
                w,
                h,
                undefined,
                "FAST"
            );

            // Free the memory right away (matters on phones).
            canvas.width = 0;
            canvas.height = 0;

        }

        pdf.save(reportFileName());

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
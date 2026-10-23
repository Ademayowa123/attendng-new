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
let ratingsByStudent = {};     // ratingsByStudent[studentId] = { traitKey: 1..5 }

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

    // 7. Behaviour & skills ratings entered by the class teacher.
    //    The card still works without them (they just show as "—").
    await loadRatings(term);

    return setupProblems;

}


async function loadRatings(term) {

    ratingsByStudent = {};

    if (students.length === 0) {

        return;

    }

    try {

        const rows =
            await fetchPaged(
                () => supabaseClient
                    .from("student_ratings")
                    .select("student_id, trait, rating")
                    .in("student_id", students.map(s => s.id))
                    .eq("term", term)
                    .order("student_id")
                    .order("trait")
            );

        rows.forEach(
            r => {

                if (!ratingsByStudent[r.student_id]) {

                    ratingsByStudent[r.student_id] = {};

                }

                ratingsByStudent[r.student_id][r.trait] = r.rating;

            }
        );

    }
    catch (error) {

        console.warn("Behaviour ratings unavailable:", error);

    }

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


// A trait's rating for one student. Attendance is always worked out
// from this term's register; everything else is what the class
// teacher entered.

function ratingFor(card, trait) {

    if (trait.auto && attendance.available) {

        return attendancePercentToRating(
            Math.round((card.present / attendance.opened) * 100)
        );

    }

    const saved =
        (ratingsByStudent[card.student.id] || {})[trait.key];

    return saved === undefined ? null : saved;

}


function ratingKeysHtml() {

    const cell =
        (item, span) => `<td colspan="${span}"><strong>${item.value}.)</strong> ${escapeHtml(item.text)}</td>`;

    // Same arrangement as the paper form: 5, 4, 3 on top; 2, 1 below.
    const [k5, k4, k3, k2, k1] = RATING_KEY;

    return `
        <table class="rc-keys">
            <tr>${cell(k5, 2)}${cell(k4, 2)}${cell(k3, 2)}</tr>
            <tr>${cell(k2, 3)}${cell(k1, 3)}</tr>
        </table>
    `;

}


function ratingSkillsHtml(card) {

    const head =
        RATING_TRAIT_GROUPS.map(
            g => `<th>${escapeHtml(g.title)}</th><th class="pt">Points</th>`
        ).join("");

    const rowCount =
        Math.max(...RATING_TRAIT_GROUPS.map(g => g.traits.length));

    let body = "";

    for (let i = 0; i < rowCount; i++) {

        body += "<tr>" + RATING_TRAIT_GROUPS.map(
            g => {

                const trait = g.traits[i];

                if (!trait) {

                    return `<td></td><td class="pt"></td>`;

                }

                const value = ratingFor(card, trait);

                return `<td>${escapeHtml(trait.label)}</td><td class="pt">${value === null ? "—" : value}</td>`;

            }
        ).join("") + "</tr>";

    }

    return `
        <table class="rc-skills">
            <thead><tr>${head}</tr></thead>
            <tbody>${body}</tbody>
        </table>
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

            <div class="rc-top">

                <div class="rc-col rc-col-main">
                    <div class="rc-sec">Student's Personal Data</div>
                    <table class="rc-info">
                        <tr>
                            <td class="k">Name</td>
                            <td><strong>${escapeHtml(card.name)}</strong></td>
                        </tr>
                        <tr>
                            <td class="k">Admission no.</td>
                            <td>${escapeHtml(student.admission_no || "—")}</td>
                        </tr>
                        <tr>
                            <td class="k">Gender</td>
                            <td style="text-transform:capitalize;">${escapeHtml(student.gender || "—")}</td>
                        </tr>
                        <tr>
                            <td class="k">Class</td>
                            <td>${escapeHtml(selectedClassName)}</td>
                        </tr>
                    </table>
                </div>

                <div class="rc-col rc-col-side">

                    <div class="rc-sec">Attendance</div>
                    <table class="rc-trio">
                        <tr>
                            <th>Times school opened</th>
                            <th>Times present</th>
                            <th>Times absent</th>
                        </tr>
                        <tr>
                            <td>${opened}</td>
                            <td>${present}</td>
                            <td>${absent}</td>
                        </tr>
                    </table>

                    <div class="rc-sec">Terminal Duration</div>
                    <table class="rc-trio rc-last">
                        <tr>
                            <th>School resumed</th>
                            <th>School closes</th>
                            <th>Next term begins</th>
                        </tr>
                        <tr>
                            <td>${formatLongDate(termDates.resume_date)}</td>
                            <td>${formatLongDate(termDates.close_date)}</td>
                            <td>${formatLongDate(termDates.next_term_date)}</td>
                        </tr>
                    </table>

                </div>

            </div>

            <div class="rc-sec">Keys to Ratings on Observable Behaviour</div>
            ${ratingKeysHtml()}

            <div class="rc-sec">Skills Development and Behavioural Attributes</div>
            ${ratingSkillsHtml(card)}

            <div class="rc-sec">Academic Performance</div>
            ${scoreTableHtml(card)}

            <div class="rc-sec">Result Summary</div>
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
            </table>

            <div class="rc-sec">Remarks</div>
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

   The PDF is drawn directly onto each A4 page (text, lines and
   boxes), not photographed. So the text is real text: it stays
   sharp at any zoom, can be selected and searched, and the file is
   small. One card per A4 page; the card fills the page inside an
   8mm margin.

   All layout maths below is in "px" (the same sizes the on-screen
   card uses) and is converted to millimetres only when drawing.
========================================== */

const PDF_PAGE_W_MM = 210;
const PDF_PAGE_H_MM = 297;
const PDF_MARGIN_MM = 8;
const PDF_BASE_WIDTH_PX = 733;      // card width at normal size (194mm)
const PDF_MAX_WIDTH_PX = 1500;      // only reached by extremely dense cards

// Spacing levels. A normal card uses level 0. A very full card (many
// subjects) is tried at tighter levels first, so the text can stay
// larger instead of shrinking the whole card.
const PDF_DENSITY = [
    { lineHeight: 1.35, rowPad: 2.5, skillPad: 2,   infoPad: 4,   sumPad: 3,   bandPad: 6, gap: 8, sign: 60, remarkMin: 26 },
    { lineHeight: 1.27, rowPad: 1.6, skillPad: 1.2, infoPad: 3,   sumPad: 2,   bandPad: 4, gap: 5, sign: 52, remarkMin: 20 },
    { lineHeight: 1.2,  rowPad: 1,   skillPad: 0.8, infoPad: 2.5, sumPad: 1.5, bandPad: 3, gap: 4, sign: 46, remarkMin: 14 }
];

// Liberation Sans (Arial-style, free licence). Unlike Poppins it has
// the Yoruba letters (ọ ẹ ṣ) that Nigerian names need.
const PDF_FONT_FILES = {
    normal: "/assets/fonts/LiberationSans-Regular.ttf",
    bold: "/assets/fonts/LiberationSans-Bold.ttf"
};

let pdfFontCache = null;

let logoDataUrlCache = { url: null, data: null };


function reportFileName() {

    const studentPart =
        visibleStudentId === "all" ?
            "" :
            `_${filenameSafe((cards.find(c => c.student.id === visibleStudentId) || {}).name)}`;

    return `${schoolNamePartForFilename(schoolInfo.name || AttendNGContext.schoolName)}_${filenameSafe(selectedClassName)}_Report_Card_${filenameSafe(selectedTerm)}${studentPart}.pdf`;

}


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

function arrayBufferToBase64(buffer) {

    const bytes =
        new Uint8Array(buffer);

    const chunkSize =
        0x8000;

    let binary =
        "";

    for (let i = 0; i < bytes.length; i += chunkSize) {

        binary +=
            String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));

    }

    return btoa(binary);

}


async function loadPdfFonts() {

    if (pdfFontCache) {

        return pdfFontCache;

    }

    try {

        const entries =
            await Promise.all(
                Object.entries(PDF_FONT_FILES).map(
                    async ([style, url]) => {

                        const response =
                            await fetch(url);

                        if (!response.ok) {

                            throw new Error(`HTTP ${response.status} for ${url}`);

                        }

                        return [style, arrayBufferToBase64(await response.arrayBuffer())];

                    }
                )
            );

        pdfFontCache =
            Object.fromEntries(entries);

    }
    catch (error) {

        console.warn("PDF fonts could not be loaded, using the built-in font:", error);

        pdfFontCache =
            null;

        showToast("PDF font file missing — special letters may not show correctly.");

    }

    return pdfFontCache;

}


function registerPdfFonts(pdf, fonts) {

    if (!fonts) {

        return "helvetica";

    }

    pdf.addFileToVFS("LiberationSans-Regular.ttf", fonts.normal);
    pdf.addFont("LiberationSans-Regular.ttf", "LiberationSans", "normal");

    pdf.addFileToVFS("LiberationSans-Bold.ttf", fonts.bold);
    pdf.addFont("LiberationSans-Bold.ttf", "LiberationSans", "bold");

    return "LiberationSans";

}


// The logo is shrunk to a sensible size and kept as PNG, so the PDF
// stays small and any image type (even WEBP) can be embedded.
async function logoForPdf(logoData) {

    if (!logoData) {

        return null;

    }

    try {

        const image =
            new Image();

        image.src =
            logoData;

        await image.decode();

        if (!image.naturalWidth || !image.naturalHeight) {

            return null;

        }

        const ratio =
            Math.min(1, 400 / Math.max(image.naturalWidth, image.naturalHeight));

        const canvas =
            document.createElement("canvas");

        canvas.width =
            Math.max(1, Math.round(image.naturalWidth * ratio));

        canvas.height =
            Math.max(1, Math.round(image.naturalHeight * ratio));

        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

        return {
            data: canvas.toDataURL("image/png"),
            mark: greyWatermarkData(image),
            aspect: image.naturalWidth / image.naturalHeight
        };

    }
    catch (error) {

        console.warn("Logo could not be prepared for the PDF:", error);

        return null;

    }

}


// A grey copy of the logo for the watermark. Done pixel by pixel
// because not every browser supports canvas filters.
function greyWatermarkData(image) {

    try {

        const ratio =
            Math.min(1, 700 / Math.max(image.naturalWidth, image.naturalHeight));

        const canvas =
            document.createElement("canvas");

        canvas.width =
            Math.max(1, Math.round(image.naturalWidth * ratio));

        canvas.height =
            Math.max(1, Math.round(image.naturalHeight * ratio));

        const context =
            canvas.getContext("2d");

        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const pixels =
            context.getImageData(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < pixels.data.length; i += 4) {

            const grey =
                Math.round(pixels.data[i] * 0.299 + pixels.data[i + 1] * 0.587 + pixels.data[i + 2] * 0.114);

            pixels.data[i] = grey;
            pixels.data[i + 1] = grey;
            pixels.data[i + 2] = grey;

        }

        context.putImageData(pixels, 0, 0);

        return canvas.toDataURL("image/png");

    }
    catch (error) {

        console.warn("Watermark could not be prepared:", error);

        return null;

    }

}


function gradeKeyPlainText() {

    return GRADE_SCALE.map(
        (band, index) => {

            const max =
                index === 0 ? 100 : GRADE_SCALE[index - 1].min - 1;

            return `${band.grade} = ${band.min}–${max} ${band.remark}`;

        }
    ).join("   ·   ");

}


/* ------------------------------------------
   Lay out one report card at a given width.

   Returns { height, paint(x_mm, y_mm) }.
   `extra` is spare height (px) to hand out: the page is taller
   than the card's natural height, so rows and remark boxes get
   roomier. Text is never scaled, so nothing looks stretched.
------------------------------------------ */

function planCard(pdf, card, logo, fontName, W, extra, level) {

    const D = PDF_DENSITY[level || 0];

    const LH = D.lineHeight;

    const bandHeight =
        10.5 * LH + D.bandPad + 1;

    const k =
        (PDF_PAGE_W_MM - PDF_MARGIN_MM * 2) / W;          // mm per px

    const ptPerPx =
        k * 72 / 25.4;

    const fills = [];
    const strokes = [];
    const texts = [];
    const images = [];

    let OX = 0;
    let OY = 0;

    // ----- measuring helpers -----

    function useFont(size, bold) {

        pdf.setFont(fontName, bold ? "bold" : "normal");
        pdf.setFontSize(size * ptPerPx);

    }

    function textWidth(text, size, bold) {

        useFont(size, bold);

        return pdf.getTextWidth(String(text)) / k;

    }

    function wrap(text, maxWidth, size, bold) {

        useFont(size, bold);

        const lines =
            pdf.splitTextToSize(String(text), Math.max(maxWidth, 1) * k);

        return lines.length > 0 ? lines : [""];

    }

    // Wrap text that has a bold part and a normal part on one line.
    function wrapRich(tokens, maxWidth, size) {

        const lines = [];
        let current = [];
        let used = 0;

        tokens.forEach(
            token => {

                const width =
                    textWidth(token.t + " ", size, token.bold);

                if (used > 0 && used + textWidth(token.t, size, token.bold) > maxWidth) {

                    lines.push(current);
                    current = [];
                    used = 0;

                }

                current.push(token);
                used += width;

            }
        );

        lines.push(current);

        return lines;

    }

    // ----- drawing primitives (queued, painted later in layers) -----

    function box(x, y, w, h, fill) {

        if (fill) {

            fills.push(() => {

                pdf.setFillColor(fill[0], fill[1], fill[2]);
                pdf.rect(OX + x * k, OY + y * k, w * k, h * k, "F");

            });

        }

        strokes.push(() => {

            pdf.setLineWidth(k);
            pdf.setDrawColor(0, 0, 0);
            pdf.rect(OX + x * k, OY + y * k, w * k, h * k, "S");

        });

    }

    function solid(x, y, w, h, color) {

        fills.push(() => {

            pdf.setFillColor(color[0], color[1], color[2]);
            pdf.rect(OX + x * k, OY + y * k, w * k, h * k, "F");

        });

    }

    // One line of text. `top` is the top of its line box.
    function textLine(line, x, top, size, bold, align, color) {

        const baseline =
            top + size * LH / 2 + size * 0.3465;

        texts.push(() => {

            pdf.setTextColor(color[0], color[1], color[2]);

            if (Array.isArray(line)) {

                let cursor = x;

                line.forEach(
                    token => {

                        useFont(size, token.bold);

                        pdf.text(token.t, OX + cursor * k, OY + baseline * k);

                        cursor += textWidth(token.t + " ", size, token.bold);

                    }
                );

                return;

            }

            useFont(size, bold);

            pdf.text(line, OX + x * k, OY + baseline * k, { align });

        });

    }

    // ----- table cells -----

    function measureCell(cell, width) {

        const padX = cell.padX === undefined ? 6 : cell.padX;
        const padY = cell.padY === undefined ? 3 : cell.padY;
        const innerWidth = width - padX * 2 - 1;

        let contentHeight = 0;

        const blocks =
            cell.parts.map(
                part => {

                    const lines =
                        part.rich ?
                            wrapRich(part.rich, innerWidth, part.size) :
                            wrap(part.upper ? String(part.text).toUpperCase() : part.text, innerWidth, part.size, part.bold);

                    contentHeight += lines.length * part.size * LH;

                    return { part, lines };

                }
            );

        return { blocks, contentHeight, padX, padY };

    }

    // rows: [{ cells: [{span, parts, align, fill, valign, padX, padY}], extra }]
    // Returns the table's height. Borders are shared like on screen.
    function table(x, y, widths, rows) {

        let cursorY = y;

        rows.forEach(
            row => {

                let column = 0;
                let rowHeight = 0;
                const placed = [];

                row.cells.forEach(
                    cell => {

                        const span = cell.span || 1;

                        const cellX =
                            x + widths.slice(0, column).reduce((a, b) => a + b, 0);

                        const cellW =
                            widths.slice(column, column + span).reduce((a, b) => a + b, 0);

                        const measured =
                            measureCell(cell, cellW);

                        rowHeight =
                            Math.max(rowHeight, measured.contentHeight + measured.padY * 2 + 1);

                        placed.push({ cell, measured, cellX, cellW });

                        column += span;

                    }
                );

                rowHeight =
                    Math.max(rowHeight, row.minHeight || 0) + (row.extra || 0);

                placed.forEach(
                    ({ cell, measured, cellX, cellW }) => {

                        box(cellX, cursorY, cellW, rowHeight, cell.fill);

                        let lineTop =
                            cell.valign === "top" ?
                                cursorY + measured.padY + 0.5 :
                                cursorY + (rowHeight - measured.contentHeight) / 2 + 0.25;

                        const align =
                            cell.align || "left";

                        const textX =
                            align === "center" ? cellX + cellW / 2 :
                                align === "right" ? cellX + cellW - measured.padX :
                                    cellX + measured.padX + 0.5;

                        measured.blocks.forEach(
                            ({ part, lines }) => {

                                lines.forEach(
                                    line => {

                                        textLine(line, textX, lineTop, part.size, part.bold, align, part.color || [0, 0, 0]);

                                        lineTop += part.size * LH;

                                    }
                                );

                            }
                        );

                    }
                );

                cursorY += rowHeight;

            }
        );

        return cursorY - y + 1;

    }

    const GREY_HEAD = [241, 241, 241];
    const GREY_BAND = [214, 214, 214];
    const GREY_HIGHLIGHT = [227, 227, 227];
    const BLACK = [0, 0, 0];
    const WHITE = [255, 255, 255];

    function plain(text, size, bold, extraPart) {

        return Object.assign({ text, size, bold: !!bold }, extraPart || {});

    }

    // The grey band that sits above each part of the card.
    function band(x, y, w, label) {

        const h =
            bandHeight;

        box(x, y, w, h, GREY_BAND);

        textLine(label.toUpperCase(), x + w / 2, y + D.bandPad / 2 + 0.5, 10.5, true, "center", BLACK);

        return h;

    }

    // ----- how spare height is shared out -----

    const termCount =
        TERMS.indexOf(selectedTerm) + 1;

    const skillRowCount =
        Math.max(...RATING_TRAIT_GROUPS.map(g => g.traits.length));

    const subjectRowCount =
        Math.max(card.rows.length, 1);

    const share = {
        skills: Math.min(extra / 7, skillRowCount * 6),
        scores: Math.min(extra * 3 / 7, subjectRowCount * 14)
    };

    const rest =
        Math.max(0, extra - share.skills - share.scores);

    share.remarks =
        rest * 0.6;

    share.sign =
        rest * 0.4;

    // ----- the card -----

    const BORDER = 1;
    const PAD_X = 16;
    const PAD_Y = 14;

    const x0 = BORDER + PAD_X;
    const innerW = W - (BORDER + PAD_X) * 2;

    let y = BORDER + PAD_Y;

    // Header: logo + school name, address, phone
    {

        const logoSize =
            logo ? 64 : 0;

        const gap =
            logo ? 14 : 0;

        const textX =
            x0 + logoSize + gap;

        const textW =
            innerW - logoSize - gap;

        const name =
            String(schoolInfo.name || AttendNGContext.schoolName || "").toUpperCase();

        const nameLines = wrap(name, textW, 18, true);
        const addressLines = schoolInfo.address ? wrap(schoolInfo.address, textW, 11, false) : [];
        const phoneLines = schoolInfo.phone ? wrap(`Tel: ${schoolInfo.phone}`, textW, 11, false) : [];

        const textHeight =
            nameLines.length * 18 * LH + 2 +
            (addressLines.length + phoneLines.length) * 11 * LH;

        const headHeight =
            Math.max(logoSize, textHeight);

        let lineTop =
            y + (headHeight - textHeight) / 2;

        nameLines.forEach(
            line => {

                textLine(line, textX + textW / 2, lineTop, 18, true, "center", BLACK);

                lineTop += 18 * LH;

            }
        );

        lineTop += 2;

        addressLines.concat(phoneLines).forEach(
            line => {

                textLine(line, textX + textW / 2, lineTop, 11, false, "center", BLACK);

                lineTop += 11 * LH;

            }
        );

        if (logo) {

            const logoW = logo.aspect >= 1 ? 64 : 64 * logo.aspect;
            const logoH = logo.aspect >= 1 ? 64 / logo.aspect : 64;

            const logoX = x0 + (64 - logoW) / 2;
            const logoY = y + (headHeight - 64) / 2 + (64 - logoH) / 2;

            images.push(() => {

                pdf.addImage(logo.data, "PNG", OX + logoX * k, OY + logoY * k, logoW * k, logoH * k, "schoollogo");

            });

        }

        // 2px rule under the header
        solid(x0 - PAD_X, y + headHeight + 8, innerW + PAD_X * 2, 2, BLACK);

        y += headHeight + 8 + 2 + 8;

    }

    // Title bar
    {

        const title =
            `Student Report Card — ${selectedTerm} · ${AttendNGContext.sessionName} Session`.toUpperCase();

        const lines =
            wrap(title, innerW - 10, 12, true);

        const h =
            lines.length * 12 * LH + 8 + 2;

        box(x0, y, innerW, h, null);

        lines.forEach(
            (line, index) => textLine(line, x0 + innerW / 2, y + 5 + index * 12 * LH, 12, true, "center", BLACK)
        );

        y += h + D.gap;

    }

    // Personal data (left) + Attendance and Terminal Duration (right)
    {

        const student =
            card.student;

        const colW =
            (innerW - 8) / 2;

        const rightX =
            x0 + colW + 8;

        const bandH =
            bandHeight;

        const gender =
            student.gender ? String(student.gender).charAt(0).toUpperCase() + String(student.gender).slice(1) : "—";

        const infoRows =
            [
                ["Name", card.name],
                ["Admission no.", student.admission_no || "—"],
                ["Gender", gender],
                ["Class", selectedClassName]
            ].map(
                ([key, value]) => ({
                    cells: [
                        { parts: [plain(key, 10, true, { upper: true })], fill: GREY_HEAD, padX: 6, padY: D.infoPad },
                        { parts: [plain(value, 11, true)], padX: 6, padY: D.infoPad }
                    ]
                })
            );

        const opened = attendance.available ? attendance.opened : "—";
        const present = attendance.available ? card.present : "—";
        const absent = attendance.available ? card.absent : "—";

        const trio =
            (heads, values) => [
                {
                    cells: heads.map(
                        head => ({
                            parts: [plain(head, 9, true, { upper: true })],
                            align: "center",
                            fill: GREY_HEAD,
                            padX: 4,
                            padY: D.skillPad
                        })
                    )
                },
                {
                    cells: values.map(
                        value => ({
                            parts: [plain(value, 10.5, true)],
                            align: "center",
                            padX: 4,
                            padY: D.sumPad
                        })
                    )
                }
            ];

        const trioWidths =
            [colW / 3, colW / 3, colW / 3];

        // Right column first, because the left box grows to match it.
        let rightY = y;

        band(rightX, rightY, colW, "Attendance");
        rightY += bandH;

        rightY += table(
            rightX, rightY, trioWidths,
            trio(
                ["Times school opened", "Times present", "Times absent"],
                [opened, present, absent]
            )
        ) + 4;

        band(rightX, rightY, colW, "Terminal Duration");
        rightY += bandH;

        rightY += table(
            rightX, rightY, trioWidths,
            trio(
                ["School resumed", "School closes", "Next term begins"],
                [
                    formatLongDate(termDates.resume_date),
                    formatLongDate(termDates.close_date),
                    formatLongDate(termDates.next_term_date)
                ]
            )
        );

        // Left column: measure the natural height, then grow rows to match.
        band(x0, y, colW, "Student's Personal Data");

        const infoWidths =
            [colW * 0.34, colW * 0.66];

        const naturalLeft =
            bandH + infoRows.reduce(
                (sum, row) => sum + Math.max(
                    ...row.cells.map(c => measureCell(c, 0 + (c === row.cells[0] ? infoWidths[0] : infoWidths[1])).contentHeight + D.infoPad * 2 + 1)
                ),
                0
            ) + 1;

        const topHeight =
            Math.max(rightY - y, naturalLeft);

        const rowGrow =
            Math.max(0, (topHeight - naturalLeft) / infoRows.length);

        infoRows.forEach(row => { row.extra = rowGrow; });

        table(x0, y + bandH, infoWidths, infoRows);

        y += topHeight + D.gap;

    }

    // Keys to ratings
    {

        band(x0, y, innerW, "Keys to Ratings on Observable Behaviour");
        y += bandHeight;

        const [k5, k4, k3, k2, k1] =
            RATING_KEY;

        const keyCell =
            (item, span) => ({
                span,
                parts: [{
                    rich: [{ t: `${item.value}.)`, bold: true }].concat(
                        String(item.text).split(/\s+/).filter(Boolean).map(word => ({ t: word, bold: false }))
                    ),
                    size: 9.5
                }],
                padX: 5,
                padY: D.sumPad
            });

        const sixth =
            innerW / 6;

        y += table(
            x0, y, [sixth, sixth, sixth, sixth, sixth, sixth],
            [
                { cells: [keyCell(k5, 2), keyCell(k4, 2), keyCell(k3, 2)] },
                { cells: [keyCell(k2, 3), keyCell(k1, 3)] }
            ]
        ) + D.gap;

    }

    // Skills development and behavioural attributes
    {

        band(x0, y, innerW, "Skills Development and Behavioural Attributes");
        y += bandHeight;

        const groupCount =
            RATING_TRAIT_GROUPS.length;

        const pointsW =
            Math.max(innerW * 0.07, textWidth("POINTS", 9, true) + 10);

        const labelW =
            (innerW - pointsW * groupCount) / groupCount;

        const widths = [];

        RATING_TRAIT_GROUPS.forEach(() => widths.push(labelW, pointsW));

        const rows = [];

        rows.push({
            cells: RATING_TRAIT_GROUPS.flatMap(
                group => [
                    { parts: [plain(group.title, 9, true, { upper: true })], fill: GREY_HEAD, padX: 4, padY: D.skillPad },
                    { parts: [plain("Points", 9, true, { upper: true })], fill: GREY_HEAD, align: "center", padX: 4, padY: D.skillPad }
                ]
            )
        });

        for (let i = 0; i < skillRowCount; i++) {

            rows.push({
                extra: share.skills / skillRowCount,
                cells: RATING_TRAIT_GROUPS.flatMap(
                    group => {

                        const trait = group.traits[i];

                        if (!trait) {

                            return [
                                { parts: [plain("", 9, false)], padX: 4, padY: D.skillPad },
                                { parts: [plain("", 9, true)], align: "center", padX: 4, padY: D.skillPad }
                            ];

                        }

                        const value = ratingFor(card, trait);

                        return [
                            { parts: [plain(trait.label, 9, false)], padX: 4, padY: D.skillPad },
                            { parts: [plain(value === null ? "—" : value, 9, true)], align: "center", padX: 4, padY: D.skillPad }
                        ];

                    }
                )
            });

        }

        y += table(x0, y, widths, rows) + D.gap;

    }

    // Academic performance
    {

        band(x0, y, innerW, "Academic Performance");
        y += bandHeight;

        const highlight =
            termCount === 1 ? "t1" : termCount === 2 ? "t2" : "avg";

        const columns = [
            { label: "S/N", kind: "sn" },
            { label: "Subject", kind: "subject", left: true },
            { label: "CA", sub: "40", kind: "ca" },
            { label: "Exam", sub: "60", kind: "exam" },
            { label: "1st", sub: "100", kind: "t1" }
        ];

        if (termCount >= 2) {

            columns.push({ label: "2nd", sub: "100", kind: "t2" });

        }

        if (termCount >= 3) {

            columns.push({ label: "3rd", sub: "100", kind: "t3" });
            columns.push({ label: "AVG", sub: "100", kind: "avg" });

        }

        columns.push({ label: "Grade", kind: "grade" });
        columns.push({ label: "Remark", kind: "remark" });

        const numericWidth =
            termCount >= 3 ? 50 : 56;

        const fixedWidth = (kind) =>
            kind === "sn" ? 36 :
                kind === "grade" ? 48 :
                    kind === "remark" ? 92 :
                        kind === "subject" ? 0 :
                            numericWidth;

        const fixedTotal =
            columns.reduce((sum, c) => sum + fixedWidth(c.kind), 0);

        const widths =
            columns.map(
                c => c.kind === "subject" ? Math.max(120, innerW - fixedTotal) : fixedWidth(c.kind)
            );

        const scale =
            innerW / widths.reduce((a, b) => a + b, 0);

        const scaledWidths =
            widths.map(w => w * scale);

        const rows = [];

        rows.push({
            cells: columns.map(
                column => {

                    const highlighted = column.kind === highlight;

                    const color = highlighted ? WHITE : BLACK;

                    const parts = [plain(column.label, 10, true, { upper: true, color })];

                    if (column.sub) {

                        parts.push(plain(column.sub, 9, false, { color }));

                    }

                    return {
                        parts,
                        align: column.left ? "left" : "center",
                        fill: highlighted ? BLACK : GREY_HEAD,
                        padX: 5,
                        padY: D.rowPad
                    };

                }
            )
        });

        card.rows.forEach(
            (row, index) => {

                const valueFor = {
                    sn: index + 1,
                    subject: row.subject,
                    ca: row.ca !== null ? row.ca : "—",
                    exam: row.exam !== null ? row.exam : "—",
                    t1: formatScore(row.termTotals[0] !== undefined ? row.termTotals[0] : null),
                    t2: formatScore(row.termTotals[1]),
                    t3: formatScore(row.termTotals[2]),
                    avg: formatScore(row.used),
                    grade: row.grade ? row.grade.grade : "—",
                    remark: row.grade ? row.grade.remark : "—"
                };

                rows.push({
                    extra: share.scores / subjectRowCount,
                    cells: columns.map(
                        column => {

                            const highlighted = column.kind === highlight;

                            return {
                                parts: [plain(valueFor[column.kind], 11, column.kind === "subject" || column.kind === "grade" || highlighted)],
                                align: column.left ? "left" : "center",
                                fill: highlighted ? GREY_HIGHLIGHT : null,
                                padX: 5,
                                padY: D.rowPad
                            };

                        }
                    )
                });

            }
        );

        rows.push({
            cells: [
                { span: 2, parts: [plain(`TOTAL NUMBER OF SUBJECTS: ${card.scored}`, 11, true)], fill: GREY_HEAD, padX: 5, padY: D.rowPad },
                { span: columns.length - 2, parts: [plain(`TOTAL SCORE: ${formatScore(card.total)}`, 11, true)], fill: GREY_HEAD, align: "right", padX: 5, padY: D.rowPad }
            ]
        });

        y += table(x0, y, scaledWidths, rows) + D.gap;

    }

    // Result summary
    {

        band(x0, y, innerW, "Result Summary");
        y += bandHeight;

        const percentageGrade =
            gradeFor(card.percentage);

        const key =
            text => ({ parts: [plain(text, 10, true, { upper: true })], fill: GREY_HEAD, valign: "top", padX: 6, padY: D.sumPad });

        const value =
            (text, bold) => ({ parts: [plain(text, 11, bold)], valign: "top", padX: 6, padY: D.sumPad });

        const summaryWidths =
            [innerW * 0.22, innerW * 0.28, innerW * 0.22, innerW * 0.28];

        y += table(
            x0, y, summaryWidths,
            [
                {
                    cells: [
                        key("Total students in class"), value(students.length),
                        key("Percentage"), value(card.scored > 0 ? formatPercent(card.percentage) : "—")
                    ]
                },
                {
                    cells: [
                        key("Total score obtained"), value(formatScore(card.total)),
                        key("Position"), value(card.scored > 0 ? ordinal(card.position) : "—", true)
                    ]
                },
                {
                    cells: [
                        key("Score obtainable"), value(card.obtainable),
                        key("Grade"), value(card.scored > 0 && percentageGrade ? `${percentageGrade.grade} (${percentageGrade.remark})` : "—")
                    ]
                }
            ]
        ) + D.gap;

    }

    // Remarks
    {

        band(x0, y, innerW, "Remarks");
        y += bandHeight;

        const comments =
            commentValues(card);

        [
            ["Class teacher's remark", comments.teacher],
            ["Principal's remark", comments.principal]
        ].forEach(
            ([label, value], index) => {

                const lines =
                    wrap(value || "", innerW - 12 - 2, 11, false);

                const textHeight =
                    Math.max(D.remarkMin, lines.length * 11 * LH);

                const h =
                    4 + 10 * LH + 2 + textHeight + 4 + 2 + share.remarks / 2;

                box(x0, y, innerW, h, null);

                textLine(label.toUpperCase(), x0 + 6.5, y + 5, 10, true, "left", BLACK);

                lines.forEach(
                    (line, lineIndex) => textLine(line, x0 + 6.5, y + 5 + 10 * LH + 2 + lineIndex * 11 * LH, 11, false, "left", BLACK)
                );

                y += h + (index === 0 ? D.gap - 2 : 0);

            }
        );

    }

    // Signatures
    {

        y += D.sign + share.sign;

        const gap = 14;
        const spanW = (innerW - gap * 2) / 3;

        const labels = [
            "Teacher's signature & date",
            "Principal's signature & date",
            "Parent's name & signature"
        ];

        let tallest = 0;

        labels.forEach(
            (label, index) => {

                const spanX = x0 + index * (spanW + gap);

                const lines = wrap(label.toUpperCase(), spanW, 10, true);

                solid(spanX, y, spanW, 1, BLACK);

                lines.forEach(
                    (line, lineIndex) => textLine(line, spanX, y + 3 + lineIndex * 10 * LH, 10, true, "left", BLACK)
                );

                tallest = Math.max(tallest, 3 + lines.length * 10 * LH);

            }
        );

        y += tallest + 6;

    }

    // Grade key and footer
    {

        solid(x0, y, innerW, 1, BLACK);

        y += 1 + 4;

        const keyLines =
            wrap(`GRADE / REMARK KEY: ${gradeKeyPlainText()}`, innerW, 9.5, false);

        keyLines.forEach(
            line => {

                textLine(line, x0 + innerW / 2, y, 9.5, false, "center", BLACK);

                y += 9.5 * LH;

            }
        );

        if (termCount === 3) {

            y += 3;

            wrap("AVG = total of the terms with scores ÷ number of those terms.", innerW, 9.5, false).forEach(
                line => {

                    textLine(line, x0 + innerW / 2, y, 9.5, false, "center", BLACK);

                    y += 9.5 * LH;

                }
            );

        }

        y += 4;

        textLine("Powered by AttendNG", x0 + innerW / 2, y, 9, false, "center", [102, 102, 102]);

        y += 9 * LH;

    }

    const height =
        y + PAD_Y + BORDER;

    return {

        height,

        paint(xMm, yMm) {

            OX = xMm;
            OY = yMm;

            // The school logo, big, grey and very faint, behind everything.
            // If the PDF library can't do transparency, skip it rather
            // than risk a solid block over the page.
            if (logo && logo.mark && pdf.GState) {

                try {

                    const markW =
                        Math.min(innerW * 0.55, height * 0.5 * logo.aspect);

                    const markH =
                        markW / logo.aspect;

                    pdf.saveGraphicsState();
                    pdf.setGState(new pdf.GState({ opacity: 0.08 }));

                    pdf.addImage(
                        logo.mark, "PNG",
                        OX + (W - markW) / 2 * k,
                        OY + (height * 0.54 - markH / 2) * k,
                        markW * k, markH * k,
                        "schoolwatermark"
                    );

                    pdf.restoreGraphicsState();

                }
                catch (error) {

                    console.warn("Watermark skipped:", error);

                }

            }

            fills.forEach(op => op());

            // The outer frame
            pdf.setLineWidth(k);
            pdf.setDrawColor(0, 0, 0);
            pdf.rect(OX + 0.5 * k, OY + 0.5 * k, (W - 1) * k, (height - 1) * k, "S");

            strokes.forEach(op => op());
            images.forEach(op => op());
            texts.forEach(op => op());

        }

    };

}


// Lays the card out so it fills the A4 page exactly. If its content
// is taller than the page at the normal width, it is laid out a
// little wider (everything shrinks together) until it fits.
function drawCardPage(pdf, card, logo, fontName) {

    const pageRatio =
        (PDF_PAGE_H_MM - PDF_MARGIN_MM * 2) / (PDF_PAGE_W_MM - PDF_MARGIN_MM * 2);

    // For one spacing level: the narrowest layout width at which the
    // card fits the page (normal width if it already fits).
    function fit(level) {

        let width =
            PDF_BASE_WIDTH_PX;

        for (let attempt = 0; attempt < 12; attempt++) {

            const plan =
                planCard(pdf, card, logo, fontName, width, 0, level);

            if (plan.height <= width * pageRatio || width >= PDF_MAX_WIDTH_PX) {

                return { width, height: plan.height, level };

            }

            width =
                Math.min(PDF_MAX_WIDTH_PX, Math.ceil(plan.height / pageRatio) + 1);

        }

        return { width, level };

    }

    // Prefer normal spacing. Only tighten it when that clearly lets
    // the text stay bigger.
    let best =
        null;

    for (let level = 0; level < PDF_DENSITY.length; level++) {

        const result =
            fit(level);

        if (!best || result.width < best.width * 0.98) {

            best = result;

        }

        if (result.width <= PDF_BASE_WIDTH_PX + 1) {

            break;

        }

    }

    const natural =
        planCard(pdf, card, logo, fontName, best.width, 0, best.level);

    const spare =
        Math.max(0, best.width * pageRatio - natural.height);

    planCard(pdf, card, logo, fontName, best.width, spare, best.level)
        .paint(PDF_MARGIN_MM, PDF_MARGIN_MM);

}


async function downloadPdf() {

    const button =
        document.getElementById("pdfBtn");

    if (button.disabled) {

        return;

    }

    if (!window.jspdf) {

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

        const [fonts, logoData] =
            await Promise.all([loadPdfFonts(), logoDataUrl()]);

        const logo =
            await logoForPdf(logoData);

        const { jsPDF } =
            window.jspdf;

        const pdf =
            new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

        const fontName =
            registerPdfFonts(pdf, fonts);

        pdf.setProperties({ title: reportFileName().replace(/\.pdf$/i, "") });

        for (let i = 0; i < list.length; i++) {

            if (list.length > 1) {

                button.innerHTML =
                    `<i class="fa-solid fa-spinner fa-spin"></i> Preparing ${i + 1} of ${list.length}…`;

            }

            // Let the button text repaint between cards.
            await new Promise(resolve => setTimeout(resolve, 0));

            if (i > 0) {

                pdf.addPage();

            }

            drawCardPage(pdf, list[i], logo, fontName);

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
/*************************************************
 * ATTENDANCE.JS
 *************************************************/

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

let sessionStartDate = null; // "YYYY-MM-DD" — the anchor for Week 1
let currentWeek = 1;
let weekDates = [];          // 5 Date objects, Mon..Fri, for the selected week
let students = [];
let schoolOpened = 10;

// attendanceMap[studentId] = { mondayMorning: bool, mondayAfternoon: bool, ... }
let attendanceMap = {};


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    if (!AttendNGContext.classId) {

        document.getElementById("noClassNotice").style.display =
            "block";

        return;

    }

    document.getElementById("registerStatusBadge").innerHTML =
        AttendNGContext.classIsFinalized ?
            `<span class="badge badge-warning">Register finalized</span>` :
            `<span class="badge badge-success">Register unlocked</span>`;


    await loadSessionStartDate();

    if (!sessionStartDate) {

        document.getElementById("noStartDateNotice").style.display =
            "block";

        return;

    }

    document.getElementById("attendanceWrapper").style.display =
        "block";


    setupWeekSelectDefault();

    await loadStudents();

    bindUI();

    await loadWeek();

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
   SESSION START DATE
========================================== */

async function loadSessionStartDate() {

    if (!AttendNGContext.sessionId) {

        return;

    }

    const {
        data,
        error

    } =
        await supabaseClient
            .from("sessions")
            .select("start_date")
            .eq("id", AttendNGContext.sessionId)
            .maybeSingle();


    if (error) {

        console.error(
            "Unable to load session start date:",
            error
        );

        return;

    }

    sessionStartDate =
        (data && data.start_date) || null;

}


function setupWeekSelectDefault() {

    const start =
        new Date(sessionStartDate + "T00:00:00");

    const today =
        new Date();

    const diffDays =
        Math.floor((today - start) / (1000 * 60 * 60 * 24));

    let guessedWeek =
        Math.floor(diffDays / 7) + 1;

    guessedWeek =
        Math.min(15, Math.max(1, guessedWeek));

    currentWeek =
        guessedWeek;

    document.getElementById("attendanceWeek").value =
        String(currentWeek);

}


function getWeekDates(weekNumber) {

    const start =
        new Date(sessionStartDate + "T00:00:00");

    const monday =
        new Date(start);

    monday.setDate(
        start.getDate() + ((weekNumber - 1) * 7)
    );

    return [0, 1, 2, 3, 4].map(
        n => {

            const d =
                new Date(monday);

            d.setDate(monday.getDate() + n);

            return d;

        }
    );

}


function toISODate(date) {

    const year =
        date.getFullYear();

    const month =
        String(date.getMonth() + 1).padStart(2, "0");

    const day =
        String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;

}


/* ==========================================
   UI WIRING
========================================== */

function bindUI() {

    document.getElementById("attendanceWeek").addEventListener(
        "change",
        async (event) => {

            currentWeek =
                Number(event.target.value);

            await loadWeek();

        }
    );

    document.getElementById("schoolOpened").addEventListener(
        "change",
        async (event) => {

            schoolOpened =
                Number(event.target.value) || 0;

            await saveWeeklySettings();

            updateSummary();

        }
    );

}


/* ==========================================
   LOAD WEEK
========================================== */

async function loadWeek() {

    weekDates =
        getWeekDates(currentWeek);

    await loadWeeklySettings();

    await loadAttendanceForWeek();

    renderTable();

}


async function loadWeeklySettings() {

    const {
        data,
        error

    } =
        await supabaseClient
            .from("weekly_settings")
            .select("school_opened")
            .eq("class_id", AttendNGContext.classId)
            .eq("week", currentWeek)
            .maybeSingle();


    if (error) {

        console.error(
            "Unable to load weekly settings:",
            error
        );

    }


    if (data) {

        schoolOpened =
            data.school_opened;

    }
    else {

        // No saved setting yet for this week — default to 10
        // and persist it immediately, same as the old app.

        schoolOpened =
            10;

        await saveWeeklySettings();

    }

    document.getElementById("schoolOpened").value =
        schoolOpened;

}


async function saveWeeklySettings() {

    const {
        error

    } =
        await supabaseClient
            .from("weekly_settings")
            .upsert(
                {
                    class_id: AttendNGContext.classId,
                    week: currentWeek,
                    school_opened: schoolOpened
                },
                { onConflict: "class_id,week" }
            );


    if (error) {

        console.error(
            "Unable to save weekly settings:",
            error
        );

        showToast("Unable to save weekly setting.");

    }

}


/* ==========================================
   STUDENTS + ATTENDANCE
========================================== */

async function loadStudents() {

    let query =
        supabaseClient
            .from("students")
            .select("id, surname, first_name, position")
            .eq("class_id", AttendNGContext.classId);

    query =
        AttendNGContext.classIsFinalized ?
            query.order("position") :
            query.order("surname").order("first_name");


    const {
        data,
        error

    } =
        await query;


    if (error) {

        console.error(
            "Unable to load students:",
            error
        );

        return;

    }

    students =
        data;

}


function blankStudentAttendance() {

    return {
        mondayMorning: false, mondayAfternoon: false,
        tuesdayMorning: false, tuesdayAfternoon: false,
        wednesdayMorning: false, wednesdayAfternoon: false,
        thursdayMorning: false, thursdayAfternoon: false,
        fridayMorning: false, fridayAfternoon: false
    };

}


async function loadAttendanceForWeek() {

    attendanceMap =
        {};

    students.forEach(
        student => {

            attendanceMap[student.id] =
                blankStudentAttendance();

        }
    );


    if (students.length === 0) {

        return;

    }

    const studentIds =
        students.map(s => s.id);

    const startISO =
        toISODate(weekDates[0]);

    const endISO =
        toISODate(weekDates[4]);


    const {
        data,
        error

    } =
        await supabaseClient
            .from("attendance")
            .select("student_id, date, morning_present, afternoon_present")
            .in("student_id", studentIds)
            .gte("date", startISO)
            .lte("date", endISO);


    if (error) {

        console.error(
            "Unable to load attendance:",
            error
        );

        return;

    }

    data.forEach(
        record => {

            const dateISO =
                record.date;

            const dayIndex =
                weekDates.findIndex(d => toISODate(d) === dateISO);

            if (dayIndex === -1) {

                return;

            }

            const day =
                DAYS[dayIndex];

            const bucket =
                attendanceMap[record.student_id];

            if (!bucket) {

                return;

            }

            bucket[`${day}Morning`] =
                record.morning_present;

            bucket[`${day}Afternoon`] =
                record.afternoon_present;

        }
    );

}


/* ==========================================
   RENDER
========================================== */

function renderTable() {

    const tbody =
        document.getElementById("attendanceTableBody");

    tbody.innerHTML =
        "";

    students.forEach(
        (student, index) => {

            const row =
                document.createElement("tr");

            const cellsHtml =
                DAYS.map(
                    day => `
                        ${attendanceCellHtml(student.id, `${day}Morning`)}
                        ${attendanceCellHtml(student.id, `${day}Afternoon`)}
                    `
                ).join("");

            row.innerHTML = `
                <td class="sticky-sn" style="padding:6px; border-bottom:1px solid var(--border);">${index + 1}</td>
                <td class="sticky-name" style="padding:6px; text-align:left; font-weight:600; border-bottom:1px solid var(--border); ">${student.surname} ${student.first_name}</td>
                ${cellsHtml}
                <td style="padding:6px; border-bottom:1px solid var(--border); text-align:center; font-weight:600;" id="weeklyTotal-${student.id}">
                    ${getStudentWeeklyTotal(student.id)}
                </td>
            `;

            tbody.appendChild(row);

        }
    );


    tbody.querySelectorAll(".attendance-cell").forEach(
        cell => {

            cell.addEventListener(
                "click",
                () => handleCellClick(cell.dataset.studentId, cell.dataset.key)
            );

        }
    );


    updateSummary();

}


function attendanceCellHtml(studentId, key) {

    const value =
        attendanceMap[studentId] && attendanceMap[studentId][key];

    return `
        <td class="attendance-cell" data-student-id="${studentId}" data-key="${key}" style="padding:6px; border-bottom:1px solid var(--border);">
            <div class="mark-box ${value ? "present" : "absent"}">${value ? "✓" : ""}</div>
        </td>
    `;

}


function getStudentWeeklyTotal(studentId) {

    const record =
        attendanceMap[studentId];

    if (!record) {

        return 0;

    }

    return Object.values(record).filter(v => v === true).length;

}


/* ==========================================
   TOGGLE ATTENDANCE
========================================== */

async function handleCellClick(studentId, key) {

    const record =
        attendanceMap[studentId];

    if (!record) {

        return;

    }

    const currentValue =
        record[key];


    // Only enforce the weekly limit when turning a cell ON —
    // unchecking is always allowed.

    if (!currentValue) {

        const currentTotal =
            getStudentWeeklyTotal(studentId);

        if (schoolOpened <= 0) {

            showToast("Set how many times school opened this week first.");

            return;

        }

        if (currentTotal >= schoolOpened) {

            showToast(`Weekly limit reached — school only opened ${schoolOpened} times this week.`);

            return;

        }

    }


    const day =
        key.endsWith("Morning") ? key.replace("Morning", "") : key.replace("Afternoon", "");

    const dayIndex =
        DAYS.indexOf(day);

    const dateISO =
        toISODate(weekDates[dayIndex]);

    const newValue =
        !currentValue;

    const updatedRecord = {
        ...record,
        [key]: newValue
    };

    const morningPresent =
        updatedRecord[`${day}Morning`];

    const afternoonPresent =
        updatedRecord[`${day}Afternoon`];


    const {
        error

    } =
        await supabaseClient
            .from("attendance")
            .upsert(
                {
                    student_id: studentId,
                    date: dateISO,
                    morning_present: morningPresent,
                    afternoon_present: afternoonPresent,
                    term: AttendNGContext.currentTerm
                },
                { onConflict: "student_id,date" }
            );


    if (error) {

        console.error(
            "Unable to save attendance:",
            error
        );

        showToast("Unable to save attendance.");

        return;

    }

    attendanceMap[studentId] =
        updatedRecord;

    renderTable();

}


/* ==========================================
   LIVE SUMMARY
========================================== */

function updateSummary() {

    let morningTotal = 0;
    let afternoonTotal = 0;

    DAYS.forEach(
        day => {

            let morningCount = 0;
            let afternoonCount = 0;

            students.forEach(
                student => {

                    const record =
                        attendanceMap[student.id];

                    if (!record) {

                        return;

                    }

                    if (record[`${day}Morning`]) {

                        morningCount++;

                    }

                    if (record[`${day}Afternoon`]) {

                        afternoonCount++;

                    }

                }
            );

            const shortDay =
                day.substring(0, 3);

            const morningEl =
                document.getElementById(`${shortDay}Morning`);

            const afternoonEl =
                document.getElementById(`${shortDay}Afternoon`);

            if (morningEl) morningEl.textContent = morningCount;
            if (afternoonEl) afternoonEl.textContent = afternoonCount;

            morningTotal += morningCount;
            afternoonTotal += afternoonCount;

        }
    );

    document.getElementById("morningTotal").textContent =
        morningTotal;

    document.getElementById("afternoonTotal").textContent =
        afternoonTotal;


    const totalStudents =
        students.length;

    const maxPossible =
        totalStudents * schoolOpened;

    const totalPresent =
        morningTotal + afternoonTotal;

    const percentage =
        maxPossible > 0 ? (totalPresent / maxPossible) * 100 : 0;

    document.getElementById("weeklyPercentage").textContent =
        percentage.toFixed(1) + "%";

}


/* ==========================================
   TOAST
========================================== */

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
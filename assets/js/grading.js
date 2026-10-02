/*************************************************
 * GRADING.JS
 * The one place the A / B / C / P / F grading scale lives.
 * Every page that shows a grade (teacher Results,
 * broadsheet, report cards) calls gradeFor() so
 * they can never disagree.
 *
 * To change the scale, edit GRADE_SCALE below —
 * highest band first. `min` is the lowest total
 * (out of 100) that earns that grade.
 *************************************************/

const GRADE_SCALE = [
    { grade: "A", min: 70, remark: "Distinction" },
    { grade: "B", min: 60, remark: "Good" },
    { grade: "C", min: 50, remark: "Credit" },
    { grade: "P", min: 40, remark: "Pass" },
    { grade: "F", min: 0,  remark: "Fail" }
];


/*
 * Returns { grade, remark } for a subject total, or null when
 * there's no total yet (so callers can show "—" instead of
 * an F for a score that simply hasn't been entered).
 */
function gradeFor(total) {

    if (total === null || total === undefined || total === "" || isNaN(Number(total))) {

        return null;

    }

    const value =
        Math.round(Number(total));

    const band =
        GRADE_SCALE.find(b => value >= b.min) ||
        GRADE_SCALE[GRADE_SCALE.length - 1];

    return {
        grade: band.grade,
        remark: band.remark
    };

}


/* Badge colour for a grade, using the app's existing badge styles. */
function gradeBadgeClass(grade) {

    if (grade === "A" || grade === "B" || grade === "C") return "badge-success";
    if (grade === "P") return "badge-warning";

    return "badge-danger";

}


/* Ready-made HTML for a grade cell's contents. */
function gradeBadgeHtml(total) {

    const result =
        gradeFor(total);

    if (!result) {

        return "—";

    }

    return `<span class="badge ${gradeBadgeClass(result.grade)}" title="${result.remark}">${result.grade}</span>`;

}


window.GRADE_SCALE = GRADE_SCALE;
window.gradeFor = gradeFor;
window.gradeBadgeClass = gradeBadgeClass;
window.gradeBadgeHtml = gradeBadgeHtml;
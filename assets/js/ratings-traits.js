/*************************************************
 * RATINGS-TRAITS.JS
 * The behaviour & skills traits, the 1-5 key, and
 * the attendance -> rating rule. Shared by the
 * Behaviour & Skills page and (next step) the
 * report card, so the wording lives in one place.
 *************************************************/

const RATING_TRAIT_GROUPS = [
    {
        key: "personal",
        title: "Personal Development",
        traits: [
            { key: "obedience", label: "Obedience" },
            { key: "honesty", label: "Honesty" },
            { key: "self_control", label: "Self-control" },
            { key: "self_reliance", label: "Self-reliance" },
            { key: "initiative", label: "Use of initiative" }
        ]
    },
    {
        key: "responsibility",
        title: "Sense of Responsibility",
        traits: [
            { key: "punctuality", label: "Punctuality" },
            { key: "neatness", label: "Neatness" },
            { key: "perseverance", label: "Perseverance" },
            { key: "attendance", label: "Attendance", auto: true },
            { key: "attentiveness", label: "Attentiveness" }
        ]
    },
    {
        key: "social",
        title: "Social Development",
        traits: [
            { key: "courtesy", label: "Courtesy / Politeness" },
            { key: "consideration", label: "Consideration for others" },
            { key: "sociability", label: "Sociability / Team player" },
            { key: "promptness", label: "Promptness in completing work" },
            { key: "responsibilities", label: "Accepts responsibilities" }
        ]
    },
    {
        key: "psychomotor",
        title: "Psychomotor (Skills) Development",
        traits: [
            { key: "reading_writing", label: "Reading and writing skills" },
            { key: "verbal_communication", label: "Verbal communication" },
            { key: "sport_game", label: "Sport and game" },
            { key: "inquisitiveness", label: "Inquisitiveness" },
            { key: "dexterity", label: "Dexterity (musical & art materials)" }
        ]
    }
];

const RATING_ALL_TRAITS =
    RATING_TRAIT_GROUPS.flatMap(g => g.traits);

const RATING_KEY = [
    { value: 5, text: "Maintains an excellent degree of observable traits" },
    { value: 4, text: "Maintains a high level of observable traits" },
    { value: 3, text: "Acceptable level of observable traits" },
    { value: 2, text: "Shows minimal regard for observable traits" },
    { value: 1, text: "Has no regard for observable traits" }
];

/*
 * The Attendance trait is worked out from the student's attendance for
 * the term. Teachers can't change it.
 *   95% and above -> 5     85% to 94% -> 4     70% to 84% -> 3
 *   50% to 69%    -> 2     below 50%  -> 1
 */
function attendancePercentToRating(percent) {

    if (percent === null || percent === undefined || isNaN(percent)) {

        return null;

    }

    if (percent >= 95) { return 5; }
    if (percent >= 85) { return 4; }
    if (percent >= 70) { return 3; }
    if (percent >= 50) { return 2; }

    return 1;

}
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
            { key: "obedience", label: "OBEDIENCE" },
            { key: "honesty", label: "HONESTY" },
            { key: "self_control", label: "SELF-CONTROL" },
            { key: "self_reliance", label: "SELF-RELIANCE" },
            { key: "initiative", label: "USE OF INITIATIVE" }
        ]
    },
    {
        key: "responsibility",
        title: "Sense of Responsibility",
        traits: [
            { key: "punctuality", label: "PUNCTUALITY" },
            { key: "neatness", label: "NEATNESS" },
            { key: "perseverance", label: "PERSEVERANCE" },
            { key: "attendance", label: "ATTENDANCE", auto: true },
            { key: "attentiveness", label: "ATTENTIVENESS" }
        ]
    },
    {
        key: "social",
        title: "Social Development",
        traits: [
            { key: "courtesy", label: "COURTESY/POLITENESS" },
            { key: "consideration", label: "CONSIDERATION FOR OTHERS" },
            { key: "sociability", label: "SOCIABILITY/TEAM-PLAYER" },
            { key: "promptness", label: "PROMPTNESS IN COMPLETING WORK" },
            { key: "responsibilities", label: "ACCEPTS RESPONSIBILITIES" }
        ]
    },
    {
        key: "psychomotor",
        title: "Psychomotor (Skills) Development",
        traits: [
            { key: "reading_writing", label: "READING & WRITING SKILLS" },
            { key: "verbal_communication", label: "VERBAL COMMUNICATION" },
            { key: "sport_game", label: "SPORT & GAME" },
            { key: "inquisitiveness", label: "INQUISITIVENESS" },
            { key: "dexterity", label: "DEXTERITY(Musical & Art Materials)" }
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
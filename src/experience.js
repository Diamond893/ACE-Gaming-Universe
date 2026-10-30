function expRequiredForLevel(level) {
    return level * 400;
}

function calculateLevel(totalExp) {
    let level = 1;
    let remainingExp = totalExp;

    while (remainingExp >= expRequiredForLevel(level)) {
        remainingExp -= expRequiredForLevel(level);
        level++;
    }

    return {
        level,
        currentExp: remainingExp,
        requiredExp: expRequiredForLevel(level)
    };
}

module.exports = {
    expRequiredForLevel,
    calculateLevel
};
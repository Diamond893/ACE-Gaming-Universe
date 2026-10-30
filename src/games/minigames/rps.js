'use strict';

const crypto = require('crypto');
const settings = require('./settings');

const choices = ['rock', 'paper', 'scissors'];

const emojis = {
    rock: '🪨',
    paper: '📄',
    scissors: '✂️'
};

const winMessages = [
    'You got lucky this time.',
    'Enjoy your little victory.',
    'Fine. You win this round.',
    'Not bad, human.'
];

const loseMessages = [
    'Too easy. Try harder.',
    'Did you really think you could beat me?',
    'Victory belongs to NYX.',
    'Better luck next time.'
];

const drawMessages = [
    'Great minds think alike.',
    'A draw? How boring.',
    'We chose the same thing. Again?'
];

function randomMessage(messages) {
    return messages[crypto.randomInt(messages.length)];
}

function play(platform, communityId, rawChoice) {

    if (!settings.isEnabled(platform, communityId, 'rps')) {
        return '🔒 Rock Paper Scissors is disabled in this community.';
    }

    const playerChoice = String(rawChoice || '')
        .trim()
        .toLowerCase();

    if (!choices.includes(playerChoice)) {
        return (
            '🎮 ROCK PAPER SCISSORS\n\n' +
            'Choose one:\n' +
            '🪨 .rps rock\n' +
            '📄 .rps paper\n' +
            '✂️ .rps scissors'
        );
    }

    const botChoice = choices[crypto.randomInt(choices.length)];

    let result;
    let comment;

    if (playerChoice === botChoice) {

        result = '🤝 DRAW!';
        comment = randomMessage(drawMessages);

    } else if (
        (playerChoice === 'rock' && botChoice === 'scissors') ||
        (playerChoice === 'paper' && botChoice === 'rock') ||
        (playerChoice === 'scissors' && botChoice === 'paper')
    ) {

        result = '🏆 YOU WIN!';
        comment = randomMessage(winMessages);

    } else {

        result = '💀 NYX WINS!';
        comment = randomMessage(loseMessages);
    }

    const display = choice =>
        `${emojis[choice]} ${choice.charAt(0).toUpperCase()}${choice.slice(1)}`;

    return `╭────❰ 🎮 ROCK PAPER SCISSORS ❱────╮

👤 YOU: ${display(playerChoice)}
🌌 NYX: ${display(botChoice)}

${result}

🖤 NYX: "${comment}"

╰────────────────────────╯`;
}

module.exports = { play };
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const project = path.resolve(__dirname, '..');
const { beginnerIntro, buildWhatsappWelcome } = require('../src/core/onboarding');

// Pure onboarding copy: platform-correct commands and no registration side effects.
assert.match(beginnerIntro('whatsapp'), /\.register YourName/);
assert.match(beginnerIntro('whatsapp'), /\.help/);
assert.match(beginnerIntro('discord'), /\/register YourName/);
assert.match(beginnerIntro('discord'), /\/help/);
assert.match(beginnerIntro('whatsapp'), /already have an AGU account/i);

const welcome = buildWhatsappWelcome([
    { id: '2348012345678:4@s.whatsapp.net' },
    { id: '2348012345678@s.whatsapp.net' },
    '1234567890@lid',
    '2348888888888@s.whatsapp.net',
    'not_a_real_JID',
    '2348012345678@somewhere.net'
], ['2348888888888@s.whatsapp.net']);
assert.deepEqual(welcome.mentions, ['2348012345678@s.whatsapp.net', '1234567890@lid']);
assert.match(welcome.text, /@2348012345678/);
assert.match(welcome.text, /@1234567890/);
assert.equal(buildWhatsappWelcome(['invalid', '1234567890@other.net']), null);

// Exercise the actual command processor via mocked module boundaries.
// This avoids touching the production SQLite database during regression tests.
const source = fs.readFileSync(path.join(project, 'src/core/commandProcessor.js'), 'utf8');
const registered = {
    gameId: 'AGU-TEST', id: 5, name: 'Example', level: 1, coins: 100,
    exp: 0, activityStreak: 0, joined: new Date().toISOString()
};
let expCalls = 0;
const stubPlayers = {
    addExp: () => { expCalls++; return { leveledUp: false, coinsEarned: 0 }; },
    updateActivityStreak: () => ({ updated: false, reward: 0 }),
    registerPlayer: () => '✅ Registered',
    checkPlayerStatAchievements: () => []
};
const stubs = {
    '../players': stubPlayers,
    '../playerResolver': { resolvePlayer: (_platform, id) => id === 'registered-id' ? registered : null },
    '../rateLimit': { checkRateLimit: () => ({ allowed: true }) },
    '../cooldown': { canEarnExp: () => true },
    '../database/connection': { withTransaction: action => action },
    './aguCommands': { ALL: new Set(), cardSpawn: () => ({success:false,message:'❌ Owner-only'}) },
    './onboarding': require('../src/core/onboarding')
};
const moduleStub = { exports: {} };
const context = {
    module: moduleStub,
    exports: moduleStub.exports,
    require: name => stubs[name] || {},
    console,
    Date,
    Set,
    Map
};
vm.runInNewContext(source, context, { filename: 'commandProcessor.js' });
const run = (command, registeredUser = false, platform = 'whatsapp', args = []) => moduleStub.exports.processCommand({
    platform, userId: registeredUser ? 'registered-id' : 'unregistered-id',
    command, args, communityId: 'example-group'
});
assert.match(run('help').message, /\.register YourName/);
assert.match(run('help', false, 'discord').message, /\/register YourName/);
assert.match(run('rps').message, /\.register YourName/);
assert.match(run('help', true).message, /HELP MENU/);
assert.match(run('help', true, 'whatsapp', ['profile']).message, /PROFILE/);
assert.doesNotMatch(run('help', true, 'whatsapp', ['profile']).message, /\.guide/);
assert.equal(run('guide', false).success, false);
assert.match(run('guide', true).message, /Unknown command/);
assert.equal(run('register').message, '❌ Enter a name between 1 and 30 characters.');
assert.equal(expCalls, 0, 'Onboarding must not grant EXP.');

const waSource = fs.readFileSync(path.join(project, 'src/whatsapp.js'), 'utf8');
const discordSource = fs.readFileSync(path.join(project, 'src/discord.js'), 'utf8');
const deploySource = fs.readFileSync(path.join(project, 'src/deploy-commands.js'), 'utf8');
assert.match(waSource, /event\.action === 'add'/);
assert.match(waSource, /communities\.isActive\('whatsapp', groupJid\)/);
assert.match(waSource, /await sock\.sendMessage\(groupJid, welcome\)/);
assert.match(waSource, /const onboardingExempt = new Set/);
assert.match(discordSource, /beginnerIntro\('discord'\)/);
assert.doesNotMatch(deploySource, /\["guide",/);
console.log('✅ NYX onboarding regression checks passed (17 checks + message/permission assertions).');

const readline = require("readline");

const {
    processCommand
} = require("./core/commandProcessor");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("🌌 ACE GAMING UNIVERSE");
console.log("✅ Terminal command engine online!");
console.log("Type .help to see available commands.\n");

// Existing test account
const testUserId = "test-player-001";

rl.setPrompt("🎮 > ");

rl.on("line", (message) => {

    const input = message.trim();

    if (!input.startsWith(".")) {
        rl.prompt();
        return;
    }

    const [command, ...args] = input.split(/\s+/);

    const result = processCommand({
        platform: "terminal",
        userId: testUserId,
        command,
        args
    });

    console.log(result.message);
    console.log();

    rl.prompt();
});

rl.prompt();
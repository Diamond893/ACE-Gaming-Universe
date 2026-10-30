'use strict';
const { db } = require('../../database/connection');
const settings = require('./settings');
const lock=require('./activityLock');
const crypto = require('crypto');


// Only one pending/playing match per player per community. All mutations serialize across processes.
db.exec(`CREATE TABLE IF NOT EXISTS tictactoe_matches (
  id TEXT PRIMARY KEY, platform TEXT NOT NULL, community_id TEXT NOT NULL,
  challenger TEXT NOT NULL, opponent TEXT NOT NULL,
  board TEXT NOT NULL, turn TEXT NOT NULL, state TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tictactoe_scope ON tictactoe_matches(platform,community_id,state);`);
const getMatch = db.prepare("SELECT * FROM tictactoe_matches WHERE platform=? AND community_id=? AND state IN ('pending','playing') AND (challenger=? OR opponent=?) ORDER BY created_at DESC LIMIT 1");
const insert = db.prepare('INSERT INTO tictactoe_matches VALUES (?,?,?,?,?,?,?,?,?,?)');
const update = db.prepare('UPDATE tictactoe_matches SET board=?,turn=?,state=?,updated_at=? WHERE id=?');
const expire = db.prepare("UPDATE tictactoe_matches SET state='expired' WHERE state='pending' AND created_at<? OR state='playing' AND updated_at<?");
const symbols = { X: '❌', O: '⭕' };
const winning = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const label = (board) => {
    const cells = Array.isArray(board)
        ? board
        : String(board).split('');

    return cells
        .map((cell, index) => {
            if (cell === 'X') return '❌';
            if (cell === 'O') return '⭕';

            return `${index + 1}️⃣`;
        })
        .reduce((rows, cell, index) => {
            if (index % 3 === 0) rows.push([]);

            rows[rows.length - 1].push(cell);

            return rows;
        }, [])
        .map(row => row.join(' | '))
        .join('\n');
};
const matchFor = (p,c,u) => getMatch.get(p,c,u,u);
function reply(platform, communityId, userId, action, value, targetId) {
  if (!settings.isEnabled(platform, communityId, 'tictactoe')) return '🔒 Tic-Tac-Toe is disabled in this community. Ask a group/server admin to enable it.';
  return db.transaction(() => {
    const now=Date.now();
    expire.run(now - 3*60*1000, now - 10*60*1000);
    const match=matchFor(platform,communityId,userId);
    if (action === 'challenge') {
      const busy=lock.otherGame(platform,communityId,'tictactoe');
      if(busy) return `⛔ ${busy} is already active in this community. Finish it first.`;
      if(db.prepare("SELECT 1 FROM tictactoe_matches WHERE platform=? AND community_id=? AND state IN ('pending','playing') LIMIT 1").get(platform,communityId)) return '⛔ Another Tic-Tac-Toe match is active in this community.';
      if(!targetId) return '❌ Mention a player: .ttt challenge @player (or reply to their message).';
      if(targetId===userId) return '❌ You cannot challenge yourself.';
      if(match) return '❌ Finish your current Tic-Tac-Toe match first.';
      if(matchFor(platform,communityId,targetId)) return '❌ That player already has a pending or active match here.';
      insert.run(crypto.randomUUID(),platform,communityId,userId,targetId,'---------',userId,'pending',now,now);
      return `🎮 TIC-TAC-TOE\nChallenge sent!\n${targetId === userId ? '' : 'Opponent:'} ${platform==='discord'?`<@${targetId}>`:`@${targetId}`}\nThey have 3 minutes to type ${platform==='discord'?'/ttt action:accept':'.ttt accept'} or decline.`;
    }
    if(action==='help') return '🎮 TIC-TAC-TOE\nChallenge: .ttt challenge @player\nAccept: .ttt accept\nDecline: .ttt decline\nPlay: .ttt move 1–9\nBoard: .ttt status\nResign: .ttt resign\nPending challenge: 3 min | Turn timeout: 10 min';
    if(!match) return '🎮 No active match. Challenge someone with .ttt challenge @player.';
    if(action==='status') return `${match.state==='pending'?'⏳ Challenge pending':'🎮 TIC-TAC-TOE'}\n${label(match.board)}\n${match.state==='playing' ? `Turn: ${platform==='discord'?`<@${match.turn}>`:`@${match.turn}`}` : 'Waiting for the opponent to accept.'}`;
    if(action==='decline' || action==='accept') {
      if(match.state!=='pending') return '❌ The match has already started.';
      if(match.opponent!==userId) return '❌ Only the challenged player can accept or decline.';
      if(action==='decline') { update.run(match.board,match.turn,'declined',now,match.id);return '🖤 Tic-Tac-Toe challenge declined.'; }
      update.run(match.board,match.challenger,'playing',now,match.id);
      return `🎮 Challenge accepted!\n${label(match.board)}\n❌ Challenger goes first. Use ${platform==='discord'?'/ttt action:move cell:1':' .ttt move 1'}–9.`;
    }
    if(action==='resign') { update.run(match.board,match.turn,'resigned',now,match.id); return `🏳️ ${platform==='discord'?`<@${userId}>`:`@${userId}`} resigned. Match ended.`; }
    if(action==='move') {
      if(match.state!=='playing') return '❌ Your challenge must be accepted first.';
      if(match.turn!==userId) return '⏳ Wait for your turn.';
      const cell=Number(value);
      if(!Number.isInteger(cell)||cell<1||cell>9) return '❌ Choose a cell from 1 to 9.';
      const board=match.board.split('');
      if(board[cell-1]!=='-') return '❌ That cell is taken. Choose another.';
      const symbol=userId===match.challenger?'X':'O';
      board[cell-1]=symbol;
      const won=winning.some(line=>line.every(i=>board[i]===symbol));
      const draw=!won && board.every(s=>s!=='-');
      const next=userId===match.challenger?match.opponent:match.challenger;
      update.run(board.join(''),next,won?'won':draw?'draw':'playing',now,match.id);
      return `🎮 TIC-TAC-TOE\n${label(board)}\n${won ? `🏆 ${platform==='discord'?`<@${userId}>`:`@${userId}`} wins!` : draw?'🤝 Draw!':`Next: ${platform==='discord'?`<@${next}>`:`@${next}`}`}\n${won||draw?'Match finished. Challenge again anytime.':'Use move 1–9.'}`;
    }
    return '❌ Unknown action. Use .ttt help.';
  }).immediate();
}
module.exports={reply};

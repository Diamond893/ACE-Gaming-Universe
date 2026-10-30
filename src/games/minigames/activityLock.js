'use strict';
const { db }=require('../../database/connection');
function exists(table, condition, values) {
  try { return !!db.prepare(`SELECT 1 FROM ${table} WHERE ${condition} LIMIT 1`).get(...values); }
  catch(e) { if (/no such table/.test(e.message)) return false; throw e; }
}
function otherGame(platform, communityId, requested) {
  if(requested!=='quiz' && exists('quiz_matches', 'platform=? AND community_id=?', [platform,communityId]))return 'Quiz Battle';
  if(requested!=='guess' && exists('number_guess_games', 'platform=? AND community_id=? AND expires_at>?', [platform,communityId,Date.now()]))return 'Number Guessing';
  if(requested!=='tictactoe' && exists('tictactoe_matches', "platform=? AND community_id=? AND ((state='pending' AND created_at>?) OR (state='playing' AND updated_at>?))", [platform,communityId,Date.now()-180000,Date.now()-600000]))return 'Tic-Tac-Toe';
  return null;
}
module.exports={otherGame};

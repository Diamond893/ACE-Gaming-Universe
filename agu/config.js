'use strict';
// Editable by ACE in backend code only; group admins can toggle cards ON/OFF.
module.exports = Object.freeze({
  ownerGameId: 'AGU-38CB35310624',
  spawnMinutes: 10,
  claimLength: 4,
  tiers: {
    '1': { minPower: 100, maxPower: 999, weight: 45 },
    '2': { minPower: 1000, maxPower: 1999, weight: 30 },
    '3': { minPower: 2000, maxPower: 2999, weight: 17 },
    '4': { minPower: 3000, maxPower: 3999, weight: 6 },
    '5': { minPower: 4000, maxPower: 4999, weight: 1.7 },
    '6': { minPower: 5000, maxPower: 5999, weight: 0.3 },
    S: { minPower: 6000, maxPower: 6999, weight: 0 }
  },
  // Separate shop bundles from the 100-fragment redemption bundle.
  bundleContents: {
    basic_card_bundle: { min: 2, max: 2, weights: {1:65,2:27,3:7,4:1} },
    standard_card_bundle: { min: 3, max: 3, weights: {1:48,2:32,3:15,4:4,5:1} },
    premium_card_bundle: { min: 5, max: 5, weights: {1:30,2:33,3:24,4:10,5:2.7,6:0.3} },
    fragment_card_bundle: { min: 3, max: 4, weights: {1:45,2:30,3:17,4:6,5:1.7,6:0.3} }
  },
  fragmentCost: 100,
  startingSlots: 50,
  upgradeSlots: 10,
  firstUpgradeCoins: 2000,
  upgradeIncrementCoins: 1500,
  auctionMinutes: 10,
  auctionFeeRate: 0.10,
  auctionStartingBidFactor: 0.5,
  battleReward: { first3: { coins:[15,30], fragments:[3,5] }, next7: { coins:[5,15], fragments:[1,2] }, later: { coins:[1,5], fragmentChance:0.2 }, lossCoins:1 }
});

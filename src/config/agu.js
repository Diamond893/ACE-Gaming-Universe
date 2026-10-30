'use strict';
// Editable by ACE in backend code only; group admins can toggle cards ON/OFF.
module.exports = Object.freeze({
  ownerGameId: 'AGU-38CB35310624',
  spawnMinutes: 5,
  claimLength: 4,
  tiers: {
    '1': { minPower: 90, maxPower: 199, weight: 44.8 },
    '2': { minPower: 200, maxPower: 399, weight: 30 },
    '3': { minPower: 400, maxPower: 799, weight: 17 },
    '4': { minPower: 800, maxPower: 1599, weight: 6 },
    '5': { minPower: 1600, maxPower: 3199, weight: 1.6 },
    '6': { minPower: 3200, maxPower: 6399, weight: 0.5 },
    S: { minPower: 6400, maxPower: 12799, weight: 0.1 }
  },

// CARD CLAIM PRICES
claimPriceRanges: {
    '1': [25, 50],
    '2': [60, 100],
    '3': [110, 200],
    '4': [220, 400],
    '5': [450, 750],
    '6': [800, 1200],
    'S': [1500, 2000]
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
  auctionStartingBidFactor: 0.30,
 battleReward: {
    first3: {
        coins: [15, 30],
        fragments: [3, 5],
        exp: [20, 30]
    },

    next7: {
        coins: [5, 15],
        fragments: [1, 2],
        exp: [15, 20]
    },

    later: {
        coins: [1, 5],
        fragmentChance: 0.2,
        exp: [5, 10]
    },

    lossCoins: 1,
    lossExp: 5,
    drawExp: 5
}
});

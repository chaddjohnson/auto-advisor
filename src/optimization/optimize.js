'use strict';

if (process.argv.length < 2) {
    console.log('Symbol must be specified.');
    process.exit(1);
}

// Libraries
var _ = require('lodash');

// State
var symbol = process.argv[2];
var previousPrice = 0;
var previousDate = 0;
var previousPercentChange = 0;
var positions = [];
var maxProfit = 0;
var optimalSettings = {};

// Data
var data = require('../../data/' + symbol + '.json');

// Settings
var balance = 100000;
var startingBalance = balance;
var commission = 4.95;
var investmentDivisor;
var baseInvestment;
var sellTriggerProfitPercentage;
var lastBuyDate;
var longHoldCount;
var maxLongHoldCount = 100;
var investmentFactor;
var daysHeld = 0;
var sequentialBuyDays = 0;
var sequentialIncreaseDays = 0;
var maxDaysHeld = 0;

console.log('Optimizing for ' + symbol);

for (investmentDivisor=5; investmentDivisor<=12; investmentDivisor++) {
    for (sellTriggerProfitPercentage=0.5; sellTriggerProfitPercentage<=3; sellTriggerProfitPercentage+=0.015625) {
        for (investmentFactor=0.5; investmentFactor<=3; investmentFactor+=0.015625) {
            for (maxDaysHeld=10; maxDaysHeld<=45; maxDaysHeld++) {
                // Reset.
                balance = 100000;
                baseInvestment = startingBalance / investmentDivisor;
                positions = [];
                previousPrice = 0;
                previousDate = 0;
                previousPercentChange = 0;
                lastBuyDate = 0;
                longHoldCount = 0;
                daysHeld = 0;
                sequentialBuyDays = 0;
                sequentialIncreaseDays = 0;

                var potentialMaxProfit = 0;
                var potentialOptimalSettings = null;

                data.forEach(function(dataPoint) {
                    if (!previousPrice) {
                        previousPrice = dataPoint.close;
                        previousDate = dataPoint.date;
                        return;
                    }

                    var costBasisSum = 0;
                    var shareSum = 0;

                    positions.forEach(function(position) {
                        costBasisSum += position.costBasis;
                        shareSum += position.shares;
                    });

                    var percentChange = ((dataPoint.close / previousPrice) - 1) * 100;
                    var averagePositionCostBasis = costBasisSum / shareSum;
                    var targetSellPrice = averagePositionCostBasis * (1 + (sellTriggerProfitPercentage / 100));

                    daysHeld = Math.round((new Date(dataPoint.date) - new Date(lastBuyDate)) / 24 / 60 / 60 / 1000);

                    if (positions.length === 0) {
                        daysHeld = 0;
                    }

                    var targetPriceReached = dataPoint.close >= targetSellPrice;
                    var averageReachedAndHeldTooLong = daysHeld >= maxDaysHeld && dataPoint.close >= averagePositionCostBasis;

                    if (previousPercentChange > 0 && percentChange > 0) {
                        sequentialIncreaseDays++;
                    }
                    else {
                        sequentialIncreaseDays = 0;
                    }

                    if (sequentialIncreaseDays >= 2) {
                        sequentialBuyDays = 0;
                    }

                    previousPercentChange = percentChange;

                    if (positions.length && (targetPriceReached || averageReachedAndHeldTooLong)) {
                        let grossProfit = (shareSum * dataPoint.close) - commission;
                        let netProfit = grossProfit - costBasisSum;

                        balance += grossProfit;
                        positions = [];
                        baseInvestment = balance / investmentDivisor;
                        sequentialBuyDays = 0;

                        if (daysHeld > maxLongHoldCount) {
                            longHoldCount++;

                            potentialMaxProfit = 0;
                            potentialOptimalSettings = null;
                        }

                        if (balance - startingBalance > maxProfit && longHoldCount === 0 && new Date(dataPoint.date) >= 1465862400000) {
                            // Record a new max profit.
                            potentialMaxProfit = balance - startingBalance;

                            potentialOptimalSettings = {
                                investmentDivisor: investmentDivisor,
                                sellTriggerProfitPercentage: sellTriggerProfitPercentage,
                                investmentFactor: investmentFactor,
                                maxLongHoldCount: maxLongHoldCount,
                                maxDaysHeld: maxDaysHeld
                            };
                        }
                    }

                    if (percentChange < 0 && sequentialBuyDays < 4) {
                        let position = {};
                        let investment = baseInvestment * (percentChange / investmentFactor) * -1;

                        position.shares = Math.floor(investment / dataPoint.close);
                        position.pricePerShare = dataPoint.close;
                        position.costBasis = (position.shares * position.pricePerShare) + commission;

                        // Ensure adding the position will not exceed the balance.
                        if (balance - position.costBasis > 0 && position.shares > 0) {
                            positions.push(position);

                            if (sequentialBuyDays === 0 || previousDate === lastBuyDate) {
                                sequentialBuyDays++;
                            }
                            else {
                                sequentialBuyDays = 0;
                            }

                            balance -= position.costBasis;
                            lastBuyDate = dataPoint.date;
                            daysHeld = 0;
                        }
                    }

                    previousPrice = dataPoint.close;
                    previousDate = dataPoint.date;
                });

                if (potentialMaxProfit && potentialOptimalSettings) {
                    maxProfit = potentialMaxProfit;
                    optimalSettings = potentialOptimalSettings;
                }
            }
        }
    }
}

console.log(parseFloat(maxProfit.toFixed(2)));
console.log(JSON.stringify(optimalSettings));

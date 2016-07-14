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
var positions = [];
var maxProfit = 0;
var optimalSettings = {};

// Data
var data = require('../../data/' + symbol + '.json');

// Settings
var balance = 100000;
var startingBalance = balance;
var investmentDivisor;
var baseInvestment;
var buyTriggerChangePercentage;
var sellTriggerProfitPercentage;
var maxInvestment;
var lastBuyDate;
var longHoldCount;
var maxLongHoldCount = 100;
var days = 0;

console.log('Optimizing for ' + symbol);

for (investmentDivisor=5; investmentDivisor<=20; investmentDivisor++) {
    for (buyTriggerChangePercentage=-2.5; buyTriggerChangePercentage<=-1.5; buyTriggerChangePercentage+=0.05) {
        for (sellTriggerProfitPercentage=0.5; sellTriggerProfitPercentage<=3; sellTriggerProfitPercentage+=0.05) {
            // Reset.
            balance = 100000;
            baseInvestment = startingBalance / investmentDivisor;
            maxInvestment = balance;
            positions = [];
            previousPrice = 0;
            lastBuyDate = 0;
            longHoldCount = 0;
            days = 0;

            var potentialMaxProfit = 0;
            var potentialOptimalSettings = null;

            data.forEach(function(dataPoint) {
                if (!previousPrice) {
                    previousPrice = dataPoint.close;
                    return;
                }

                var costBasisSum = 0;
                var shareSum = 0;

                positions.forEach(function(position) {
                    costBasisSum += position.costBasis;
                    shareSum += position.shares;
                });

                var averagePositionCostBasis = costBasisSum / shareSum;
                var targetSellPrice = averagePositionCostBasis * (1 + (sellTriggerProfitPercentage / 100));

                days = Math.round((new Date(dataPoint.date) - lastBuyDate) / 24 / 60 / 60 / 1000);

                // if (positions.length && dataPoint.high >= (targetSellPrice * 1.01)) {
                //     let grossProfit = shareSum * (targetSellPrice * 1.01);
                //     let netProfit = grossProfit - costBasisSum;

                //     balance += grossProfit;
                //     positions = [];
                //     baseInvestment = balance / investmentDivisor;
                //     maxInvestment = balance;

                //     if (days > maxLongHoldCount) {
                //         longHoldCount++;

                //         potentialMaxProfit = 0;
                //         potentialOptimalSettings = null;
                //     }

                //     if (balance - startingBalance > maxProfit && longHoldCount === 0) {
                //         // Record a new max profit.
                //         potentialMaxProfit = balance - startingBalance;

                //         potentialOptimalSettings = {
                //             investmentDivisor: investmentDivisor,
                //             buyTriggerChangePercentage: parseFloat(buyTriggerChangePercentage.toFixed(2)),
                //             sellTriggerProfitPercentage: parseFloat(sellTriggerProfitPercentage.toFixed(2)),
                //             maxLongHoldCount: maxLongHoldCount
                //         };
                //     }
                // }

                var targetPriceReached = dataPoint.close >= targetSellPrice;
                var averageReachedAndHeldTooLong = days >= 30 && dataPoint.close >= averagePositionCostBasis;

                if (positions.length && (targetPriceReached || averageReachedAndHeldTooLong)) {
                    let grossProfit = shareSum * dataPoint.close;
                    let netProfit = grossProfit - costBasisSum;

                    balance += grossProfit;
                    positions = [];
                    baseInvestment = balance / investmentDivisor;
                    maxInvestment = balance;

                    if (days > maxLongHoldCount) {
                        longHoldCount++;

                        potentialMaxProfit = 0;
                        potentialOptimalSettings = null;
                    }

                    if (balance - startingBalance > maxProfit && longHoldCount === 0) {
                        // Record a new max profit.
                        potentialMaxProfit = balance - startingBalance;

                        potentialOptimalSettings = {
                            investmentDivisor: investmentDivisor,
                            buyTriggerChangePercentage: parseFloat(buyTriggerChangePercentage.toFixed(2)),
                            sellTriggerProfitPercentage: parseFloat(sellTriggerProfitPercentage.toFixed(2)),
                            maxLongHoldCount: maxLongHoldCount
                        };
                    }
                }

                var percentChange = ((dataPoint.close / previousPrice) - 1) * 100;
                var currentInvestment = _.reduce(positions, function(memo, position) {
                    return memo + (position.pricePerShare * position.shares);
                }, 0);

                if (percentChange < buyTriggerChangePercentage && currentInvestment < maxInvestment) {
                    let position = {};

                    position.shares = Math.floor(baseInvestment / dataPoint.close);
                    position.pricePerShare = dataPoint.close;
                    position.costBasis = position.shares * position.pricePerShare;

                    // Ensure adding the position will not go beyond the maximum investment amount.
                    if ((position.pricePerShare * position.shares) + currentInvestment <= maxInvestment) {
                        positions.push(position);

                        balance -= position.costBasis;
                        currentInvestment += position.costBasis;
                        lastBuyDate = new Date(dataPoint.date);
                        days = 0;
                    }

                    // Avoid trying to sell on the same day that a position was opened.
                    previousPrice = dataPoint.close;
                    return;
                }

                previousPrice = dataPoint.close;
            });

            if (potentialMaxProfit && potentialOptimalSettings) {
                maxProfit = potentialMaxProfit;
                optimalSettings = potentialOptimalSettings;
            }
        }
    }
}

var finalProfit = 0;

balance = 100000;
baseInvestment = startingBalance / optimalSettings.investmentDivisor;
maxInvestment = balance;
positions = [];
previousPrice = 0;
lastBuyDate = 0;
days = 0;

data.forEach(function(dataPoint) {
    if (!previousPrice) {
        previousPrice = dataPoint.close;
        return;
    }

    if (new Date(dataPoint.date).getFullYear() < 2015) {
        return;
    }

    var costBasisSum = 0;
    var shareSum = 0;

    positions.forEach(function(position) {
        costBasisSum += position.costBasis;
        shareSum += position.shares;
    });

    var averagePositionCostBasis = costBasisSum / shareSum;
    var targetSellPrice = averagePositionCostBasis * (1 + (optimalSettings.sellTriggerProfitPercentage / 100));

    days = Math.round((new Date(dataPoint.date) - lastBuyDate) / 24 / 60 / 60 / 1000);

    var targetPriceReached = dataPoint.close >= targetSellPrice;
    var averageReachedAndHeldTooLong = days >= 30 && dataPoint.close >= averagePositionCostBasis;

    if (positions.length && (targetPriceReached || averageReachedAndHeldTooLong)) {
        let grossProfit = shareSum * dataPoint.close;
        let netProfit = grossProfit - costBasisSum;

        balance += grossProfit;
        positions = [];
        baseInvestment = balance / optimalSettings.investmentDivisor;
        maxInvestment = balance;
        finalProfit = balance - startingBalance;
    }

    var percentChange = ((dataPoint.close / previousPrice) - 1) * 100;
    var currentInvestment = _.reduce(positions, function(memo, position) {
        return memo + (position.pricePerShare * position.shares);
    }, 0);

    if (percentChange < optimalSettings.buyTriggerChangePercentage && currentInvestment < maxInvestment) {
        let position = {};

        position.shares = Math.floor(baseInvestment / dataPoint.close);
        position.pricePerShare = dataPoint.close;
        position.costBasis = position.shares * position.pricePerShare;

        // Ensure adding the position will not go beyond the maximum investment amount.
        if ((position.pricePerShare * position.shares) + currentInvestment <= maxInvestment) {
            positions.push(position);

            balance -= position.costBasis;
            currentInvestment += position.costBasis;
            lastBuyDate = new Date(dataPoint.date);
            days = 0;
        }

        // Avoid trying to sell on the same day that a position was opened.
        previousPrice = dataPoint.close;
        return;
    }

    previousPrice = dataPoint.close;
});

console.log(parseFloat(maxProfit.toFixed(2)), parseFloat(finalProfit.toFixed(2)));
console.log(JSON.stringify(optimalSettings));

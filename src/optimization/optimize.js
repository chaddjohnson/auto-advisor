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
var sellTriggerProfitPercentage = 0;
var stopLossThreshold;
var lastBuyDate;
var longHoldCount;
var maxLongHoldCount = 100;
var daysHeld = 0;
var index = 0;

console.log('Optimizing for ' + symbol);

for (investmentDivisor=4; investmentDivisor<=4; investmentDivisor++) {
    for (sellTriggerProfitPercentage=0.1; sellTriggerProfitPercentage<=4.0; sellTriggerProfitPercentage+=0.125) {
        for (stopLossThreshold=0.1; stopLossThreshold<=6.0; stopLossThreshold+=0.125) {
            // Reset.
            balance = 100000;
            baseInvestment = startingBalance / investmentDivisor;
            positions = [];
            previousPrice = 0;
            previousDate = 0;
            lastBuyDate = 0;
            longHoldCount = 0;
            daysHeld = 0;

            var cumulativeData = [];
            var potentialMaxProfit = 0;
            var potentialOptimalSettings = null;

            data.forEach(function(dataPoint) {
                if (!previousPrice) {
                    previousPrice = dataPoint.close;
                    previousDate = dataPoint.date;
                    return;
                }

                cumulativeData.push(dataPoint);

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

                var targetSellPriceReached = dataPoint.close >= targetSellPrice;
                var stopLossThresholdReached = dataPoint.close <= averagePositionCostBasis * (1 - (stopLossThreshold / 100));

                if (positions.length && (stopLossThresholdReached || targetSellPriceReached)) {
                    let grossProfit = (shareSum * dataPoint.close) - commission;
                    let netProfit = grossProfit - costBasisSum;

                    balance += grossProfit;
                    positions = [];
                    baseInvestment = balance / investmentDivisor;

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
                            stopLossThreshold: stopLossThreshold,
                            maxLongHoldCount: maxLongHoldCount
                        };
                    }
                }

                if (percentChange !== 0) {
                    let position = {};
                    let investment = Math.sqrt(Math.abs(percentChange)) * baseInvestment;

                    position.shares = Math.floor(investment / dataPoint.close);
                    position.pricePerShare = dataPoint.close;
                    position.costBasis = (position.shares * position.pricePerShare) + commission;

                    // Ensure adding the position will not exceed the balance.
                    if (balance - position.costBasis > 0 && position.shares > 0) {
                        positions.push(position);

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

console.log(parseFloat(maxProfit.toFixed(2)));
console.log(JSON.stringify(optimalSettings));

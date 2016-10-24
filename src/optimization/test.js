'use strict';

if (process.argv.length < 3) {
    console.log('Symbol must be specified.');
    process.exit(1);
}

// State
var symbol = process.argv[2];
var previousPrice = 0;
var previousDate = 0;
var positions = [];

// Data
var data = require('../../data/' + symbol + '.json');

// Settings
var phenotype = {"investmentDivisor": 3.14365,"sellTriggerProfitPercentage": 2.66697,"stopLossThreshold": 5.58246,"recentLargeChangeCounterStart": 3,"minPercentChangeBuy": -3.85875,"maxPercentChangeBuy": 6.5528};
var balance = 100000;
var startingBalance = balance;
var commission = 4.95;
var baseInvestment = startingBalance / phenotype.investmentDivisor;
var firstBuyDate = 0;
var daysHeld = 0;
var index = 0;
var recentLargeChangeCounter = 0;
var loss = 0;
var accountValue = 0;

console.log('SYMBOL\tTYPE\tDATE\t\tCHANGE\tSHARES\tSHARE PRICE\tCOST\t\tGROSS\t\tNET\t\tBALANCE\t\tDAYS HELD');
console.log('======\t======\t==============\t======\t======\t==============\t==============\t==============\t==============\t==============\t=========');

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
    var targetSellPrice = averagePositionCostBasis * (1 + (phenotype.sellTriggerProfitPercentage / 100));
    var targetSellPriceReached = dataPoint.close >= targetSellPrice;
    var stopLossThresholdReached = dataPoint.close <= averagePositionCostBasis * (1 - (phenotype.stopLossThreshold / 100));

    daysHeld = Math.round((new Date(dataPoint.date) - new Date(firstBuyDate)) / 24 / 60 / 60 / 1000);

    if (positions.length === 0) {
        daysHeld = 0;
    }

    if (positions.length && (stopLossThresholdReached || targetSellPriceReached)) {
        let grossProfit = (shareSum * dataPoint.close) - commission;
        let netProfit = grossProfit - costBasisSum;

        balance += grossProfit;
        positions = [];
        baseInvestment = balance / phenotype.investmentDivisor;
        firstBuyDate = 0;

        if (netProfit < 0) {
            loss += netProfit * -1;
        }

        console.log(symbol + '\t' + 'SELL' + '\t' + dataPoint.date + '\t' + percentChange.toFixed(2) + '\t' + shareSum + '\t$' + dataPoint.close.toFixed(4) + '\t\t\t$' + grossProfit.toFixed(2) + '  \t$' + netProfit.toFixed(2) + '  \t$' + balance.toFixed(2) + '\t' + daysHeld);

        shareSum = 0;
    }

    if (percentChange !== 0 && percentChange > phenotype.minPercentChangeBuy && percentChange < phenotype.maxPercentChangeBuy) {
        if (recentLargeChangeCounter <= 0) {
            let position = {};
            let investment = Math.sqrt(Math.abs(percentChange)) * baseInvestment;

            position.shares = Math.floor(investment / dataPoint.close);
            position.pricePerShare = dataPoint.close;
            position.costBasis = (position.shares * position.pricePerShare) + commission;

            // Ensure adding the position will not exceed the balance.
            if (balance - position.costBasis > 0 && position.shares > 0) {
                positions.push(position);
                balance -= position.costBasis;
                shareSum += position.shares;

                if (!firstBuyDate) {
                    firstBuyDate = dataPoint.date;
                    daysHeld = 0;
                }

                console.log(symbol + '\t' + 'BUY' + '\t' + dataPoint.date + '\t' + percentChange.toFixed(2) + '\t' + position.shares + '\t$' + position.pricePerShare.toFixed(4) + '\t  $' + position.costBasis.toFixed(2) + '\t\t\t\t\t  $' + balance.toFixed(2));
            }
        }
    }
    else {
        recentLargeChangeCounter = phenotype.recentLargeChangeCounterStart;
    }

    // Calculate current account value.
    accountValue = balance + (shareSum * dataPoint.close);

    previousPrice = dataPoint.close;
    previousDate = dataPoint.date;
    recentLargeChangeCounter--;
});

console.log();
console.log(JSON.stringify(phenotype));
console.log('Account Value: ' + accountValue.toFixed(2));
console.log('Loss: ' + loss.toFixed(2));

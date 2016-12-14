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

// AMZN
var phenotype = {"investmentDivisor":7.46803,"sellTriggerProfitPercentage":1.98684,"stopLossThreshold":8.93799,"recentLargeChangeCounterStart":5,"minPercentChangeBuy":-5.32629,"maxPercentChangeBuy":2.0849};
var pullOutDates = ['2016-10-27','2016-07-28','2016-04-21','2016-02-01','2015-10-22','2015-07-16','2015-04-23','2015-01-29','2014-10-16','2014-07-17'];

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

    // if (new Date(dataPoint.date).getDate() === 20 || (new Date(previousDate).getDate() < 20 && new Date(dataPoint.date).getDate() > 20)) {
    //     balance += 9500;
    // }

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
    var isPullOutDate = pullOutDates.indexOf(dataPoint.date) > -1;

    daysHeld = Math.round((new Date(dataPoint.date) - new Date(firstBuyDate)) / 24 / 60 / 60 / 1000);

    if (positions.length === 0) {
        daysHeld = 0;
    }

    if (positions.length && (stopLossThresholdReached || targetSellPriceReached || isPullOutDate)) {
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

    if (percentChange > phenotype.minPercentChangeBuy && percentChange < phenotype.maxPercentChangeBuy && !isPullOutDate) {
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
        if (!isPullOutDate) {
            recentLargeChangeCounter = phenotype.recentLargeChangeCounterStart;
        }
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

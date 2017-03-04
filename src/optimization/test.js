'use strict';

if (process.argv.length < 3) {
    console.log('Symbol must be specified.');
    process.exit(1);
}

// State
var symbol = process.argv[2];
var previousPrice = 0;
var previousDate = 0;

// Data
var data = require('../../data/' + symbol + '.json');

// AMZN
var phenotype = {"investmentDivisor":5.83481,"sellTriggerProfitPercentage":1.31727,"stopLossThreshold":8.7725};
var pullOutDates = ["2016-10-27","2016-07-28","2016-04-28","2016-01-28","2015-10-22","2015-07-23","2015-04-23","2015-01-29","2014-10-23","2014-07-24","2014-04-24","2014-01-30","2013-10-24","2013-07-25","2013-04-25","2013-01-29","2012-10-25","2012-07-26","2012-04-26","2012-01-31"];

var balance = 100000;
var startingBalance = balance;
var commission = 4.95;
var baseInvestment = startingBalance / phenotype.investmentDivisor;
var costBasisSum = 0;
var shareSum = 0;
var averageCostBasis = 0;
var firstBuyDate = 0;
var daysHeld = 0;
var index = 0;
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

    var percentChange = ((dataPoint.close / previousPrice) - 1) * 100;
    var targetSellPrice = averageCostBasis * (1 + (phenotype.sellTriggerProfitPercentage / 100));
    var targetSellPriceReached = dataPoint.close >= targetSellPrice;
    var stopLossThresholdReached = dataPoint.close <= averageCostBasis * (1 - (phenotype.stopLossThreshold / 100));
    var isPullOutDate = pullOutDates.indexOf(dataPoint.date) > -1;

    daysHeld = Math.round((new Date(dataPoint.date) - new Date(firstBuyDate)) / 24 / 60 / 60 / 1000);

    if (shareSum === 0) {
        daysHeld = 0;
    }

    if (shareSum > 0 && (stopLossThresholdReached || targetSellPriceReached || isPullOutDate)) {
        let grossProfit = (shareSum * dataPoint.close) - commission;
        let netProfit = grossProfit - costBasisSum;

        balance += grossProfit;
        baseInvestment = balance / phenotype.investmentDivisor;
        costBasisSum = 0;
        shareSum = 0;
        averageCostBasis = 0;
        firstBuyDate = 0;

        if (netProfit < 0) {
            loss += netProfit * -1;
        }

        console.log(symbol + '\t' + 'SELL' + '\t' + dataPoint.date + '\t' + percentChange.toFixed(2) + '\t' + shareSum + '\t$' + dataPoint.close.toFixed(4) + '\t\t\t$' + grossProfit.toFixed(2) + '  \t$' + netProfit.toFixed(2) + '  \t$' + balance.toFixed(2) + '\t' + daysHeld);

        shareSum = 0;
    }

    if (!isPullOutDate) {
        let position = {};
        let investment = Math.sqrt(Math.abs(percentChange)) * baseInvestment;

        position.shares = Math.floor(investment / dataPoint.close);
        position.pricePerShare = dataPoint.close;
        position.costBasis = (position.shares * position.pricePerShare) + commission;

        // Ensure adding the position will not exceed the balance.
        if (balance - position.costBasis > 0 && position.shares > 0) {
            balance -= position.costBasis;
            costBasisSum += position.costBasis;
            shareSum += position.shares;
            averageCostBasis = costBasisSum / shareSum;

            if (!firstBuyDate) {
                firstBuyDate = dataPoint.date;
                daysHeld = 0;
            }

            console.log(symbol + '\t' + 'BUY' + '\t' + dataPoint.date + '\t' + percentChange.toFixed(2) + '\t' + position.shares + '\t$' + position.pricePerShare.toFixed(4) + '\t  $' + position.costBasis.toFixed(2) + '\t\t\t\t\t  $' + balance.toFixed(2));
        }
    }

    // Calculate current account value.
    accountValue = balance + (shareSum * dataPoint.close);

    previousPrice = dataPoint.close;
    previousDate = dataPoint.date;
});

console.log();
console.log(JSON.stringify(phenotype));
console.log('Account Value: ' + accountValue.toFixed(2));
console.log('Profit: ' + (accountValue - startingBalance).toFixed(2));
console.log('Loss: ' + loss.toFixed(2));

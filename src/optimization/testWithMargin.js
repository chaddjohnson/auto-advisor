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
var phenotype = {"investmentDivisor":5.83481,"sellTriggerProfitPercentage":1.31727,"stopLossThreshold":8.7725};
var pullOutDates = ["2016-10-27","2016-07-28","2016-04-28","2016-01-28","2015-10-22","2015-07-23","2015-04-23","2015-01-29","2014-10-23","2014-07-24","2014-04-24","2014-01-30","2013-10-24","2013-07-25","2013-04-25","2013-01-29","2012-10-25","2012-07-26","2012-04-26","2012-01-31"];

var balance = 100000 * 2;
var startingBalance = balance;
var balanceBeforeBuy = balance / 2;
var commission = 4.95;
var baseInvestment = startingBalance / phenotype.investmentDivisor;
var firstBuyDate = 0;
var daysHeld = 0;
var index = 0;
var loss = 0;
var marginUsed = 0;
var dateMarginUsed = 0;

console.log('SYMBOL\tTYPE\tDATE\t\tCHANGE\tSHARES\tSHARE PRICE\tCOST\t\tGROSS\t\tNET\t\tBALANCE\t\t\tDAYS HELD');
console.log('======\t======\t==============\t======\t======\t==============\t==============\t==============\t==============\t==============\t\t=========');

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
        let marginDays = 0;
        let marginInterest = 0;

        if (dateMarginUsed) {
            marginDays = Math.round((new Date(dataPoint.date) - new Date(dateMarginUsed)) / 24 / 60 / 60 / 1000);
            marginInterest = ((marginUsed * getMarginInterestRate(marginUsed)) / 365) * marginDays;
        }

        balance += grossProfit + netProfit;
        balance -= marginInterest;
        positions = [];
        baseInvestment = balance / phenotype.investmentDivisor;
        firstBuyDate = 0;
        balanceBeforeBuy = balance / 2;
        marginUsed = 0;
        dateMarginUsed = 0;

        if (netProfit < 0) {
            loss += netProfit * -1;
        }

        console.log(symbol + '\t' + 'SELL' + '\t' + dataPoint.date + '\t' + percentChange.toFixed(2) + '\t' + shareSum + '\t$' + dataPoint.close.toFixed(4) + '\t\t\t$' + grossProfit.toFixed(2) + '  \t$' + netProfit.toFixed(2) + '  \t$' + balance.toFixed(2) + ' ($' + (balance / 2).toFixed(2) + ')' + '\t' + daysHeld);
    }

    if (!isPullOutDate) {
        let position = {};
        let investment = Math.sqrt(Math.abs(percentChange)) * baseInvestment;

        position.shares = Math.floor(investment / dataPoint.close);
        position.pricePerShare = dataPoint.close;
        position.costBasis = (position.shares * position.pricePerShare) + commission;

        // Ensure adding the position will not exceed the balance.
        if (balance - position.costBasis > 0 && position.shares > 0) {
            positions.push(position);

            balance -= position.costBasis;

            if (!firstBuyDate) {
                firstBuyDate = dataPoint.date;
                daysHeld = 0;
            }

            if (balance < balanceBeforeBuy) {
                if (!dateMarginUsed) {
                    dateMarginUsed = dataPoint.date;
                }

                marginUsed = Math.abs(balance - balanceBeforeBuy);
            }

            console.log(symbol + '\t' + 'BUY' + '\t' + dataPoint.date + '\t' + percentChange.toFixed(2) + '\t' + position.shares + '\t$' + position.pricePerShare.toFixed(4) + '\t  $' + position.costBasis.toFixed(2) + '\t\t\t\t\t  $' + balance.toFixed(2));
        }
    }

    previousPrice = dataPoint.close;
    previousDate = dataPoint.date;
});

console.log();
console.log(JSON.stringify(phenotype));
// console.log('Account Value: ' + accountValue.toFixed(2));
// console.log('Profit: ' + (accountValue - startingBalance).toFixed(2));
// console.log('Loss: ' + loss.toFixed(2));

function getMarginInterestRate(amount) {
    if (amount < 5000) {
        return 9 / 100;
    }
    else if (amount >= 5000 && amount < 50000) {
        return 8 / 100;
    }
    else if (amount >= 50000 && amount < 100000) {
        return 7 / 100;
    }
    else if (amount >= 100000 && amount < 250000) {
        return 5.75 / 100;
    }
    else if (amount >= 250000 && amount < 500000) {
        return 4.75 / 100;
    }
    else {
        return 4.25 / 100;
    }
}

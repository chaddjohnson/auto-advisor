'use strict';

if (process.argv.length < 3) {
    console.log('Symbol must be specified.');
    process.exit(1);
}

// Libraries
var _ = require('lodash');

// State
var symbol = process.argv[2];
var previousPrice = 0;
var positions = [];

// Data
var data = require('../../data/' + symbol + '.json');

// Settings
var balance = 100000;
var startingBalance = balance;
var commission = 4.95;
var investmentDivisor = 6;
var baseInvestment = startingBalance / investmentDivisor;
var sellTriggerProfitPercentage = 2.5;
var lastBuyDate = 0;
var longHoldCount = 0;
var maxLongHoldCount = 100;
var investmentFactor = 0.8125;
var days = 0;

console.log('SYMBOL\tTYPE\tDATE\t\tCHANGE\tSHARES\tSHARE PRICE\tCOST\t\tGROSS\t\tNET\t\tBALANCE\t\tDAYS HELD');
console.log('======\t======\t==============\t======\t======\t==============\t==============\t==============\t==============\t==============\t=========');

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

    var percentChange = ((dataPoint.close / previousPrice) - 1) * 100;
    var averagePositionCostBasis = costBasisSum / shareSum;
    var targetSellPrice = averagePositionCostBasis * (1 + (sellTriggerProfitPercentage / 100));

    days = Math.round((new Date(dataPoint.date) - lastBuyDate) / 24 / 60 / 60 / 1000);

    var targetPriceReached = dataPoint.close >= targetSellPrice;
    var averageReachedAndHeldTooLong = days >= 30 && dataPoint.close >= averagePositionCostBasis;

    if (positions.length && (targetPriceReached || averageReachedAndHeldTooLong)) {
        let grossProfit = (shareSum * dataPoint.close) - commission;
        let netProfit = grossProfit - costBasisSum;

        balance += grossProfit;
        positions = [];
        baseInvestment = balance / investmentDivisor;

        if (days > maxLongHoldCount) {
            longHoldCount++;
        }

        console.log(symbol + '\t' + 'SELL' + '\t' + dataPoint.date + '\t' + percentChange.toFixed(2) + '\t' + shareSum + '\t$' + dataPoint.close.toFixed(4) + '\t\t\t$' + grossProfit.toFixed(2) + '  \t$' + netProfit.toFixed(2) + '  \t$' + balance.toFixed(2) + '\t' + days);
    }

    if (percentChange < 0) {
        let position = {};
        let investment = baseInvestment * (percentChange / investmentFactor) * -1;

        position.shares = Math.floor(investment / dataPoint.close);
        position.pricePerShare = dataPoint.close;
        position.costBasis = (position.shares * position.pricePerShare) + commission;

        // Ensure adding the position will not exceed the balance.
        if (balance - position.costBasis > 0 && position.shares > 0) {
            positions.push(position);

            balance -= position.costBasis;
            lastBuyDate = new Date(dataPoint.date);
            days = 0;

            console.log(symbol + '\t' + 'BUY' + '\t' + dataPoint.date + '\t' + percentChange.toFixed(2) + '\t' + position.shares + '\t$' + position.pricePerShare.toFixed(4) + '\t  $' + position.costBasis.toFixed(2) + '\t\t\t\t\t  $' + balance.toFixed(2));
        }
    }

    previousPrice = dataPoint.close;
});

console.log('\nLong holds: ' + longHoldCount);

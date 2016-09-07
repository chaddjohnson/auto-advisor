'use strict';

// Environment
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Config
var config = require('../../config');

// Libraries
var _ = require('lodash');
var async = require('async');
var request = require('request');
var Holidays = require('date-holidays');

// State and data
var baseInvestment = 0;
var holdingQty = 0;
var holdingCostBasis = 0;
var cash = 0;
var accountValue = 0;
var quote = {};
var activityOccurred = false;

// Set up the trading client.
var tradingClient = require('../../lib/tradingClients/base').factory(config.client, config.brokerage);

// Set up the SMS client.
var smsClient = new (require('../../lib/smsClient'))(config.sms);

// Synchronous tasks to execute.
var tasks = [];

// Delay between buy/sell and balance lookup.
var delay = process.env.NODE_ENV === 'production' ? 60 * 1000 : 0;

function formatDollars(number) {
    return '$' + number.toFixed(2).replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,');
}

// Determine if today is a holiday.
tasks.push(function(taskCallback) {
    var holidays = new Holidays('US');
    var holiday = holidays.isHoliday(new Date());

    // Do not trade in production mode on public and bank holidays.
    if (process.env.NODE_ENV === 'production' && holiday && (holiday.type === 'public' || holiday.type === 'bank')) {
        return taskCallback('No buy or sell activity occurred today as it is ' + (holiday.name || 'a holiday') + '.');
    }

    taskCallback();
});

// Request a quote.
tasks.push(function(taskCallback) {
    tradingClient.getQuote(config.symbol).then(function(data) {
        // Keep track of the quote.
        quote = data;

        taskCallback();
    }).catch(function(error) {
        taskCallback(error);
    });
});

// Request account information.
tasks.push(function(taskCallback) {
    tradingClient.getAccount().then(function(data) {
        cash = data.cash;
        accountValue = data.value;

        holdingCostBasis = data.holdingCostBasis;
        holdingQty = data.holdingQty;

        // Calculate baseInvestment.
        baseInvestment = (cash + holdingCostBasis) / config.investmentDivisor;

        taskCallback();
    }).catch(function(error) {
        taskCallback(error);
    });
});

// Sell?
tasks.push(function(taskCallback) {
    var percentChange = ((quote.price / quote.previousClosePrice) - 1) * 100;

    // Calculate the average cost basis of the holdings.
    var averageHoldingCostBasis = holdingCostBasis / holdingQty;

    // Calculate the target sell price.
    var targetSellPrice = averageHoldingCostBasis * (1 + (config.sellTriggerProfitPercentage / 100));

    // Determine whether the target sell price has been reached.
    var targetSellPriceReached = quote.price >= targetSellPrice;

    // Determine whether the stop loss threshold has been reached.
    var stopLossThresholdReached = quote.price <= averageHoldingCostBasis * (1 - (config.stopLossThreshold / 100));

    // Track cash prior to sell so that net profit can be calculated.
    var previousCash = cash;

    if (holdingQty > 0 && (stopLossThresholdReached || targetSellPriceReached)) {
        tradingClient.sell(config.symbol, holdingQty).then(function() {
            // Add a multi-second delay to let things settle.
            setTimeout(function() {
                // Get account updates.
                tradingClient.getAccount().then(function(data) {
                    var netProfit = data.cash - (holdingCostBasis + previousCash);

                    // Update the cash available.
                    cash = data.cash;

                    // Recalculate the base investment.
                    baseInvestment = cash / config.investmentDivisor;

                    activityOccurred = true;

                    // Log what happened.
                    console.log(config.symbol + '\t' + 'SELL' + '\t' + quote.datetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' + percentChange.toFixed(2) + '%\t' + holdingQty + '\t' + formatDollars(quote.price) + '\t\t\t\t' + formatDollars(netProfit) + ' \t' + formatDollars(cash));

                    // Send an SMS.
                    smsClient.send(config.sms.toNumber, 'Sold ' + holdingQty + ' shares of ' + config.symbol + ' at ~' + formatDollars(quote.price) + ' for ' + formatDollars(netProfit) + ' profit. New balance is ' + formatDollars(cash) + '.');

                    taskCallback();
                });
            }, delay);
        });
    }
    else {
        // Today is not an opportunity to sell.
        taskCallback();
    }
});

// Buy?
tasks.push(function(taskCallback) {
    var percentChange = ((quote.price / quote.previousClosePrice) - 1) * 100;
    var changeAction = percentChange >= 0 ? 'increased' : 'decreased';

    // Possibly buy if it's not a bad time to buy.
    if (percentChange !== 0) {
        let investment = Math.sqrt(Math.abs(percentChange)) * baseInvestment;
        let qty = Math.floor(investment / quote.price);
        let costBasis = (qty * quote.price) + config.brokerage.commission;

        // Track cash prior to sell so that net profit can be calculated.
        let previousCash = cash;

        if (cash - costBasis <= 0) {
            return taskCallback(config.symbol + ' ' + changeAction + ' ' + percentChange.toFixed(2) + '% since previous close from ' + formatDollars(quote.previousClosePrice) + ' to ' + formatDollars(quote.price) + '. Potential investment amount exceeds balance. Consider placing a manual trade.');
        }

        // Ensure adding the holding will not go beyond the maximum investment amount.
        if (cash - costBasis > 0 && qty > 0) {
            tradingClient.buy(config.symbol, qty).then(function() {
                // Add a multi-second delay to let things settle.
                setTimeout(function() {
                    tradingClient.getAccount().then(function(data) {
                        // Calculate the average cost basis of the holdings.
                        var averageHoldingCostBasis = data.holdingCostBasis / data.holdingQty;

                        // Calculate the stop loss price.
                        var stopLossPrice = averageHoldingCostBasis * (1 - (config.stopLossThreshold / 100));

                        // Calculate the target sell price.
                        var targetSellPrice = averageHoldingCostBasis * (1 + (config.sellTriggerProfitPercentage / 100));

                        // Update the cash available.
                        cash = data.cash;

                        activityOccurred = true;

                        // Log what happened.
                        console.log(config.symbol + '\t' + 'BUY' + '\t' + quote.datetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' + percentChange.toFixed(2) + '%\t' + qty + '\t' + formatDollars(quote.price) + '\t\t' + formatDollars(previousCash - cash) + ' \t\t\t' + formatDollars(cash));

                        // Send an SMS.
                        smsClient.send(config.sms.toNumber, config.symbol + ' ' + changeAction + ' ' + percentChange.toFixed(2) + '% since previous close from ' + formatDollars(quote.previousClosePrice) + ' to ' + formatDollars(quote.price) + '. Bought ' + qty + ' shares of ' + config.symbol + ' using ' + formatDollars(previousCash - cash) + '. Target price is ' + formatDollars(targetSellPrice) + '. Stop loss price is ' + formatDollars(stopLossPrice) + '. New balance is ' + formatDollars(cash) + '. Account value is ' + formatDollars(data.value) + '.');

                        taskCallback();
                    }).catch(function(error) {
                        taskCallback(error);
                    });
                }, delay);
            }).catch(function(error) {
                taskCallback(error);
            });
        }
        else {
            taskCallback();
        }
    }
    else {
        taskCallback();
    }
});

// Execute all tasks.
async.series(tasks, function(error) {
    if (error) {
        // Send an SMS.
        return smsClient.send(config.sms.toNumber, error.message || error);
    }

    if (!activityOccurred) {
        // Send an SMS.
        smsClient.send(config.sms.toNumber, 'No buy or sell activity occurred today. Balance is ' + formatDollars(cash) + '. Account value is ' + formatDollars(accountValue) + '.');
    }
});
